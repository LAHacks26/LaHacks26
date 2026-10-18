import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { landingDestination } from "./landing";

const input = { query: " butter chicken ", constraints: ["No oven"], readyBy: "19:30", allergies: ["dairy"] };
const now = new Date(2026, 9, 18, 17, 0);
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
});
afterEach(() => vi.unstubAllGlobals());

describe("landing submission", () => {
  it("starts a real search with text, constraints, allergies and an absolute deadline", async () => {
    fetchMock.mockResolvedValue(Response.json({ searchId: "search-123" }));
    const signal = new AbortController().signal;
    expect(await landingDestination(input, signal, now)).toBe("/search/search-123");
    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/search");
    expect(options?.signal).toBe(signal);
    expect(JSON.parse(options!.body as string)).toEqual({
      text: "butter chicken", constraints: ["No oven"], allergies: ["dairy"],
      readyBy: new Date(2026, 9, 18, 19, 30).toISOString(),
    });
  });

  it("does not constrain searches when ready-by is cleared", async () => {
    fetchMock.mockResolvedValue(Response.json({ searchId: "search-123" }));
    await landingDestination({ ...input, readyBy: "" }, new AbortController().signal, now);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty("readyBy");
  });

  it("imports pasted URLs directly and carries the deadline to the recipe", async () => {
    fetchMock.mockResolvedValue(Response.json({ sourceRecipeId: "recipe-123" }));
    const query = "https://www.allrecipes.com/recipe/123/example/";
    const href = await landingDestination({ ...input, query }, new AbortController().signal, now);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/import");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ url: query });
    const url = new URL(href, "https://saffron.test");
    expect(url.pathname).toBe("/recipe/recipe-123");
    expect(url.searchParams.get("readyBy")).toBe(new Date(2026, 9, 18, 19, 30).toISOString());
  });

  it("surfaces API errors so the form can retry without navigating to a mock", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Try again shortly." }, { status: 429 }));
    await expect(landingDestination(input, new AbortController().signal, now)).rejects.toThrow("Try again shortly.");
    fetchMock.mockResolvedValue(Response.json({ searchId: "retry-123" }));
    expect(await landingDestination(input, new AbortController().signal, now)).toBe("/search/retry-123");
  });

  it("passes cancellation to the request and rejects instead of returning a destination", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_, options) => {
      controller.abort();
      options?.signal?.throwIfAborted();
      return Response.json({ searchId: "unused" });
    });
    await expect(landingDestination(input, controller.signal, now)).rejects.toThrow();
  });

  it("rejects an invalid clock before making a request", async () => {
    await expect(landingDestination({ ...input, readyBy: "bad" }, new AbortController().signal, now))
      .rejects.toThrow("Choose a valid ready-by time");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
