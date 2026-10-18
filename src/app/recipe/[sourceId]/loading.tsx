import { AppHeader } from "@/components/shell/AppHeader";

// Skeleton shown while the recipe row loads. Mirrors the title, stats strip and step lines.
export default function RecipeLoading() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AppHeader />
      <main className="flex-1">
        <div
          role="status"
          className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-8 pb-28 sm:px-6 sm:pt-12"
        >
          <span className="sr-only">Loading recipe…</span>

          <div aria-hidden="true" className="flex flex-col gap-4">
            <div className="h-10 w-3/4 max-w-md animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>

          <div
            aria-hidden="true"
            className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-card p-4"
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>

          <div aria-hidden="true" className="flex flex-col gap-3">
            <div className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        </div>
      </main>
    </div>
  );
}
