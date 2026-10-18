import Link from "next/link";
import { AppHeader } from "@/components/shell/AppHeader";

export default function RecipeNotFound() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AppHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            We couldn&apos;t find that recipe.
          </h1>
          <p className="text-muted-foreground">
            It may have been removed, or the link may be wrong.
          </p>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Back to search
          </Link>
        </div>
      </main>
    </div>
  );
}
