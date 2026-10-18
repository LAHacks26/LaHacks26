// Browser-side helpers for the search pipeline: start a run, subscribe to its SSE stream,
// import a pasted link and read the user's allergies. No server imports here.

import {
  SearchEventSchema,
  SearchRequestSchema,
  SearchStartResponseSchema,
  type SearchEvent,
  type SearchRequest,
} from "./types";

/** An error whose message is safe to show to the user. Anything else gets a fixed fallback. */
export class SearchClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchClientError";
  }
}

export const SEARCH_FALLBACK_ERROR = "Couldn't start the search. Try again.";
const IMPORT_FALLBACK_ERROR = "Couldn't import that page. Try another link.";
const IMPORT_TIMEOUT_ERROR = "That page took too long. Try another link.";
const IMPORT_TIMEOUT_MS = 60_000;
const ALLERGIES_KEY = "saffron:allergies";

/** How long a new EventSource (or a browser retry) may take to open before we give up. */
export const CONNECT_TIMEOUT_MS = 15_000;
/** How long a connected stream may go silent mid-run before we give up. */
export const STALL_TIMEOUT_MS = 90_000;

const SSE_EVENT_NAMES = [
  "meta",
  "cached",
  "agent_started",
  "agent_step",
  "candidate",
  "candidate_ready",
  "candidate_dropped",
  "done",
  "error",
] as const;

/** Reads the `error` field of a non-2xx JSON response, or returns the fallback. */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Not JSON. Use the fallback.
  }
  return fallback;
}

/** POST /api/search. Resolves to the new searchId, or throws a SearchClientError. */
export async function startSearch(req: SearchRequest, signal?: AbortSignal): Promise<string> {
  const checked = SearchRequestSchema.safeParse(req);
  if (!checked.success) {
    throw new SearchClientError(SEARCH_FALLBACK_ERROR);
  }
  const body = checked.data;
  let response: Response;
  try {
    response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new SearchClientError(SEARCH_FALLBACK_ERROR);
  }

  if (!response.ok) {
    throw new SearchClientError(await readErrorMessage(response, SEARCH_FALLBACK_ERROR));
  }

  try {
    const parsed = SearchStartResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      return parsed.data.searchId;
    }
  } catch {
    // Not JSON. Fall through to the fallback.
  }
  throw new SearchClientError(SEARCH_FALLBACK_ERROR);
}

/**
 * Subscribes to GET /api/search/[searchId]/stream. Invalid events are skipped. The stream replays
 * every event on each (re)connect, so duplicates from a reconnect are dropped before delivery.
 * Terminal events (`done`, `error`) are never dropped, even inside a replay window.
 *
 * Watchdogs: if the stream does not open within CONNECT_TIMEOUT_MS, or goes silent for
 * STALL_TIMEOUT_MS mid-run, the subscription gives up and calls onError. Closes itself after
 * `done` or `error`. Returns an unsubscribe function.
 */
export function subscribeSearch(
  searchId: string,
  onEvent: (event: SearchEvent) => void,
  onError?: () => void,
): () => void {
  const source = new EventSource(`/api/search/${encodeURIComponent(searchId)}/stream`);

  // Every message is counted, valid or not, so a replay after reconnect can be skipped exactly.
  let received = 0;
  let skip = 0;
  let finished = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  function clearWatchdog() {
    if (watchdog !== null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  }

  function armWatchdog(ms: number) {
    clearWatchdog();
    watchdog = setTimeout(() => {
      watchdog = null;
      if (finished) {
        return;
      }
      finish();
      onError?.();
    }, ms);
  }

  function finish() {
    finished = true;
    clearWatchdog();
    source.close();
  }

  function deliver(name: string, data: string) {
    received += 1;
    const terminal = name === "done" || name === "error";
    if (skip > 0) {
      skip -= 1;
      // A replayed terminal still goes through, so a finished run is never missed.
      if (!terminal) {
        return;
      }
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    // The payload carries `type`. If a server omits it, the SSE event name supplies it.
    const withType =
      raw && typeof raw === "object" && !("type" in raw) ? { type: name, ...raw } : raw;
    const parsed = SearchEventSchema.safeParse(withType);
    if (!parsed.success) {
      return;
    }
    onEvent(parsed.data);
    if (parsed.data.type === "done" || parsed.data.type === "error") {
      finish();
    }
  }

  // Until the stream opens, the connect watchdog runs.
  armWatchdog(CONNECT_TIMEOUT_MS);

  source.onopen = () => {
    // A (re)connect replays everything from the start, so skip what was already delivered.
    skip = received;
    armWatchdog(STALL_TIMEOUT_MS);
  };

  for (const name of SSE_EVENT_NAMES) {
    source.addEventListener(name, (event) => {
      // A connection failure is a plain Event with no data. onerror handles that case.
      if (typeof (event as MessageEvent).data !== "string") {
        return;
      }
      if (finished) {
        return;
      }
      // Any traffic means the stream is alive, so the stall watchdog restarts.
      armWatchdog(STALL_TIMEOUT_MS);
      deliver(name, (event as MessageEvent<string>).data);
    });
  }

  source.onerror = () => {
    if (finished) {
      return;
    }
    // CONNECTING means the browser is retrying on its own. CLOSED means it gave up.
    if (source.readyState === EventSource.CLOSED) {
      finish();
      onError?.();
      return;
    }
    // The browser will retry; give that retry the connect window, or fail.
    armWatchdog(CONNECT_TIMEOUT_MS);
  };

  return () => {
    finished = true;
    clearWatchdog();
    source.close();
  };
}

/** POST /api/import {url}. Resolves to the cached recipe id, or throws a SearchClientError. */
export async function importRecipeLink(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, IMPORT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new SearchClientError(await readErrorMessage(response, IMPORT_FALLBACK_ERROR));
    }
    try {
      const body = (await response.json()) as { sourceRecipeId?: unknown };
      if (typeof body.sourceRecipeId === "string" && body.sourceRecipeId) {
        return body.sourceRecipeId;
      }
    } catch {
      // Not JSON. Fall through to the fallback.
    }
    throw new SearchClientError(IMPORT_FALLBACK_ERROR);
  } catch (error) {
    if (error instanceof SearchClientError) {
      throw error;
    }
    if (timedOut) {
      throw new SearchClientError(IMPORT_TIMEOUT_ERROR);
    }
    if (signal?.aborted) {
      throw error;
    }
    throw new SearchClientError(IMPORT_FALLBACK_ERROR);
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** The allergy list from localStorage (`saffron:allergies`). Empty when nothing is stored or storage is blocked. */
export function readAllergies(): string[] {
  try {
    const raw = window.localStorage.getItem(ALLERGIES_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
