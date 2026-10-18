import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import { RecipeView } from "./RecipeView";

describe("recipe display", () => {
  it("scales and converts the view without mutating the recipe", () => {
    const recipe = structuredClone(butterChicken);
    recipe.steps[0].text = "Bake at 350°F.";
    const before = structuredClone(recipe);
    const html = renderToStaticMarkup(createElement(RecipeView, {
      recipe, readOnly: true, servings: 8, unit: "metric",
      stepTimes: [new Date("2026-10-18T18:00:00Z")],
    }));
    expect(html).toContain("475 ml");
    expect(html).toContain("175°C");
    expect(html).toContain('dateTime="2026-10-18T18:00:00.000Z"');
    expect(recipe).toEqual(before);
  });
  it("omits clock times when there is no deadline", () => {
    const html = renderToStaticMarkup(createElement(RecipeView, { recipe: butterChicken, readOnly: true }));
    expect(html).not.toContain("Approx.");
    expect(html).toContain("1 cup");
  });
});
