import { Chip } from "@/components/saffron";
import { cn } from "@/lib/utils";

export type RejectionCardProps = {
  reason: string;
  /** Exactly three valid alternatives. */
  suggestions: string[];
  onSuggest?: (suggestion: string) => void;
  className?: string;
};

export function RejectionCard({ reason, suggestions, onSuggest, className }: RejectionCardProps) {
  return (
    <div className={cn("rounded-xl border border-tomato bg-tomato-soft p-3 text-sm", className)}>
      <p className="font-semibold text-tomato-ink">That swap won’t work.</p>
      <p className="mt-0.5 leading-relaxed text-foreground">{reason}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <Chip
            key={suggestion}
            variant="default"
            size="md"
            className="cursor-pointer hover:border-saffron"
            onClick={() => onSuggest?.(suggestion)}
          >
            {suggestion}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Your recipe is unchanged.</p>
    </div>
  );
}
