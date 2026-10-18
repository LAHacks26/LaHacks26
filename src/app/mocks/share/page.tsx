import { RecipeView } from "@/components/recipe";
import { MOCK_ALLERGIES } from "@/lib/mocks/recipe";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";

export default function ShareMockPage() {
  return (
    <div className="min-h-dvh bg-background">
      <RecipeView recipe={butterChicken} allergies={MOCK_ALLERGIES} readOnly />
    </div>
  );
}
