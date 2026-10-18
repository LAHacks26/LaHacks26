import { z } from "zod";

// Contract for the search pipeline (PRD §5.2, §9, §10). Shared by /api/search, the SSE stream and
// the /search/[searchId] page. Every non-2xx JSON response is `{ error: string }`.

/** Constraint labels, exactly as ConstraintChips shows them. */
export const SEARCH_CONSTRAINTS = [
  "Vegan",
  "Vegetarian",
  "Gluten-free",
  "Dairy-free",
  "No oven",
  "No blender",
] as const;

/** POST /api/search → 200 `{ searchId }`. Links are imported by the client via /api/import instead. */
export const SearchRequestSchema = z.object({
  text: z.string().trim().min(1).max(200),
  /** Labels from SEARCH_CONSTRAINTS; unknown labels are ignored. */
  constraints: z.array(z.string().max(40)).max(12).default([]),
  /** When the user wants to eat, ISO 8601 with offset. Omitted when no ready-by is set. */
  readyBy: z.iso.datetime({ offset: true }).optional(),
  allergies: z.array(z.string().max(60)).max(30).default([]),
});
export type SearchRequest = z.input<typeof SearchRequestSchema>;

export const SearchStartResponseSchema = z.object({ searchId: z.string() });
export type SearchStartResponse = z.infer<typeof SearchStartResponseSchema>;

/** One result card. `sourceRecipeId` is set once the recipe is normalized and cached. */
export const CandidateCardDataSchema = z.object({
  url: z.string(),
  title: z.string(),
  site: z.string(),
  imageUrl: z.string().optional(),
  /** Unknown until JSON-LD or normalization provides it. */
  totalMin: z.number().optional(),
  /** 1–5, known after normalization. */
  difficulty: z.number().optional(),
  allergens: z.array(z.string()),
  /** False when totalMin exceeds the ready-by budget. Such cards are dropped, so normally true. */
  fitsReadyBy: z.boolean(),
  sourceRecipeId: z.string().optional(),
});
export type CandidateCardData = z.infer<typeof CandidateCardDataSchema>;

/** A cached pgvector match ("Already in Saffron's kitchen"). */
export const CachedItemDataSchema = z.object({
  sourceRecipeId: z.string(),
  title: z.string(),
  site: z.string(),
  totalMin: z.number(),
  imageUrl: z.string().optional(),
  allergens: z.array(z.string()),
});
export type CachedItemData = z.infer<typeof CachedItemDataSchema>;

/**
 * GET /api/search/[searchId]/stream is Server-Sent Events. Each message is `event: <type>` plus
 * `data: <JSON of the matching payload>`. On connect the server replays every event so far, so a
 * late subscriber sees the whole run. The stream ends after `done` or `error`.
 */
export const SearchEventSchema = z.discriminatedUnion("type", [
  /** First event: what is being searched, for the summary header. */
  z.object({
    type: z.literal("meta"),
    query: z.string(),
    constraints: z.array(z.string()),
    readyBy: z.string().optional(),
    maxTotalMin: z.number().optional(),
  }),
  z.object({ type: z.literal("cached"), items: z.array(CachedItemDataSchema) }),
  /** `liveUrl` is null for the mock agent (the page shows a placeholder instead of the iframe). */
  z.object({ type: z.literal("agent_started"), liveUrl: z.string().nullable() }),
  z.object({ type: z.literal("agent_step"), text: z.string() }),
  /** Basic card from JSON-LD, before normalization. Keyed by `url`. */
  z.object({ type: z.literal("candidate"), card: CandidateCardDataSchema }),
  /** Full card after normalization; replaces the `candidate` with the same `url`. */
  z.object({ type: z.literal("candidate_ready"), sourceRecipeId: z.string(), card: CandidateCardDataSchema }),
  /** A candidate that failed extraction or exceeded the ready-by budget; the page removes it. */
  z.object({ type: z.literal("candidate_dropped"), url: z.string(), reason: z.string() }),
  z.object({ type: z.literal("done") }),
  /**
   * `code`: "not_food" (friendly decline), "agent_failed", "busy", "not_found" (unknown searchId), "failed".
   * `message` is user-facing.
   */
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type SearchEvent = z.infer<typeof SearchEventSchema>;
export type SearchEventType = SearchEvent["type"];
