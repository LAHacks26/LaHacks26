import { beforeEach, describe, expect, it, vi } from "vitest";
import { embed } from "../ai/gemini";
import { normalizeRecipe } from "../ai/normalize";
import { getSourceRecipeByUrl, upsertSourceRecipe } from "../db/sourceRecipes";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import type { Recipe } from "../recipe/schema";
import { fetchPage } from "./fetchPage";
import { importRecipe, type ImportHooks } from "./importRecipe";

vi.mock("server-only", () => ({}));
vi.mock("../ai/gemini", () => ({ embed: vi.fn(), AiError: class extends Error {} }));
vi.mock("../ai/normalize", () => ({ normalizeRecipe: vi.fn(), embeddingText: () => "recipe" }));
vi.mock("../db/sourceRecipes", () => ({ getSourceRecipeByUrl: vi.fn(), upsertSourceRecipe: vi.fn() }));
vi.mock("./fetchPage", async (original) => ({
  ...(await original<typeof import("./fetchPage")>()), fetchPage: vi.fn(),
}));

const url = "https://example.com/recipe";
const html = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "Recipe", name: "Dinner", totalTime: "PT60M",
  recipeIngredient: ["1 cup rice", "2 cups water"], recipeInstructions: ["Cook the rice."],
})}</script>`;
const tooLong = new Error("too long for this search");
const rejectLong: ImportHooks = { onParsed(info) { if (info.totalMin! > 15) throw tooLong; } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSourceRecipeByUrl).mockResolvedValue(null);
  vi.mocked(fetchPage).mockResolvedValue({ url, finalUrl: url, html });
  vi.mocked(normalizeRecipe).mockResolvedValue(butterChicken);
  vi.mocked(embed).mockResolvedValue([1, 0]);
  vi.mocked(upsertSourceRecipe).mockResolvedValue("source-id");
});

describe("shared imports with independent caller policies", () => {
  it.each([true, false])("does not let a constrained search fail an unrestricted import (search first: %s)", async (searchFirst) => {
    const first = importRecipe(url, searchFirst ? rejectLong : undefined);
    const second = importRecipe(url, searchFirst ? undefined : rejectLong);
    const results = await Promise.allSettled([first, second]);
    expect(results[searchFirst ? 0 : 1]).toEqual({ status: "rejected", reason: tooLong });
    expect(results[searchFirst ? 1 : 0]).toEqual({
      status: "fulfilled", value: { sourceRecipeId: "source-id", cached: false },
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(normalizeRecipe).toHaveBeenCalledTimes(1);
    expect(upsertSourceRecipe).toHaveBeenCalledTimes(1);
  });

  it("runs every caller's hook while sharing a single normalization", async () => {
    const first = vi.fn();
    const second = vi.fn();
    await Promise.all([importRecipe(url, { onParsed: first }), importRecipe(url, { onParsed: second })]);
    expect(first).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ totalMin: 60 }));
    expect(second).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ totalMin: 60 }));
    expect(normalizeRecipe).toHaveBeenCalledTimes(1);
  });

  it("skips AI when all callers reject, then allows a fresh import", async () => {
    const results = await Promise.allSettled([importRecipe(url, rejectLong), importRecipe(url, rejectLong)]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(normalizeRecipe).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    await expect(importRecipe(url)).resolves.toMatchObject({ sourceRecipeId: "source-id" });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(normalizeRecipe).toHaveBeenCalledTimes(1);
  });

  it("replays parsed facts to late joiners without letting rejection evict an active normalization", async () => {
    const normalized = deferred<Recipe>();
    const started = deferred<void>();
    vi.mocked(normalizeRecipe).mockImplementationOnce(() => {
      started.resolve();
      return normalized.promise;
    });
    const first = importRecipe(url);
    await started.promise;
    await expect(importRecipe(url, rejectLong)).rejects.toBe(tooLong);
    const hook = vi.fn();
    const last = importRecipe(url, { onParsed: hook });
    normalized.resolve(butterChicken);
    await Promise.all([first, last]);
    expect(hook).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ totalMin: 60 }));
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(normalizeRecipe).toHaveBeenCalledTimes(1);
  });

  it("isolates callback mutation from another caller's time check", async () => {
    const results = await Promise.allSettled([
      importRecipe(url, { onParsed(info) { info.totalMin = 1; } }),
      importRecipe(url, rejectLong),
    ]);
    expect(results[1]).toEqual({ status: "rejected", reason: tooLong });
  });

  it.each(["fetch", "normalize"])("removes a failed shared %s so retry can succeed", async (stage) => {
    const error = new Error("temporary failure");
    if (stage === "fetch") vi.mocked(fetchPage).mockRejectedValueOnce(error);
    else vi.mocked(normalizeRecipe).mockRejectedValueOnce(error);
    const results = await Promise.allSettled([importRecipe(url), importRecipe(url)]);
    expect(results).toEqual([{ status: "rejected", reason: error }, { status: "rejected", reason: error }]);
    await expect(importRecipe(url)).resolves.toMatchObject({ sourceRecipeId: "source-id" });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("keeps private-host rejection ahead of DB lookup and fetching", async () => {
    await expect(importRecipe("http://127.0.0.1/recipe")).rejects.toMatchObject({ code: "blocked_url" });
    expect(getSourceRecipeByUrl).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("returns cache hits without fetching or invoking page hooks", async () => {
    vi.mocked(getSourceRecipeByUrl).mockResolvedValueOnce({ id: "cached-id" } as NonNullable<Awaited<ReturnType<typeof getSourceRecipeByUrl>>>);
    const hook = vi.fn();
    await expect(importRecipe(url, { onParsed: hook })).resolves.toEqual({ sourceRecipeId: "cached-id", cached: true });
    expect(hook).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
    expect(normalizeRecipe).not.toHaveBeenCalled();
  });
});
