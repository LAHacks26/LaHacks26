import { z } from "zod";
import type { RawRecipe } from "../ingest/types";
import { COMMON_ALLERGENS, HttpUrlSchema, type Ingredient, type Recipe, type Step, type Timer } from "../recipe/schema";

// Draft format Gemini fills in, plus the pure post-processing that turns it into a Recipe.
// No `server-only` here so vitest can cover it. Flat on purpose: Gemini handles flat schemas best.

const idHint = (prefix: string, example: string) =>
  `Unique ID in the form ${prefix}N, numbered from 1 (${example}). Steps refer to it by this ID.`;

export const DraftIngredientSchema = z.object({
  id: z.string().describe(idHint("i", "i1, i2, ...")),
  qty: z.number().nullable().describe("Amount as a number. Null when there is no amount."),
  unit: z.string().nullable().describe('Unit as written, e.g. "tbsp", "cup", "g". Null for counts like "2 eggs".'),
  item: z.string().describe('Ingredient name, e.g. "unsalted butter".'),
  note: z.string().describe('Prep note, e.g. "softened". Empty string if none.'),
  group: z.string().describe('Section heading it sits under, e.g. "For the marinade". Empty string if none.'),
  allergens: z.array(z.enum(COMMON_ALLERGENS)).describe("Allergen tags from the fixed list. Empty array if none."),
});

export const DraftApplianceSchema = z.object({
  id: z.string().describe(idHint("a", "a1, a2, ...")),
  name: z.string().describe('Equipment name, e.g. "oven", "Dutch oven".'),
});

export const DraftStepSchema = z.object({
  id: z.string().describe(idHint("s", "s1, s2, ... in cooking order")),
  text: z.string().describe("The instruction, in the author's wording where reasonable. No quantities."),
  ingredientIds: z.array(z.string()).describe("IDs of the ingredients this step uses."),
  applianceIds: z.array(z.string()).describe("IDs of the appliances this step uses."),
  estMin: z.number().describe("Minutes this step takes, including waiting."),
  timerMin: z.number().nullable().describe("Shortest explicit wait in minutes. Null if the step has no wait."),
  timerMax: z.number().nullable().describe("Longest explicit wait in minutes. Null if the step has no wait."),
});

export const DraftRecipeSchema = z.object({
  notARecipe: z.boolean().describe("True if the input has no ingredient list and no cooking steps. Then leave the lists empty."),
  title: z.string(),
  servings: z.number().int().describe("Servings as a whole number. 4 if unknown."),
  totalMin: z.number().describe("Total minutes: prep plus cook plus waiting."),
  activeMin: z.number().describe("Hands-on minutes."),
  difficultyScore: z.number().int().describe("Integer 1 to 5, per the rubric."),
  difficultyReason: z.string().describe("One sentence."),
  cleanupScore: z.number().int().describe("Integer 1 to 5, per the rubric."),
  cleanupReason: z.string().describe("One sentence."),
  dishes: z.array(z.string()).describe("Dishes and tools to wash."),
  ingredients: z.array(DraftIngredientSchema),
  appliances: z.array(DraftApplianceSchema),
  steps: z.array(DraftStepSchema),
});
export type DraftRecipe = z.infer<typeof DraftRecipeSchema>;

/** Server-side facts the draft does not carry. The page URL and site are never trusted from the model. */
export type DraftContext = {
  url: string;
  siteName: string;
  jsonLd: RawRecipe | null;
};

const DEFAULT_SERVINGS = 4;
const NEUTRAL_SCORE = 3;

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return NEUTRAL_SCORE;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function trimmed(value: string | null | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Whole-number servings from a JSON-LD yield such as "4 servings" or "Serves 6". */
function servingsFromYield(yieldText: string | undefined): number | undefined {
  const match = yieldText?.match(/\d+/);
  const n = match ? Number.parseInt(match[0], 10) : Number.NaN;
  return n > 0 ? n : undefined;
}

function timerFrom(min: number | null, max: number | null): Timer | undefined {
  const values = [min, max].filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
  if (values.length === 0) return undefined;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi <= 0) return undefined;
  return { min: lo, max: hi };
}

/**
 * Turns the model's draft into a Recipe candidate. Renumbers IDs by position, remaps step
 * references, drops references to unknown IDs, clamps scores and fills server-owned fields.
 * Returns null when the draft is not a recipe (no usable ingredients or steps).
 * The caller still validates the result with RecipeSchema.
 */
export function draftToRecipe(draft: DraftRecipe, ctx: DraftContext): Recipe | null {
  if (draft.notARecipe) return null;
  const jl = ctx.jsonLd;

  // Ingredients first, so step references can be remapped.
  const ingredientMap = new Map<string, string>();
  const ingredients: Ingredient[] = [];
  for (const raw of draft.ingredients) {
    const item = raw.item.trim();
    if (!item) continue;
    const id = `i${ingredients.length + 1}`;
    if (!ingredientMap.has(raw.id.trim())) ingredientMap.set(raw.id.trim(), id);
    const note = trimmed(raw.note);
    const group = trimmed(raw.group);
    ingredients.push({
      id,
      qty: raw.qty !== null && Number.isFinite(raw.qty) && raw.qty > 0 ? raw.qty : null,
      unit: trimmed(raw.unit) ?? null,
      item,
      ...(note ? { note } : {}),
      ...(group ? { group } : {}),
      allergens: unique(raw.allergens.map((a) => a.trim().toLowerCase()).filter(Boolean)),
      tips: [],
    });
  }

  const applianceMap = new Map<string, string>();
  const appliances: Recipe["appliances"] = [];
  for (const raw of draft.appliances) {
    const name = trimmed(raw.name);
    if (!name) continue;
    const id = `a${appliances.length + 1}`;
    if (!applianceMap.has(raw.id.trim())) applianceMap.set(raw.id.trim(), id);
    appliances.push({ id, name, tips: [] });
  }

  const remap = (refs: string[], map: Map<string, string>): string[] =>
    unique(refs.flatMap((ref) => {
      const id = map.get(ref.trim());
      return id ? [id] : [];
    }));

  const steps: Step[] = [];
  for (const raw of draft.steps) {
    const text = raw.text.trim();
    if (!text) continue;
    const timer = timerFrom(raw.timerMin, raw.timerMax);
    steps.push({
      id: `s${steps.length + 1}`,
      text,
      ingredientIds: remap(raw.ingredientIds, ingredientMap),
      applianceIds: remap(raw.applianceIds, applianceMap),
      estMin: nonNegative(raw.estMin),
      ...(timer ? { timer } : {}),
      tips: [],
    });
  }

  if (ingredients.length === 0 || steps.length === 0) return null;

  // JSON-LD is primary for times and servings; the model fills in what JSON-LD lacks.
  const jsonLdTotal = jl?.totalTimeMin || (jl?.prepTimeMin ?? 0) + (jl?.cookTimeMin ?? 0) || undefined;
  const totalMin = Math.round(nonNegative(jsonLdTotal ?? draft.totalMin));
  const activeMin = Math.min(Math.round(nonNegative(draft.activeMin)), totalMin);
  const servings =
    servingsFromYield(jl?.recipeYield) ??
    (Number.isFinite(draft.servings) && draft.servings >= 1 ? Math.round(draft.servings) : DEFAULT_SERVINGS);

  const author = trimmed(jl?.author);
  const imageUrl = jl?.imageUrl && HttpUrlSchema.safeParse(jl.imageUrl).success ? jl.imageUrl : undefined;

  return {
    title: trimmed(draft.title) ?? trimmed(jl?.name) ?? "Untitled recipe",
    source: {
      url: ctx.url,
      siteName: ctx.siteName,
      ...(author ? { author } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
    servings,
    times: { totalMin, activeMin },
    difficulty: { score: clampScore(draft.difficultyScore), reason: draft.difficultyReason.trim() },
    cleanup: {
      score: clampScore(draft.cleanupScore),
      reason: draft.cleanupReason.trim(),
      dishes: draft.dishes.map((d) => d.trim()).filter(Boolean),
    },
    ingredients,
    appliances,
    steps,
  };
}
