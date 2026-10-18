import { describe, expect, it } from "vitest";
import {
  convertIngredient,
  convertQty,
  convertTemperaturesInText,
  formatIngredientQty,
  normalizeUnit,
} from "./units";
import type { Ingredient } from "./schema";

function ingredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: "i1",
    qty: 1,
    unit: "cup",
    item: "flour",
    allergens: [],
    tips: [],
    ...overrides,
  };
}

describe("normalizeUnit", () => {
  it("maps US volume aliases", () => {
    expect(normalizeUnit("tsp")).toBe("tsp");
    expect(normalizeUnit("teaspoon")).toBe("tsp");
    expect(normalizeUnit("Teaspoons")).toBe("tsp");
    expect(normalizeUnit("tsp.")).toBe("tsp");
    expect(normalizeUnit("tbsp")).toBe("tbsp");
    expect(normalizeUnit("Tbsp")).toBe("tbsp");
    expect(normalizeUnit("tbs")).toBe("tbsp");
    expect(normalizeUnit("tablespoon")).toBe("tbsp");
    expect(normalizeUnit("Tablespoons")).toBe("tbsp");
    expect(normalizeUnit("T")).toBe("tbsp");
    expect(normalizeUnit("T.")).toBe("tbsp");
    expect(normalizeUnit("cup")).toBe("cup");
    expect(normalizeUnit("Cups")).toBe("cup");
    expect(normalizeUnit("c")).toBe("cup");
    expect(normalizeUnit("c.")).toBe("cup");
    expect(normalizeUnit("fl oz")).toBe("fl oz");
    expect(normalizeUnit("fl. oz.")).toBe("fl oz");
    expect(normalizeUnit("fluid ounce")).toBe("fl oz");
    expect(normalizeUnit("Fluid Ounces")).toBe("fl oz");
    expect(normalizeUnit("pint")).toBe("pint");
    expect(normalizeUnit("pt")).toBe("pint");
    expect(normalizeUnit("quarts")).toBe("quart");
    expect(normalizeUnit("qt")).toBe("quart");
    expect(normalizeUnit("gallon")).toBe("gallon");
    expect(normalizeUnit("gal")).toBe("gallon");
  });

  it("maps US weight aliases, with oz always weight", () => {
    expect(normalizeUnit("oz")).toBe("oz");
    expect(normalizeUnit("OZ")).toBe("oz");
    expect(normalizeUnit("ounce")).toBe("oz");
    expect(normalizeUnit("ounces")).toBe("oz");
    expect(normalizeUnit("oz.")).toBe("oz");
    expect(normalizeUnit("lb")).toBe("lb");
    expect(normalizeUnit("lbs")).toBe("lb");
    expect(normalizeUnit("Pound")).toBe("lb");
    expect(normalizeUnit("pounds")).toBe("lb");
  });

  it("maps metric volume aliases", () => {
    expect(normalizeUnit("ml")).toBe("ml");
    expect(normalizeUnit("mL")).toBe("ml");
    expect(normalizeUnit("milliliter")).toBe("ml");
    expect(normalizeUnit("Milliliters")).toBe("ml");
    expect(normalizeUnit("millilitre")).toBe("ml");
    expect(normalizeUnit("millilitres")).toBe("ml");
    expect(normalizeUnit("l")).toBe("l");
    expect(normalizeUnit("L")).toBe("l");
    expect(normalizeUnit("liter")).toBe("l");
    expect(normalizeUnit("Liters")).toBe("l");
    expect(normalizeUnit("litre")).toBe("l");
    expect(normalizeUnit("litres")).toBe("l");
  });

  it("maps metric weight aliases", () => {
    expect(normalizeUnit("g")).toBe("g");
    expect(normalizeUnit("G")).toBe("g");
    expect(normalizeUnit("gram")).toBe("g");
    expect(normalizeUnit("grams")).toBe("g");
    expect(normalizeUnit("kg")).toBe("kg");
    expect(normalizeUnit("kilogram")).toBe("kg");
    expect(normalizeUnit("Kilograms")).toBe("kg");
  });

  it("returns null for non-convertible units and empty input", () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit("")).toBeNull();
    expect(normalizeUnit("   ")).toBeNull();
    expect(normalizeUnit("can")).toBeNull();
    expect(normalizeUnit("clove")).toBeNull();
    expect(normalizeUnit("cloves")).toBeNull();
    expect(normalizeUnit("medium")).toBeNull();
    expect(normalizeUnit("pinch")).toBeNull();
    expect(normalizeUnit("to taste")).toBeNull();
  });

  it("does not match Object prototype keys", () => {
    expect(normalizeUnit("constructor")).toBeNull();
    expect(normalizeUnit("__proto__")).toBeNull();
  });
});

describe("convertQty", () => {
  it("returns the input unchanged when the unit is not convertible", () => {
    expect(convertQty(2, "can", "metric")).toEqual({ qty: 2, unit: "can" });
    expect(convertQty(2, "clove", "us")).toEqual({ qty: 2, unit: "clove" });
  });

  it("returns the input unchanged for a null unit", () => {
    expect(convertQty(3, null, "metric")).toEqual({ qty: 3, unit: null });
    expect(convertQty(3, null, "us")).toEqual({ qty: 3, unit: null });
  });

  it("returns the input unchanged when the unit is already in the target system", () => {
    expect(convertQty(250, "g", "metric")).toEqual({ qty: 250, unit: "g" });
    expect(convertQty(2, "kg", "metric")).toEqual({ qty: 2, unit: "kg" });
    expect(convertQty(1, "ml", "metric")).toEqual({ qty: 1, unit: "ml" });
    expect(convertQty(1, "l", "metric")).toEqual({ qty: 1, unit: "l" });
    expect(convertQty(1, "tablespoons", "us")).toEqual({ qty: 1, unit: "tablespoons" });
    expect(convertQty(1, "Cups", "us")).toEqual({ qty: 1, unit: "Cups" });
    expect(convertQty(2, "oz", "us")).toEqual({ qty: 2, unit: "oz" });
    expect(convertQty(2, "lbs", "us")).toEqual({ qty: 2, unit: "lbs" });
  });

  it("converts US volume to metric ml", () => {
    const cup = convertQty(1, "cup", "metric");
    expect(cup.unit).toBe("ml");
    expect(cup.qty).toBeCloseTo(236.588, 2);

    expect(convertQty(2, "cups", "metric").qty).toBeCloseTo(473.176, 2);
    expect(convertQty(1, "tsp", "metric").qty).toBeCloseTo(4.92892, 4);
    expect(convertQty(1, "tbsp", "metric").qty).toBeCloseTo(14.7868, 4);
    expect(convertQty(1, "fl oz", "metric").qty).toBeCloseTo(29.5735, 3);
    expect(convertQty(1, "pint", "metric").qty).toBeCloseTo(473.176, 2);
    expect(convertQty(1, "quart", "metric").qty).toBeCloseTo(946.353, 2);
  });

  it("converts gallons to metric and picks l at 1000 ml or more", () => {
    const gallon = convertQty(1, "gallon", "metric");
    expect(gallon.unit).toBe("l");
    expect(gallon.qty).toBeCloseTo(3.78541, 4);
  });

  it("keeps small US volumes in ml when converting to metric", () => {
    const result = convertQty(0.5, "tsp", "metric");
    expect(result.unit).toBe("ml");
    expect(result.qty).toBeCloseTo(2.46446, 4);
  });

  it("picks l for metric volumes of 1000 ml or more, and ml below that", () => {
    const litres = convertQty(5, "cups", "metric"); // 1182.9 ml
    expect(litres.unit).toBe("l");
    expect(litres.qty).toBeCloseTo(1.18294, 4);
    expect(convertQty(4, "cups", "metric").unit).toBe("ml");
    expect(convertQty(1, "quart", "metric").unit).toBe("ml");
  });

  it("converts metric volume to US, choosing cup, tbsp or tsp", () => {
    const cups = convertQty(500, "ml", "us");
    expect(cups.unit).toBe("cup");
    expect(cups.qty).toBeCloseTo(500 / 236.588, 4);

    const litre = convertQty(1, "l", "us");
    expect(litre.unit).toBe("cup");
    expect(litre.qty).toBeCloseTo(4.22675, 3);

    const tbsp = convertQty(50, "ml", "us");
    expect(tbsp.unit).toBe("tbsp");
    expect(tbsp.qty).toBeCloseTo(50 / 14.7868, 4);

    const tsp = convertQty(10, "ml", "us");
    expect(tsp.unit).toBe("tsp");
    expect(tsp.qty).toBeCloseTo(10 / 4.92892, 4);
  });

  it("uses cup from exactly 1/4 cup and tbsp from exactly 1 tbsp", () => {
    // Round trip through ml, so the boundary values are the exact US sizes.
    const quarter = convertQty(0.25, "cup", "metric");
    const quarterCup = convertQty(quarter.qty, quarter.unit, "us");
    expect(quarterCup.unit).toBe("cup");
    expect(quarterCup.qty).toBeCloseTo(0.25, 6);

    const tbsp = convertQty(1, "tbsp", "metric");
    const oneTbsp = convertQty(tbsp.qty, tbsp.unit, "us");
    expect(oneTbsp.unit).toBe("tbsp");
    expect(oneTbsp.qty).toBeCloseTo(1, 6);
  });

  it("shows 3 tsp as exactly 1 tbsp and 2 tbsp as 2 tbsp (no float slip)", () => {
    // 3 tsp is an exact tbsp, so the round trip through ml must land on the tbsp branch.
    const threeTsp = convertQty(3, "tsp", "metric");
    const back = convertQty(threeTsp.qty, threeTsp.unit, "us");
    expect(back.unit).toBe("tbsp");
    expect(back.qty).toBeCloseTo(1, 6);

    const twoTbsp = convertQty(2, "tbsp", "metric");
    const backTbsp = convertQty(twoTbsp.qty, twoTbsp.unit, "us");
    expect(backTbsp.unit).toBe("tbsp");
    expect(backTbsp.qty).toBeCloseTo(2, 6);
  });

  it("converts US weight to metric g, then kg at 1000 g or more", () => {
    const pound = convertQty(1, "lb", "metric");
    expect(pound.unit).toBe("g");
    expect(pound.qty).toBeCloseTo(453.592, 2);

    const oz = convertQty(8, "oz", "metric");
    expect(oz.unit).toBe("g");
    expect(oz.qty).toBeCloseTo(226.796, 2);

    const threePounds = convertQty(3, "lb", "metric");
    expect(threePounds.unit).toBe("kg");
    expect(threePounds.qty).toBeCloseTo(1.36078, 4);
  });

  it("converts metric weight to US oz, then lb at 16 oz or more", () => {
    const grams = convertQty(100, "g", "us");
    expect(grams.unit).toBe("oz");
    expect(grams.qty).toBeCloseTo(3.5274, 3);

    const kilo = convertQty(1, "kg", "us");
    expect(kilo.unit).toBe("lb");
    expect(kilo.qty).toBeCloseTo(2.20462, 4);

    const halfKilo = convertQty(500, "g", "us");
    expect(halfKilo.unit).toBe("lb");
    expect(halfKilo.qty).toBeCloseTo(1.10231, 4);
  });

  it("keeps exactly 1 lb as lb and just under as oz", () => {
    const exact = convertQty(453.59237, "g", "us");
    expect(exact.unit).toBe("lb");
    expect(exact.qty).toBeCloseTo(1, 4);

    const underPound = convertQty(400, "g", "us");
    expect(underPound.unit).toBe("oz");
  });

  it("never converts between volume and weight (no density)", () => {
    const flour = convertQty(1, "cup", "metric");
    expect(flour.unit).toBe("ml");
    const butter = convertQty(1, "oz", "metric");
    expect(butter.unit).toBe("g");
    const grams = convertQty(100, "g", "us");
    expect(grams.unit).toBe("oz");
  });

  it("converts units that are already canonical-looking but spelled loosely", () => {
    const result = convertQty(2, "Tablespoons", "metric");
    expect(result.unit).toBe("ml");
    expect(result.qty).toBeCloseTo(29.5736, 3);
  });
});

describe("convertIngredient", () => {
  it("converts qty and unit and keeps the other fields", () => {
    const original = ingredient({ qty: 1, unit: "cup", item: "milk", allergens: ["dairy"], note: "whole" });
    const converted = convertIngredient(original, "metric");
    expect(converted.unit).toBe("ml");
    expect(converted.qty).toBeCloseTo(236.588, 2);
    expect(converted.item).toBe("milk");
    expect(converted.note).toBe("whole");
    expect(converted.allergens).toEqual(["dairy"]);
    expect(converted).not.toBe(original);
    expect(original.unit).toBe("cup");
  });

  it("leaves a non-convertible unit alone", () => {
    const original = ingredient({ qty: 2, unit: "clove", item: "garlic" });
    expect(convertIngredient(original, "metric")).toEqual(original);
  });

  it("keeps an ingredient with no qty unchanged", () => {
    const original = ingredient({ qty: null, unit: "cup", item: "salt" });
    const converted = convertIngredient(original, "metric");
    expect(converted).toEqual(original);
    expect(converted).not.toBe(original);
  });
});

describe("convertTemperaturesInText", () => {
  it("converts °F to °C in common forms", () => {
    expect(convertTemperaturesInText("Bake at 375°F for 20 minutes.", "metric")).toBe(
      "Bake at 190°C for 20 minutes.",
    );
    expect(convertTemperaturesInText("Bake at 375 °F.", "metric")).toBe("Bake at 190 °C.");
    expect(convertTemperaturesInText("Bake at 375 degrees F.", "metric")).toBe("Bake at 190 degrees C.");
    expect(convertTemperaturesInText("Bake at 375 degrees Fahrenheit.", "metric")).toBe(
      "Bake at 190 degrees Celsius.",
    );
  });

  it("converts °C to °F in common forms", () => {
    expect(convertTemperaturesInText("Bake at 190°C.", "us")).toBe("Bake at 375°F.");
    expect(convertTemperaturesInText("Bake at 190 °C.", "us")).toBe("Bake at 375 °F.");
    expect(convertTemperaturesInText("Bake at 190 degrees C.", "us")).toBe("Bake at 375 degrees F.");
    expect(convertTemperaturesInText("Bake at 190 degrees Celsius.", "us")).toBe(
      "Bake at 375 degrees Fahrenheit.",
    );
  });

  it("converts ranges, keeping the separator", () => {
    expect(convertTemperaturesInText("Roast at 350–375°F.", "metric")).toBe("Roast at 175–190°C.");
    expect(convertTemperaturesInText("Roast at 350-375°F.", "metric")).toBe("Roast at 175-190°C.");
    expect(convertTemperaturesInText("Roast at 350 to 375°F.", "metric")).toBe("Roast at 175 to 190°C.");
    // 175°C = 347°F → 345; 190°C = 374°F → 375.
    expect(convertTemperaturesInText("Roast at 175–190°C.", "us")).toBe("Roast at 345–375°F.");
  });

  it("rounds to the nearest 5 degrees", () => {
    // 425°F = 218.3°C → 220; 180°C = 356°F → 355; 200°C = 392°F → 390.
    expect(convertTemperaturesInText("425°F", "metric")).toBe("220°C");
    expect(convertTemperaturesInText("180°C", "us")).toBe("355°F");
    expect(convertTemperaturesInText("200°C", "us")).toBe("390°F");
    // 400°F = 204.4°C → 205; 350°F = 176.7°C → 175.
    expect(convertTemperaturesInText("Start at 400°F, then reduce to 350°F.", "metric")).toBe(
      "Start at 205°C, then reduce to 175°C.",
    );
  });

  it("leaves text unchanged when it already gives both scales", () => {
    expect(convertTemperaturesInText("Bake at 375 degrees F (190 degrees C).", "metric")).toBe(
      "Bake at 375 degrees F (190 degrees C).",
    );
    expect(convertTemperaturesInText("Bake at 375 degrees F (190 degrees C).", "us")).toBe(
      "Bake at 375 degrees F (190 degrees C).",
    );
    expect(convertTemperaturesInText("Bake at 190°C (375°F).", "us")).toBe("Bake at 190°C (375°F).");
    expect(convertTemperaturesInText("Bake at 190°C (375°F).", "metric")).toBe("Bake at 190°C (375°F).");
    expect(convertTemperaturesInText("Bake at 375°F (190°C).", "metric")).toBe("Bake at 375°F (190°C).");
    expect(convertTemperaturesInText("Bake at 375°F (about 190°C).", "us")).toBe("Bake at 375°F (about 190°C).");
    expect(convertTemperaturesInText("Heat to 350°F (about 175°C).", "metric")).toBe(
      "Heat to 350°F (about 175°C).",
    );
  });

  it("converts negative temperatures", () => {
    // -18°C = -0.4°F → 0; -10°F = -23.3°C → -25.
    expect(convertTemperaturesInText("Freeze at -18°C.", "us")).toBe("Freeze at 0°F.");
    expect(convertTemperaturesInText("Store at -10°F.", "metric")).toBe("Store at -25°C.");
    expect(convertTemperaturesInText("Freeze at -18 degrees C.", "us")).toBe("Freeze at 0 degrees F.");
    expect(convertTemperaturesInText("From -20 to -10°C.", "us")).toBe("From -5 to 15°F.");
  });

  it("accepts the º and ˚ degree sign variants", () => {
    expect(convertTemperaturesInText("Bake at 350º F.", "metric")).toBe("Bake at 175º C.");
    expect(convertTemperaturesInText("Bake at 350˚F.", "metric")).toBe("Bake at 175˚C.");
    expect(convertTemperaturesInText("Bake at 190˚C.", "us")).toBe("Bake at 375˚F.");
    expect(convertTemperaturesInText("Bake at 350º F (about 175˚C).", "metric")).toBe("Bake at 350º F (about 175˚C).");
  });

  it("leaves a fraction's denominator alone", () => {
    expect(convertTemperaturesInText("Heat 1/2°F more.", "metric")).toBe("Heat 1/2°F more.");
  });

  it("leaves temperatures written as alternatives ('/' or 'or') unchanged", () => {
    expect(convertTemperaturesInText("Bake at 180°C / 350°F.", "metric")).toBe("Bake at 180°C / 350°F.");
    expect(convertTemperaturesInText("Bake at 180°C / 350°F.", "us")).toBe("Bake at 180°C / 350°F.");
    expect(convertTemperaturesInText("Bake at 350°F or 180°C.", "metric")).toBe("Bake at 350°F or 180°C.");
    expect(convertTemperaturesInText("Bake at 350°F or 180°C.", "us")).toBe("Bake at 350°F or 180°C.");
  });

  it("leaves text in the target system unchanged", () => {
    expect(convertTemperaturesInText("Bake at 190°C.", "metric")).toBe("Bake at 190°C.");
    expect(convertTemperaturesInText("Bake at 375°F.", "us")).toBe("Bake at 375°F.");
    expect(convertTemperaturesInText("Bake at 375 degrees Fahrenheit.", "us")).toBe(
      "Bake at 375 degrees Fahrenheit.",
    );
  });

  it("leaves text without temperatures unchanged", () => {
    expect(convertTemperaturesInText("Stir until smooth, about 5 minutes.", "metric")).toBe(
      "Stir until smooth, about 5 minutes.",
    );
    expect(convertTemperaturesInText("Bake 375 minutes.", "metric")).toBe("Bake 375 minutes.");
    expect(convertTemperaturesInText("", "us")).toBe("");
  });

  it("needs a degree sign or 'degrees' before the unit letter", () => {
    expect(convertTemperaturesInText("Use 375Fresh herbs.", "metric")).toBe("Use 375Fresh herbs.");
  });
});

describe("formatIngredientQty", () => {
  it("formats US amounts as nice fractions with the unit", () => {
    expect(formatIngredientQty(ingredient({ qty: 1.5, unit: "cup" }), "us")).toBe("1 ½ cups");
    expect(formatIngredientQty(ingredient({ qty: 0.5, unit: "cup" }), "us")).toBe("½ cup");
    expect(formatIngredientQty(ingredient({ qty: 1, unit: "cup" }), "us")).toBe("1 cup");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "cup" }), "us")).toBe("2 cups");
  });

  it("keeps a fraction under one cup singular", () => {
    expect(formatIngredientQty(ingredient({ qty: 0.333, unit: "cup" }), "us")).toBe("⅓ cup");
    expect(formatIngredientQty(ingredient({ qty: 0.875, unit: "cup" }), "us")).toBe("⅞ cup");
  });

  it("pluralizes US units that take an s, and not the others", () => {
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "tbsp" }), "us")).toBe("2 tbsp");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "tsp" }), "us")).toBe("2 tsp");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "oz" }), "us")).toBe("2 oz");
    expect(formatIngredientQty(ingredient({ qty: 1, unit: "lb" }), "us")).toBe("1 lb");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "lb" }), "us")).toBe("2 lbs");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "pint" }), "us")).toBe("2 pints");
  });

  it("writes US units in their canonical spelling", () => {
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "tablespoons" }), "us")).toBe("2 tbsp");
    expect(formatIngredientQty(ingredient({ qty: 1, unit: "Cups" }), "us")).toBe("1 cup");
  });

  it("formats metric amounts with the rounded number and unit", () => {
    expect(formatIngredientQty(ingredient({ qty: 1.5, unit: "cup" }), "metric")).toBe("355 ml");
    expect(formatIngredientQty(ingredient({ qty: 1, unit: "cup" }), "metric")).toBe("235 ml");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "cup" }), "metric")).toBe("475 ml");
    expect(formatIngredientQty(ingredient({ qty: 500, unit: "ml" }), "metric")).toBe("500 ml");
    expect(formatIngredientQty(ingredient({ qty: 1, unit: "l" }), "metric")).toBe("1 l");
  });

  it("keeps counts, unitless items and non-convertible units in metric mode as fractions and written units", () => {
    expect(formatIngredientQty(ingredient({ qty: 12, unit: null, item: "eggs" }), "metric")).toBe("12");
    expect(formatIngredientQty(ingredient({ qty: 13, unit: null, item: "apples" }), "metric")).toBe("13");
    expect(formatIngredientQty(ingredient({ qty: 12, unit: "eggs", item: "eggs" }), "metric")).toBe("12 eggs");
    expect(formatIngredientQty(ingredient({ qty: 12, unit: "cloves", item: "garlic" }), "metric")).toBe("12 cloves");
    expect(formatIngredientQty(ingredient({ qty: 1 / 3, unit: "large", item: "egg" }), "metric")).toBe("⅓ large");
  });

  it("shows fractions for counts in US mode too", () => {
    expect(formatIngredientQty(ingredient({ qty: 12, unit: "cloves" }), "us")).toBe("12 cloves");
    expect(formatIngredientQty(ingredient({ qty: 1 / 3, unit: "large" }), "us")).toBe("⅓ large");
  });

  it("does not throw on a non-finite qty and shows it as written", () => {
    expect(formatIngredientQty(ingredient({ qty: Number.NaN, unit: "cup" }), "us")).toBe("NaN cup");
    expect(formatIngredientQty(ingredient({ qty: Number.POSITIVE_INFINITY, unit: null }), "metric")).toBe("Infinity");
  });

  it("converts to the target system before formatting", () => {
    expect(formatIngredientQty(ingredient({ qty: 1, unit: "l" }), "us")).toBe("4 ¼ cups");
    expect(formatIngredientQty(ingredient({ qty: 500, unit: "g" }), "us")).toBe("1 ⅛ lbs");
    expect(formatIngredientQty(ingredient({ qty: 1, unit: "oz" }), "metric")).toBe("30 g");
    expect(formatIngredientQty(ingredient({ qty: 3, unit: "lb" }), "metric")).toBe("1.36 kg");
    expect(formatIngredientQty(ingredient({ qty: 500, unit: "ml" }), "us")).toBe("2 ⅛ cups");
    expect(formatIngredientQty(ingredient({ qty: 3, unit: "ml" }), "us")).toBe("⅝ tsp");
  });

  it("shows non-convertible units as written", () => {
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "clove" }), "us")).toBe("2 clove");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: "clove" }), "metric")).toBe("2 clove");
  });

  it("omits a missing unit", () => {
    expect(formatIngredientQty(ingredient({ qty: 2, unit: null }), "us")).toBe("2");
    expect(formatIngredientQty(ingredient({ qty: 2, unit: null }), "metric")).toBe("2");
  });

  it("shows only the unit when there is no qty, or nothing at all", () => {
    expect(formatIngredientQty(ingredient({ qty: null, unit: "pinch" }), "us")).toBe("pinch");
    expect(formatIngredientQty(ingredient({ qty: null, unit: null }), "metric")).toBe("");
  });

  it("uses the same rounding as scale.ts for the qty", () => {
    expect(formatIngredientQty(ingredient({ qty: 1.95, unit: null }), "us")).toBe("2");
  });
});
