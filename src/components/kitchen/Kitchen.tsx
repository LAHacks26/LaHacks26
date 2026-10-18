"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChefHat, Laptop, LoaderCircle, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/button";
import { AllergySheet } from "./AllergySheet";
import { AllergySummaryCard } from "./AllergySummaryCard";
import { SavedRecipeCard } from "./SavedRecipeCard";
import { KitchenSession } from "./kitchenSession";

function updatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved recipe" : `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function Kitchen({ initialAllergiesOpen = false }: { initialAllergiesOpen?: boolean }) {
  const [session] = useState(() => new KitchenSession());
  const [open, setOpen] = useState(initialAllergiesOpen);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background">
      <AppHeader onAllergiesClick={() => setOpen(true)} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Laptop aria-hidden="true" className="size-4" />
            Saved for this browser
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">My Kitchen</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Your saves belong to this browser. Clearing its cookies loses access to them.
            Cross-device recovery and account linking are not available yet.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <AllergySummaryCard allergies={state.allergies} onEdit={() => setOpen(true)} />
          <div aria-live="polite" className="px-1 text-sm text-muted-foreground">
            {state.syncStatus === "syncing" ? (
              <p className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Syncing allergies…</p>
            ) : state.syncStatus === "error" ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
                <p className="text-tomato-ink">
                  Couldn&apos;t sync allergies. {state.localPersisted ? "Your changes are saved in this browser." : "Your changes are kept in this tab only."} {state.syncError}
                </p>
                <Button variant="outline" size="sm" onClick={() => session.retrySync()}>Retry sync</Button>
              </div>
            ) : state.syncStatus === "synced" ? (
              <p>Allergies are up to date.</p>
            ) : (
              <p>Allergy changes apply here immediately, even while offline.</p>
            )}
            {!state.localPersisted ? (
              <p className="mt-2 text-tomato-ink">
                Browser storage is unavailable. Keep this tab open until syncing finishes; local allergy settings won&apos;t survive a reload.
              </p>
            ) : null}
          </div>
        </div>

        <AllergySheet open={open} onOpenChange={setOpen} selected={state.allergies} onSave={(allergies) => session.saveAllergies(allergies)} />

        {state.loadStatus === "loading" ? (
          <section aria-label="Saved recipes" aria-busy="true" className="flex flex-col gap-4">
            <p role="status" className="text-sm text-muted-foreground">Loading your recipes…</p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((item) => <div key={item} className="h-72 rounded-2xl bg-card shadow-border motion-safe:animate-pulse" />)}
            </div>
          </section>
        ) : state.loadStatus === "error" ? (
          <section role="alert" className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-2xl font-semibold text-ink">Your kitchen couldn&apos;t load</h2>
            <p className="text-sm text-muted-foreground">{state.loadError}</p>
            <Button variant="outline" onClick={() => void session.load()}><RefreshCw aria-hidden="true" />Try again</Button>
          </section>
        ) : state.recipes?.length ? (
          <section aria-label="Saved recipes" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {state.recipes.map((recipe) => (
              <SavedRecipeCard
                key={recipe.id}
                title={recipe.title}
                imageUrl={recipe.imageUrl}
                totalMin={recipe.totalMin}
                updatedLabel={updatedLabel(recipe.updatedAt)}
                shared={Boolean(recipe.shareSlug)}
                href={`/my/${encodeURIComponent(recipe.id)}`}
              />
            ))}
          </section>
        ) : (
          <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <ChefHat aria-hidden="true" strokeWidth={1.5} className="size-10 text-saffron-ink" />
            <h2 className="font-display text-2xl font-semibold text-ink">Nothing saved yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">Save a recipe to keep your version here, ready for next time.</p>
            <Button render={<Link href="/" />} size="lg" className="mt-2 h-11">Find something to cook</Button>
          </section>
        )}
      </main>
    </div>
  );
}
