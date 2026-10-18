import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type AllergenBadgeProps = {
  allergen: string;
  className?: string;
};

export function AllergenBadge({ allergen, className }: AllergenBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-tomato-soft px-2 py-0.5 text-xs font-semibold text-tomato-ink",
        className
      )}
    >
      <TriangleAlert size={12} aria-hidden="true" className="shrink-0" />
      {allergen}
    </span>
  );
}
