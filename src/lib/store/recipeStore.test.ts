import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNDO_LIMIT, type AiEditResult } from "../recipe/schema";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { useRecipeStore, workingCopyKey } from "./recipeStore";

// A small in-memory localStorage, so the store's persistence can be checked in the node environment.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

const SOURCE_ID = "demo-butter-chicken";

function milkPatch(item: string): AiEditResult {
  return {
    kind: "patch",
    summary: `Set milk to ${item}`,
    ops: [{ op: "update_ingredient", id: "i9", item }],
  };
}

function currentCopy() {
  const copy = useRecipeStore.getState().copy;
  if (!copy) throw new Error("no working copy");
  return copy;
}

// Starts an edit the way the UI does, then applies the result.
function editAndApply(result: AiEditResult, baseVersion: number) {
  const store = useRecipeStore.getState();
  store.setEditing({ kind: "ingredient", id: "i9" });
  return useRecipeStore.getState().applyEdit(result, baseVersion);
}

let storage: Storage;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  useRecipeStore.setState({ copy: null, editing: null, glow: null, toast: null, newTipIds: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("load", () => {
  it("starts fresh at version 0 when nothing is stored", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    const copy = currentCopy();
    expect(copy).toEqual({ recipe: butterChicken, version: 0, undoStack: [], sourceRecipeId: SOURCE_ID });
  });

  it("restores the stored working copy after an edit", () => {
    const store = useRecipeStore.getState();
    store.load(SOURCE_ID, butterChicken);
    expect(editAndApply(milkPatch("coconut milk"), 0)).toBe("applied");

    // Simulate a reload: the in-memory store is gone, the localStorage copy is not.
    useRecipeStore.setState({ copy: null, glow: null, toast: null });
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);

    const copy = currentCopy();
    expect(copy.version).toBe(1);
    expect(copy.undoStack).toHaveLength(1);
    expect(copy.recipe.ingredients[8].item).toBe("coconut milk");
    expect(storage.getItem(workingCopyKey(SOURCE_ID))).not.toBeNull();
  });

  it("ignores a corrupted stored value", () => {
    storage.setItem(workingCopyKey(SOURCE_ID), "{not json");
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    expect(currentCopy()).toMatchObject({ version: 0, undoStack: [], recipe: butterChicken });
  });

  it("ignores a stored value that fails WorkingCopySchema", () => {
    storage.setItem(workingCopyKey(SOURCE_ID), JSON.stringify({ recipe: {}, version: 3 }));
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    expect(currentCopy().version).toBe(0);
  });

  it("ignores a stored copy whose sourceRecipeId does not match", () => {
    const copy = { recipe: butterChicken, version: 4, undoStack: [], sourceRecipeId: "someone-else" };
    storage.setItem(workingCopyKey(SOURCE_ID), JSON.stringify(copy));
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    expect(currentCopy()).toMatchObject({ version: 0, sourceRecipeId: SOURCE_ID });
  });

  it("clears an edit in progress, so a result for the old recipe cannot apply", () => {
    const recipeA = butterChicken;
    const recipeB = { ...structuredClone(butterChicken), title: "Other Curry" };
    useRecipeStore.getState().load("recipe-a", recipeA);
    useRecipeStore.getState().setEditing({ kind: "ingredient", id: "i9" });

    useRecipeStore.getState().load("recipe-b", recipeB);
    expect(useRecipeStore.getState().editing).toBeNull();

    expect(useRecipeStore.getState().applyEdit(milkPatch("coconut milk"), 0)).toBe("stale");
    expect(currentCopy()).toMatchObject({ version: 0, sourceRecipeId: "recipe-b" });
    expect(currentCopy().recipe).toEqual(recipeB);
  });
});

describe("applyEdit", () => {
  it("applies a patch at the current version, then reports stale for the same base version", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);

    expect(editAndApply(milkPatch("coconut milk"), 0)).toBe("applied");
    expect(currentCopy().version).toBe(1);
    expect(currentCopy().undoStack).toEqual([butterChicken]);
    expect(useRecipeStore.getState().editing).toBeNull();
    expect(useRecipeStore.getState().glow?.ids).toEqual(["i9"]);
    expect(useRecipeStore.getState().toast).toMatchObject({
      summary: "Set milk to coconut milk",
      linesChanged: 1,
    });

    expect(editAndApply(milkPatch("oat milk"), 0)).toBe("stale");
    expect(currentCopy().version).toBe(1);
    expect(currentCopy().recipe.ingredients[8].item).toBe("coconut milk");
  });

  it("leaves the edit in progress when the version moved on", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    useRecipeStore.getState().setEditing({ kind: "ingredient", id: "i9" });
    expect(useRecipeStore.getState().applyEdit(milkPatch("oat milk"), 5)).toBe("stale");
    expect(useRecipeStore.getState().editing).toEqual({ target: { kind: "ingredient", id: "i9" } });
  });

  it("returns stale when there is no working copy", () => {
    expect(useRecipeStore.getState().applyEdit(milkPatch("coconut milk"), 0)).toBe("stale");
  });

  it("returns stale when no edit is in progress", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    expect(useRecipeStore.getState().applyEdit(milkPatch("coconut milk"), 0)).toBe("stale");
    expect(currentCopy()).toMatchObject({ version: 0, undoStack: [] });
  });

  it("ignores non-patch kinds and clears the edit in progress", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    useRecipeStore.getState().setEditing({ kind: "ingredient", id: "i9" });
    expect(useRecipeStore.getState().applyEdit({ kind: "answer", text: "Coconut milk works." }, 0)).toBe(
      "ignored",
    );
    expect(useRecipeStore.getState().editing).toBeNull();
    expect(currentCopy().version).toBe(0);
  });

  it("ignores a patch whose ops fail, leaves the recipe alone and clears the edit in progress", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    const badPatch: AiEditResult = {
      kind: "patch",
      summary: "Swapped an ingredient that does not exist",
      ops: [{ op: "update_ingredient", id: "i99", item: "x" }],
    };
    expect(editAndApply(badPatch, 0)).toBe("ignored");
    expect(useRecipeStore.getState().editing).toBeNull();
    expect(currentCopy()).toMatchObject({ version: 0, undoStack: [], recipe: butterChicken });
    expect(useRecipeStore.getState().toast).toBeNull();
  });

  it("caps the undo stack at UNDO_LIMIT and drops the oldest entries", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    for (let n = 0; n < UNDO_LIMIT + 5; n++) {
      const base = currentCopy().version;
      expect(editAndApply(milkPatch(`milk ${n}`), base)).toBe("applied");
    }

    const copy = currentCopy();
    expect(copy.version).toBe(UNDO_LIMIT + 5);
    expect(copy.undoStack).toHaveLength(UNDO_LIMIT);
    // The oldest kept entry is the recipe from just before the 6th edit ("milk 4").
    expect(copy.undoStack[0].ingredients[8].item).toBe("milk 4");
  });
});

describe("undo", () => {
  it("restores the previous recipe, bumps version and clears the toast and glow", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    editAndApply(milkPatch("coconut milk"), 0);

    expect(useRecipeStore.getState().undo()).toBe(true);
    const copy = currentCopy();
    expect(copy.recipe).toEqual(butterChicken);
    expect(copy.version).toBe(2);
    expect(copy.undoStack).toEqual([]);
    expect(useRecipeStore.getState().toast).toBeNull();
    expect(useRecipeStore.getState().glow).toBeNull();
    expect(useRecipeStore.getState().undo()).toBe(false);
  });

  it("walks back through several edits in order", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    editAndApply(milkPatch("first"), 0);
    editAndApply(milkPatch("second"), 1);

    useRecipeStore.getState().undo();
    expect(currentCopy().recipe.ingredients[8].item).toBe("first");
    useRecipeStore.getState().undo();
    expect(currentCopy().recipe.ingredients[8].item).toBe("heavy cream");
  });

  it("restores the pre-edit snapshot after a tip was added following an edit", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    editAndApply(milkPatch("coconut milk"), 0);
    const snapshot = currentCopy().undoStack[0];
    expect(snapshot).toEqual(butterChicken);

    expect(useRecipeStore.getState().addTip({ kind: "step", id: "s2" }, "Whisk until smooth.")).toBe("t2");
    expect(currentCopy().recipe.steps[1].tips).toHaveLength(1);

    expect(useRecipeStore.getState().undo()).toBe(true);
    expect(currentCopy().recipe).toEqual(snapshot);
    expect(currentCopy().version).toBe(2);
  });
});

describe("addTip", () => {
  it("saves the tip without changing the version or the undo stack", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);

    const tipId = useRecipeStore
      .getState()
      .addTip({ kind: "step", id: "s2", selectedText: "whisk" }, "Whisk until smooth.");
    expect(tipId).toBe("t2");
    const copy = currentCopy();
    expect(copy.version).toBe(0);
    expect(copy.undoStack).toEqual([]);
    expect(copy.recipe.steps[1].tips).toEqual([{ id: "t2", anchorText: "whisk", text: "Whisk until smooth." }]);
    expect(useRecipeStore.getState().newTipIds).toEqual(["t2"]);

    const stored = JSON.parse(storage.getItem(workingCopyKey(SOURCE_ID)) ?? "null");
    expect(stored.recipe.steps[1].tips).toHaveLength(1);
  });

  it("returns null for an unknown target and when there is no copy", () => {
    expect(useRecipeStore.getState().addTip({ kind: "step", id: "s1" }, "x")).toBeNull();
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    expect(useRecipeStore.getState().addTip({ kind: "step", id: "s99" }, "x")).toBeNull();
    expect(currentCopy().version).toBe(0);
  });
});

describe("setEditing and dismissToast", () => {
  it("sets and clears the editing target, and dismisses the toast", () => {
    useRecipeStore.getState().load(SOURCE_ID, butterChicken);
    useRecipeStore.getState().setEditing({ kind: "ingredient", id: "i9" });
    expect(useRecipeStore.getState().editing).toEqual({ target: { kind: "ingredient", id: "i9" } });
    useRecipeStore.getState().setEditing(null);
    expect(useRecipeStore.getState().editing).toBeNull();

    editAndApply(milkPatch("coconut milk"), 0);
    expect(useRecipeStore.getState().toast).not.toBeNull();
    useRecipeStore.getState().dismissToast();
    expect(useRecipeStore.getState().toast).toBeNull();
  });
});
