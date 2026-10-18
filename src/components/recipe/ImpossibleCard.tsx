import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ImpossibleCardProps = {
  reason: string;
  /** Search query used for the "Search instead" button. */
  suggestedSearch: string;
  onSearch?: () => void;
  className?: string;
};

export function ImpossibleCard({ reason, suggestedSearch, onSearch, className }: ImpossibleCardProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 text-sm", className)}>
      <p className="leading-relaxed text-foreground">{reason}</p>
      <Button
        size="lg"
        onClick={onSearch}
        className="h-auto min-h-9 w-full justify-start py-2 text-left whitespace-normal"
      >
        <Search aria-hidden="true" />
        <span>Search instead: {suggestedSearch}</span>
      </Button>
    </div>
  );
}
