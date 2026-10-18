import { create } from "zustand";
import type { AiEditResult, LineRef, Recipe, WorkingCopy } from "../recipe/schema";

// Client working copy of the open recipe (PRD §5.4, §5.8, §8.1). CONTRACT STUB: the state shape and
// action signatures are fixed; the bodies are implemented in phase 2.

export type RecipeStoreState = {
  /** null until `load` runs. */
  copy: WorkingCopy | null;
  /** The one edit that may run at a time (Explain is not an edit). Affected lines shimmer while set. */
  editing: { target: LineRef } | null;
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
  load(sourceRecipeId: string, recipe: Recipe): void;
  /** Marks an edit as running, or clears it. */
  setEditing(target: LineRef | null): void;
  /**
   * Applies a "patch" result if `baseVersion` still equals the current version: pushes the old
   * recipe on the undo stack (max UNDO_LIMIT), bumps version, sets glow and toast, persists.
   * Returns "stale" (and changes nothing) when the version moved on, "ignored" for non-patch kinds.
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

export const useRecipeStore = create<RecipeStore>()(() => ({
  copy: null,
  editing: null,
  glow: null,
  toast: null,
  newTipIds: [],
  load() {
    throw new Error("not implemented");
  },
  setEditing() {
    throw new Error("not implemented");
  },
  applyEdit() {
    throw new Error("not implemented");
  },
  addTip() {
    throw new Error("not implemented");
  },
  undo() {
    throw new Error("not implemented");
  },
  dismissToast() {
    throw new Error("not implemented");
  },
}));
