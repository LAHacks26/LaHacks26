import type { LineRef, Recipe } from "../recipe/schema";
import type { EditAction } from "./contracts";

// Pure helpers shared by the edit, explain and swap prompts, plus the allergen check. No `server-only`,
// so vitest can cover them. This is a new file: the AI prompt helpers had no shared home yet.

/** Compact recipe for prompts: no tips, and optional fields only when they carry data. */
export function compactRecipe(recipe: Recipe) {
  return {
    title: recipe.title,
    servings: recipe.servings,
    times: recipe.times,
    appliances: recipe.appliances.map((a) => ({ id: a.id, name: a.name })),
    ingredients: recipe.ingredients.map((i) => ({
      id: i.id,
      qty: i.qty,
      unit: i.unit,
      item: i.item,
      ...(i.note ? { note: i.note } : {}),
      ...(i.group ? { group: i.group } : {}),
      ...(i.allergens.length > 0 ? { allergens: i.allergens } : {}),
    })),
    steps: recipe.steps.map((s) => ({
      id: s.id,
      text: s.text,
      ingredientIds: s.ingredientIds,
      applianceIds: s.applianceIds,
      estMin: s.estMin,
      ...(s.timer ? { timer: s.timer } : {}),
    })),
  };
}

/** The line's own text: an ingredient's amount and name, a step's text, or an appliance's name. Undefined if absent. */
export function targetText(recipe: Recipe, target: LineRef): string | undefined {
  if (target.kind === "ingredient") {
    const ing = recipe.ingredients.find((i) => i.id === target.id);
    if (!ing) return undefined;
    const amount = [ing.qty, ing.unit].filter((v) => v !== null && v !== undefined && v !== "").join(" ");
    return [amount, ing.item, ing.note ? `(${ing.note})` : ""].filter(Boolean).join(" ");
  }
  if (target.kind === "step") {
    return recipe.steps.find((s) => s.id === target.id)?.text;
  }
  return recipe.appliances.find((a) => a.id === target.id)?.name;
}

/** Short name for a target: the ingredient's item, the appliance's name, or undefined for a step. */
export function targetName(recipe: Recipe, target: LineRef): string | undefined {
  if (target.kind === "ingredient") return recipe.ingredients.find((i) => i.id === target.id)?.item;
  if (target.kind === "appliance") return recipe.appliances.find((a) => a.id === target.id)?.name;
  return undefined;
}

/** Plain-text description of the target for a prompt, with the steps that use it and any highlighted phrase. */
export function describeTarget(recipe: Recipe, target: LineRef): string {
  const kindLabel = target.kind;
  const text = targetText(recipe, target);
  const lines = [
    text === undefined
      ? `Target: ${kindLabel} ${target.id} (not in the recipe).`
      : `Target: ${kindLabel} ${target.id}: "${text}"`,
  ];
  if (target.selectedText) {
    lines.push(`Highlighted phrase inside the target: ${JSON.stringify(target.selectedText)}. The request applies to this phrase.`);
  }
  if (target.kind !== "step") {
    const usedBy = recipe.steps.filter((s) =>
      target.kind === "ingredient" ? s.ingredientIds.includes(target.id) : s.applianceIds.includes(target.id),
    );
    if (usedBy.length > 0) {
      lines.push(`Steps that use it: ${usedBy.map((s) => `${s.id} "${s.text}"`).join("; ")}`);
    } else {
      lines.push("No step uses it yet.");
    }
  }
  return lines.join("\n");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Plant milks are not dairy, so they never trip a "milk" or "dairy" allergy.
const PLANT_MILK = /\b(?:coconut|almond|oat|soy|rice|cashew)\s+milks?\b/gi;
const MILK_STEMS = new Set(["milk", "dairy"]);

/** Removes negated mentions ("dairy-free", "free of dairy", "without eggs", "non-dairy") so they never count. */
function stripNegations(text: string, term: string): string {
  const negations = [
    new RegExp(`\\b${term}[- ]free\\b`, "gi"),
    new RegExp(`\\bfree of ${term}\\b`, "gi"),
    new RegExp(`\\bwithout ${term}\\b`, "gi"),
    new RegExp(`\\bnon-?${term}\\b`, "gi"),
  ];
  return negations.reduce((acc, pattern) => acc.replace(pattern, " "), text);
}

/**
 * Returns the allergy that `text` mentions, or undefined. Whole words only, so "egg" does not match
 * "eggplant", and a plural matches its singular ("peanuts" also catches "peanut butter"). Negated
 * mentions ("gluten-free", "without eggs") do not count, and plant milks are not dairy.
 */
export function containsAllergen(text: string, allergies: readonly string[]): string | undefined {
  for (const allergy of allergies) {
    const stem = allergy.trim().toLowerCase().replace(/s$/, "");
    if (stem.length < 3) continue;
    // A dairy allergy also covers the word "milk" (plant milks are removed first).
    const names = stem === "dairy" ? ["dairy", "milk"] : [stem];
    const term = `(?:${names.map(escapeRegExp).join("|")})(?:s|es)?`;
    let cleaned = stripNegations(text, term);
    if (MILK_STEMS.has(stem)) cleaned = cleaned.replace(PLANT_MILK, " ");
    if (new RegExp(`\\b${term}\\b`, "i").test(cleaned)) return allergy;
  }
  return undefined;
}

/**
 * Why an edit request cannot run against this recipe, or undefined if it can. Runs before any Gemini
 * call. The target must exist, and the action must fit the target's kind.
 */
export function editTargetProblem(recipe: Recipe, action: EditAction, target: LineRef): string | undefined {
  const exists =
    target.kind === "ingredient"
      ? recipe.ingredients.some((i) => i.id === target.id)
      : target.kind === "step"
        ? recipe.steps.some((s) => s.id === target.id)
        : recipe.appliances.some((a) => a.id === target.id);
  if (!exists) return `That ${target.kind} isn't in this recipe.`;
  if (action === "substitute" && target.kind !== "ingredient") return "Substitute works on an ingredient.";
  if (action === "missing_appliance" && target.kind !== "appliance") return "That action works on an appliance.";
  return undefined;
}

/** Trims the items and drops empty ones and any that mention a listed allergen. */
export function filterAllergenSafe(items: readonly string[], allergies: readonly string[]): string[] {
  return items.map((s) => s.trim()).filter((s) => s !== "" && containsAllergen(s, allergies) === undefined);
}
