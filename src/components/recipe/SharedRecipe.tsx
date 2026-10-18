"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseAllergies, readAllergiesRaw, subscribeAllergies } from "@/lib/allergies";
import type { Recipe } from "@/lib/recipe/schema";
import { RecipeView } from "./RecipeView";

export function SharedRecipe({ recipe, slug }: { recipe: Recipe; slug: string }) {
  const router = useRouter();
  const raw = useSyncExternalStore(subscribeAllergies, readAllergiesRaw, () => null);
  const allergies = useMemo(() => parseAllergies(raw), [raw]);
  const [servings, setServings] = useState(recipe.servings);
  const [unit, setUnit] = useState<"us" | "metric">("us");
  return <RecipeView recipe={recipe} readOnly allergies={allergies} servings={servings} unit={unit}
    onServingsChange={setServings} onUnitChange={setUnit}
    headerActions={<Button size="lg" onClick={() => router.push(`/fork/${encodeURIComponent(slug)}?draft=${crypto.randomUUID()}`)}>Make it mine</Button>} />;
}
