import { describe, expect, it } from "vitest";
import { RecipeSchema } from "../recipe/schema";
import { type DraftContext, type DraftRecipe, draftToRecipe } from "./normalizeDraft";

const ctx: DraftContext = {
  url: "https://www.example.com/butter-chicken",
  siteName: "Example Kitchen",
  jsonLd: null,
};

function draft(overrides: Partial<DraftRecipe> = {}): DraftRecipe {
  return {
    notARecipe: false,
    title: "Butter chicken",
    servings: 4,
    totalMin: 60,
    activeMin: 25,
    difficultyScore: 3,
    difficultyReason: "Several components.",
    cleanupScore: 3,
    cleanupReason: "A few pans.",
    dishes: ["Skillet", " Bowl "],
    ingredients: [
      { id: "x9", qty: 1, unit: "lb", item: "chicken thighs", note: "", group: "", allergens: [] },
      { id: "x2", qty: 0.5, unit: "cup", item: "heavy cream", note: "", group: "", allergens: ["dairy"] },
      { id: "x5", qty: null, unit: null, item: "salt", note: "to taste", group: "", allergens: [] },
    ],
    appliances: [
      { id: "q1", name: "Broiler" },
      { id: "q2", name: "Large skillet" },
    ],
    steps: [
      {
        id: "z7",
        text: "Marinate the chicken.",
        ingredientIds: ["x9", "x5"],
        applianceIds: [],
        estMin: 30,
        timerMin: 30,
        timerMax: 30,
      },
      {
        id: "z8",
        text: "Broil until charred.",
        ingredientIds: ["x9", "nope"],
        applianceIds: ["q1", "q99"],
        estMin: 10,
        timerMin: null,
        timerMax: null,
      },
      {
        id: "z9",
        text: "Simmer the sauce.",
        ingredientIds: ["x2"],
        applianceIds: ["q2"],
        estMin: 12,
        timerMin: 10,
        timerMax: 15,
      },
    ],
    ...overrides,
  };
}

describe("draftToRecipe", () => {
  it("renumbers IDs sequentially by position", () => {
    const recipe = draftToRecipe(draft(), ctx);
    expect(recipe).not.toBeNull();
    expect(recipe?.ingredients.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(recipe?.appliances.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(recipe?.steps.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("remaps step references to the new IDs", () => {
    const recipe = draftToRecipe(draft(), ctx);
    expect(recipe?.steps[0].ingredientIds).toEqual(["i1", "i3"]);
    expect(recipe?.steps[2].ingredientIds).toEqual(["i2"]);
    expect(recipe?.steps[2].applianceIds).toEqual(["a2"]);
  });

  it("drops step references to unknown IDs", () => {
    const recipe = draftToRecipe(draft(), ctx);
    expect(recipe?.steps[1].ingredientIds).toEqual(["i1"]);
    expect(recipe?.steps[1].applianceIds).toEqual(["a1"]);
  });

  it("clamps scores to 1 to 5 and rounds them", () => {
    const low = draftToRecipe(draft({ difficultyScore: 0, cleanupScore: -4 }), ctx);
    expect(low?.difficulty.score).toBe(1);
    expect(low?.cleanup.score).toBe(1);

    const high = draftToRecipe(draft({ difficultyScore: 9, cleanupScore: 4.6 }), ctx);
    expect(high?.difficulty.score).toBe(5);
    expect(high?.cleanup.score).toBe(5);
  });

  it("builds timers only for explicit waits and keeps min <= max", () => {
    const recipe = draftToRecipe(draft(), ctx);
    expect(recipe?.steps[0].timer).toEqual({ min: 30, max: 30 });
    expect(recipe?.steps[1].timer).toBeUndefined();
    expect(recipe?.steps[2].timer).toEqual({ min: 10, max: 15 });
  });

  it("sets qty to null for non-positive amounts and omits empty optional fields", () => {
    const recipe = draftToRecipe(draft(), ctx);
    expect(recipe?.ingredients[2].qty).toBeNull();
    expect(recipe?.ingredients[0]).not.toHaveProperty("note");
    expect(recipe?.ingredients[0]).not.toHaveProperty("group");
    expect(recipe?.ingredients[2].note).toBe("to taste");
  });

  it("fills server-owned fields and sets empty tips everywhere", () => {
    const recipe = draftToRecipe(draft(), ctx);
    expect(recipe?.source).toEqual({ url: ctx.url, siteName: ctx.siteName });
    expect(recipe?.ingredients.every((i) => Array.isArray(i.tips) && i.tips.length === 0)).toBe(true);
    expect(recipe?.appliances.every((a) => a.tips.length === 0)).toBe(true);
    expect(recipe?.steps.every((s) => s.tips.length === 0)).toBe(true);
  });

  it("defaults servings to 4 and never returns a non-positive value", () => {
    expect(draftToRecipe(draft({ servings: 0 }), ctx)?.servings).toBe(4);
    expect(draftToRecipe(draft({ servings: 2.4 }), ctx)?.servings).toBe(2);
  });

  it("prefers JSON-LD for times, servings, author and image", () => {
    const jsonLd = {
      name: "Butter Chicken (JSON-LD)",
      author: "Jane Cook",
      imageUrl: "https://img.example.com/bc.jpg",
      recipeYield: "6 servings",
      totalTimeMin: 90,
      ingredients: [],
      instructions: [],
    };
    const recipe = draftToRecipe(draft(), { ...ctx, jsonLd });
    expect(recipe?.times.totalMin).toBe(90);
    expect(recipe?.servings).toBe(6);
    expect(recipe?.source.author).toBe("Jane Cook");
    expect(recipe?.source.imageUrl).toBe("https://img.example.com/bc.jpg");
  });

  it("sums prep and cook when JSON-LD has no total", () => {
    const jsonLd = { prepTimeMin: 20, cookTimeMin: 40, ingredients: [], instructions: [] };
    expect(draftToRecipe(draft(), { ...ctx, jsonLd })?.times.totalMin).toBe(60);
  });

  it("drops non-http image URLs", () => {
    const jsonLd = { imageUrl: "javascript:alert(1)", ingredients: [], instructions: [] };
    expect(draftToRecipe(draft(), { ...ctx, jsonLd })?.source.imageUrl).toBeUndefined();
  });

  it("drops ingredients and steps with empty text", () => {
    const d = draft({
      ingredients: [...draft().ingredients, { id: "x10", qty: 1, unit: null, item: "  ", note: "", group: "", allergens: [] }],
      steps: [...draft().steps, { id: "z10", text: " ", ingredientIds: [], applianceIds: [], estMin: 1, timerMin: null, timerMax: null }],
    });
    const recipe = draftToRecipe(d, ctx);
    expect(recipe?.ingredients).toHaveLength(3);
    expect(recipe?.steps).toHaveLength(3);
  });

  it("returns null when the model says it is not a recipe", () => {
    expect(draftToRecipe(draft({ notARecipe: true }), ctx)).toBeNull();
  });

  it("returns null when there are no usable ingredients or steps", () => {
    expect(draftToRecipe(draft({ ingredients: [] }), ctx)).toBeNull();
    expect(draftToRecipe(draft({ steps: [] }), ctx)).toBeNull();
  });

  it("produces a result that passes RecipeSchema", () => {
    const recipe = draftToRecipe(draft(), ctx);
    expect(() => RecipeSchema.parse(recipe)).not.toThrow();
  });
});
