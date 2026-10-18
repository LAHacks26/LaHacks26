import { describe, expect, it } from "vitest";
import { formatMetricQty, formatUsQty, scaleIngredient, scaleQty } from "./scale";
import type { Ingredient } from "./schema";

function ingredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: "i1",
    qty: 2,
    unit: "cup",
    item: "flour",
    allergens: [],
    tips: [],
    ...overrides,
  };
}

describe("scaleQty", () => {
  it("multiplies by servings over base servings", () => {
    expect(scaleQty(2, 8, 4)).toBe(4);
    expect(scaleQty(1, 6, 4)).toBe(1.5);
  });

  it("scales down", () => {
    expect(scaleQty(3, 2, 6)).toBe(1);
  });

  it("keeps the same servings unchanged", () => {
    expect(scaleQty(0.75, 4, 4)).toBe(0.75);
  });

  it("keeps null as null", () => {
    expect(scaleQty(null, 8, 4)).toBeNull();
  });

  it("rejects a non-positive base servings", () => {
    expect(() => scaleQty(2, 4, 0)).toThrow(RangeError);
    expect(() => scaleQty(2, 4, -1)).toThrow(RangeError);
  });
});

describe("formatUsQty", () => {
  it("shows whole numbers without a fraction", () => {
    expect(formatUsQty(2)).toBe("2");
    expect(formatUsQty(1)).toBe("1");
    expect(formatUsQty(0)).toBe("0");
  });

  it("shows mixed numbers with a space before the fraction", () => {
    expect(formatUsQty(1.5)).toBe("1 ½");
    expect(formatUsQty(2.25)).toBe("2 ¼");
    expect(formatUsQty(3.75)).toBe("3 ¾");
  });

  it("shows halves, quarters, eighths", () => {
    expect(formatUsQty(0.5)).toBe("½");
    expect(formatUsQty(0.25)).toBe("¼");
    expect(formatUsQty(0.75)).toBe("¾");
    expect(formatUsQty(0.125)).toBe("⅛");
    expect(formatUsQty(0.375)).toBe("⅜");
    expect(formatUsQty(0.625)).toBe("⅝");
    expect(formatUsQty(0.875)).toBe("⅞");
  });

  it("uses thirds where they are closer", () => {
    expect(formatUsQty(0.333)).toBe("⅓");
    expect(formatUsQty(1 / 3)).toBe("⅓");
    expect(formatUsQty(2 / 3)).toBe("⅔");
    expect(formatUsQty(0.667)).toBe("⅔");
    expect(formatUsQty(1.333)).toBe("1 ⅓");
    expect(formatUsQty(2.667)).toBe("2 ⅔");
  });

  it("uses eighths where they are closer than thirds", () => {
    // 0.35 is 0.025 from 3/8 and 0.0167 from 1/3, so thirds win; 0.37 is closer to 3/8.
    expect(formatUsQty(0.37)).toBe("⅜");
    expect(formatUsQty(0.6)).toBe("⅝");
  });

  it("never shows 0 for a positive amount", () => {
    expect(formatUsQty(0.06)).toBe("⅛");
    expect(formatUsQty(0.01)).toBe("⅛");
    expect(formatUsQty(0.0001)).toBe("⅛");
  });

  it("carries a value that rounds up to the next whole number", () => {
    expect(formatUsQty(0.99)).toBe("1");
    expect(formatUsQty(2.97)).toBe("3");
    expect(formatUsQty(9.99)).toBe("10");
  });

  it("carries a fraction that rounds up to the whole part", () => {
    // 1.95 is closest to 2 (0.05 away), not to 1 7/8 (0.075 away).
    expect(formatUsQty(1.95)).toBe("2");
    expect(formatUsQty(1.9)).toBe("1 ⅞");
  });

  it("rounds values of 10 or more to whole numbers", () => {
    expect(formatUsQty(10)).toBe("10");
    expect(formatUsQty(10.4)).toBe("10");
    expect(formatUsQty(10.6)).toBe("11");
    expect(formatUsQty(25.5)).toBe("26");
  });

  it("rejects non-finite numbers", () => {
    expect(() => formatUsQty(Number.NaN)).toThrow(RangeError);
    expect(() => formatUsQty(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("formatMetricQty", () => {
  it("shows g and ml under 10 with at most one decimal", () => {
    expect(formatMetricQty(3.456, "g")).toBe("3.5 g");
    expect(formatMetricQty(4.92, "ml")).toBe("4.9 ml");
    expect(formatMetricQty(5, "ml")).toBe("5 ml");
    expect(formatMetricQty(0.5, "g")).toBe("0.5 g");
  });

  it("rounds g and ml from 10 to 99 to the nearest 5", () => {
    expect(formatMetricQty(12, "g")).toBe("10 g");
    expect(formatMetricQty(13, "g")).toBe("15 g");
    expect(formatMetricQty(22.4, "ml")).toBe("20 ml");
    expect(formatMetricQty(97, "g")).toBe("95 g");
    expect(formatMetricQty(98, "g")).toBe("100 g");
  });

  it("rounds g and ml from 100 to 999 to the nearest 5", () => {
    expect(formatMetricQty(355, "ml")).toBe("355 ml");
    expect(formatMetricQty(354.88, "ml")).toBe("355 ml");
    expect(formatMetricQty(236.588, "ml")).toBe("235 ml");
    expect(formatMetricQty(453.592, "g")).toBe("455 g");
    expect(formatMetricQty(357, "g")).toBe("355 g");
    expect(formatMetricQty(998, "g")).toBe("1000 g");
  });

  it("rounds g and ml from 1000 up to the nearest 10", () => {
    expect(formatMetricQty(1234, "g")).toBe("1230 g");
    expect(formatMetricQty(1004, "ml")).toBe("1000 ml");
    expect(formatMetricQty(1006, "ml")).toBe("1010 ml");
  });

  it("shows a positive amount that rounds to zero as a less-than value, not 0", () => {
    expect(formatMetricQty(0.04, "g")).toBe("<0.1 g");
    expect(formatMetricQty(0.04, "ml")).toBe("<0.1 ml");
    expect(formatMetricQty(0.004, "kg")).toBe("<0.01 kg");
    expect(formatMetricQty(0.004, "l")).toBe("<0.01 l");
    expect(formatMetricQty(0.5, "g")).toBe("0.5 g");
  });

  it("shows zero as 0", () => {
    expect(formatMetricQty(0, "g")).toBe("0 g");
    expect(formatMetricQty(0, "kg")).toBe("0 kg");
  });

  it("shows kg and l with up to 2 decimals, trimmed", () => {
    expect(formatMetricQty(1.5, "kg")).toBe("1.5 kg");
    expect(formatMetricQty(1.234, "kg")).toBe("1.23 kg");
    expect(formatMetricQty(2, "l")).toBe("2 l");
    expect(formatMetricQty(3.8, "l")).toBe("3.8 l");
    expect(formatMetricQty(1.999, "kg")).toBe("2 kg");
  });

  it("does not round kg or l to the g/ml steps", () => {
    expect(formatMetricQty(1.23, "l")).toBe("1.23 l");
  });

  it("returns only the number when the unit is empty", () => {
    expect(formatMetricQty(2, "")).toBe("2");
    expect(formatMetricQty(355, "  ")).toBe("355");
  });

  it("uses the g/ml rule for other units", () => {
    expect(formatMetricQty(2.34, "clove")).toBe("2.3 clove");
    expect(formatMetricQty(13, "piece")).toBe("15 piece");
  });
});

describe("scaleIngredient", () => {
  it("scales the qty and returns a new object", () => {
    const original = ingredient({ qty: 1.5 });
    const scaled = scaleIngredient(original, 6, 4);
    expect(scaled.qty).toBeCloseTo(2.25);
    expect(scaled).not.toBe(original);
    expect(original.qty).toBe(1.5);
  });

  it("keeps the other fields", () => {
    const original = ingredient({ unit: "tbsp", item: "butter", note: "softened", group: "Dough", allergens: ["dairy"] });
    const scaled = scaleIngredient(original, 2, 1);
    expect(scaled).toEqual({ ...original, qty: 4 });
  });

  it("keeps a null qty as null", () => {
    const scaled = scaleIngredient(ingredient({ qty: null, unit: null, item: "salt" }), 8, 4);
    expect(scaled.qty).toBeNull();
    expect(scaled.item).toBe("salt");
  });
});
