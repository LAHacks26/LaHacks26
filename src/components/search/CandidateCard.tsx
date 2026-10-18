"use client";

import Link from "next/link";
import { ChefHat } from "lucide-react";
import { AllergenBadge, Chip, Meter } from "@/components/saffron";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./search.css";

export type CandidateCardProps = {
  title: string;
  site: string;
  totalMin: number;
  /** 1 to 5. */
  difficulty: number;
  /** Allergen tags on the recipe, e.g. ["dairy"]. */
  allergens: string[];
  /** The user's listed allergens. Matches are labelled. */
  userAllergies: string[];
  fitsReadyBy: boolean;
  /** Position in the results grid. Drives the 50ms entrance stagger. */
  entranceIndex?: number;
};

export function CandidateCard({
  title,
  site,
  totalMin,
  difficulty,
  allergens,
  userAllergies,
  fitsReadyBy,
  entranceIndex = 0,
}: CandidateCardProps) {
  const matching = allergens.filter((allergen) => userAllergies.includes(allergen));

  // The entrance sits on a wrapper, not the article: a finished fill-mode
  // animation on the article would override its hover lift.
  return (
    <div
      className="search-card-enter flex h-full w-full"
      style={{ animationDelay: `${entranceIndex * 50}ms` }}
    >
      <article
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-2xl border border-transparent bg-card shadow-border",
          "transition-[transform,box-shadow] duration-150 ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-border-hover",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        )}
      >
        <div
          aria-hidden="true"
          className="flex aspect-[4/3] items-center justify-center bg-linear-to-br from-saffron-soft via-card to-sage-soft"
        >
          <ChefHat className="size-8 text-saffron-ink/70" />
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg leading-snug font-semibold tracking-tight text-ink">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {site} · {totalMin} min
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Meter label="Difficulty" score={difficulty} />
            {fitsReadyBy ? (
              <Chip size="sm" variant="sage">
                Fits ready-by
              </Chip>
            ) : null}
          </div>

          {matching.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {matching.map((allergen) => (
                <AllergenBadge key={allergen} allergen={`Contains ${allergen}`} />
              ))}
            </div>
          ) : null}

          <Link
            href="/mocks/recipe"
            className={cn(buttonVariants({ size: "default" }), "mt-auto w-full")}
          >
            Open recipe
          </Link>
        </div>
      </article>
    </div>
  );
}
