"use client";

import Link from "next/link";
import { ChefHat, Loader2 } from "lucide-react";
import { AllergenBadge, Chip, Meter } from "@/components/saffron";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { allergenMatches } from "./searchRunState";
import "./search.css";

export type CandidateCardProps = {
  title: string;
  site: string;
  /** Unknown until the recipe is read. The line shows only the site until then. */
  totalMin?: number;
  /** 1 to 5. Omitted until the recipe is read. */
  difficulty?: number;
  /** Allergen tags on the recipe, e.g. ["dairy"]. */
  allergens: string[];
  /** The user's listed allergens. Matches are labelled. */
  userAllergies: string[];
  fitsReadyBy: boolean;
  /** Position in the results grid. Drives the 50ms entrance stagger. */
  entranceIndex?: number;
  /** Recipe photo from the source page. The gradient placeholder shows when absent. */
  imageUrl?: string;
  /** Where the card goes. Defaults to the mock recipe page. */
  href?: string;
  /** True while the recipe is still being read: shows "Reading recipe…" and no link. */
  pending?: boolean;
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
  imageUrl,
  href = "/mocks/recipe",
  pending = false,
}: CandidateCardProps) {
  const matching = allergenMatches(allergens, userAllergies);

  // The entrance sits on a wrapper, not the article: a finished fill-mode
  // animation on the article would override its hover lift.
  return (
    <div
      className="search-card-enter flex h-full w-full"
      style={{ animationDelay: `${entranceIndex * 50}ms` }}
    >
      <article
        aria-busy={pending || undefined}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-2xl border border-transparent bg-card shadow-border",
          "transition-[transform,box-shadow] duration-150 ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-border-hover",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          pending && "opacity-90"
        )}
      >
        {imageUrl ? (
          // Recipe photos come from arbitrary sites, so next/image cannot list their hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="aspect-[4/3] w-full bg-card object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex aspect-[4/3] items-center justify-center bg-linear-to-br from-saffron-soft via-card to-sage-soft"
          >
            <ChefHat className="size-8 text-saffron-ink/70" />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg leading-snug font-semibold tracking-tight text-ink">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {totalMin !== undefined ? `${site} · ${totalMin} min` : site}
            </p>
          </div>

          {difficulty !== undefined || fitsReadyBy ? (
            <div className="flex flex-wrap items-center gap-2">
              {difficulty !== undefined ? (
                <Meter label="Difficulty" score={difficulty} />
              ) : null}
              {fitsReadyBy ? (
                <Chip size="sm" variant="sage">
                  Fits ready-by
                </Chip>
              ) : null}
            </div>
          ) : null}

          {matching.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {matching.map((allergen) => (
                <AllergenBadge key={allergen} allergen={`Contains ${allergen}`} />
              ))}
            </div>
          ) : null}

          {pending ? (
            <span
              role="status"
              className="mt-auto inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-muted text-sm font-medium text-muted-foreground"
            >
              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              Reading recipe…
            </span>
          ) : (
            <Link
              href={href}
              className={cn(buttonVariants({ size: "default" }), "mt-auto w-full")}
            >
              Open recipe
            </Link>
          )}
        </div>
      </article>
    </div>
  );
}
