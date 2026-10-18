import { describe, expect, it } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import {
  compactRecipe,
  containsAllergen,
  describeTarget,
  editTargetProblem,
  filterAllergenSafe,
  targetName,
  targetText,
} from "./context";

describe("containsAllergen negations and plant milks (review item 1)", () => {
  it("does not flag a negated mention", () => {
    expect(containsAllergen("gluten-free flour", ["gluten"])).toBeUndefined();
    expect(containsAllergen("dairy-free butter", ["dairy"])).toBeUndefined();
    expect(containsAllergen("dairy free butter", ["dairy"])).toBeUndefined();
    expect(containsAllergen("free of dairy", ["dairy"])).toBeUndefined();
    expect(containsAllergen("stir without eggs", ["egg"])).toBeUndefined();
    expect(containsAllergen("non-dairy yogurt", ["dairy"])).toBeUndefined();
    expect(containsAllergen("nondairy yogurt", ["dairy"])).toBeUndefined();
  });

  it("still flags a positive mention next to a negated one", () => {
    expect(containsAllergen("gluten-free flour and regular gluten", ["gluten"])).toBe("gluten");
  });

  it("does not treat plant milks as dairy or milk", () => {
    expect(containsAllergen("coconut milk", ["milk"])).toBeUndefined();
    expect(containsAllergen("almond milk", ["dairy"])).toBeUndefined();
    expect(containsAllergen("oat milk", ["milk"])).toBeUndefined();
    expect(containsAllergen("cashew milk", ["dairy"])).toBeUndefined();
    expect(containsAllergen("rice milk", ["milk"])).toBeUndefined();
    expect(containsAllergen("soy milk", ["milk"])).toBeUndefined();
  });

  it("still flags real dairy milk, and soy milk for a soy allergy", () => {
    expect(containsAllergen("whole milk", ["milk"])).toBe("milk");
    expect(containsAllergen("2 cups milk", ["dairy"])).toBe("dairy");
    expect(containsAllergen("2 cups almond milk", ["dairy"])).toBeUndefined();
    expect(containsAllergen("soy milk", ["soy"])).toBe("soy");
    expect(containsAllergen("coconut milk and whole milk", ["milk"])).toBe("milk");
  });

  it("keeps eggplant apart from egg", () => {
    expect(containsAllergen("eggplant", ["egg"])).toBeUndefined();
    expect(containsAllergen("roasted eggplant", ["eggs"])).toBeUndefined();
    expect(containsAllergen("two eggs", ["egg"])).toBe("egg");
  });

  it("filters negated and plant-milk suggestions for a dairy allergy", () => {
    expect(filterAllergenSafe(["dairy-free butter", "coconut milk", "whole milk"], ["dairy"])).toEqual([
      "dairy-free butter",
      "coconut milk",
    ]);
  });
});

describe("editTargetProblem (review item 7)", () => {
  it("accepts an ingredient for substitute and a known appliance for missing_appliance", () => {
    expect(editTargetProblem(butterChicken, "substitute", { kind: "ingredient", id: "i9" })).toBeUndefined();
    expect(editTargetProblem(butterChicken, "missing_appliance", { kind: "appliance", id: "a2" })).toBeUndefined();
    expect(editTargetProblem(butterChicken, "ask", { kind: "step", id: "s1" })).toBeUndefined();
  });

  it("rejects a target ID that is not in the recipe", () => {
    expect(editTargetProblem(butterChicken, "substitute", { kind: "ingredient", id: "i99" })).toMatch(/isn't in this recipe/);
    expect(editTargetProblem(butterChicken, "ask", { kind: "step", id: "s99" })).toMatch(/isn't in this recipe/);
    expect(editTargetProblem(butterChicken, "ask", { kind: "appliance", id: "a9" })).toMatch(/isn't in this recipe/);
  });

  it("rejects substitute on a non-ingredient and missing_appliance on a non-appliance", () => {
    expect(editTargetProblem(butterChicken, "substitute", { kind: "step", id: "s1" })).toMatch(/ingredient/);
    expect(editTargetProblem(butterChicken, "substitute", { kind: "appliance", id: "a2" })).toMatch(/ingredient/);
    expect(editTargetProblem(butterChicken, "missing_appliance", { kind: "ingredient", id: "i9" })).toMatch(/appliance/);
  });
});

describe("containsAllergen", () => {
  it("matches whole words and a plural of the allergy", () => {
    expect(containsAllergen("peanut butter", ["peanuts"])).toBe("peanuts");
    expect(containsAllergen("Toasted PEANUTS", ["peanuts"])).toBe("peanuts");
    expect(containsAllergen("2 eggs", ["egg"])).toBe("egg");
    expect(containsAllergen("tree nut milk", ["tree nuts"])).toBe("tree nuts");
    expect(containsAllergen("Soy Sauce", ["soy"])).toBe("soy");
  });

  it("does not match a word that only starts with the allergy", () => {
    expect(containsAllergen("eggplant", ["egg"])).toBeUndefined();
    expect(containsAllergen("walnut", ["nuts"])).toBeUndefined();
    expect(containsAllergen("nutmeg", ["nuts"])).toBeUndefined();
  });

  it("ignores blank and very short allergy entries", () => {
    expect(containsAllergen("anything", ["", "a"])).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(containsAllergen("coconut milk", ["dairy", "tree nuts"])).toBeUndefined();
  });
});

describe("filterAllergenSafe", () => {
  it("trims, drops empties and drops anything with an allergen", () => {
    expect(filterAllergenSafe(["  oat milk ", "", "soy milk", "rice milk"], ["soy"])).toEqual(["oat milk", "rice milk"]);
  });
});

describe("targetText and targetName", () => {
  it("reads an ingredient's amount, item and note", () => {
    expect(targetText(butterChicken, { kind: "ingredient", id: "i9" })).toBe("1 cup heavy cream");
    expect(targetName(butterChicken, { kind: "ingredient", id: "i9" })).toBe("heavy cream");
  });

  it("reads a step's text and an appliance's name", () => {
    expect(targetText(butterChicken, { kind: "step", id: "s7" })).toContain("Stir in the heavy cream");
    expect(targetText(butterChicken, { kind: "appliance", id: "a2" })).toBe("Blender");
    expect(targetName(butterChicken, { kind: "appliance", id: "a2" })).toBe("Blender");
    expect(targetName(butterChicken, { kind: "step", id: "s7" })).toBeUndefined();
  });

  it("returns undefined for an unknown ID", () => {
    expect(targetText(butterChicken, { kind: "ingredient", id: "i99" })).toBeUndefined();
  });
});

describe("describeTarget", () => {
  it("names the target, the highlighted phrase and the steps that use it", () => {
    const text = describeTarget(butterChicken, { kind: "ingredient", id: "i9", selectedText: "heavy" });
    expect(text).toContain('Target: ingredient i9: "1 cup heavy cream"');
    expect(text).toContain('Highlighted phrase inside the target: "heavy"');
    expect(text).toContain("Steps that use it: s7");
  });

  it("says when the target is missing", () => {
    expect(describeTarget(butterChicken, { kind: "step", id: "s99" })).toContain("(not in the recipe)");
  });
});

describe("compactRecipe", () => {
  it("drops tips and empty optional fields but keeps step references and timers", () => {
    const compact = compactRecipe(butterChicken);
    const text = JSON.stringify(compact);
    expect(text).not.toContain('"tips"');
    expect(text).not.toContain('"allergens":[]');
    expect(compact.steps.find((s) => s.id === "s2")).toMatchObject({
      ingredientIds: ["i2", "i3", "i4", "i7", "i1"],
      timer: { min: 30, max: 30 },
    });
  });
});
