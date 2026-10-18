import type { Ingredient } from "./schema";
import { formatMetricQty, formatUsQty } from "./scale";

// Unit aliases and US ↔ metric conversion (PRD §5.11). Converts only within the same kind:
// volume to volume, weight to weight. Never density.

export type CanonicalUnit =
  | "tsp"
  | "tbsp"
  | "cup"
  | "fl oz"
  | "pint"
  | "quart"
  | "gallon"
  | "oz"
  | "lb"
  | "ml"
  | "l"
  | "g"
  | "kg";

export type UnitSystem = "us" | "metric";

type UnitInfo = { kind: "volume" | "weight"; system: UnitSystem; factor: number };

// US customary sizes are defined from the teaspoon so that 3 tsp is exactly 1 tbsp (and so on).
const TSP_ML = 4.92892159375;
const TBSP_ML = 3 * TSP_ML;
const CUP_ML = 48 * TSP_ML;
const FL_OZ_ML = 2 * TBSP_ML;
const PINT_ML = 16 * FL_OZ_ML;
const QUART_ML = 2 * PINT_ML;
const GALLON_ML = 4 * QUART_ML;
const OZ_G = 28.349523125;
const LB_G = 16 * OZ_G;

// factor is millilitres for volume units and grams for weight units.
const UNITS: Record<CanonicalUnit, UnitInfo> = {
  tsp: { kind: "volume", system: "us", factor: TSP_ML },
  tbsp: { kind: "volume", system: "us", factor: TBSP_ML },
  cup: { kind: "volume", system: "us", factor: CUP_ML },
  "fl oz": { kind: "volume", system: "us", factor: FL_OZ_ML },
  pint: { kind: "volume", system: "us", factor: PINT_ML },
  quart: { kind: "volume", system: "us", factor: QUART_ML },
  gallon: { kind: "volume", system: "us", factor: GALLON_ML },
  oz: { kind: "weight", system: "us", factor: OZ_G },
  lb: { kind: "weight", system: "us", factor: LB_G },
  ml: { kind: "volume", system: "metric", factor: 1 },
  l: { kind: "volume", system: "metric", factor: 1000 },
  g: { kind: "weight", system: "metric", factor: 1 },
  kg: { kind: "weight", system: "metric", factor: 1000 },
};

// Keys are lowercase, without a trailing dot. "T" (tablespoon) is special-cased before lowercasing.
const ALIASES = new Map<string, CanonicalUnit>([
  ["tsp", "tsp"],
  ["teaspoon", "tsp"],
  ["teaspoons", "tsp"],
  ["t", "tsp"],
  ["tbsp", "tbsp"],
  ["tbs", "tbsp"],
  ["tbl", "tbsp"],
  ["tablespoon", "tbsp"],
  ["tablespoons", "tbsp"],
  ["cup", "cup"],
  ["cups", "cup"],
  ["c", "cup"],
  ["fl oz", "fl oz"],
  ["fl. oz", "fl oz"],
  ["floz", "fl oz"],
  ["fluid ounce", "fl oz"],
  ["fluid ounces", "fl oz"],
  ["pint", "pint"],
  ["pints", "pint"],
  ["pt", "pint"],
  ["quart", "quart"],
  ["quarts", "quart"],
  ["qt", "quart"],
  ["gallon", "gallon"],
  ["gallons", "gallon"],
  ["gal", "gallon"],
  ["oz", "oz"],
  ["ounce", "oz"],
  ["ounces", "oz"],
  ["lb", "lb"],
  ["lbs", "lb"],
  ["pound", "lb"],
  ["pounds", "lb"],
  ["ml", "ml"],
  ["milliliter", "ml"],
  ["milliliters", "ml"],
  ["millilitre", "ml"],
  ["millilitres", "ml"],
  ["l", "l"],
  ["liter", "l"],
  ["liters", "l"],
  ["litre", "l"],
  ["litres", "l"],
  ["g", "g"],
  ["gram", "g"],
  ["grams", "g"],
  ["kg", "kg"],
  ["kilogram", "kg"],
  ["kilograms", "kg"],
  ["kilo", "kg"],
  ["kilos", "kg"],
]);

// Tolerance for threshold checks, so exact boundaries like 3 tsp = 1 tbsp survive float error.
function atLeast(value: number, threshold: number): boolean {
  return value >= threshold * (1 - 1e-9);
}

/** Maps a unit string (any case, plural, optional trailing dot) to its canonical unit, or null if not convertible. */
export function normalizeUnit(unit: string | null): CanonicalUnit | null {
  if (unit === null) return null;
  const trimmed = unit.trim().replace(/\.$/, "");
  if (trimmed === "T") return "tbsp";
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return ALIASES.get(key) ?? null;
}

function metricVolume(ml: number): { qty: number; unit: string } {
  return atLeast(ml, 1000) ? { qty: ml / 1000, unit: "l" } : { qty: ml, unit: "ml" };
}

function usVolume(ml: number): { qty: number; unit: string } {
  if (atLeast(ml, CUP_ML / 4)) return { qty: ml / CUP_ML, unit: "cup" };
  if (atLeast(ml, TBSP_ML)) return { qty: ml / TBSP_ML, unit: "tbsp" };
  return { qty: ml / TSP_ML, unit: "tsp" };
}

function metricWeight(g: number): { qty: number; unit: string } {
  return atLeast(g, 1000) ? { qty: g / 1000, unit: "kg" } : { qty: g, unit: "g" };
}

function usWeight(g: number): { qty: number; unit: string } {
  return atLeast(g, LB_G) ? { qty: g / LB_G, unit: "lb" } : { qty: g / OZ_G, unit: "oz" };
}

/**
 * Converts to the target system within the same kind. Returns the input unchanged when the unit
 * is not convertible or already belongs to the target system.
 */
export function convertQty(qty: number, unit: string | null, system: UnitSystem): { qty: number; unit: string | null } {
  const canon = normalizeUnit(unit);
  if (canon === null || UNITS[canon].system === system) return { qty, unit };
  const info = UNITS[canon];
  const base = qty * info.factor;
  if (info.kind === "volume") return system === "metric" ? metricVolume(base) : usVolume(base);
  return system === "metric" ? metricWeight(base) : usWeight(base);
}

/** Converts an ingredient's qty and unit. Ingredients without a qty keep their unit. */
export function convertIngredient(ing: Ingredient, system: UnitSystem): Ingredient {
  if (ing.qty === null) return { ...ing };
  const converted = convertQty(ing.qty, ing.unit, system);
  return { ...ing, qty: converted.qty, unit: converted.unit };
}

// Degree sign variants: ° (U+00B0), º (U+00BA) and ˚ (U+02DA).
const DEG = "[\\u00B0\\u00BA\\u02DA]";

// A temperature with a degree sign or "degrees", then F or C (or the long word). A leading minus is part of the number,
// but not when it follows a digit, slash or dot (so "1/2°F" and "20-18°C" keep their own meaning).
// Groups: 1 first number, 2 range separator, 3 second number, 4 unit separator, 5 unit word.
const TEMP_RE = new RegExp(
  `(?<![\\d./])(-?\\d+(?:\\.\\d+)?)(?:(\\s*(?:–|—|-|to)\\s*)(-?\\d+(?:\\.\\d+)?))?(\\s*${DEG}\\s*|\\s+degrees?\\s+)(F|C|Fahrenheit|Celsius)\\b`,
  "gi",
);

// Text right after a temperature that already gives the other scale in parentheses, e.g. "375°F (190°C)".
const PAREN_TEMP_RE = new RegExp(`^\\s*\\((?=[^)]*\\d)[^)]*?(?:${DEG}|degrees|celsius|fahrenheit|\\bc\\b|\\bf\\b)`, "i");
// Text after a temperature that is paired with another, e.g. "180°C / 350°F" or "350°F or 180°C".
const PAIR_AFTER_RE = new RegExp(
  `^\\s*(?:\\/|or)\\s*(?:(?:about|approximately)\\s+|~)?-?\\d+(?:\\.\\d+)?(?:\\s*(?:–|—|-|to)\\s*-?\\d+(?:\\.\\d+)?)?\\s*(?:${DEG}\\s*|\\s+degrees?\\s+)(?:F|C|Fahrenheit|Celsius)\\b`,
  "i",
);
// Text ending in a temperature and a pair joiner ("(", "/" or "or"), so the temperature after it is the second half of a pair.
const PAIR_BEFORE_RE = new RegExp(
  `\\d\\s*(?:${DEG}\\s*|\\s+degrees\\s+)(?:F|C|Fahrenheit|Celsius)\\s*(?:\\(\\s*(?:(?:about|approximately)\\s+|~)?|\\/\\s*|or\\s+)$`,
  "i",
);

function roundToFive(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Converts °F ↔ °C in step text to the target system, rounding to the nearest 5 degrees.
 * Leaves text alone when it already gives both scales, e.g. "375 degrees F (190 degrees C)".
 */
export function convertTemperaturesInText(text: string, system: UnitSystem): string {
  const toF = system === "us";
  return text.replace(
    TEMP_RE,
    (match: string, first: string, rangeSep: string | undefined, second: string | undefined, unitSep: string, unit: string, offset: number, source: string) => {
      const fromF = /^f/i.test(unit);
      if (fromF === toF) return match;
      // Temperatures that already give both scales are left as written.
      const after = source.slice(offset + match.length);
      if (PAREN_TEMP_RE.test(after) || PAIR_AFTER_RE.test(after)) return match;
      if (PAIR_BEFORE_RE.test(source.slice(0, offset))) return match;

      const convert = (value: string): string => {
        const x = Number(value);
        return String(roundToFive(fromF ? ((x - 32) * 5) / 9 : (x * 9) / 5 + 32));
      };
      const newUnit = toF ? (unit.length > 1 ? "Fahrenheit" : "F") : unit.length > 1 ? "Celsius" : "C";
      const tail = second === undefined ? "" : `${rangeSep ?? ""}${convert(second)}`;
      return `${convert(first)}${tail}${unitSep}${newUnit}`;
    },
  );
}

// US units with a plural form. Others (tsp, tbsp, oz, fl oz) stay the same in the plural.
const US_PLURALS: Partial<Record<CanonicalUnit, string>> = {
  cup: "cups",
  pint: "pints",
  quart: "quarts",
  gallon: "gallons",
  lb: "lbs",
};

/**
 * Display string for an ingredient's amount in the given system: "1 ½ cups", "355 ml", "2 cloves".
 * Converts first, then formats with scale.ts. Units that can't be converted are shown as written.
 */
export function formatIngredientQty(ing: Ingredient, system: UnitSystem): string {
  // Runs in render, so a bad number is shown as written rather than thrown.
  if (ing.qty !== null && !Number.isFinite(ing.qty)) return [String(ing.qty), ing.unit].filter(Boolean).join(" ");

  const converted = ing.qty === null ? { qty: null, unit: ing.unit } : convertQty(ing.qty, ing.unit, system);
  if (converted.qty === null) return converted.unit ?? "";
  const canon = normalizeUnit(converted.unit);

  // Metric units (ml, l, g, kg) get the metric rounding and keep their unit.
  if (system === "metric" && canon !== null && UNITS[canon].system === "metric") {
    return formatMetricQty(converted.qty, canon);
  }

  // Counts, unitless items and non-convertible units use the fraction formatter and the unit as written.
  let unit = canon ?? converted.unit;
  if (system === "us" && canon !== null && Math.round(converted.qty * 8) / 8 > 1) {
    unit = US_PLURALS[canon] ?? canon;
  }
  return [formatUsQty(converted.qty), unit].filter((part) => part && part.length > 0).join(" ");
}
