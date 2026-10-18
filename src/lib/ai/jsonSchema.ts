import { z } from "zod";

// Pure helpers for turning zod schemas into the JSON Schema Gemini accepts as `responseJsonSchema`.
// No `server-only` here so vitest can cover it.

/** `.int()` adds bounds of ±Number.MAX_SAFE_INTEGER; anything this large is noise to Gemini. */
const HUGE_BOUND = 1e15;

/** Keys Gemini does not need. `default` is dropped because the output-mode schema already marks the field required. */
const STRIP_KEYS = new Set(["$schema", "default"]);

/** Keys whose value is a map of name → schema. Their keys are property names, so they are never stripped. */
const SCHEMA_MAP_KEYS = new Set(["properties", "$defs", "definitions", "patternProperties"]);

/** Keys whose value is literal data. Copied as-is so a value named "default" survives. */
const LITERAL_KEYS = new Set(["enum", "const", "examples", "required"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively removes keys Gemini rejects or does not need. Returns a new value; the input is not mutated. */
export function stripForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripForGemini);
  if (!isPlainObject(node)) return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (STRIP_KEYS.has(key)) continue;
    if ((key === "minimum" || key === "maximum") && typeof value === "number" && Math.abs(value) >= HUGE_BOUND) {
      continue;
    }
    if (LITERAL_KEYS.has(key)) {
      out[key] = value;
    } else if (SCHEMA_MAP_KEYS.has(key) && isPlainObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, stripForGemini(sub)]));
    } else {
      out[key] = stripForGemini(value);
    }
  }
  return out;
}

/**
 * Output-mode JSON Schema for a zod schema, cleaned for Gemini. Output mode makes defaulted
 * fields required, so the model has to emit them.
 */
export function toGeminiSchema(schema: z.ZodType): object {
  const raw = z.toJSONSchema(schema, { io: "output", reused: "inline", unrepresentable: "any" });
  return stripForGemini(raw) as object;
}
