import { describe, expect, it } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { CreateSavedSchema, UpdateSavedSchema, UpdateAllergiesSchema } from "./validation";

const copy = { recipe: butterChicken, undoStack: [], version: 0 };
const body = { copy, messages: [] };
describe("saved request boundaries", () => {
  it.each(["userId", "ownerId", "forkedFromId", "googleSub", "shareSlug"])("rejects forged authority field %s", (field) => {
    expect(CreateSavedSchema.safeParse({ ...body, [field]: "forged" }).success).toBe(false);
  });
  it("rejects simultaneous public-source and fork lineage claims", () => {
    expect(CreateSavedSchema.safeParse({ ...body, sourceRecipeId: "44444444-4444-4444-8444-444444444444", forkedFromSlug: "a".repeat(32) }).success).toBe(false);
  });
  it("rejects excessive undo, chat, line text and recipe arrays", () => {
    for (const invalid of [
      { ...body, copy: { ...copy, undoStack: Array(21).fill(butterChicken) } },
      { ...body, messages: Array(201).fill({ id: "m", role: "user", content: "x" }) },
      { ...body, messages: [{ id: "m", role: "user", content: "x".repeat(10001) }] },
      { ...body, copy: { ...copy, recipe: { ...butterChicken, title: "x".repeat(301) } } },
      { ...body, copy: { ...copy, recipe: { ...butterChicken, ingredients: Array(201).fill(butterChicken.ingredients[0]) } } },
    ]) expect(CreateSavedSchema.safeParse(invalid).success).toBe(false);
  });
  it("rejects stored AI/undo attachment metadata and mismatched line reference kinds", () => {
    for (const extra of [{ result: {} }, { appliedVersion: 4 }, { contextRefs: [{ kind: "step", id: "i1" }] }]) {
      expect(CreateSavedSchema.safeParse({ ...body, messages: [{ id: "m", role: "user", content: "x", ...extra }] }).success).toBe(false);
    }
  });
  it("requires the complete microsecond token rather than a truncated Date", () => {
    expect(UpdateSavedSchema.safeParse({ ...body, expectedUpdatedAt: "2026-10-18T12:00:00.123456Z" }).success).toBe(true);
    expect(UpdateSavedSchema.safeParse({ ...body, expectedUpdatedAt: "2026-10-18T12:00:00.123Z" }).success).toBe(false);
  });
  it("normalizes and bounds allergies", () => {
    expect(UpdateAllergiesSchema.parse({ allergies: [" DAIRY ", "dairy", " Soy"] })).toEqual({ allergies: ["dairy", "soy"] });
    expect(UpdateAllergiesSchema.safeParse({ allergies: Array(31).fill("dairy") }).success).toBe(false);
    expect(UpdateAllergiesSchema.safeParse({ allergies: ["x".repeat(81)] }).success).toBe(false);
    expect(UpdateAllergiesSchema.safeParse({ allergies: [" "] }).success).toBe(false);
  });
});
