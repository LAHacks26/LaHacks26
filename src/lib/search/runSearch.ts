import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { AiError } from "../ai/gemini";
import { getSourceRecipe } from "../db/sourceRecipes";
import { importRecipe } from "../ingest/importRecipe";
import { IngestError } from "../ingest/fetchPage";
import {
  AGENT_MAX_STEPS,
  type AgentCandidate,
  type BrowserUseClient,
  buildAgentPrompt,
  getBrowserUseClient,
} from "./browserUse";
import { findCached } from "./cache";
import { constraintViolations } from "./constraints";
import { maxTotalMinutes, mergeConstraints, type ParsedQuery, parseQuery } from "./parseQuery";
import { isTerminalEvent } from "./sse";
import { logSearchStart, logSearchUpdate } from "./searchLog";
import {
  type CachedItemData,
  type CandidateCardData,
  type SearchEvent,
  type SearchRequestSchema,
} from "./types";

// The search run registry and pipeline (PRD §10). A run lives in memory: an event log that late
// subscribers replay, plus live listeners. The registry sits on globalThis so dev hot reloads and
// route bundles share it.

export type SearchRequest = z.output<typeof SearchRequestSchema>;
export type SearchListener = (event: SearchEvent) => void;
export type SearchSubscription = { replay: SearchEvent[]; unsubscribe(): void };

/** Candidates imported per search (PRD §10 step 3). */
const MAX_CANDIDATES = 3;
/** How often the agent is polled (PRD §10 step 3). */
const POLL_INTERVAL_MS = 1_500;
/** The agent is cancelled and the run fails after this long (PRD §10 step 3). */
const AGENT_TIMEOUT_MS = 150_000;
/** Global cap on agents running at once. Extra runs wait in a queue (PRD §10 step 6). */
const MAX_CONCURRENT_AGENTS = 3;
/** Finished runs stay readable this long, then they are deleted from memory. */
const FINISHED_RUN_TTL_MS = 10 * 60_000;

const REPLACED_MESSAGE = "Replaced by a new search";
const AGENT_FAILED_MESSAGE = "The agent hit a snag. Cached results are still here, or try the search again.";
const NO_CANDIDATES_MESSAGE = "The agent didn't find any recipe pages. Try different words.";
const NOT_FOOD_MESSAGE = "That doesn't look like something to cook. Try a dish, like butter chicken.";

type ActiveAgent = { client: BrowserUseClient; taskId: string };

type Run = {
  id: string;
  sessionKey: string;
  request: SearchRequest;
  events: SearchEvent[];
  listeners: Set<SearchListener>;
  ended: boolean;
  /** Set while this run holds one of the MAX_CONCURRENT_AGENTS slots. */
  holdsSlot: boolean;
  agent: ActiveAgent | null;
  /** Resolves to the `searches` row id, or null when the insert failed. */
  logId: Promise<string | null>;
};

type Waiter = { run: Run; resolve: (granted: boolean) => void };

type Registry = {
  runs: Map<string, Run>;
  /** The one run each session may have open. */
  activeBySession: Map<string, string>;
  agentsInUse: number;
  waiting: Waiter[];
};

const globalForSearch = globalThis as unknown as { __saffronSearchRegistry?: Registry };
const registry: Registry = (globalForSearch.__saffronSearchRegistry ??= {
  runs: new Map(),
  activeBySession: new Map(),
  agentsInUse: 0,
  waiting: [],
});

/** Starts a run and returns its id. A new search from the same session cancels that session's old run. */
export function startSearch(request: SearchRequest, opts: { sessionKey: string; ip?: string }): string {
  const previousId = registry.activeBySession.get(opts.sessionKey);
  const previous = previousId ? registry.runs.get(previousId) : undefined;
  if (previous && !previous.ended) {
    cancelRun(previous, { type: "error", code: "failed", message: REPLACED_MESSAGE });
  }

  const run: Run = {
    id: randomUUID(),
    sessionKey: opts.sessionKey,
    request,
    events: [],
    listeners: new Set(),
    ended: false,
    holdsSlot: false,
    agent: null,
    logId: logSearchStart(request.text),
  };
  registry.runs.set(run.id, run);
  registry.activeBySession.set(opts.sessionKey, run.id);

  executeRun(run).catch((err: unknown) => {
    console.error("[search] run failed unexpectedly", err instanceof Error ? err.name : "unknown");
    endRun(run, { type: "error", code: "failed", message: "Something went wrong. Try the search again." }, "failed");
  });
  return run.id;
}

/**
 * Replays the run's events so far, then delivers new ones to `listener`. Returns null for an
 * unknown (or already deleted) run. The caller unsubscribes once a terminal event arrives.
 */
export function subscribe(searchId: string, listener: SearchListener): SearchSubscription | null {
  const run = registry.runs.get(searchId);
  if (!run) return null;

  const replay = [...run.events];
  if (!run.ended) run.listeners.add(listener);
  return {
    replay,
    unsubscribe: () => {
      run.listeners.delete(listener);
    },
  };
}

async function executeRun(run: Run): Promise<void> {
  const { request } = run;
  const chips = mergeConstraints(request.constraints, []);
  emit(run, {
    type: "meta",
    query: request.text,
    constraints: chips,
    readyBy: request.readyBy,
    maxTotalMin: maxTotalMinutes(request.readyBy, new Date()),
  });

  const parsed = await parseOrFallback(run, chips);
  if (run.ended) return;
  void logUpdate(run, { parsed });
  if (!parsed.isFood) {
    endRun(run, { type: "error", code: "not_food", message: NOT_FOOD_MESSAGE }, "not_food");
    return;
  }

  emit(run, { type: "cached", items: await cacheLookup(parsed) });
  if (run.ended) return;

  const granted = await acquireAgentSlot(run);
  if (!granted || run.ended) return;

  const client = getBrowserUseClient();
  let taskId: string;
  try {
    const started = await client.start(buildAgentPrompt(parsed.dishQuery, parsed.constraints, parsed.maxTotalMin), {
      dishQuery: parsed.dishQuery,
      constraints: parsed.constraints,
      maxTotalMin: parsed.maxTotalMin,
      maxSteps: AGENT_MAX_STEPS,
    });
    taskId = started.taskId;
    if (run.ended) {
      void client.cancel(taskId).catch(() => undefined);
      return;
    }
    run.agent = { client, taskId };
    emit(run, { type: "agent_started", liveUrl: started.liveUrl });
  } catch (err) {
    console.error("[search] agent failed to start", errorName(err));
    releaseAgentSlot(run);
    endRun(run, { type: "error", code: "agent_failed", message: AGENT_FAILED_MESSAGE }, "agent_failed");
    return;
  }

  let found: AgentCandidate[] | null;
  try {
    found = await awaitAgent(run, client, taskId);
  } catch (err) {
    releaseAgentSlot(run);
    if (run.ended) return;
    console.error("[search] agent failed", errorName(err));
    void client.cancel(taskId).catch(() => undefined);
    endRun(run, { type: "error", code: "agent_failed", message: AGENT_FAILED_MESSAGE }, "agent_failed");
    return;
  }
  releaseAgentSlot(run);
  if (found === null || run.ended) return;

  const candidates = uniqueCandidates(found).slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) {
    endRun(run, { type: "error", code: "agent_failed", message: NO_CANDIDATES_MESSAGE }, "agent_failed");
    return;
  }

  await Promise.all(candidates.map((candidate) => processCandidate(run, candidate, parsed.maxTotalMin, parsed.constraints)));
  endRun(run, { type: "done" }, "done");
}

/** Parses the query. parseQuery already falls back to the raw text; this guards anything unexpected. */
async function parseOrFallback(run: Run, chips: string[]): Promise<ParsedQuery> {
  try {
    return await parseQuery(run.request.text, run.request.constraints, run.request.readyBy, new Date());
  } catch (err) {
    console.error("[search] parse failed", errorName(err));
    return { dishQuery: run.request.text, constraints: chips, isFood: true };
  }
}

async function cacheLookup(parsed: ParsedQuery): Promise<CachedItemData[]> {
  try {
    return await findCached(parsed.dishQuery, parsed.constraints, parsed.maxTotalMin);
  } catch (err) {
    console.error("[search] cache lookup failed", errorName(err));
    return [];
  }
}

/** Polls until the agent finishes, fails or times out. Returns null when the run ended meanwhile. */
async function awaitAgent(run: Run, client: BrowserUseClient, taskId: string): Promise<AgentCandidate[] | null> {
  const deadline = Date.now() + AGENT_TIMEOUT_MS;
  let shown = 0;
  for (;;) {
    if (run.ended) return null;
    const snapshot = await client.poll(taskId);
    if (run.ended) return null;

    for (const text of snapshot.steps.slice(shown)) emit(run, { type: "agent_step", text });
    shown = Math.max(shown, snapshot.steps.length);

    if (snapshot.status === "finished") return snapshot.candidates ?? [];
    if (snapshot.status === "failed") throw new Error("agent reported failure");
    if (Date.now() >= deadline) throw new Error("agent timed out");
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Imports one candidate. Emits a basic card from JSON-LD, then the full card or a drop reason. */
async function processCandidate(run: Run, candidate: AgentCandidate, maxTotalMin: number | undefined, constraints: string[]): Promise<void> {
  try {
    const result = await importRecipe(candidate.url, {
      onParsed: (info) => {
        emit(run, {
          type: "candidate",
          card: {
            url: candidate.url,
            title: info.title ?? candidate.title,
            site: info.siteName || hostOf(candidate.url),
            imageUrl: info.imageUrl,
            totalMin: info.totalMin,
            allergens: [],
            fitsReadyBy: fits(info.totalMin, maxTotalMin),
          },
        });
        // Too long by the page's own JSON-LD: stop before any Gemini call.
        if (maxTotalMin !== undefined && info.totalMin !== undefined && info.totalMin > maxTotalMin) {
          throw new TooLongError();
        }
      },
    });
    if (run.ended) return;

    const row = await getSourceRecipe(result.sourceRecipeId);
    if (run.ended) return;
    if (!row) {
      emit(run, { type: "candidate_dropped", url: candidate.url, reason: "Couldn't save that recipe." });
      return;
    }
    if (maxTotalMin !== undefined && row.totalMin > maxTotalMin) {
      emit(run, { type: "candidate_dropped", url: candidate.url, reason: "too long" });
      return;
    }
    const violations = constraintViolations(row.recipe, constraints);
    if (violations.length > 0) {
      emit(run, { type: "candidate_dropped", url: candidate.url, reason: `Doesn't meet: ${violations.join(", ")}` });
      return;
    }

    const card: CandidateCardData = {
      url: candidate.url,
      title: row.title,
      site: row.site,
      imageUrl: row.imageUrl ?? undefined,
      totalMin: row.totalMin,
      difficulty: row.recipe.difficulty.score,
      allergens: row.allergens,
      fitsReadyBy: fits(row.totalMin, maxTotalMin),
      sourceRecipeId: row.id,
    };
    emit(run, { type: "candidate_ready", sourceRecipeId: row.id, card });
  } catch (err) {
    if (run.ended) return;
    const reason = err instanceof TooLongError ? "too long" : shortReason(err);
    emit(run, { type: "candidate_dropped", url: candidate.url, reason });
  }
}

class TooLongError extends Error {
  constructor() {
    super("too long");
    this.name = "TooLongError";
  }
}

function fits(totalMin: number | undefined, maxTotalMin: number | undefined): boolean {
  return totalMin === undefined || maxTotalMin === undefined || totalMin <= maxTotalMin;
}

/** A short, user-safe reason. Ingest and AI errors carry messages written for users. */
function shortReason(err: unknown): string {
  if (err instanceof IngestError || err instanceof AiError) return err.message;
  return "Couldn't read that recipe.";
}

function uniqueCandidates(candidates: AgentCandidate[]): AgentCandidate[] {
  const seen = new Set<string>();
  const out: AgentCandidate[] = [];
  for (const candidate of candidates) {
    if (!/^https?:\/\//i.test(candidate.url) || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    out.push(candidate);
  }
  return out;
}

/** Waits for one of the agent slots. The queue emits "Waiting for a free agent…" once. Resolves false if the run is cancelled while waiting. */
function acquireAgentSlot(run: Run): Promise<boolean> {
  if (registry.agentsInUse < MAX_CONCURRENT_AGENTS) {
    registry.agentsInUse++;
    run.holdsSlot = true;
    return Promise.resolve(true);
  }
  emit(run, { type: "agent_step", text: "Waiting for a free agent…" });
  return new Promise<boolean>((resolve) => {
    registry.waiting.push({ run, resolve });
  });
}

/** Gives the slot to the next waiting run, or frees it. Safe to call more than once. */
function releaseAgentSlot(run: Run): void {
  if (!run.holdsSlot) return;
  run.holdsSlot = false;
  const next = registry.waiting.shift();
  if (next) {
    next.run.holdsSlot = true;
    next.resolve(true);
  } else {
    registry.agentsInUse--;
  }
}

function cancelRun(run: Run, terminal: SearchEvent): void {
  if (run.ended) return;
  const index = registry.waiting.findIndex((waiter) => waiter.run === run);
  if (index >= 0) {
    const [waiter] = registry.waiting.splice(index, 1);
    waiter.resolve(false);
  }
  if (run.agent) {
    const { client, taskId } = run.agent;
    void Promise.resolve()
      .then(() => client.cancel(taskId))
      .catch(() => undefined);
  }
  endRun(run, terminal, "failed");
}

/** Sends a non-terminal event to listeners and the log. Ignored once the run has ended. */
function emit(run: Run, event: SearchEvent): void {
  if (run.ended) return;
  run.events.push(event);
  broadcast(run, event);
}

/** Records the terminal event, releases the agent slot, updates the log and schedules deletion. */
function endRun(run: Run, terminal: SearchEvent, status: string): void {
  if (run.ended) return;
  run.events.push(terminal);
  run.ended = true;
  broadcast(run, terminal);
  releaseAgentSlot(run);
  if (registry.activeBySession.get(run.sessionKey) === run.id) registry.activeBySession.delete(run.sessionKey);

  const error = terminal.type === "error" ? terminal.message : undefined;
  void logUpdate(run, { status, error, browserUseTaskId: run.agent?.taskId });

  const timer = setTimeout(() => {
    registry.runs.delete(run.id);
  }, FINISHED_RUN_TTL_MS);
  timer.unref?.();
}

function broadcast(run: Run, event: SearchEvent): void {
  for (const listener of run.listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[search] listener failed", errorName(err));
    }
  }
  if (isTerminalEvent(event)) run.listeners.clear();
}

/** Best-effort log update. Waits for the insert first, and skips the update if the insert failed. */
async function logUpdate(run: Run, update: Parameters<typeof logSearchUpdate>[1]): Promise<void> {
  const id = await run.logId;
  if (id) await logSearchUpdate(id, update);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}
