import Link from "next/link";
import { Chip } from "@/components/saffron";
import { RecipeView } from "@/components/recipe";
import { isRecipeMockState, RECIPE_MOCK_STATES, recipeMockStates } from "@/lib/mocks/recipe";

export default async function RecipeMockPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;
  const current = isRecipeMockState(state) ? state : "default";
  const { props } = recipeMockStates[current];

  return (
    <div className="min-h-dvh bg-background">
      <nav
        aria-label="Recipe mock states"
        className="border-b border-border bg-card px-4 py-3"
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <span className="mr-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Mock state
          </span>
          {RECIPE_MOCK_STATES.map((value) => {
            const selected = value === current;
            return (
              <Link
                key={value}
                href={`/mocks/recipe?state=${value}`}
                aria-current={selected ? "page" : undefined}
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Chip
                  variant={selected ? "selected" : "default"}
                  size="sm"
                  className="cursor-pointer hover:border-saffron"
                >
                  {recipeMockStates[value].label}
                </Chip>
              </Link>
            );
          })}
        </div>
      </nav>

      <RecipeView key={current} {...props} />
    </div>
  );
}
