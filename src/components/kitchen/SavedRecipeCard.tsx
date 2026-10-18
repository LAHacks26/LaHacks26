import Link from "next/link";
import { ChefHat, Share2 } from "lucide-react";
import { Chip } from "@/components/saffron";

export type SavedRecipeCardProps = {
  title: string;
  /** For example "Adapted: dairy-free". */
  adaptedNote?: string;
  updatedLabel: string;
  shared: boolean;
  href?: string;
};

export function SavedRecipeCard({
  title,
  adaptedNote,
  updatedLabel,
  shared,
  href = "/mocks/recipe",
}: SavedRecipeCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-linear-to-br from-saffron-soft via-background to-sage-soft">
        <ChefHat aria-hidden="true" strokeWidth={1.5} className="size-10 text-saffron-ink/70" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-lg leading-snug font-semibold text-ink">{title}</h2>
          {shared ? (
            <Chip variant="sage" size="sm" icon={<Share2 />}>
              Shared
            </Chip>
          ) : null}
        </div>
        {adaptedNote ? (
          <p className="text-sm font-medium text-saffron-ink">{adaptedNote}</p>
        ) : null}
        <p className="mt-auto pt-2 text-xs text-muted-foreground">{updatedLabel}</p>
      </div>
    </Link>
  );
}
