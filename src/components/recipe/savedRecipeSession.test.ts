import { describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import type { SavedDocument } from "@/lib/saved/contracts";
import { createSavedRecipeLoader } from "./savedRecipeSession";

const document: SavedDocument = { id: "saved", copy: { recipe: butterChicken, version: 0, undoStack: [], savedId: "saved" }, messages: [], updatedAt: "old", shareSlug: null };

describe("saved recipe fresh owner reads", () => {
  it("clears the old recipe on hiding and fetches a fresh revision on returning", async () => {
    const get = vi.fn().mockResolvedValueOnce(document).mockResolvedValueOnce({ ...document, updatedAt: "new" });
    const loader = createSavedRecipeLoader("saved", get);
    await loader.start();
    expect(loader.getSnapshot().document?.updatedAt).toBe("old");
    loader.stop();
    expect(loader.getSnapshot().document).toBeUndefined();
    await loader.start();
    expect(loader.getSnapshot().document?.updatedAt).toBe("new");
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("does not fall back to a cached private recipe when ownership disappears", async () => {
    const get = vi.fn().mockResolvedValueOnce(document).mockRejectedValueOnce(new Error("Recipe not found"));
    const loader = createSavedRecipeLoader("saved", get);
    await loader.start();
    await loader.start();
    expect(loader.getSnapshot()).toEqual({ error: "Recipe not found" });
  });
  it("ignores responses from a previous visit even when transport ignores abort", async () => {
    let finish!: (document: SavedDocument) => void;
    const get = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({ ...document, updatedAt: "new" });
    const loader = createSavedRecipeLoader("saved", get);
    const oldVisit = loader.start();
    loader.stop();
    await loader.start();
    finish(document);
    await oldVisit;
    expect(loader.getSnapshot().document?.updatedAt).toBe("new");
  });
});
