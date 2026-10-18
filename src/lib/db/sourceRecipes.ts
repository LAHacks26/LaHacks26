import "server-only";
import { eq } from "drizzle-orm";
import type { Recipe } from "../recipe/schema";
import { getDb } from "./client";
import { type SourceRecipe, sourceRecipes } from "./schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns null for unknown or malformed IDs (Postgres throws on a malformed uuid). */
export async function getSourceRecipe(id: string): Promise<SourceRecipe | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await getDb().select().from(sourceRecipes).where(eq(sourceRecipes.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getSourceRecipeByUrl(url: string): Promise<SourceRecipe | null> {
  const rows = await getDb().select().from(sourceRecipes).where(eq(sourceRecipes.url, url)).limit(1);
  return rows[0] ?? null;
}

/** Inserts or refreshes the cached recipe for `recipe.source.url`. Returns the row ID. */
export async function upsertSourceRecipe(recipe: Recipe, embedding: number[] | null): Promise<string> {
  const allergens = [...new Set(recipe.ingredients.flatMap((i) => i.allergens))];
  const values = {
    url: recipe.source.url,
    site: recipe.source.siteName,
    title: recipe.title,
    imageUrl: recipe.source.imageUrl ?? null,
    totalMin: Math.round(recipe.times.totalMin),
    allergens,
    recipe,
    embedding,
  };
  const [row] = await getDb()
    .insert(sourceRecipes)
    .values(values)
    .onConflictDoUpdate({ target: sourceRecipes.url, set: values })
    .returning({ id: sourceRecipes.id });
  return row.id;
}
