import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateJson } from "../ai/gemini";
import { maxTotalMinutes, mergeConstraints, parseQuery } from "./parseQuery";

vi.mock("server-only", () => ({}));
vi.mock("../ai/gemini", () => ({
  generateJson: vi.fn(),
  AiError: class AiError extends Error {},
}));

const NOW = new Date("2026-10-18T17:00:00Z");

describe("mergeConstraints", () => {
  it("merges chips with the constraints the text implies, in SEARCH_CONSTRAINTS order", () => {
    expect(mergeConstraints(["Dairy-free"], ["Vegan"])).toEqual(["Vegan", "Dairy-free"]);
  });

  it("dedupes and ignores case and spacing", () => {
    expect(mergeConstraints([" vegan ", "VEGAN"], ["vegan"])).toEqual(["Vegan"]);
  });

  it("drops labels that are not in SEARCH_CONSTRAINTS", () => {
    expect(mergeConstraints(["Keto", "No oven"], ["paleo"])).toEqual(["No oven"]);
  });
});

describe("maxTotalMinutes", () => {
  it("is undefined when there is no ready-by time and the text implies no time", () => {
    expect(maxTotalMinutes(undefined, NOW)).toBeUndefined();
  });

  it("subtracts a 5 minute buffer from the time until ready-by", () => {
    // 17:00 now, ready at 17:45: 45 minutes minus the 5 minute buffer.
    expect(maxTotalMinutes("2026-10-18T17:45:00Z", NOW)).toBe(40);
  });

  it("does not invent extra time for imminent or past deadlines", () => {
    expect(maxTotalMinutes("2026-10-18T17:08:00Z", NOW)).toBe(3);
    expect(maxTotalMinutes("2026-10-18T17:04:00Z", NOW)).toBe(0);
    expect(maxTotalMinutes("2026-10-18T16:30:00Z", NOW)).toBe(0);
  });

  it("uses a time the text implies when it is lower than the ready-by budget", () => {
    expect(maxTotalMinutes("2026-10-18T19:00:00Z", NOW, 15)).toBe(15);
  });

  it("uses the ready-by budget when it is lower than the implied time", () => {
    expect(maxTotalMinutes("2026-10-18T17:25:00Z", NOW, 60)).toBe(20);
  });

  it("uses the implied time alone when there is no ready-by", () => {
    expect(maxTotalMinutes(undefined, NOW, 30)).toBe(30);
  });

  it("ignores an unparseable ready-by time", () => {
    expect(maxTotalMinutes("not a date", NOW)).toBeUndefined();
  });
});

describe("parseQuery", () => {
  beforeEach(() => {
    vi.mocked(generateJson).mockReset();
  });

  it("merges the model's constraints with the chips and applies the text's time limit", async () => {
    vi.mocked(generateJson).mockResolvedValueOnce({
      dishQuery: "pasta",
      constraints: ["Vegan"],
      timeLimitMin: 20,
      isFood: true,
    });

    const parsed = await parseQuery("quick vegan pasta", ["Dairy-free"], undefined, NOW);

    expect(parsed).toEqual({
      dishQuery: "pasta",
      constraints: ["Vegan", "Dairy-free"],
      maxTotalMin: 20,
      isFood: true,
    });
  });

  it("returns isFood false for non-food text", async () => {
    vi.mocked(generateJson).mockResolvedValueOnce({ dishQuery: "poem", constraints: [], isFood: false });
    const parsed = await parseQuery("write me a poem about the sea", [], undefined, NOW);
    expect(parsed.isFood).toBe(false);
    expect(parsed.maxTotalMin).toBeUndefined();
  });

  it("caches the model result by text and chips", async () => {
    vi.mocked(generateJson).mockResolvedValueOnce({ dishQuery: "soup", constraints: [], isFood: true });

    await parseQuery("hot soup for lunch", ["No blender"], undefined, NOW);
    const second = await parseQuery("hot soup for lunch", ["No blender"], "2026-10-18T17:40:00Z", NOW);

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(second.maxTotalMin).toBe(35);
  });

  it("falls back to the raw text when the model fails, and does not cache the fallback", async () => {
    vi.mocked(generateJson).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({
      dishQuery: "tacos",
      constraints: [],
      isFood: true,
    });

    const first = await parseQuery("tacos please", ["Vegan"], undefined, NOW);
    expect(first).toEqual({ dishQuery: "tacos please", constraints: ["Vegan"], maxTotalMin: undefined, isFood: true });

    const second = await parseQuery("tacos please", ["Vegan"], undefined, NOW);
    expect(second.dishQuery).toBe("tacos");
    expect(generateJson).toHaveBeenCalledTimes(2);
  });
});
