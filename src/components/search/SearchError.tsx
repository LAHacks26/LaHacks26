import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SearchErrorProps = {
  /** One line on why the agent stopped. */
  message: string;
};

export function SearchError({ message }: SearchErrorProps) {
  return (
    <section
      aria-labelledby="search-error-heading"
      className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tomato-soft text-tomato-ink"
        >
          <TriangleAlert className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="search-error-heading"
            className="font-display text-xl font-semibold tracking-tight text-ink"
          >
            The agent hit a snag.
          </h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <Button size="lg" className="w-full sm:w-auto">
          Retry
        </Button>

        <div className="flex flex-col gap-2">
          <label htmlFor="paste-recipe-link" className="text-sm font-medium text-ink">
            Paste a recipe link instead
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="paste-recipe-link"
              type="url"
              inputMode="url"
              placeholder="https://"
              autoComplete="off"
              className="h-10 flex-1"
            />
            <Button variant="outline" size="lg">
              Import
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Your cached results above still work.</p>
      </div>
    </section>
  );
}
