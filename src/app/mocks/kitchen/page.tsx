import Link from "next/link";
import { ChefHat } from "lucide-react";
import { AllergyManager, SavedRecipeCard, SignInPrompt } from "@/components/kitchen";
import { Chip } from "@/components/saffron";
import { Button } from "@/components/ui/button";
import { kitchenMock } from "@/lib/mocks/kitchen";

type KitchenMockPageProps = {
  searchParams: Promise<{ state?: string }>;
};

const PREVIEW_STATES = [
  { key: "signedin", label: "Signed in", href: "/mocks/kitchen" },
  { key: "empty", label: "Empty", href: "/mocks/kitchen?state=empty" },
  { key: "allergies", label: "Allergies open", href: "/mocks/kitchen?state=allergies" },
  { key: "signedout", label: "Signed out", href: "/mocks/kitchen?state=signedout" },
] as const;

export default async function KitchenMockPage({ searchParams }: KitchenMockPageProps) {
  const { state } = await searchParams;
  const view =
    state === "empty" || state === "allergies" || state === "signedout" ? state : "signedin";
  const signedIn = view !== "signedout";

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <nav aria-label="Preview states" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Preview
          </span>
          {PREVIEW_STATES.map((preview) => (
            <Link
              key={preview.key}
              href={preview.href}
              aria-current={preview.key === view ? "true" : undefined}
              className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Chip variant={preview.key === view ? "selected" : "default"} size="sm">
                {preview.label}
              </Chip>
            </Link>
          ))}
        </nav>

        <header className="flex flex-col gap-3">
          {signedIn ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-saffron-soft font-semibold text-saffron-ink"
              >
                {kitchenMock.userName.charAt(0)}
              </span>
              Signed in as {kitchenMock.userName}
            </div>
          ) : null}
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            My Kitchen
          </h1>
        </header>

        <AllergyManager
          key={view}
          initialAllergies={kitchenMock.allergies}
          initialOpen={view === "allergies"}
        />

        {view === "signedout" ? (
          <SignInPrompt />
        ) : view === "empty" ? (
          <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <ChefHat aria-hidden="true" strokeWidth={1.5} className="size-10 text-saffron-ink" />
            <h2 className="font-display text-2xl font-semibold text-ink">Nothing saved yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Recipes you save or adapt will show up here.
            </p>
            <Button render={<Link href="/mocks/landing" />} size="lg" className="mt-2 h-11">
              Find something to cook
            </Button>
          </section>
        ) : (
          <section aria-label="Saved recipes" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {kitchenMock.recipes.map((recipe) => (
              <SavedRecipeCard
                key={recipe.id}
                title={recipe.title}
                adaptedNote={recipe.adaptedNote}
                updatedLabel={recipe.updatedLabel}
                shared={recipe.shared}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
