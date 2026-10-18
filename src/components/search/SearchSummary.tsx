import Link from "next/link";
import { AlarmClock } from "lucide-react";
import { Chip } from "@/components/saffron";
import { buttonVariants } from "@/components/ui/button";
import { formatReadyBy } from "@/lib/mocks/search";
import { cn } from "@/lib/utils";

export type SearchSummaryProps = {
  query: string;
  /** Labels of the active constraints. */
  constraints: string[];
  /** 24-hour "HH:MM", or "" when not set. */
  readyBy: string;
};

export function SearchSummary({ query, constraints, readyBy }: SearchSummaryProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight break-words text-ink sm:text-4xl">
          {query}
        </h1>
        {constraints.length > 0 || readyBy ? (
          <div className="flex flex-wrap items-center gap-2">
            {constraints.map((label) => (
              <Chip key={label} size="sm" variant="sage">
                {label}
              </Chip>
            ))}
            {readyBy ? (
              <Chip size="sm" variant="selected" icon={<AlarmClock />}>
                Ready by {formatReadyBy(readyBy)}
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>

      <Link
        href="/mocks/landing"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0 self-start sm:self-auto")}
      >
        Edit search
      </Link>
    </header>
  );
}
