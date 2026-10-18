import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRecipe } from "../db/schema";
import { getSourceRecipe } from "../db/sourceRecipes";
import { importRecipe } from "../ingest/importRecipe";
import { findCached } from "./cache";
import { type AgentCandidate, type AgentStatus, type BrowserUseClient, getBrowserUseClient } from "./browserUse";
import { parseQuery } from "./parseQuery";
import { type SearchRequest, startSearch, subscribe } from "./runSearch";
import type { SearchEvent } from "./types";

vi.mock("server-only", () => ({}));
vi.mock("../ai/gemini", () => ({
  generateJson: vi.fn(),
  embed: vi.fn(),
  AiError: class AiError extends Error {
    code = "failed";
  },
}));
vi.mock("./parseQuery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./parseQuery")>()),
  parseQuery: vi.fn(),
}));
vi.mock("./cache", () => ({ findCached: vi.fn() }));
vi.mock("../db/sourceRecipes", () => ({ getSourceRecipe: vi.fn() }));
vi.mock("../ingest/importRecipe", () => ({ importRecipe: vi.fn() }));
vi.mock("./searchLog", () => ({
  logSearchStart: vi.fn(async () => null),
  logSearchUpdate: vi.fn(async () => undefined),
}));
vi.mock("./browserUse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./browserUse")>()),
  getBrowserUseClient: vi.fn(),
}));

const CANDIDATES: AgentCandidate[] = [
  { url: "https://www.allrecipes.com/a", title: "A" },
  { url: "https://www.bbcgoodfood.com/b", title: "B" },
  { url: "https://www.simplyrecipes.com/c", title: "C" },
];

type Mode = "finish" | "hang" | "fail" | "start-error";

/**
 * A scripted Browser Use client. "finish" completes on the third poll, "hang" keeps running until
 * finishTask() is called, "fail" reports failure, and "start-error" throws from start().
 */
function makeAgent(mode: Mode, candidates: AgentCandidate[] = CANDIDATES) {
  let counter = 0;
  const tasks = new Map<string, { polls: number; steps: string[]; outcome: AgentStatus | "running" }>();

  const client = {
    start: vi.fn(async () => {
      if (mode === "start-error") throw new Error("no agent");
      const taskId = `task-${++counter}`;
      tasks.set(taskId, { polls: 0, steps: [], outcome: "running" });
      return { taskId, liveUrl: null };
    }),
    poll: vi.fn(async (taskId: string) => {
      const task = tasks.get(taskId);
      if (!task) throw new Error("unknown task");
      task.polls++;
      if (task.outcome === "running") {
        if (mode === "fail") task.outcome = "failed";
        else if (mode === "finish" && task.polls >= 3) task.outcome = "finished";
        else task.steps.push(`Step ${task.steps.length + 1}`);
      }
      return {
        status: task.outcome === "running" ? "running" : task.outcome,
        steps: [...task.steps],
        candidates: task.outcome === "finished" ? candidates : undefined,
      };
    }),
    cancel: vi.fn(async () => undefined),
  };

  return {
    client: client as unknown as BrowserUseClient,
    raw: client,
    taskIds: () => [...tasks.keys()],
    finishTask: (taskId: string) => {
      const task = tasks.get(taskId);
      if (task) task.outcome = "finished";
    },
  };
}

/** Total minutes the importer's JSON-LD reports (seen before normalization), by URL. */
const jsonLdTotals = new Map<string, number>();
/** Total minutes of the normalized row in the DB, by URL. */
const rowTotals = new Map<string, number>();

/** A DB row for the sourceRecipeId made by the importer mock. */
function rowFor(id: string): SourceRecipe {
  const url = id.replace(/^id:/, "");
  return {
    id,
    url,
    site: "example.com",
    title: `Title for ${url}`,
    imageUrl: null,
    totalMin: rowTotals.get(url) ?? 40,
    allergens: ["dairy"],
    recipe: { difficulty: { score: 2 } },
  } as unknown as SourceRecipe;
}

function startRun(sessionKey: string, opts: { readyBy?: string } = {}) {
  const request: SearchRequest = { text: "butter chicken", constraints: [], allergies: [], readyBy: opts.readyBy };
  const id = startSearch(request, { sessionKey, ip: "test" });
  const events: SearchEvent[] = [];
  const sub = subscribe(id, (event) => events.push(event));
  if (!sub) throw new Error("run was not registered");
  events.push(...sub.replay);
  return { id, events };
}

const types = (events: SearchEvent[]) => events.map((event) => event.type);

beforeEach(() => {
  vi.useFakeTimers();
  jsonLdTotals.clear();
  rowTotals.clear();
  vi.mocked(parseQuery).mockResolvedValue({
    dishQuery: "butter chicken",
    constraints: [],
    maxTotalMin: undefined,
    isFood: true,
  });
  vi.mocked(findCached).mockResolvedValue([]);
  vi.mocked(getSourceRecipe).mockImplementation(async (id: string) => rowFor(id));
  vi.mocked(importRecipe).mockImplementation(async (url: string, hooks) => {
    hooks?.onParsed?.({ url, title: `Title for ${url}`, siteName: "example.com", totalMin: jsonLdTotals.get(url) });
    return { sourceRecipeId: `id:${url}`, cached: false };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("runSearch: happy path", () => {
  it("emits meta, cached, agent_started, steps, candidates, then done", async () => {
    const agent = makeAgent("finish");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);

    const { events } = startRun("s-happy");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(types(events).slice(0, 3)).toEqual(["meta", "cached", "agent_started"]);
    expect(types(events).at(-1)).toBe("done");
    expect(events.filter((e) => e.type === "agent_step").map((e) => (e.type === "agent_step" ? e.text : ""))).toEqual([
      "Step 1",
      "Step 2",
    ]);

    const readyUrls = events.flatMap((e) => (e.type === "candidate_ready" ? [e.card.url] : []));
    expect(readyUrls.sort()).toEqual(CANDIDATES.map((c) => c.url).sort());

    for (const candidate of CANDIDATES) {
      const basic = events.findIndex((e) => e.type === "candidate" && e.card.url === candidate.url);
      const ready = events.findIndex((e) => e.type === "candidate_ready" && e.card.url === candidate.url);
      expect(basic).toBeGreaterThanOrEqual(0);
      expect(basic).toBeLessThan(ready);
    }
    expect(events.findIndex((e) => e.type === "candidate_ready" && e.card.url === CANDIDATES[0].url)).toBeLessThan(
      events.findIndex((e) => e.type === "done"),
    );
  });

  it("emits cached with an empty list when nothing matches", async () => {
    const agent = makeAgent("finish");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);
    const { events } = startRun("s-empty-cache");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events[1]).toEqual({ type: "cached", items: [] });
  });

  it("returns cached matches in the cached event", async () => {
    const agent = makeAgent("finish");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);
    const item = { sourceRecipeId: "x", title: "Butter Chicken", site: "allrecipes.com", totalMin: 60, allergens: [] };
    vi.mocked(findCached).mockResolvedValueOnce([item]);
    const { events } = startRun("s-cached-items");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events[1]).toEqual({ type: "cached", items: [item] });
  });
});

describe("runSearch: failures", () => {
  it("stops with not_food for non-food text and never starts the agent", async () => {
    vi.mocked(parseQuery).mockResolvedValueOnce({ dishQuery: "poem", constraints: [], isFood: false });
    const agent = makeAgent("finish");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);

    const { events } = startRun("s-not-food");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(types(events)).toEqual(["meta", "error"]);
    expect(events[1]).toMatchObject({ type: "error", code: "not_food" });
    expect(agent.raw.start).not.toHaveBeenCalled();
  });

  it("emits agent_failed when the agent reports failure, and keeps cached results", async () => {
    const agent = makeAgent("fail");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);
    const { events } = startRun("s-agent-fails");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(types(events)).toEqual(["meta", "cached", "agent_started", "error"]);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "agent_failed" });
  });

  it("emits agent_failed when the agent cannot start", async () => {
    const agent = makeAgent("start-error");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);
    const { events } = startRun("s-start-error");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(types(events)).toEqual(["meta", "cached", "error"]);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "agent_failed" });
  });

  it("cancels the agent and emits agent_failed after 150 seconds", async () => {
    const agent = makeAgent("hang");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);
    const { events } = startRun("s-timeout");
    await vi.advanceTimersByTimeAsync(151_000);

    expect(events.at(-1)).toMatchObject({ type: "error", code: "agent_failed" });
    expect(agent.raw.cancel).toHaveBeenCalledWith(agent.taskIds()[0]);
  });
});

describe("runSearch: ready-by budget", () => {
  it("drops candidates that are too long, before and after normalization", async () => {
    const agent = makeAgent("finish", [
      { url: "https://www.allrecipes.com/long-by-json-ld", title: "Long" },
      { url: "https://www.bbcgoodfood.com/short", title: "Short" },
      { url: "https://www.simplyrecipes.com/long-after-import", title: "Later long" },
    ]);
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);
    vi.mocked(parseQuery).mockResolvedValueOnce({
      dishQuery: "butter chicken",
      constraints: [],
      maxTotalMin: 30,
      isFood: true,
    });
    // Too long by JSON-LD: dropped before normalization. Too long only after normalization: dropped from the row.
    jsonLdTotals.set("https://www.allrecipes.com/long-by-json-ld", 60);
    rowTotals.set("https://www.allrecipes.com/long-by-json-ld", 60);
    rowTotals.set("https://www.simplyrecipes.com/long-after-import", 45);
    jsonLdTotals.set("https://www.bbcgoodfood.com/short", 20);
    rowTotals.set("https://www.bbcgoodfood.com/short", 20);

    const { events } = startRun("s-ready-by", { readyBy: "2026-10-18T18:00:00Z" });
    await vi.advanceTimersByTimeAsync(10_000);

    const dropped = events.flatMap((e) => (e.type === "candidate_dropped" ? [e] : []));
    expect(dropped.map((e) => [e.url, e.reason])).toEqual([
      ["https://www.allrecipes.com/long-by-json-ld", "too long"],
      ["https://www.simplyrecipes.com/long-after-import", "too long"],
    ]);
    const ready = events.flatMap((e) => (e.type === "candidate_ready" ? [e.card] : []));
    expect(ready.map((card) => card.url)).toEqual(["https://www.bbcgoodfood.com/short"]);
    expect(ready[0].fitsReadyBy).toBe(true);
    expect(types(events).at(-1)).toBe("done");
  });
});

describe("runSearch: one active run per session", () => {
  it("cancels the old run when a new search starts from the same session", async () => {
    const agent = makeAgent("hang");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);

    const first = startRun("s-replace");
    await vi.advanceTimersByTimeAsync(2_000);
    const firstTask = agent.taskIds()[0];

    const second = startRun("s-replace");
    await vi.advanceTimersByTimeAsync(10);

    expect(first.events.at(-1)).toEqual({ type: "error", code: "failed", message: "Replaced by a new search" });
    expect(agent.raw.cancel).toHaveBeenCalledWith(firstTask);

    const countAfterReplace = first.events.length;
    agent.finishTask(agent.taskIds()[1]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(first.events).toHaveLength(countAfterReplace);
    expect(types(second.events).at(-1)).toBe("done");
  });
});

describe("runSearch: concurrency", () => {
  it("runs at most three agents at once and queues the rest", async () => {
    const agent = makeAgent("hang");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);

    const runs = ["q-1", "q-2", "q-3", "q-4"].map((session) => startRun(session));
    await vi.advanceTimersByTimeAsync(10);

    expect(agent.raw.start).toHaveBeenCalledTimes(3);
    const queued = runs[3];
    expect(queued.events).toContainEqual({ type: "agent_step", text: "Waiting for a free agent…" });
    expect(types(queued.events)).not.toContain("agent_started");

    agent.finishTask(agent.taskIds()[0]);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(agent.raw.start).toHaveBeenCalledTimes(4);
    expect(types(queued.events)).toContain("agent_started");
    expect(types(runs[0].events).at(-1)).toBe("done");

    for (const taskId of agent.taskIds()) agent.finishTask(taskId);
    await vi.advanceTimersByTimeAsync(5_000);
    for (const run of runs) expect(types(run.events).at(-1)).toBe("done");
  });
});

describe("runSearch: replay", () => {
  it("replays the whole log to a late subscriber", async () => {
    const agent = makeAgent("finish");
    vi.mocked(getBrowserUseClient).mockReturnValue(agent.client);
    const { id, events } = startRun("s-replay");
    await vi.advanceTimersByTimeAsync(10_000);

    const late = subscribe(id, () => {
      throw new Error("a finished run should not send live events");
    });
    expect(late?.replay).toEqual(events);
  });

  it("returns null for an unknown search id", () => {
    expect(subscribe("00000000-0000-4000-8000-000000000000", () => undefined)).toBeNull();
  });
});
