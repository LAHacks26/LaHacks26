import { describe, expect, it } from "vitest";
import {
  AiEditResultSchema,
  IngredientSchema,
  PatchOpSchema,
  RecipeSchema,
  ScoreSchema,
  TimerSchema,
  WorkingCopySchema,
} from "./schema";
import { butterChicken } from "./fixtures/butterChicken";

const ingredient = { id: "i1", qty: 1, unit: "cup", item: "flour" };
const step = { id: "s1", text: "Mix.", estMin: 2 };
const appliance = { id: "a1", name: "Oven" };
const lineRef = { kind: "step", id: "s1" } as const;

describe("butterChicken fixture", () => {
  it("parses with RecipeSchema", () => {
    expect(() => RecipeSchema.parse(butterChicken)).not.toThrow();
  });

  it("has step estMin values that sum to times.totalMin", () => {
    const sum = butterChicken.steps.reduce((total, s) => total + s.estMin, 0);
    expect(sum).toBe(butterChicken.times.totalMin);
  });

  it("only references ingredient and appliance IDs that exist", () => {
    const ingredientIds = new Set(butterChicken.ingredients.map((i) => i.id));
    const applianceIds = new Set(butterChicken.appliances.map((a) => a.id));
    for (const s of butterChicken.steps) {
      for (const id of s.ingredientIds) expect(ingredientIds.has(id), `${s.id} -> ${id}`).toBe(true);
      for (const id of s.applianceIds) expect(applianceIds.has(id), `${s.id} -> ${id}`).toBe(true);
    }
  });
});

describe("defaults", () => {
  it("fills allergens and tips with [] when omitted", () => {
    const parsed = IngredientSchema.parse(ingredient);
    expect(parsed.allergens).toEqual([]);
    expect(parsed.tips).toEqual([]);
  });
});

describe("validation", () => {
  it("rejects a malformed ingredient ID", () => {
    expect(IngredientSchema.safeParse({ ...ingredient, id: "x1" }).success).toBe(false);
  });

  it("rejects a score of 6", () => {
    expect(ScoreSchema.safeParse(6).success).toBe(false);
  });

  it("rejects a timer whose max is below min", () => {
    expect(TimerSchema.safeParse({ min: 10, max: 5 }).success).toBe(false);
    expect(TimerSchema.safeParse({ min: 5, max: 10 }).success).toBe(true);
  });
});

describe("PatchOpSchema", () => {
  const validOps: Record<string, unknown>[] = [
    { op: "update_ingredient", id: "i1", qty: 2 },
    { op: "add_ingredient", after: null, ingredient },
    { op: "remove_ingredient", id: "i1" },
    { op: "update_step", id: "s1", text: "Mix well." },
    { op: "insert_step", after: "s1", step },
    { op: "remove_step", id: "s1" },
    { op: "add_appliance", appliance },
    { op: "remove_appliance", id: "a1" },
    { op: "add_tip", target: lineRef, text: "Use a hot pan." },
  ];

  it.each(validOps)("parses a minimal $op op", (op) => {
    expect(PatchOpSchema.safeParse(op).success).toBe(true);
  });

  it("has exactly the nine expected variants", () => {
    const ops = PatchOpSchema.options.map((o) => o.shape.op.value);
    expect(PatchOpSchema.options).toHaveLength(9);
    expect(new Set(ops)).toEqual(
      new Set([
        "update_ingredient",
        "add_ingredient",
        "remove_ingredient",
        "update_step",
        "insert_step",
        "remove_step",
        "add_appliance",
        "remove_appliance",
        "add_tip",
      ]),
    );
  });

  it("rejects an unknown op", () => {
    expect(PatchOpSchema.safeParse({ op: "explode", id: "i1" }).success).toBe(false);
  });
});

describe("AiEditResultSchema", () => {
  const validResults: Record<string, unknown>[] = [
    { kind: "patch", summary: "Swapped heavy cream for coconut milk", ops: [{ op: "remove_ingredient", id: "i1" }] },
    { kind: "rejected", reason: "Baking soda cannot be replaced with flour.", suggestions: ["a", "b", "c"] },
    { kind: "answer", text: "Broil for about 8 minutes." },
    { kind: "tip", text: "Pat the chicken dry first.", target: lineRef },
    { kind: "impossible", reason: "No recipe matches that.", suggestedSearch: "vegan butter chicken" },
  ];

  it.each(validResults)("parses a valid $kind result", (result) => {
    expect(AiEditResultSchema.safeParse(result).success).toBe(true);
  });

  it("rejects a rejected result with only 2 suggestions", () => {
    const result = AiEditResultSchema.safeParse({ kind: "rejected", reason: "No.", suggestions: ["a", "b"] });
    expect(result.success).toBe(false);
  });

  it("rejects a patch without ops and names the field", () => {
    const result = AiEditResultSchema.safeParse({ kind: "patch", summary: "Did a thing" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("ops");
  });

  it("rejects an impossible result without suggestedSearch and names the field", () => {
    const result = AiEditResultSchema.safeParse({ kind: "impossible", reason: "Cannot do that." });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("suggestedSearch");
  });

  it("names the missing field for each failing kind", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ kind: "patch", ops: [{ op: "remove_ingredient", id: "i1" }] }, "summary"],
      [{ kind: "patch", summary: "x", ops: [] }, "ops"],
      [{ kind: "rejected", reason: "No.", suggestions: ["a", "b"] }, "suggestions"],
      [{ kind: "rejected", suggestions: ["a", "b", "c"] }, "reason"],
      [{ kind: "answer" }, "text"],
      [{ kind: "tip", target: lineRef }, "text"],
      [{ kind: "tip", text: "Pat dry." }, "target"],
      [{ kind: "impossible", suggestedSearch: "vegan butter chicken" }, "reason"],
      [{ kind: "impossible", reason: "No.", suggestedSearch: "   " }, "suggestedSearch"],
    ];
    for (const [input, field] of cases) {
      const result = AiEditResultSchema.safeParse(input);
      expect(result.success, JSON.stringify(input)).toBe(false);
      if (!result.success) expect(result.error.message, JSON.stringify(input)).toContain(field);
    }
  });

  it("treats a whitespace-only answer text as missing", () => {
    const result = AiEditResultSchema.safeParse({ kind: "answer", text: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("text");
  });
});

describe("WorkingCopySchema", () => {
  const workingCopy = (undoStack: unknown[]) => ({
    recipe: butterChicken,
    version: 0,
    undoStack,
  });

  it("accepts an undo stack of 20 entries", () => {
    const stack = Array.from({ length: 20 }, () => butterChicken);
    expect(WorkingCopySchema.safeParse(workingCopy(stack)).success).toBe(true);
  });

  it("rejects an undo stack of 21 entries", () => {
    const stack = Array.from({ length: 21 }, () => butterChicken);
    expect(WorkingCopySchema.safeParse(workingCopy(stack)).success).toBe(false);
  });

  it("accepts readyBy with a UTC offset", () => {
    const result = WorkingCopySchema.safeParse({ ...workingCopy([]), readyBy: "2026-10-17T19:30:00-07:00" });
    expect(result.success).toBe(true);
  });

  it("rejects readyBy that is not a datetime", () => {
    const result = WorkingCopySchema.safeParse({ ...workingCopy([]), readyBy: "tonight" });
    expect(result.success).toBe(false);
  });
});

describe("source URLs", () => {
  const withUrls = (url: string, imageUrl?: string) => ({
    ...butterChicken,
    source: { ...butterChicken.source, url, ...(imageUrl ? { imageUrl } : {}) },
  });
  const unsafe = ["javascript:alert(1)", "data:text/html,x", "vbscript:msgbox(1)", "ftp://example.com/recipe"];

  it.each(unsafe)("rejects %s as source.url", (url) => {
    expect(RecipeSchema.safeParse(withUrls(url)).success).toBe(false);
  });

  it.each(unsafe)("rejects %s as source.imageUrl", (url) => {
    expect(RecipeSchema.safeParse(withUrls(butterChicken.source.url, url)).success).toBe(false);
  });

  it("accepts an https URL in both fields", () => {
    const result = RecipeSchema.safeParse(withUrls("https://example.com/recipe", "https://example.com/photo.jpg"));
    expect(result.success).toBe(true);
  });
});
