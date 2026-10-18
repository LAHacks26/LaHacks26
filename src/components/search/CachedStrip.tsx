import Link from "next/link";
import { ChefHat } from "lucide-react";
import { SectionLabel } from "@/components/saffron";
import type { CachedItem } from "@/lib/mocks/search";
import { cn } from "@/lib/utils";

export type CachedStripProps = {
  items: CachedItem[];
  /** Slim rows with a small thumbnail, used above the live view. */
  compact?: boolean;
};

export function CachedStrip({ items, compact = false }: CachedStripProps) {
  return (
    <section aria-label="Already in Saffron's kitchen" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <SectionLabel as="h2" className="text-ink">
          Already in Saffron&apos;s kitchen
        </SectionLabel>
        <span className="text-xs text-muted-foreground">· instant</span>
      </div>

      <ul
        className={cn(
          "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden",
          compact && "pb-1"
        )}
      >
        {items.map((item) => (
          <li
            key={item.id}
            className={cn("shrink-0 snap-start", compact ? "w-60" : "w-44 sm:w-48")}
          >
            <Link
              href="/mocks/recipe"
              className={cn(
                "group flex overflow-hidden rounded-2xl border border-transparent bg-card shadow-border transition-[border-color,box-shadow] duration-150 ease-out outline-none hover:border-saffron hover:shadow-border-hover focus-visible:ring-3 focus-visible:ring-ring/50",
                compact ? "items-center gap-2.5 p-2 pr-3" : "flex-col"
              )}
            >
              {compact ? (
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-[9px] bg-linear-to-br from-saffron-soft to-sage-soft"
                >
                  <ChefHat className="size-4 text-saffron-ink/70" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-20 items-center justify-center bg-linear-to-br from-saffron-soft via-card to-sage-soft"
                >
                  <ChefHat className="size-6 text-saffron-ink/70" />
                </span>
              )}
              <span className={cn("flex min-w-0 flex-col", compact ? "gap-0" : "gap-0.5 p-3")}>
                <span
                  className={cn(
                    "truncate font-display font-semibold text-ink group-hover:text-saffron-ink",
                    compact ? "text-sm" : "text-base"
                  )}
                >
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.site} · {item.totalMin}m
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
