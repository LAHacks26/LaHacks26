"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MeterProps = {
  label: string;
  /** 1 to 5. Values outside the range are clamped. */
  score: number;
  /** One-line reason, shown on hover (and keyboard focus). */
  reason?: string;
  /** Extra content shown under the reason in the tooltip, e.g. a dish list. */
  detail?: ReactNode;
  className?: string;
};

const TOTAL = 5;

export function Meter({ label, score, reason, detail, className }: MeterProps) {
  const filled = Math.min(TOTAL, Math.max(0, Math.round(score)));
  const name = `${label} ${filled} of ${TOTAL}`;

  // Visual row: label plus five dots. Hidden from assistive tech, because the
  // interactive element or the wrapper carries the single accessible name.
  const visual = (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        {label}
      </span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {Array.from({ length: TOTAL }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-2 rounded-full",
              i < filled ? "bg-saffron" : "bg-border"
            )}
          />
        ))}
      </span>
    </>
  );

  const rowClass = "inline-flex items-center gap-2 text-sm";

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      {reason ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`${name}. ${reason}`}
                className={cn(
                  rowClass,
                  "cursor-help rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                )}
              />
            }
          >
            {visual}
          </TooltipTrigger>
          <TooltipContent className="max-w-64 items-start">
            <span className="flex flex-col gap-1">
              <span>{reason}</span>
              {detail ? <span className="text-background/80">{detail}</span> : null}
            </span>
          </TooltipContent>
        </Tooltip>
      ) : (
        <>
          <span role="img" aria-label={name} className={rowClass}>
            {visual}
          </span>
          {detail ? (
            <span className="text-xs text-muted-foreground">{detail}</span>
          ) : null}
        </>
      )}
    </span>
  );
}
