import { describe, expect, it } from "vitest";
import { isRecipeUrl, recipeUrlFrom } from "./search";

describe("recipeUrlFrom", () => {
  it("keeps pasted http(s) links as they are", () => {
    expect(recipeUrlFrom("  https://www.allrecipes.com/recipe/150313/x/ ")).toBe("https://www.allrecipes.com/recipe/150313/x/");
    expect(recipeUrlFrom("HTTP://example.com/a")).toBe("HTTP://example.com/a");
  });

  it("adds https:// to links typed without it", () => {
    expect(recipeUrlFrom("allrecipes.com/recipe/150313/thai-sweet-sticky-rice/")).toBe("https://allrecipes.com/recipe/150313/thai-sweet-sticky-rice/");
    expect(recipeUrlFrom("www.bbcgoodfood.com/recipes/sticky-rice-mango")).toBe("https://www.bbcgoodfood.com/recipes/sticky-rice-mango");
    expect(recipeUrlFrom("seriouseats.com")).toBe("https://seriouseats.com");
  });

  it("leaves dish searches alone", () => {
    for (const dish of ["mango sticky rice", "butter chicken", "mac & cheese", "1.5 lb chicken thighs", "pad thai", "", "e.g. pasta", "v1.2"]) {
      expect(recipeUrlFrom(dish)).toBeNull();
      expect(isRecipeUrl(dish)).toBe(false);
    }
  });
});
