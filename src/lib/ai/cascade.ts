import type { PatchOp, Recipe } from "../recipe/schema";

// Smart cascade check (PRD §3 step 4, EDIT_RULES): when a patch renames an ingredient, every step
// that uses it and still names the old ingredient must be rewritten in the same patch.

/** Words that describe an ingredient rather than name it. "heavy cream" → coconut milk leaves "cream". */
const DESCRIPTORS = new Set([
  "all", "and", "boneless", "chopped", "coarse", "cooked", "diced", "dried", "extra", "fat", "fine", "finely",
  "for", "free", "fresh", "frozen", "full", "ground", "heavy", "large", "light", "low", "medium", "minced",
  "plain", "purpose", "raw", "reduced", "salted", "skinless", "sliced", "small", "the", "unsalted", "virgin",
  "whole", "with",
]);

function singular(word: string): string {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(?:[sxzo]|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (/[^su]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Naming words of an ingredient, singular, so "tomatoes" and "tomato" compare equal. Text after a
 * comma or in parentheses is a note ("olive oil, for frying"), not the name.
 */
function nameWords(item: string): string[] {
  return item
    .replace(/\([^)]*\)/g, " ")
    .split(",")[0]!
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !DESCRIPTORS.has(word))
    .map(singular);
}

/** Whole-word match of a singular word or its plural. Words are [a-z] only, so they are regex-safe. */
function mentions(text: string, word: string): boolean {
  const plural = word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}e?s`;
  return new RegExp(`\\b(?:${word}|${plural})\\b`, "i").test(text);
}

/**
 * Problems for steps the patch leaves untouched although they use a renamed ingredient and still
 * name it. Only IDs and single lowercase words go into the messages, never recipe text.
 */
export function cascadeProblems(recipe: Recipe, ops: readonly PatchOp[]): string[] {
  const rewritten = new Set(
    ops.flatMap((op) => (op.op === "update_step" && op.text !== undefined) || op.op === "remove_step" ? [op.id] : []),
  );
  const problems: string[] = [];
  for (const op of ops) {
    if (op.op !== "update_ingredient" || op.item === undefined) continue;
    const before = recipe.ingredients.find((ingredient) => ingredient.id === op.id);
    if (!before) continue;
    const kept = new Set(nameWords(op.item));
    const replaced = nameWords(before.item).filter((word) => !kept.has(word));
    if (replaced.length === 0) continue;

    for (const step of recipe.steps) {
      if (rewritten.has(step.id) || !step.ingredientIds.includes(op.id)) continue;
      const word = replaced.find((candidate) => mentions(step.text, candidate));
      if (word) {
        problems.push(
          `Step ${step.id} uses ${op.id} and still says "${word}" after the swap. Add an update_step op that rewrites its text for the new ingredient (smart cascade).`,
        );
      }
    }
  }
  return problems;
}
