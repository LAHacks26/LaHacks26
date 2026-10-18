import Link from "next/link";
import { ChefHat, Clock3, Share2 } from "lucide-react";
import { Chip } from "@/components/saffron";

export type SavedRecipeCardProps = {
  title: string;
  /** For example "Adapted: dairy-free". */
  adaptedNote?: string;
  imageUrl?: string;
  totalMin?: number;
  updatedLabel: string;
  shared: boolean;
  href?: string;
};

export function SavedRecipeCard({
  title,
  adaptedNote,
  imageUrl,
  totalMin,
  updatedLabel,
  shared,
  href = "/mocks/recipe",
}: SavedRecipeCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-transparent bg-card shadow-border outline-none transition-[transform,box-shadow] duration-150 ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-border-hover focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-linear-to-br from-saffron-soft via-background to-sage-soft">
        {imageUrl && /^https?:\/\//i.test(imageUrl) ? (
          // External recipe images come from many source sites, so use the native image element.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
        ) : <ChefHat aria-hidden="true" strokeWidth={1.5} className="size-10 text-saffron-ink/70" />}
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
        {totalMin !== undefined ? <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock3 aria-hidden="true" className="size-3.5" />{totalMin} min</p> : null}
        <p className="mt-auto pt-2 text-xs text-muted-foreground">{updatedLabel}</p>
      </div>
    </Link>
  );
}
