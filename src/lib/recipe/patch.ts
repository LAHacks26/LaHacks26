import type { AiEditResult, LineRef, PatchOp, Recipe } from "./schema";

// Pure patch engine shared by client and server (PRD §6.3). CONTRACT STUB: signatures are fixed;
// the bodies are implemented in phase 2.

export class PatchError extends Error {}

/**
 * Server-side, before validation: gives every newly created ingredient, step and appliance
 * (add_ingredient, insert_step, add_appliance) the next free ID ("i12", "s9", "a4") when its ID is
 * already used or repeated, and rewrites references to it in later ops. Returns new ops; never mutates.
 */
export function normalizePatchIds(recipe: Recipe, ops: PatchOp[]): PatchOp[] {
  void recipe;
  void ops;
  throw new Error("not implemented");
}

/**
 * Returns one message per problem (empty array = valid): unknown IDs in update/remove/after/target,
 * step refs to ingredients or appliances that won't exist after the patch, duplicate new IDs,
 * and removing every ingredient or every step. Messages are fed back to Gemini on retry.
 */
export function validatePatch(recipe: Recipe, ops: PatchOp[]): string[] {
  void recipe;
  void ops;
  throw new Error("not implemented");
}

/**
 * Applies ops in order without mutating `recipe`. `touchedIds` lists lines that were updated or
 * added (including the target line of add_tip), for the glow. Removed lines are not listed.
 * add_tip gets the next free tip ID ("t3"), with anchorText from target.selectedText.
 * Throws PatchError on an invalid op.
 */
export function applyPatch(recipe: Recipe, ops: PatchOp[]): { recipe: Recipe; touchedIds: string[] } {
  void recipe;
  void ops;
  throw new Error("not implemented");
}

/**
 * Applies a "patch" result: its ops, then its `meta` (times, difficulty, cleanup) on top.
 * Any other kind returns the recipe unchanged with no touched IDs.
 */
export function applyEditResult(
  recipe: Recipe,
  result: AiEditResult,
): { recipe: Recipe; touchedIds: string[] } {
  void recipe;
  void result;
  throw new Error("not implemented");
}

/** Adds one tip under a line (used when an explanation finishes streaming). Returns the new recipe and tip ID. */
export function addTip(recipe: Recipe, target: LineRef, text: string): { recipe: Recipe; tipId: string } {
  void recipe;
  void target;
  void text;
  throw new Error("not implemented");
}
