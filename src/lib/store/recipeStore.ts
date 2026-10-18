import { create } from "zustand";
import { parseReadyBy } from "../recipe/readyBy";
import { PatchError, addTip as addTipToRecipe, applyEditResult } from "../recipe/patch";
import {
  UNDO_LIMIT,
  WorkingCopySchema,
  type AiEditResult,
  type LineRef,
  type Recipe,
  type WorkingCopy,
} from "../recipe/schema";

// Client working copy of the open recipe (PRD §5.4, §5.8, §8.1).

export type RecipeStoreState = {
  /** null until `load` runs. */
  copy: WorkingCopy | null;
  /** The one edit that may run at a time (Explain is not an edit). Affected lines shimmer while set. */
  editing: { target: LineRef | null } | null;
  /** Lines to glow after an edit. `key` changes on every edit so the same IDs can glow again. */
  glow: { ids: string[]; key: number } | null;
  /** Undo toast for the last applied edit, or null once dismissed or undone. */
  toast: { summary: string; linesChanged: number; key: number } | null;
  /** Tip IDs added this session; they render expanded (PRD §5.3). */
  newTipIds: string[];
};

export type RecipeStoreActions = {
  /**
   * Opens a recipe. Restores the localStorage working copy for this `sourceRecipeId` when one exists
   * and parses with WorkingCopySchema; otherwise starts fresh at version 0. Clears editing/glow/toast.
   */
  load(sourceRecipeId: string, recipe: Recipe, readyBy?: string): void;
  /** Marks an edit as running, or clears it. */
  setEditing(target: LineRef | null): void;
  beginWholeRecipeEdit(): void;
  /**
   * Applies a "patch" result if `baseVersion` still equals the current version: pushes the old
   * recipe on the undo stack (max UNDO_LIMIT), bumps version, sets glow and toast, persists.
   * Callers must `setEditing(target)` before starting an edit. Returns "stale" (and changes nothing)
   * when there is no copy, no edit in progress (`load` clears it, so a result from another recipe
   * can't apply), or the version moved on. Returns "ignored" for non-patch kinds or invalid ops; both
   * clear `editing`.
   */
  applyEdit(result: AiEditResult, baseVersion: number): "applied" | "stale" | "ignored";
  /** Saves an explanation as a tip. Does not bump version or touch the undo stack. Returns the tip ID. */
  addTip(target: LineRef, text: string): string | null;
  /** Restores the previous recipe from the undo stack, bumps version, clears the toast. False if empty. */
  undo(): boolean;
  dismissToast(): void;
};

export type RecipeStore = RecipeStoreState & RecipeStoreActions;

/** localStorage key for one source recipe's working copy. */
export function workingCopyKey(sourceRecipeId: string): string {
  return `saffron:wc:${sourceRecipeId}`;
}

// Keys only ever increase, and track the clock, so the same IDs can glow again on every edit.
let lastKey = 0;
function nextKey(): number {
  lastKey = Math.max(lastKey + 1, Date.now());
  return lastKey;
}

// localStorage can be missing (SSR, tests), throw (private mode, blocked site data) or hold junk.
// Every access goes through try/catch, so the store still works in memory.
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredCopy(sourceRecipeId: string): WorkingCopy | null {
  try {
    const raw = storage()?.getItem(workingCopyKey(sourceRecipeId));
    if (!raw) return null;
    const parsed = WorkingCopySchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.sourceRecipeId !== sourceRecipeId) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function persistCopy(copy: WorkingCopy): void {
  if (!copy.sourceRecipeId) return;
  try {
    storage()?.setItem(workingCopyKey(copy.sourceRecipeId), JSON.stringify(copy));
  } catch {
    // Private mode or a full quota: the in-memory copy still works for this session.
  }
}

export const useRecipeStore = create<RecipeStore>()((set, get) => ({
  copy: null,
  editing: null,
  glow: null,
  toast: null,
  newTipIds: [],
  load(sourceRecipeId, recipe, readyBy) {
    const restored = readStoredCopy(sourceRecipeId);
    const deadline = parseReadyBy(readyBy);
    const copy = restored ?? { recipe, version: 0, undoStack: [], sourceRecipeId };
    const next = deadline ? { ...copy, readyBy: deadline } : copy;
    if (deadline) persistCopy(next);
    set({
      copy: next,
      editing: null,
      glow: null,
      toast: null,
      newTipIds: [],
    });
  },
  setEditing(target) {
    set({ editing: target ? { target } : null });
  },
  beginWholeRecipeEdit() {
    if (!get().editing) set({ editing: { target: null } });
  },
  applyEdit(result, baseVersion) {
    const { copy, editing } = get();
    if (!copy) return "stale";
    if (!editing) return "stale";
    if (copy.version !== baseVersion) return "stale";
    if (result.kind !== "patch") {
      set({ editing: null });
      return "ignored";
    }

    let applied: ReturnType<typeof applyEditResult>;
    try {
      applied = applyEditResult(copy.recipe, result);
    } catch (error) {
      // The server validates patches before they reach the client, so a failure here is a bad result.
      // Leave the recipe alone rather than crash the popover.
      if (error instanceof PatchError) {
        set({ editing: null });
        return "ignored";
      }
      throw error;
    }

    const key = nextKey();
    const next: WorkingCopy = {
      ...copy,
      recipe: applied.recipe,
      version: copy.version + 1,
      undoStack: [...copy.undoStack, copy.recipe].slice(-UNDO_LIMIT),
    };
    persistCopy(next);
    set({
      copy: next,
      editing: null,
      glow: { ids: applied.touchedIds, key },
      toast: { summary: result.summary ?? "Recipe updated", linesChanged: applied.touchedIds.length, key },
    });
    return "applied";
  },
  addTip(target, text) {
    const { copy, newTipIds } = get();
    if (!copy) return null;

    let added: ReturnType<typeof addTipToRecipe>;
    try {
      added = addTipToRecipe(copy.recipe, target, text);
    } catch (error) {
      if (error instanceof PatchError) return null;
      throw error;
    }

    const next: WorkingCopy = { ...copy, recipe: added.recipe };
    persistCopy(next);
    set({ copy: next, newTipIds: [...newTipIds, added.tipId] });
    return added.tipId;
  },
  undo() {
    const { copy } = get();
    if (!copy || copy.undoStack.length === 0) return false;

    const previous = copy.undoStack[copy.undoStack.length - 1];
    const next: WorkingCopy = {
      ...copy,
      recipe: previous,
      undoStack: copy.undoStack.slice(0, -1),
      version: copy.version + 1,
    };
    persistCopy(next);
    set({ copy: next, toast: null, glow: null });
    return true;
  },
  dismissToast() {
    set({ toast: null });
  },
}));
