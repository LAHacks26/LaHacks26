// Pure state for one search run, reduced from the SSE stream (PRD §5.2, §10). No React here, so
// the rules can be unit tested. SearchRun.tsx owns the subscription and renders from this state.

import type {
  CachedItemData,
  CandidateCardData,
  SearchEvent,
} from "@/lib/search/types";

export type SearchMeta = Extract<SearchEvent, { type: "meta" }>;

export type RunPhase = "running" | "done" | "error";

export type RunError = {
  /** The server's error code, or "connection" when the stream dropped. */
  code: string;
  /** User-facing text. */
  message: string;
};

export type SearchRunState = {
  meta: SearchMeta | null;
  /** null until the `cached` event arrives. */
  cached: CachedItemData[] | null;
  /** False until `agent_started`. */
  agentStarted: boolean;
  liveUrl: string | null;
  steps: string[];
  /** True once the agent has finished: the first candidate arrives, or the run ends. The live view leaves. */
  agentDone: boolean;
  /** Candidate cards keyed by url. */
  cards: Record<string, CandidateCardData>;
  /** Card urls in arrival order. */
  order: string[];
  /** Urls removed by `candidate_dropped`. Late events for them are ignored. */
  dropped: string[];
  phase: RunPhase;
  error: RunError | null;
};

/** What the reducer accepts: every SSE event, plus the client-side "connection lost" signal. */
export type SearchRunAction = SearchEvent | { type: "connection_lost" };

export const initialSearchRunState: SearchRunState = {
  meta: null,
  cached: null,
  agentStarted: false,
  liveUrl: null,
  steps: [],
  agentDone: false,
  cards: {},
  order: [],
  dropped: [],
  phase: "running",
  error: null,
};

export function reduceSearchEvent(
  state: SearchRunState,
  action: SearchRunAction,
): SearchRunState {
  switch (action.type) {
    case "meta":
      return { ...state, meta: action };

    case "cached":
      return { ...state, cached: action.items };

    case "agent_started":
      return { ...state, agentStarted: true, liveUrl: action.liveUrl };

    case "agent_step":
      return { ...state, steps: [...state.steps, action.text] };

    case "candidate": {
      const url = action.card.url;
      if (state.dropped.includes(url)) {
        return state;
      }
      // A basic card never replaces a card that is already ready.
      const existing = state.cards[url];
      if (existing?.sourceRecipeId) {
        return state;
      }
      return {
        ...state,
        agentDone: true,
        cards: { ...state.cards, [url]: action.card },
        order: existing ? state.order : [...state.order, url],
      };
    }

    case "candidate_ready": {
      const url = action.card.url;
      if (state.dropped.includes(url)) {
        return state;
      }
      const card: CandidateCardData = {
        ...action.card,
        sourceRecipeId: action.sourceRecipeId,
      };
      const known = url in state.cards;
      return {
        ...state,
        agentDone: true,
        cards: { ...state.cards, [url]: card },
        order: known ? state.order : [...state.order, url],
      };
    }

    case "candidate_dropped": {
      const cards = { ...state.cards };
      delete cards[action.url];
      return {
        ...state,
        cards,
        order: state.order.filter((url) => url !== action.url),
        dropped: state.dropped.includes(action.url)
          ? state.dropped
          : [...state.dropped, action.url],
      };
    }

    case "done":
      if (state.phase !== "running") {
        return state;
      }
      return { ...state, phase: "done", agentDone: true };

    case "error":
      if (state.phase !== "running") {
        return state;
      }
      return {
        ...state,
        phase: "error",
        agentDone: true,
        error: { code: action.code, message: action.message },
      };

    case "connection_lost":
      if (state.phase !== "running") {
        return state;
      }
      return {
        ...state,
        phase: "error",
        agentDone: true,
        error: {
          code: "connection",
          message: "Lost the connection to the search.",
        },
      };
  }
}

/** Allergen labels compare case-insensitively, ignoring surrounding spaces. */
export function normalizeAllergen(value: string): string {
  return value.toLowerCase().trim();
}

/** The recipe's allergens that match one of the user's allergies, as the recipe spells them. */
export function allergenMatches(allergens: string[], userAllergies: string[]): string[] {
  const mine = new Set(userAllergies.map(normalizeAllergen));
  return allergens.filter((allergen) => mine.has(normalizeAllergen(allergen)));
}

/** Candidate cards in display order: the arrival order, with allergen matches moved last (PRD §5.9). */
export function rankCandidates(
  state: Pick<SearchRunState, "cards" | "order">,
  userAllergies: string[],
): CandidateCardData[] {
  const cards = state.order
    .map((url) => state.cards[url])
    .filter((card): card is CandidateCardData => card !== undefined);
  const hasMatch = (card: CandidateCardData) =>
    allergenMatches(card.allergens, userAllergies).length > 0;
  // Array.prototype.sort is stable, so cards keep their arrival order within each group.
  return [...cards].sort((a, b) => Number(hasMatch(a)) - Number(hasMatch(b)));
}

/** The "HH:MM" wall-clock time in an ISO string, as the summary shows it. "" when missing or unparseable. */
export function readyByClock(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[1]}:${match[2]}` : "";
}
