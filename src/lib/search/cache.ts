import "server-only";
import { and, asc, cosineDistance, isNotNull, lte, type SQL } from "drizzle-orm";
import { embed } from "../ai/gemini";
import { getDb } from "../db/client";
import { sourceRecipes } from "../db/schema";
import type { CachedItemData } from "./types";
import { constraintViolations } from "./constraints";

// "Already in Saffron's kitchen" (PRD §10 step 2): embed the dish, then take the closest cached
// recipes by cosine similarity.

/**
 * Minimum cosine similarity for a cached recipe to count as a match. Tuned live on 2026-10-18
 * against the 5 seeded recipes (gemini-embedding-001, 768 dims). Started at 0.75, which missed
 * "butter chicken" (0.7215). Correct matches scored 0.65 to 0.76, and the best wrong match was
 * "chicken tikka masala" to butter chicken at 0.67. "chocolate cake" peaked at 0.48, so 0.64
 * keeps every correct match and rejects it.
 */
export const SIMILARITY_THRESHOLD = 0.64;
/** At most this many cached matches are shown. */
export const CACHE_MATCH_LIMIT = 3;

export type ScoredCachedItem = { item: CachedItemData; similarity: number };

/** Cached matches with their cosine similarity, best first. Used by findCached and by the tuning check. */
export async function findCachedScored(
  dishQuery: string,
  constraints: string[],
  maxTotalMin?: number,
  threshold: number = SIMILARITY_THRESHOLD,
): Promise<ScoredCachedItem[]> {
  const embedding = await embed(dishQuery);
  const distance = cosineDistance(sourceRecipes.embedding, embedding);

  const conditions: SQL[] = [isNotNull(sourceRecipes.embedding), lte(distance, 1 - threshold)];
  if (maxTotalMin !== undefined) conditions.push(lte(sourceRecipes.totalMin, maxTotalMin));

  const rows = await getDb()
    .select({
      id: sourceRecipes.id,
      title: sourceRecipes.title,
      site: sourceRecipes.site,
      totalMin: sourceRecipes.totalMin,
      imageUrl: sourceRecipes.imageUrl,
      allergens: sourceRecipes.allergens,
      distance,
      recipe: sourceRecipes.recipe,
    })
    .from(sourceRecipes)
    .where(and(...conditions))
    .orderBy(asc(distance))
    // Examine a bounded pool before choosing three so excluded top matches do not hide all alternatives.
    .limit(constraints.length > 0 ? 30 : CACHE_MATCH_LIMIT);

  return rows.filter((row) => constraintViolations(row.recipe, constraints).length === 0)
    .slice(0, CACHE_MATCH_LIMIT).map((row) => ({
    similarity: 1 - Number(row.distance),
    item: {
      sourceRecipeId: row.id,
      title: row.title,
      site: row.site,
      totalMin: row.totalMin,
      imageUrl: row.imageUrl ?? undefined,
      allergens: row.allergens,
    },
  }));
}

/** Cached recipes that match the dish, within the time budget and the allergen chips. */
export async function findCached(
  dishQuery: string,
  constraints: string[],
  maxTotalMin?: number,
): Promise<CachedItemData[]> {
  const scored = await findCachedScored(dishQuery, constraints, maxTotalMin);
  return scored.map((entry) => entry.item);
}
