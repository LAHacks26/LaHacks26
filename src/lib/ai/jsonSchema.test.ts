import { describe, expect, it } from "vitest";
import { z } from "zod";
import { stripForGemini, toGeminiSchema } from "./jsonSchema";

type Json = Record<string, unknown>;

/** Walks every node in the tree, so assertions cover nested objects and arrays too. */
function allKeys(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => allKeys(n, found));
  else if (typeof node === "object" && node !== null) {
    for (const [k, v] of Object.entries(node)) {
      found.push(k);
      allKeys(v, found);
    }
  }
  return found;
}

describe("toGeminiSchema", () => {
  const schema = z.object({
    title: z.string(),
    tags: z.array(z.string()).default([]),
    servings: z.number().int(),
    steps: z.array(
      z.object({
        id: z.string(),
        estMin: z.number().int().min(0),
        ingredientIds: z.array(z.string()).default([]),
      }),
    ),
  });

  it("strips $schema and default at every depth", () => {
    const json = toGeminiSchema(schema) as Json;
    const keys = allKeys(json);
    expect(keys).not.toContain("$schema");
    expect(keys).not.toContain("default");
  });

  it("drops the huge bounds that .int() adds but keeps real bounds", () => {
    const json = toGeminiSchema(schema) as Json;
    const servings = (json.properties as Json).servings as Json;
    expect(servings.type).toBe("integer");
    expect(servings).not.toHaveProperty("maximum");
    expect(servings).not.toHaveProperty("minimum");

    const estMin = (((json.properties as Json).steps as Json).items as Json & { properties: Json }).properties
      .estMin as Json;
    expect(estMin.minimum).toBe(0);
  });

  it("keeps defaulted arrays required in output mode", () => {
    const json = toGeminiSchema(schema) as Json;
    expect(json.required).toEqual(expect.arrayContaining(["title", "tags", "servings", "steps"]));
  });

  it("keeps a property literally named default", () => {
    const json = toGeminiSchema(z.object({ default: z.string() })) as Json;
    expect(Object.keys(json.properties as Json)).toEqual(["default"]);
  });
});

describe("stripForGemini", () => {
  it("does not mutate its input", () => {
    const input = { $schema: "x", default: [], maximum: 9007199254740991 };
    stripForGemini(input);
    expect(input).toEqual({ $schema: "x", default: [], maximum: 9007199254740991 });
  });

  it("keeps small numeric bounds and literal enum values", () => {
    const out = stripForGemini({ maximum: 5, enum: [{ default: 1 }] });
    expect(out).toEqual({ maximum: 5, enum: [{ default: 1 }] });
  });

  it("recurses into arrays of schemas", () => {
    const out = stripForGemini({ anyOf: [{ $schema: "a", type: "string" }, { type: "null" }] });
    expect(out).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });
});
