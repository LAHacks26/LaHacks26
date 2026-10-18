import { containsAllergen } from "../ai/context";
import type { Recipe } from "../recipe/schema";

// Deterministic checks of normalized ingredient names/tags and declared equipment.
// These are search filters, not a certification of dietary suitability or cross-contamination.
const MEAT = /\b(chicken|beef|pork|bacon|ham|lamb|veal|venison|duck|turkey|sausage|chorizo|prosciutto|pancetta|lard|tallow|gelatin|gelatine|meat)\b/i;
const PLANT_SUBSTITUTE = /\b(?:vegan|vegetarian|plant[ -]based|mock|meatless)[ -]+(?:chicken|beef|pork|bacon|ham|duck|turkey|sausage|meat)\b/gi;

export function constraintViolations(recipe: Recipe, constraints: readonly string[]): string[] {
  const wants = new Set(constraints.map((label) => label.toLowerCase()));
  if (wants.size === 0) return [];
  const ingredients = recipe.ingredients;
  const hasAllergen = (allergen: string) => ingredients.some((ingredient) =>
    containsAllergen(ingredient.item, [allergen]) !== undefined ||
    ingredient.allergens.some((tag) => containsAllergen(tag, [allergen]) !== undefined),
  );
  const animal = ingredients.some((ingredient) => MEAT.test(ingredient.item.replace(PLANT_SUBSTITUTE, ""))) ||
    hasAllergen("fish") || hasAllergen("shellfish");
  const failures: string[] = [];
  if (wants.has("vegetarian") && animal) failures.push("Vegetarian");
  if (wants.has("vegan") && (animal || hasAllergen("dairy") || hasAllergen("egg") ||
    ingredients.some((ingredient) => /\bhoney\b/i.test(ingredient.item)))) failures.push("Vegan");
  if (wants.has("dairy-free") && hasAllergen("dairy")) failures.push("Dairy-free");
  if (wants.has("gluten-free") && hasAllergen("gluten")) failures.push("Gluten-free");
  if (wants.has("no oven") && recipe.appliances.some((appliance) =>
    /(?<!dutch\s)\boven\b|\bbroiler\b/i.test(appliance.name))) failures.push("No oven");
  if (wants.has("no blender") && recipe.appliances.some((appliance) =>
    /\bblender\b|\bliquidi[sz]er\b/i.test(appliance.name))) failures.push("No blender");
  return failures;
}
