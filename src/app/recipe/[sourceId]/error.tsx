"use client";

import Link from "next/link";
import { AppHeader } from "@/components/shell/AppHeader";

// Shown when loading or rendering a recipe throws, for example when the database is down.
// `retry` re-runs the failed render, which re-fetches the row. The raw error stays in the server log.
export default function RecipeError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Something went wrong loading this recipe.
          </h1>
          <p className="text-muted-foreground">Give it another try, or search for something else.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Retry
            </button>
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold text-ink transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Back to search
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
