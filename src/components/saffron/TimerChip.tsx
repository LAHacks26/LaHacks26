import { Timer } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const timerChipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums whitespace-nowrap",
  {
    variants: {
      state: {
        idle: "border-border bg-card text-ink",
        running: "border-saffron bg-card text-saffron-ink",
        done: "border-sage bg-sage-soft text-ink",
      },
    },
    defaultVariants: {
      state: "idle",
    },
  }
);

export type TimerChipProps = VariantProps<typeof timerChipVariants> & {
  /** For example "30 min" or "8:42 left". */
  label: string;
  className?: string;
};

export function TimerChip({ label, state = "idle", className }: TimerChipProps) {
  return (
    <span className={cn(timerChipVariants({ state }), className)}>
      {state === "running" ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-saffron motion-reduce:animate-none"
        />
      ) : null}
      <Timer size={12} aria-hidden="true" className="shrink-0" />
      <span>{label}</span>
    </span>
  );
}
