import { beforeEach, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { findCached } from "./cache";

const { query, rows } = vi.hoisted(() => {
  const rows: unknown[] = [];
  const query = { select: vi.fn(), from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn() };
  return { query, rows };
});
vi.mock("server-only", () => ({}));
vi.mock("../ai/gemini", () => ({ embed: vi.fn(async () => [1, 0]) }));
vi.mock("../db/client", () => ({ getDb: () => query }));
beforeEach(() => {
  rows.length = 0;
  query.select.mockReturnValue(query);
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockImplementation(async () => rows);
});
it("filters before selecting three cached matches and preserves allergen labels", async () => {
  rows.push(...Array.from({ length: 5 }, (_, i) => ({
    id: `id-${i}`, title: "Dinner", site: "example", totalMin: 30, imageUrl: null,
    allergens: ["dairy"], distance: 0.2,
    recipe: i === 0 ? butterChicken : { ...butterChicken, ingredients: [butterChicken.ingredients[1]] },
  })));
  const matches = await findCached("dinner", ["Vegetarian"]);
  expect(matches.map((item) => item.sourceRecipeId)).toEqual(["id-1", "id-2", "id-3"]);
  expect(matches[0].allergens).toEqual(["dairy"]);
});
