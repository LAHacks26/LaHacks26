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

/**
 * Allergy words that name another allergen, keyed by normalized stem (lowercase, one trailing "s"
 * removed). "milk" is dairy, "nut" is tree nut and peanut, "wheat" is gluten.
 */
const ALLERGY_KEYS: Record<string, readonly string[]> = {
  milk: ["dairy"],
  "milk product": ["dairy"],
  lactose: ["dairy"],
  casein: ["dairy"],
  whey: ["dairy"],
  nut: ["tree nut", "peanut"],
  groundnut: ["peanut"],
  wheat: ["gluten"],
  soya: ["soy"],
  soybean: ["soy"],
  crustacean: ["shellfish"],
  "shell fish": ["shellfish"],
  "sesame seed": ["sesame"],
};

type Allergen = {
  /** The generic name: "dairy-free" and "egg-free" also negate the item after them. */
  key: string;
  /** Other names for it. "wheat-free" negates only the word "wheat", so "wheat-free spelt bread" still counts. */
  aliases: readonly string[];
  /** Words that count as the allergen, besides the key and the aliases. */
  words: readonly string[];
};

const ALLERGENS: Record<string, Allergen> = {
  dairy: {
    key: "dairy",
    aliases: ["milk", "lactose", "casein", "whey"],
    words: [
      "butter", "buttermilk", "cheese", "cream", "yogurt", "yoghurt", "ghee", "paneer", "kefir",
      "parmesan", "parmigiano", "mozzarella", "cheddar", "ricotta", "feta", "brie", "mascarpone", "halloumi",
      "gouda", "gruyere", "half-and-half", "creamer", "custard", "gelato", "crème fraîche", "creme fraiche",
      "curd", "butterscotch",
    ],
  },
  "tree nut": {
    key: "tree nut",
    aliases: ["nut"],
    words: [
      "almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut",
      "marzipan", "praline", "nutella", "chestnut",
    ],
  },
  peanut: { key: "peanut", aliases: ["groundnut"], words: ["satay"] },
  egg: {
    key: "egg",
    aliases: [],
    words: ["mayonnaise", "mayo", "meringue", "aioli", "eggnog", "albumin", "hollandaise", "brioche"],
  },
  gluten: {
    key: "gluten",
    aliases: ["wheat"],
    words: [
      "barley", "rye", "spelt", "semolina", "couscous", "bread crumb", "breadcrumb", "flour", "pasta",
      "spaghetti", "noodle", "bread", "panko", "tortilla", "seitan", "farro", "bulgur", "beer", "soy sauce",
    ],
  },
  soy: {
    key: "soy",
    aliases: ["soya", "soybean"],
    words: ["tofu", "tempeh", "edamame", "miso", "tamari", "natto"],
  },
  fish: {
    key: "fish",
    aliases: [],
    words: [
      "salmon", "tuna", "cod", "anchovy", "anchovies", "sardine", "fish sauce", "tilapia", "halibut", "trout",
      "mackerel", "haddock", "catfish", "snapper", "swordfish", "herring", "worcestershire",
    ],
  },
  shellfish: {
    key: "shellfish",
    aliases: ["crustacean", "shell fish"],
    words: [
      "shrimp", "prawn", "crab", "lobster", "scallop", "clam", "mussel", "oyster", "crayfish", "crawfish",
      "langoustine", "squid", "calamari",
    ],
  },
  sesame: { key: "sesame", aliases: ["sesame seed"], words: ["tahini", "hummus", "halva"] },
};

const NO_ALLERGEN: Allergen = { key: "", aliases: [], words: [] };

/** Lookbehinds: a word is not the allergen when one of these comes right before it. */
const FLOUR_EXCEPTION =
  "(?<!\\b(?:rice|almond|coconut|oat|corn|chickpea|tapioca|buckwheat|cassava|potato|sorghum|quinoa|arrowroot|millet|teff|gram)[\\s-]+)";
const NOODLE_EXCEPTION = "(?<!\\b(?:rice|glass|kelp|zucchini|mung bean)[\\s-]+)";
const TORTILLA_EXCEPTION = "(?<!\\b(?:corn|rice)[\\s-]+)";
const WORD_PREFIX: Record<string, string> = {
  flour: FLOUR_EXCEPTION,
  noodle: NOODLE_EXCEPTION,
  pasta: NOODLE_EXCEPTION,
  spaghetti: NOODLE_EXCEPTION,
  tortilla: TORTILLA_EXCEPTION,
};

/** Dairy-looking words that are not dairy: plant milks, creams, cheeses and yogurts, nut and seed butters, cocoa butter, cream of tartar, butter beans. */
const DAIRY_LOOKALIKES = new RegExp(
  [
    String.raw`\b(?:coconut|almond|oat|soy|rice|cashew|peanut|nut|sunflower|seed|cocoa|apple)\s+(?:milks?|creams?|butters?|cheeses?|yogh?urts?)\b`,
    String.raw`\bcream of tartar\b`,
    String.raw`\b(?:vegan|plant[\s-]+based|dairy[\s-]+free|non[\s-]*dairy)[\s-]+(?:cream cheese|butter|cheese|cream|milk|yogh?urt)s?\b`,
    String.raw`\bbutter[\s-]?beans?\b`,
    String.raw`\bbutter(?:nut|cup)\b`,
  ].join("|"),
  "gi",
);

/** Up to two words after a negated generic name, so "dairy-free butter" negates "butter" too. Stops at "and", "or", punctuation. */
const NEGATED_ITEM = "(?:\\s+(?!(?:and|or|with|but|plus|to|for|in|of|on|at)\\b)[a-z][a-z'-]*){0,2}";

function alternation(words: readonly string[]): string {
  return words.map((word) => `${escapeRegExp(word)}(?:s|es)?`).join("|");
}

/** The negation forms for one set of names. `item` is the trailing consumption: NEGATED_ITEM for generic names, "" for aliases. */
function negationPatterns(names: readonly string[], item: string): RegExp[] {
  if (names.length === 0) return [];
  const alt = alternation(names);
  return [
    new RegExp(`\\b(?:${alt})[- ]free\\b${item}`, "gi"),
    new RegExp(`\\bfree of (?:${alt})\\b${item}`, "gi"),
    new RegExp(`\\bwithout (?:${alt})\\b${item}`, "gi"),
    new RegExp(`\\bnon-?(?:${alt})\\b${item}`, "gi"),
    new RegExp(`\\b(?:${alt})less\\b${item}`, "gi"),
  ];
}

/**
 * Removes negated mentions so they never count. Generic names ("dairy-free", "egg-free") negate the
 * item after them. Aliases ("milk-free", "wheat-free") negate only the word itself.
 */
function stripNegations(text: string, generic: readonly string[], aliases: readonly string[]): string {
  const patterns = [...negationPatterns(generic, NEGATED_ITEM), ...negationPatterns(aliases, "")];
  return patterns.reduce((acc, pattern) => acc.replace(pattern, " "), text);
}

/** Lowercase, single spaces, one trailing "s" removed: "Tree Nuts" becomes "tree nut". */
function allergyStem(allergy: string): string {
  return allergy.trim().toLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
}

/**
 * Returns the allergy that `text` mentions, or undefined. Each allergy counts its synonyms too ("butter"
 * for dairy, "almond" for tree nuts, "pasta" for gluten). Whole words only, so "egg" does not match
 * "eggplant". Negated mentions ("gluten-free flour", "egg-free mayo", "wheat-free spelt bread" is
 * negated only for "wheat") and dairy lookalikes ("coconut milk", "peanut butter") do not count.
 */
export function containsAllergen(text: string, allergies: readonly string[]): string | undefined {
  for (const allergy of allergies) {
    const stem = allergyStem(allergy);
    if (stem.length < 3) continue;
    const specs = (ALLERGY_KEYS[stem] ?? [stem]).map((key) => ALLERGENS[key] ?? { ...NO_ALLERGEN, key });
    const generic = specs.map((spec) => spec.key);
    const aliases = specs.flatMap((spec) => spec.aliases);
    const words = [...new Set(specs.flatMap((spec) => [spec.key, ...spec.aliases, ...spec.words]))];

    let cleaned = stripNegations(text, generic, aliases);
    if (generic.includes("dairy")) cleaned = cleaned.replace(DAIRY_LOOKALIKES, " ");
    for (const word of words) {
      const pattern = new RegExp(`${WORD_PREFIX[word] ?? ""}\\b${escapeRegExp(word)}(?:s|es)?\\b`, "i");
      if (pattern.test(cleaned)) return allergy;
    }
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
