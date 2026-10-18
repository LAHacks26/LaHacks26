import type { Ingredient } from "./schema";

// Quantity scaling and display rounding (PRD §5.11). Display only: AI edits always use the base recipe.

// Nearest-first candidates for the fractional part. 0 and 1 are included so rounding can carry into the whole.
const FRACTIONS: [number, string][] = [
  [0, ""],
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
  [1, ""],
];

/** qty × servings / baseServings. Null stays null. */
export function scaleQty(qty: number | null, servings: number, baseServings: number): number | null {
  if (qty === null) return null;
  if (!(baseServings > 0)) throw new RangeError(`baseServings must be positive (got ${baseServings})`);
  return (qty * servings) / baseServings;
}

/**
 * US display: nearest ⅛ with unicode fractions, thirds when closer. Never shows "0" for a
 * positive amount (anything below ⅛ becomes ⅛). Values of 10 or more round to whole numbers.
 * 1.5 → "1 ½", 0.333 → "⅓", 2 → "2", 0.06 → "⅛".
 */
export function formatUsQty(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`formatUsQty: not a finite number (${n})`);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10) return sign + String(Math.round(abs));

  let whole = Math.floor(abs);
  const frac = abs - whole;
  let best = FRACTIONS[0];
  for (const candidate of FRACTIONS) {
    if (Math.abs(candidate[0] - frac) < Math.abs(best[0] - frac)) best = candidate;
  }
  let glyph = best[1];
  if (best[0] === 1) whole += 1;
  if (whole === 0 && glyph === "") {
    // Positive but rounds to nothing: show the smallest step instead of "0".
    if (abs === 0) return "0";
    glyph = "⅛";
  }
  if (glyph === "") return sign + String(whole);
  if (whole === 0) return sign + glyph;
  return `${sign}${whole} ${glyph}`;
}

/**
 * Metric display with the unit appended ("355 ml"; just the number when unit is empty).
 * g/ml: 1 decimal under 10, nearest 5 under 1000, else nearest 10. kg/l: up to 2 decimals, trimmed.
 * A positive amount that would round to 0 shows "<0.1" (or "<0.01" for kg/l) instead.
 * Any other unit uses the g/ml rule.
 */
export function formatMetricQty(n: number, unit: string): string {
  const u = unit.trim();
  const abs = Math.abs(n);
  let text: string;
  if (u.toLowerCase() === "kg" || u.toLowerCase() === "l") {
    text = String(Number(n.toFixed(2)));
    if (text === "0" && n > 0) text = "<0.01";
  } else if (abs < 10) {
    text = String(Math.round(n * 10) / 10);
    if (text === "0" && n > 0) text = "<0.1";
  } else if (abs < 1000) {
    text = String(Math.round(n / 5) * 5);
  } else {
    text = String(Math.round(n / 10) * 10);
  }
  return u ? `${text} ${u}` : text;
}

/** Returns a new ingredient with its qty scaled. */
export function scaleIngredient(ing: Ingredient, servings: number, baseServings: number): Ingredient {
  return { ...ing, qty: scaleQty(ing.qty, servings, baseServings) };
}
