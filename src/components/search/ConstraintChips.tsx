"use client";

import { AlarmClock } from "lucide-react";
import { Chip } from "@/components/saffron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatReadyBy } from "@/lib/mocks/search";
import { defaultReadyByClock } from "@/lib/recipe/readyBy";

export type ConstraintChipsProps = {
  /** Labels of the active constraints, e.g. ["Vegan"]. */
  selected: string[];
  onToggle: (label: string) => void;
  /** 24-hour "HH:MM", or "" when not set. */
  readyBy: string;
  onReadyByChange: (value: string) => void;
};

const CONSTRAINTS = [
  "Vegan",
  "Vegetarian",
  "Gluten-free",
  "Dairy-free",
  "No oven",
  "No blender",
];

export function ConstraintChips({
  selected,
  onToggle,
  readyBy,
  onReadyByChange,
}: ConstraintChipsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {CONSTRAINTS.map((label) => {
        const on = selected.includes(label);
        return (
          <Chip
            key={label}
            variant={on ? "selected" : "default"}
            aria-pressed={on}
            onClick={() => onToggle(label)}
          >
            {label}
          </Chip>
        );
      })}

      <Popover onOpenChange={(open) => {
        if (open && !readyBy) onReadyByChange(defaultReadyByClock(new Date()));
      }}>
        {/* Base UI injects the trigger's onClick, which makes Chip render a button. */}
        <PopoverTrigger
          render={
            <Chip
              variant={readyBy ? "selected" : "default"}
              icon={<AlarmClock />}
            >
              {readyBy ? `Ready by ${formatReadyBy(readyBy)}` : "Ready by"}
            </Chip>
          }
        />
        <PopoverContent align="center" className="w-64 gap-3 p-3">
          <label htmlFor="ready-by-time" className="text-sm font-medium text-ink">
            Ready by
          </label>
          <Input
            id="ready-by-time"
            type="time"
            value={readyBy}
            onChange={(event) => onReadyByChange(event.target.value)}
            className="h-9"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Earlier times mean tomorrow. Recipes that take longer are left out.
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={!readyBy}
              onClick={() => onReadyByChange("")}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
