"use client";

import { useId, useState } from "react";
import { Lightbulb } from "lucide-react";
import type { Tip } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";

export type TipBlockProps = {
  tip: Tip;
  /** Starts expanded (for example, a tip the user just added). Tips default to collapsed. */
  defaultOpen?: boolean;
  className?: string;
};

export function TipBlock({ tip, defaultOpen = false, className }: TipBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={cn(
        "mt-1.5 rounded-r-lg border-l-2 border-saffron bg-saffron-soft text-sm",
        className
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-9 w-full items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-left font-medium text-saffron-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Lightbulb size={14} aria-hidden="true" className="shrink-0" />
        Tip
      </button>
      {open ? (
        <p id={panelId} className="px-3 pt-0.5 pb-2.5 pl-8 leading-relaxed text-foreground">
          {tip.text}
        </p>
      ) : null}
    </div>
  );
}
