import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RecipeEditor } from "@/components/recipe";
import { AppHeader } from "@/components/shell/AppHeader";
import { getSourceRecipe } from "@/lib/db/sourceRecipes";
import { type Recipe, RecipeSchema } from "@/lib/recipe/schema";
import { parseReadyBy } from "@/lib/recipe/readyBy";

// The cached row can change when a pasted link is re-imported, so never prerender it.
export const dynamic = "force-dynamic";

type RecipePageProps = {
  params: Promise<{ sourceId: string }>;
  searchParams: Promise<{ readyBy?: string | string[] }>;
};

// Shared by generateMetadata and the page, so one request reads the row once.
// Returns null for unknown IDs and for rows that fail the frozen recipe contract.
const loadRecipe = cache(async (sourceId: string): Promise<Recipe | null> => {
  const row = await getSourceRecipe(sourceId);
  if (!row) return null;

  const parsed = RecipeSchema.safeParse(row.recipe);
  if (!parsed.success) {
    console.error(`Stored recipe ${sourceId} failed schema validation`, parsed.error);
    return null;
  }
  return parsed.data;
});

export async function generateMetadata({ params }: RecipePageProps): Promise<Metadata> {
  const { sourceId } = await params;
  const recipe = await loadRecipe(sourceId);
  return {
    title: recipe ? `${recipe.title} · Saffron` : "Recipe · Saffron",
  };
}

export default async function RecipePage({ params, searchParams }: RecipePageProps) {
  const { sourceId } = await params;
  const readyBy = parseReadyBy((await searchParams).readyBy);
  const recipe = await loadRecipe(sourceId);
  if (!recipe) {
    notFound();
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AppHeader />
      <main className="flex-1">
        <RecipeEditor sourceRecipeId={sourceId} recipe={recipe} readyBy={readyBy} />
      </main>
    </div>
  );
}
