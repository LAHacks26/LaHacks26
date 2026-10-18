import { describe, expect, it } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import type { Recipe } from "../recipe/schema";
import { constraintViolations } from "./constraints";

function recipe(item: string, allergens: string[] = [], appliances: string[] = []): Recipe {
  return { ...butterChicken, ingredients: [{ ...butterChicken.ingredients[0], item, allergens }],
    appliances: appliances.map((name, index) => ({ id: `a${index + 1}`, name, tips: [] })) };
}

describe("explicit search constraints", () => {
  it.each([
    ["chicken stock", "Vegetarian"], ["fish sauce", "Vegetarian"], ["gelatin", "Vegan"],
    ["honey", "Vegan"], ["eggs", "Vegan"], ["heavy cream", "Dairy-free"],
    ["soy sauce", "Gluten-free"], ["paneer", "Vegan"],
  ])("excludes %s for %s", (item, constraint) => {
    expect(constraintViolations(recipe(item), [constraint])).toContain(constraint);
  });
  it.each(["coconut milk", "vegan chicken", "plant-based beef", "rice flour"])("keeps %s when it fits", (item) => {
    expect(constraintViolations(recipe(item), ["Vegan", "Gluten-free"])).toEqual([]);
  });
  it("uses normalized allergen tags as well as ingredient names", () => {
    expect(constraintViolations(recipe("sauce", ["dairy"]), ["Dairy-free"])).toEqual(["Dairy-free"]);
  });
  it("rejects missing equipment but permits a stovetop Dutch oven", () => {
    expect(constraintViolations(recipe("rice", [], ["Oven", "Immersion blender"]), ["No oven", "No blender"]))
      .toEqual(["No oven", "No blender"]);
    expect(constraintViolations(recipe("rice", [], ["Dutch oven"]), ["No oven"])).toEqual([]);
  });
  it("does not treat a user's allergy list as exclusion constraints", () => {
    expect(constraintViolations(recipe("cream", ["dairy"]), [])).toEqual([]);
    expect(constraintViolations(recipe("cream", ["dairy"]), ["dairy"])).toEqual([]);
  });
});
