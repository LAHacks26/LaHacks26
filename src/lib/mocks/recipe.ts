import type { ReadyBy, RecipeViewProps } from "@/components/recipe";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import type { Recipe } from "@/lib/recipe/schema";

// Mock data for the recipe page mocks. Display only; nothing here calls the API.

export const MOCK_ALLERGIES = ["dairy"];

export const MOCK_READY_BY: ReadyBy = {
  kind: "startBy",
  startAt: "6:35 PM",
  readyAt: "7:30",
};

export const HEAVY_CREAM_SUBSTITUTES = ["coconut milk", "cashew cream", "oat cream"];

export const UNTIL_CHARRED_EXPLANATION =
  "Charred means blistered, dark spots on the edges, not a uniformly black surface. Look for blackened edges on about a quarter of each piece, and pull the pieces once they are cooked through so the inside stays juicy.";

export const SALT_TO_SUGAR_REJECTION = {
  reason: "Sugar can't season a savory sauce the way salt does.",
  suggestions: ["soy sauce", "fish sauce", "lemon + herbs"],
};

export const TEN_MINUTE_IMPOSSIBLE = {
  reason:
    "Raw chicken needs about 20 minutes of cooking to be safe, so 10 minutes isn't possible.",
  suggestedSearch: "10-minute chicken curry with rotisserie chicken",
};

/** Heavy cream swapped for coconut milk, with the cascade into step 7. */
export const patchedRecipe: Recipe = (() => {
  const recipe = structuredClone(butterChicken);
  const cream = recipe.ingredients.find((ingredient) => ingredient.id === "i9");
  if (cream) {
    cream.qty = 1;
    cream.unit = "cup";
    cream.item = "full-fat coconut milk";
    cream.allergens = [];
  }
  const step = recipe.steps.find((item) => item.id === "s7");
  if (step) {
    step.text =
      "Stir in the coconut milk and the broiled chicken, keeping the sauce below a boil so it doesn't split, then simmer for 2 minutes more.";
  }
  return recipe;
})();

export const PATCHED_GLOW_IDS = ["i9", "s7"];

const base: RecipeViewProps = {
  recipe: butterChicken,
  allergies: MOCK_ALLERGIES,
  readyBy: MOCK_READY_BY,
};

export const RECIPE_MOCK_STATES = [
  "default",
  "popover",
  "phrase",
  "patched",
  "rejected",
  "appliance",
  "impossible",
] as const;

export type RecipeMockState = (typeof RECIPE_MOCK_STATES)[number];

export function isRecipeMockState(value: unknown): value is RecipeMockState {
  return typeof value === "string" && (RECIPE_MOCK_STATES as readonly string[]).includes(value);
}

export const recipeMockStates: Record<
  RecipeMockState,
  { label: string; props: RecipeViewProps }
> = {
  default: {
    label: "Default",
    props: { ...base },
  },
  popover: {
    label: "Click-to-ask popover",
    props: {
      ...base,
      active: {
        kind: "ingredient",
        id: "i9",
        mode: "substitute",
        suggestions: HEAVY_CREAM_SUBSTITUTES,
      },
    },
  },
  phrase: {
    label: "Highlighted phrase",
    props: {
      ...base,
      highlight: { stepId: "s4", text: "until charred" },
      active: {
        kind: "step",
        id: "s4",
        mode: "explain",
        label: "“until charred”",
        explanation: UNTIL_CHARRED_EXPLANATION,
      },
      openTipIds: ["t1"],
    },
  },
  patched: {
    label: "Edit applied",
    props: {
      ...base,
      recipe: patchedRecipe,
      glowIds: PATCHED_GLOW_IDS,
      glowMs: 4000,
      toast: {
        summary: "Swapped heavy cream → coconut milk",
        linesChanged: PATCHED_GLOW_IDS.length,
      },
    },
  },
  rejected: {
    label: "Rejected swap",
    props: {
      ...base,
      active: {
        kind: "ingredient",
        id: "i4",
        mode: "rejected",
        question: "What if I use sugar instead of salt?",
        rejection: SALT_TO_SUGAR_REJECTION,
      },
    },
  },
  appliance: {
    label: "No oven",
    props: {
      ...base,
      active: {
        kind: "appliance",
        id: "a1",
        mode: "loading",
        question: "I don't have an oven",
        loadingText: "Rewriting for the stovetop…",
      },
    },
  },
  impossible: {
    label: "Impossible ask",
    props: {
      ...base,
      active: {
        kind: "step",
        id: "s2",
        mode: "impossible",
        question: "Can this be ready in 10 minutes?",
        impossible: TEN_MINUTE_IMPOSSIBLE,
      },
    },
  },
};
