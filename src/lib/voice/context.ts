import type { Recipe } from "@/lib/recipe/schema";
import { formatIngredientQty, type UnitSystem } from "@/lib/recipe/units";
import type { CookStoreState } from "@/lib/store/cookStore";
import type { VoiceContext } from "./types";

// Builds what the voice brain knows (PRD §11.1) from the recipe and the cook store. Every field is
// clamped to VoiceContextSchema's limits, so a long recipe never makes /api/voice/turn reject the turn.

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function buildVoiceContext(
  recipe: Recipe,
  cook: Pick<CookStoreState, "currentStepId" | "doneStepIds" | "timers">,
  allergies: readonly string[],
  unit: UnitSystem = "us",
  now = Date.now(),
): VoiceContext {
  const steps = recipe.steps.slice(0, 60);
  const numberOf = (id: string | null | undefined) => {
    const index = id ? steps.findIndex((step) => step.id === id) : -1;
    return index === -1 ? null : index + 1;
  };
  return {
    title: clip(recipe.title, 200),
    steps: steps.map((step, index) => ({
      n: index + 1,
      text: clip(step.text, 1000),
      ...(step.timer ? { timerMin: step.timer.max } : {}),
    })),
    ingredients: recipe.ingredients
      .slice(0, 80)
      .map((ingredient) => clip([formatIngredientQty(ingredient, unit), ingredient.item].filter(Boolean).join(" "), 200)),
    currentStep: numberOf(cook.currentStepId),
    doneSteps: cook.doneStepIds.map(numberOf).filter((n): n is number => n !== null),
    timers: cook.timers
      .filter((timer) => !timer.firedAt)
      .slice(0, 10)
      .map((timer) => ({ label: clip(timer.label, 60), remainingSec: Math.max(0, Math.round((timer.endsAt - now) / 1000)) })),
    allergies: allergies.slice(0, 30).map((allergy) => clip(allergy, 60)),
  };
}
