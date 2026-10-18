import { describe, expect, it } from "vitest";
import {
  PatchError,
  addTip,
  applyEditResult,
  applyPatch,
  normalizePatchIds,
  validatePatch,
} from "./patch";
import { RecipeSchema, type AiEditResult, type PatchOp, type Recipe, type Step } from "./schema";
import { butterChicken } from "./fixtures/butterChicken";

// Deep-freezing the input means any accidental mutation throws in strict (ES module) code.
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    const record = value as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) deepFreeze(record[key]);
  }
  return value;
}

function frozenRecipe(): Recipe {
  return deepFreeze(structuredClone(butterChicken));
}

function stepById(recipe: Recipe, id: string): Step {
  const step = recipe.steps.find((s) => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  return step;
}

// The demo substitution: heavy cream becomes coconut milk, with two steps reworded.
const demoOps: PatchOp[] = [
  {
    op: "update_ingredient",
    id: "i9",
    item: "coconut milk",
    allergens: [],
  },
  {
    op: "update_step",
    id: "s7",
    text: "Stir in the coconut milk and the broiled chicken, then simmer for 2 minutes more.",
  },
  {
    op: "update_step",
    id: "s6",
    text: "Blend the crushed tomatoes with the ginger-garlic paste until smooth, pour into the skillet, and simmer until thickened. Keep the heat low so the coconut milk does not split.",
  },
];

const demoResult: AiEditResult = {
  kind: "patch",
  summary: "Swapped heavy cream → coconut milk",
  ops: demoOps,
  meta: { times: { totalMin: 50, activeMin: 25 } },
};

describe("applyEditResult", () => {
  it("applies the demo substitution with its meta and reports the touched lines", () => {
    const base = frozenRecipe();
    const { recipe, touchedIds } = applyEditResult(base, demoResult);

    expect(touchedIds).toEqual(["i9", "s7", "s6"]);
    const cream = recipe.ingredients.find((i) => i.id === "i9");
    expect(cream?.item).toBe("coconut milk");
    expect(cream?.allergens).toEqual([]);
    expect(cream?.unit).toBe("cup");
    expect(stepById(recipe, "s7").text).toContain("coconut milk");
    expect(stepById(recipe, "s6").text).toContain("coconut milk");
    expect(recipe.times).toEqual({ totalMin: 50, activeMin: 25 });
    expect(() => RecipeSchema.parse(recipe)).not.toThrow();
  });

  it("merges difficulty and cleanup from meta", () => {
    const { recipe } = applyEditResult(frozenRecipe(), {
      kind: "patch",
      summary: "Made it a one-pan dish",
      ops: [],
      meta: {
        difficulty: { score: 1, reason: "Just one pan." },
        cleanup: { score: 1, reason: "Only the pan.", dishes: ["large skillet"] },
      },
    });
    expect(recipe.difficulty).toEqual({ score: 1, reason: "Just one pan." });
    expect(recipe.cleanup.dishes).toEqual(["large skillet"]);
  });

  it("returns the recipe unchanged for non-patch kinds", () => {
    const base = frozenRecipe();
    const out = applyEditResult(base, { kind: "answer", text: "Coconut milk is a fine swap." });
    expect(out.recipe).toBe(base);
    expect(out.touchedIds).toEqual([]);
  });
});

describe("applyPatch", () => {
  it("inserts a step after s2 with a new ingredient whose reused ID is renumbered", () => {
    const base = frozenRecipe();
    const raw: PatchOp[] = [
      {
        op: "add_ingredient",
        after: "i9",
        ingredient: { id: "i3", qty: 1, unit: "can", item: "coconut milk", allergens: [], tips: [] },
      },
      {
        op: "insert_step",
        after: "s2",
        step: {
          id: "s8",
          text: "Stir the coconut milk into the sauce.",
          ingredientIds: ["i3"],
          applianceIds: ["a3"],
          estMin: 3,
          tips: [{ id: "t9", text: "Not allowed to carry tips." }],
        },
      },
    ];

    const normalized = normalizePatchIds(base, raw);
    expect(normalized[0]).toMatchObject({ op: "add_ingredient", after: "i9", ingredient: { id: "i10", tips: [] } });
    expect(normalized[1]).toMatchObject({ op: "insert_step", after: "s2" });
    if (normalized[1].op !== "insert_step") throw new Error("unreachable");
    expect(normalized[1].step.ingredientIds).toEqual(["i10"]);
    expect(normalized[1].step.tips).toEqual([]);

    // The raw ops reuse i3 and are rejected; the normalized ops are valid.
    expect(validatePatch(base, raw)).toEqual(['ops[0] add_ingredient: duplicate ingredient ID "i3"']);
    expect(validatePatch(base, normalized)).toEqual([]);

    const { recipe, touchedIds } = applyPatch(base, normalized);
    expect(recipe.ingredients).toHaveLength(10);
    expect(recipe.ingredients[9].id).toBe("i10");
    expect(recipe.steps.map((s) => s.id)).toEqual(["s1", "s2", "s8", "s3", "s4", "s5", "s6", "s7"]);
    expect(stepById(recipe, "s8").ingredientIds).toEqual(["i10"]);
    expect(touchedIds).toEqual(["i10", "s8"]);
    expect(() => RecipeSchema.parse(recipe)).not.toThrow();
  });

  it("strips a removed appliance from step refs and touches those steps", () => {
    const { recipe, touchedIds } = applyPatch(frozenRecipe(), [{ op: "remove_appliance", id: "a3" }]);
    expect(recipe.appliances.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(stepById(recipe, "s5").applianceIds).toEqual([]);
    expect(stepById(recipe, "s6").applianceIds).toEqual(["a2"]);
    expect(stepById(recipe, "s7").applianceIds).toEqual([]);
    expect(touchedIds).toEqual(["s5", "s6", "s7"]);
    expect(() => RecipeSchema.parse(recipe)).not.toThrow();
  });

  it("strips a removed ingredient from step refs", () => {
    const { recipe, touchedIds } = applyPatch(frozenRecipe(), [{ op: "remove_ingredient", id: "i9" }]);
    expect(recipe.ingredients).toHaveLength(8);
    expect(stepById(recipe, "s7").ingredientIds).toEqual(["i1"]);
    expect(touchedIds).toEqual(["s7"]);
  });

  it("drops a ref set earlier in the patch when the ingredient is removed later", () => {
    const { recipe, touchedIds } = applyPatch(frozenRecipe(), [
      { op: "update_step", id: "s7", ingredientIds: ["i9", "i1"] },
      { op: "remove_ingredient", id: "i9" },
    ]);
    expect(stepById(recipe, "s7").ingredientIds).toEqual(["i1"]);
    expect(touchedIds).toEqual(["s7"]);
    expect(() => RecipeSchema.parse(recipe)).not.toThrow();
  });

  it("drops an appliance ref set earlier in the patch when the appliance is removed later", () => {
    const { recipe } = applyPatch(frozenRecipe(), [
      { op: "update_step", id: "s1", applianceIds: ["a3"] },
      { op: "remove_appliance", id: "a3" },
    ]);
    expect(stepById(recipe, "s1").applianceIds).toEqual([]);
  });

  it("throws when a ref is set after the ingredient was removed", () => {
    expect(() =>
      applyPatch(frozenRecipe(), [
        { op: "remove_ingredient", id: "i9" },
        { op: "update_step", id: "s7", ingredientIds: ["i9", "i1"] },
      ]),
    ).toThrow(PatchError);
  });

  it("deletes the timer when timer is null", () => {
    const { recipe, touchedIds } = applyPatch(frozenRecipe(), [{ op: "update_step", id: "s6", timer: null }]);
    const step = stepById(recipe, "s6");
    expect(step.timer).toBeUndefined();
    expect("timer" in step).toBe(false);
    expect(touchedIds).toEqual(["s6"]);
  });

  it("sets an explicit null on qty and unit and leaves other fields alone", () => {
    const { recipe } = applyPatch(frozenRecipe(), [{ op: "update_ingredient", id: "i5", qty: null, unit: null }]);
    const butter = recipe.ingredients.find((i) => i.id === "i5");
    expect(butter).toMatchObject({ qty: null, unit: null, item: "butter", note: "unsalted" });
  });

  it("numbers tips across all lines, starting after the existing t1", () => {
    const { recipe, touchedIds } = applyPatch(frozenRecipe(), [
      {
        op: "add_tip",
        target: { kind: "ingredient", id: "i5", selectedText: "butter" },
        text: "Brown it lightly for a nuttier flavor.",
      },
      { op: "add_tip", target: { kind: "step", id: "s2" }, text: "Keep it covered for at least 30 minutes." },
      { op: "add_tip", target: { kind: "appliance", id: "a1" }, text: "Preheat fully before loading." },
    ]);

    const butter = recipe.ingredients.find((i) => i.id === "i5");
    expect(butter?.tips).toEqual([
      { id: "t2", anchorText: "butter", text: "Brown it lightly for a nuttier flavor." },
    ]);
    const s2Tip = stepById(recipe, "s2").tips[0];
    expect(s2Tip.id).toBe("t3");
    expect(s2Tip).not.toHaveProperty("anchorText");
    expect(recipe.appliances[0].tips[0].id).toBe("t4");
    expect(stepById(recipe, "s4").tips[0].id).toBe("t1");
    expect(touchedIds).toEqual(["i5", "s2", "a1"]);
    expect(() => RecipeSchema.parse(recipe)).not.toThrow();
  });

  it("throws PatchError on an unknown ID", () => {
    expect(() => applyPatch(frozenRecipe(), [{ op: "update_ingredient", id: "i99", item: "x" }])).toThrow(
      PatchError,
    );
    expect(() => applyPatch(frozenRecipe(), [{ op: "update_ingredient", id: "i99", item: "x" }])).toThrow(
      'ops[0] update_ingredient: unknown ingredient "i99"',
    );
  });

  it("never mutates the input recipe", () => {
    const base = frozenRecipe();
    const snapshot = JSON.stringify(base);
    applyPatch(base, demoOps);
    applyEditResult(base, demoResult);
    applyPatch(base, [{ op: "remove_appliance", id: "a3" }]);
    addTip(base, { kind: "step", id: "s1" }, "Start with cold chicken.");
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe("validatePatch", () => {
  it("accepts the demo substitution", () => {
    expect(validatePatch(frozenRecipe(), demoOps)).toEqual([]);
  });

  it("names the op index and ID for an unknown step", () => {
    expect(validatePatch(frozenRecipe(), [{ op: "update_step", id: "s14", text: "x" }])).toEqual([
      'ops[0] update_step: unknown step "s14"',
    ]);
  });

  it("flags a step ref to an ingredient removed by the patch", () => {
    expect(
      validatePatch(frozenRecipe(), [
        { op: "remove_ingredient", id: "i9" },
        { op: "update_step", id: "s7", ingredientIds: ["i9", "i1"] },
      ]),
    ).toEqual(['ops[1] update_step: unknown ingredient "i9" (not in the recipe after this patch)']);
  });

  it("flags removing every step", () => {
    const removeAll: PatchOp[] = butterChicken.steps.map((s) => ({ op: "remove_step", id: s.id }));
    const messages = validatePatch(frozenRecipe(), removeAll);
    expect(messages).toEqual(["result: the patch removes every step; a recipe needs at least one"]);
  });

  it("accepts a step ref that a later removal strips", () => {
    expect(
      validatePatch(frozenRecipe(), [
        { op: "update_step", id: "s7", ingredientIds: ["i9", "i1"] },
        { op: "remove_ingredient", id: "i9" },
      ]),
    ).toEqual([]);
  });

  it("flags an appliance ref set after the appliance was removed", () => {
    expect(
      validatePatch(frozenRecipe(), [
        { op: "remove_appliance", id: "a3" },
        { op: "update_step", id: "s7", applianceIds: ["a3"] },
      ]),
    ).toEqual(['ops[1] update_step: unknown appliance "a3" (not in the recipe after this patch)']);
  });

  it("flags an add_tip target that does not exist", () => {
    expect(validatePatch(frozenRecipe(), [{ op: "add_tip", target: { kind: "step", id: "s9" }, text: "x" }])).toEqual([
      'ops[0] add_tip: unknown step "s9"',
    ]);
  });
});

describe("addTip", () => {
  it("adds one tip with the next free tip ID and keeps the anchor text", () => {
    const { recipe, tipId } = addTip(frozenRecipe(), { kind: "step", id: "s2", selectedText: "whisk" }, "Whisk well.");
    expect(tipId).toBe("t2");
    expect(stepById(recipe, "s2").tips).toEqual([{ id: "t2", anchorText: "whisk", text: "Whisk well." }]);
    expect(() => RecipeSchema.parse(recipe)).not.toThrow();
  });

  it("throws PatchError for an unknown target", () => {
    expect(() => addTip(frozenRecipe(), { kind: "step", id: "s99" }, "x")).toThrow(PatchError);
  });
});
