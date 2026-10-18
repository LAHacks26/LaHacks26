import { describe, expect, it } from "vitest";
import type { CandidateCardData, SearchEvent } from "@/lib/search/types";
import {
  initialSearchRunState,
  rankCandidates,
  readyByClock,
  reduceSearchEvent,
  type SearchRunState,
} from "./searchRunState";

function card(overrides: Partial<CandidateCardData> & { url: string }): CandidateCardData {
  return {
    title: "Recipe",
    site: "Example",
    allergens: [],
    fitsReadyBy: true,
    ...overrides,
  };
}

function run(events: Array<SearchEvent | { type: "connection_lost" }>): SearchRunState {
  return events.reduce(reduceSearchEvent, initialSearchRunState);
}

const META: SearchEvent = {
  type: "meta",
  query: "butter chicken",
  constraints: ["Dairy-free"],
  readyBy: "2026-10-18T19:30:00-07:00",
};

describe("reduceSearchEvent", () => {
  it("stores meta and cached items", () => {
    const state = run([
      META,
      {
        type: "cached",
        items: [
          {
            sourceRecipeId: "f0a8dd5a-4a78-4aa9-974d-3deaa8570896",
            title: "Easy Indian Butter Chicken",
            site: "Allrecipes",
            totalMin: 60,
            allergens: ["dairy"],
          },
        ],
      },
    ]);
    expect(state.meta?.query).toBe("butter chicken");
    expect(state.cached).toHaveLength(1);
    expect(state.phase).toBe("running");
    expect(state.agentDone).toBe(false);
  });

  it("tracks the live URL and steps while the agent runs", () => {
    const state = run([
      { type: "agent_started", liveUrl: null },
      { type: "agent_step", text: "Searching" },
      { type: "agent_step", text: "Opened a page" },
    ]);
    expect(state.agentStarted).toBe(true);
    expect(state.liveUrl).toBeNull();
    expect(state.steps).toEqual(["Searching", "Opened a page"]);
    expect(state.agentDone).toBe(false);
  });

  it("ends the live phase on the first candidate and keeps arrival order", () => {
    const state = run([
      { type: "candidate", card: card({ url: "https://a.test" }) },
      { type: "candidate", card: card({ url: "https://b.test" }) },
    ]);
    expect(state.agentDone).toBe(true);
    expect(state.order).toEqual(["https://a.test", "https://b.test"]);
    expect(state.cards["https://a.test"]?.sourceRecipeId).toBeUndefined();
  });

  it("does not duplicate a card when the same url arrives twice", () => {
    const state = run([
      { type: "candidate", card: card({ url: "https://a.test", title: "First" }) },
      { type: "candidate", card: card({ url: "https://a.test", title: "Second" }) },
    ]);
    expect(state.order).toEqual(["https://a.test"]);
    expect(state.cards["https://a.test"]?.title).toBe("Second");
  });

  it("replaces a basic card with the ready card and sets sourceRecipeId", () => {
    const state = run([
      { type: "candidate", card: card({ url: "https://a.test" }) },
      {
        type: "candidate_ready",
        sourceRecipeId: "1cd3ee5b-54e6-44aa-be5a-e1e0d9ec8941",
        card: card({ url: "https://a.test", totalMin: 45, difficulty: 3 }),
      },
    ]);
    expect(state.order).toEqual(["https://a.test"]);
    expect(state.cards["https://a.test"]).toMatchObject({
      sourceRecipeId: "1cd3ee5b-54e6-44aa-be5a-e1e0d9ec8941",
      totalMin: 45,
      difficulty: 3,
    });
  });

  it("does not let a late basic candidate overwrite a ready card", () => {
    const state = run([
      {
        type: "candidate_ready",
        sourceRecipeId: "c8d0897c-9d97-44f8-af67-d81aa137a1b5",
        card: card({ url: "https://a.test", totalMin: 35 }),
      },
      { type: "candidate", card: card({ url: "https://a.test" }) },
    ]);
    expect(state.cards["https://a.test"]).toMatchObject({
      sourceRecipeId: "c8d0897c-9d97-44f8-af67-d81aa137a1b5",
      totalMin: 35,
    });
  });

  it("removes a dropped candidate and ignores later events for it", () => {
    const state = run([
      { type: "candidate", card: card({ url: "https://a.test" }) },
      { type: "candidate", card: card({ url: "https://b.test" }) },
      { type: "candidate_dropped", url: "https://a.test", reason: "Over ready-by" },
      { type: "candidate", card: card({ url: "https://a.test" }) },
      {
        type: "candidate_ready",
        sourceRecipeId: "1cd3ee5b-54e6-44aa-be5a-e1e0d9ec8941",
        card: card({ url: "https://a.test" }),
      },
    ]);
    expect(state.order).toEqual(["https://b.test"]);
    expect(state.cards["https://a.test"]).toBeUndefined();
    expect(state.dropped).toEqual(["https://a.test"]);
  });

  it("marks the run done", () => {
    const state = run([META, { type: "done" }]);
    expect(state.phase).toBe("done");
    expect(state.agentDone).toBe(true);
    expect(state.error).toBeNull();
  });

  it("records a server error with its code and message", () => {
    const state = run([
      META,
      { type: "error", code: "agent_failed", message: "The browser session timed out." },
    ]);
    expect(state.phase).toBe("error");
    expect(state.error).toEqual({
      code: "agent_failed",
      message: "The browser session timed out.",
    });
  });

  it("treats a lost connection as an error, unless the run already finished", () => {
    const lost = run([META, { type: "connection_lost" }]);
    expect(lost.phase).toBe("error");
    expect(lost.error?.code).toBe("connection");

    const finished = run([{ type: "done" }, { type: "connection_lost" }]);
    expect(finished.phase).toBe("done");
    expect(finished.error).toBeNull();
  });

  it("keeps the first terminal event", () => {
    const state = run([
      { type: "error", code: "agent_failed", message: "First" },
      { type: "done" },
    ]);
    expect(state.phase).toBe("error");
    expect(state.error?.message).toBe("First");
  });
});

describe("rankCandidates", () => {
  it("moves cards that match the user's allergens last, keeping order within each group", () => {
    const state = run([
      { type: "candidate", card: card({ url: "https://dairy-1.test", allergens: ["dairy"] }) },
      { type: "candidate", card: card({ url: "https://free-1.test", allergens: [] }) },
      { type: "candidate", card: card({ url: "https://egg.test", allergens: ["egg"] }) },
      { type: "candidate", card: card({ url: "https://free-2.test", allergens: ["soy"] }) },
    ]);
    const ranked = rankCandidates(state, ["dairy"]).map((item) => item.url);
    expect(ranked).toEqual([
      "https://free-1.test",
      "https://egg.test",
      "https://free-2.test",
      "https://dairy-1.test",
    ]);
  });

  it("keeps arrival order when the user has no allergies", () => {
    const state = run([
      { type: "candidate", card: card({ url: "https://a.test", allergens: ["dairy"] }) },
      { type: "candidate", card: card({ url: "https://b.test", allergens: [] }) },
    ]);
    expect(rankCandidates(state, []).map((item) => item.url)).toEqual([
      "https://a.test",
      "https://b.test",
    ]);
  });
});

describe("readyByClock", () => {
  it("reads the wall-clock time in the ISO string", () => {
    expect(readyByClock("2026-10-18T19:30:00-07:00")).toBe("19:30");
    expect(readyByClock("2026-10-18T07:05:00+00:00")).toBe("07:05");
  });

  it("returns an empty string when there is no ready-by time", () => {
    expect(readyByClock(undefined)).toBe("");
    expect(readyByClock("not a date")).toBe("");
  });
});
