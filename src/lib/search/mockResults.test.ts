import { describe, expect, it, vi } from "vitest";
import { buildAgentPrompt } from "./browserUse";
import { MOCK_TASK_TTL_MS, MockBrowserUseClient, stepsSoFar } from "./mockBrowserUse";
import { mockCandidatesFor } from "./mockResults";

vi.mock("server-only", () => ({}));

describe("mockCandidatesFor", () => {
  it("matches chicken tikka masala to the curry set, which includes the cached tikka page", () => {
    const urls = mockCandidatesFor("chicken tikka masala").map((c) => c.url);
    expect(urls).toContain("https://www.simplyrecipes.com/recipes/chicken_tikka_masala/");
  });

  it("includes a cake page for chocolate cake", () => {
    const urls = mockCandidatesFor("chocolate cake").map((c) => c.url);
    expect(urls).toContain("https://www.bbcgoodfood.com/recipes/easy-chocolate-cake");
  });

  it("returns the AllRecipes butter chicken page (already cached) for butter chicken", () => {
    const urls = mockCandidatesFor("butter chicken").map((c) => c.url);
    expect(urls).toContain("https://www.allrecipes.com/recipe/141169/easy-indian-butter-chicken/");
  });

  it("matches keywords ignoring case", () => {
    expect(mockCandidatesFor("Mac and Cheese")[0].url).toBe("https://www.allrecipes.com/recipe/11679/homemade-mac-and-cheese/");
  });

  it.each([
    ["pasta", "https://www.allrecipes.com/recipe/23600/worlds-best-lasagna/"],
    ["spinach chickpea curry", "https://www.bbcgoodfood.com/recipes/spinach-chickpea-curry"],
    ["breakfast", "https://www.allrecipes.com/recipe/21014/good-old-fashioned-pancakes/"],
    ["pancakes", "https://www.allrecipes.com/recipe/21014/good-old-fashioned-pancakes/"],
    ["chocolate chip cookies", "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/"],
  ])("maps %s to its keyword set", (dish, firstUrl) => {
    expect(mockCandidatesFor(dish)[0].url).toBe(firstUrl);
  });

  it("falls back to the default set for an unknown dish", () => {
    expect(mockCandidatesFor("zzz unknown dish")[0].url).toBe("https://www.simplyrecipes.com/recipes/homemade_pizza/");
  });

  it("returns at most three distinct, https, allowlisted URLs", () => {
    const allowed = ["allrecipes.com", "bbcgoodfood.com", "simplyrecipes.com", "seriouseats.com"];
    for (const dish of ["butter chicken", "pasta", "curry", "pancakes", "cookies", "mac and cheese", "xyz"]) {
      const candidates = mockCandidatesFor(dish);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(3);
      expect(new Set(candidates.map((c) => c.url)).size).toBe(candidates.length);
      for (const { url } of candidates) {
        const host = new URL(url).hostname.replace(/^www\./, "");
        expect(url.startsWith("https://")).toBe(true);
        expect(allowed).toContain(host);
      }
    }
  });
});

describe("stepsSoFar", () => {
  it("shows the first step at once and every step by the end", () => {
    expect(stepsSoFar("pasta", 0, 8_000)).toHaveLength(1);
    expect(stepsSoFar("pasta", 8_000, 8_000)).toHaveLength(7);
    expect(stepsSoFar("pasta", 0, 8_000)[0]).toBe("Opening Allrecipes…");
  });

  it("fills in the dish name", () => {
    expect(stepsSoFar("pasta", 2_000, 8_000)).toContain("Searching for pasta…");
  });
});

describe("MockBrowserUseClient", () => {
  it("runs for the scripted duration, then finishes with verified candidates", async () => {
    let now = 1_000;
    const client = new MockBrowserUseClient({ now: () => now, durationMs: 8_000 });
    const { taskId, liveUrl } = await client.start("prompt", {
      dishQuery: "butter chicken",
      constraints: [],
      maxSteps: 25,
    });
    expect(liveUrl).toBeNull();

    const early = await client.poll(taskId);
    expect(early.status).toBe("running");
    expect(early.candidates).toBeUndefined();

    now += 8_000;
    const done = await client.poll(taskId);
    expect(done.status).toBe("finished");
    expect(done.steps.length).toBeGreaterThan(early.steps.length);
    expect(done.candidates).toEqual(mockCandidatesFor("butter chicken"));
    await expect(client.poll(taskId)).rejects.toThrow("Unknown mock task");
  });

  it("releases a cancelled task immediately, even without another poll", async () => {
    const client = new MockBrowserUseClient({ now: () => 0 });
    const { taskId } = await client.start("prompt", { dishQuery: "pasta", constraints: [], maxSteps: 25 });
    await client.cancel(taskId);
    await client.cancel(taskId); // Idempotent after deletion.
    await expect(client.poll(taskId)).rejects.toThrow("Unknown mock task");
  });

  it("reaps abandoned tasks while preserving newly started tasks", async () => {
    let now = 0;
    const client = new MockBrowserUseClient({ now: () => now });
    const options = { dishQuery: "pasta", constraints: [], maxSteps: 25 };
    const old = await client.start("prompt", options);
    now += MOCK_TASK_TTL_MS;
    const current = await client.start("prompt", options);
    await expect(client.poll(old.taskId)).rejects.toThrow("Unknown mock task");
    expect((await client.poll(current.taskId)).status).toBe("running");
    await client.cancel(current.taskId);
  });
});

describe("buildAgentPrompt", () => {
  it("asks for 3 distinct pages, the allowlist, and the time limit", () => {
    const prompt = buildAgentPrompt("pasta", ["Vegan", "No oven"], 30);
    expect(prompt).toContain('"pasta"');
    expect(prompt).toContain("Vegan, No oven");
    expect(prompt).toContain("at most 30 minutes");
    expect(prompt).toContain("3 distinct");
    expect(prompt).toContain("allrecipes.com");
    expect(prompt).toContain("about 25 steps");
  });

  it("omits the time line when there is no limit", () => {
    expect(buildAgentPrompt("pasta", [])).not.toContain("minutes");
  });
});
