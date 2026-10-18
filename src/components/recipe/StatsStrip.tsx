import { Clock, Minus, Plus } from "lucide-react";
import { Meter } from "@/components/saffron";
import type { Recipe } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";

export type ReadyBy =
  | { kind: "startBy"; startAt: string; readyAt: string }
  | { kind: "eta"; readyAt: string };

export type StatsStripProps = {
  recipe: Recipe;
  servings: number;
  unit: "us" | "metric";
  /** Display strings, already formatted (for example "6:35 PM" and "7:30"). */
  readyBy?: ReadyBy;
  onServingsChange?: (servings: number) => void;
  onUnitChange?: (unit: "us" | "metric") => void;
  className?: string;
};

const UNITS = [
  { value: "us", label: "US" },
  { value: "metric", label: "Metric" },
] as const;

export function StatsStrip({ recipe, servings, unit, readyBy, onServingsChange, onUnitChange, className }: StatsStripProps) {
  const { times, difficulty, cleanup } = recipe;

  return (
    <section
      aria-label="Recipe stats"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-transparent bg-card p-4 shadow-border sm:p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="inline-flex items-center gap-2 text-sm">
          <Clock size={16} aria-hidden="true" className="text-muted-foreground" />
          <span className="font-semibold tabular-nums">{times.totalMin}m</span>
          <span className="text-muted-foreground">· {times.activeMin} active</span>
        </p>
        <Meter label="Difficulty" score={difficulty.score} reason={difficulty.reason} />
        <Meter
          label="Cleanup"
          score={cleanup.score}
          reason={cleanup.reason}
          detail={cleanup.dishes.join(", ")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-4">
        <div className="inline-flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Serves</span>
          <div className="inline-flex items-center rounded-full border border-border bg-background">
            <button
              type="button"
              aria-label="Fewer servings"
              disabled={!onServingsChange || servings <= 1}
              onClick={() => onServingsChange?.(servings - 1)}
              className="grid size-9 place-items-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <span className="min-w-6 text-center font-semibold tabular-nums" aria-live="polite">
              {servings}
            </span>
            <button
              type="button"
              aria-label="More servings"
              disabled={!onServingsChange || servings >= 100}
              onClick={() => onServingsChange?.(servings + 1)}
              className="grid size-9 place-items-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          role="group"
          aria-label="Units"
          className="inline-flex items-center rounded-full border border-border bg-background p-0.5 text-sm"
        >
          {UNITS.map((option) => {
            const pressed = unit === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={pressed}
                disabled={!onUnitChange}
                onClick={() => onUnitChange?.(option.value)}
                className={cn(
                  "min-h-8 rounded-full px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  pressed
                    ? "bg-saffron-soft text-saffron-ink"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {readyBy ? (
          <p className="text-sm font-medium text-saffron-ink sm:ml-auto">
            {readyBy.kind === "startBy"
              ? `Start by ${readyBy.startAt} · ready ${readyBy.readyAt}`
              : `Ready at ${readyBy.readyAt} if you start now`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
