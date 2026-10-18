"use client";

import { motion, useReducedMotion } from "motion/react";
import { CircleCheck, Timer } from "lucide-react";
import { TimerChip } from "@/components/saffron";
import { Button } from "@/components/ui/button";
import type { Step } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";
import { type CookTimer, formatClock, useNow } from "./TimerTray";

export type CookStepStatus = "upcoming" | "current" | "done";

export type CookStepCardProps = {
  step: Step;
  /** Zero-based position in the recipe. Shown as step index + 1. */
  index: number;
  status: CookStepStatus;
  /** Active timer for this step, if one is running or finished. */
  timer?: CookTimer;
  /** Focuses this step. Focusing a done step reopens it. */
  onFocus: () => void;
  onDone: () => void;
  onStartTimer: () => void;
};

export function CookStepCard({
  step,
  index,
  status,
  timer,
  onFocus,
  onDone,
  onStartTimer,
}: CookStepCardProps) {
  const reduce = useReducedMotion();
  const now = useNow(Boolean(timer));

  const current = status === "current";
  const done = status === "done";
  const number = index + 1;

  const remaining = timer && now !== null ? timer.endsAt - now : null;
  const timerFinished = remaining !== null && remaining <= 0;
  const timerLabel = timerFinished
    ? "Done"
    : remaining === null
      ? "--:--"
      : `${formatClock(remaining)} left`;

  return (
    <motion.li
      layout={!reduce}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative rounded-2xl border transition-colors",
        current
          ? "border-2 border-saffron bg-saffron-soft p-5 shadow-sm sm:p-6"
          : "border-transparent bg-card p-4 shadow-border",
        status === "upcoming" && "opacity-55"
      )}
    >
      {/* Whole card is the focus target. Action buttons sit above it (z-10). */}
      <button
        type="button"
        onClick={onFocus}
        aria-label={`Focus step ${number}`}
        aria-current={current ? "step" : undefined}
        className="absolute inset-0 z-0 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      />

      <div className="pointer-events-none flex items-start gap-4">
        {done ? (
          <span className="flex size-10 shrink-0 items-center justify-center">
            <CircleCheck size={32} aria-hidden="true" className="text-sage" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold tabular-nums",
              current
                ? "bg-saffron text-ink"
                : "border border-border bg-background text-muted-foreground"
            )}
          >
            {number}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "leading-relaxed",
              current
                ? "text-xl font-medium text-ink sm:text-[22px]"
                : done
                  ? "text-base text-muted-foreground"
                  : "text-base text-ink"
            )}
          >
            {step.text}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">~{step.estMin} min</p>

          {current && step.tips.length > 0 ? (
            <p className="mt-3 rounded-xl bg-card/70 p-3 text-sm leading-relaxed text-ink">
              <span className="font-semibold text-saffron-ink">Tip · </span>
              {step.tips[0].text}
            </p>
          ) : null}
        </div>
      </div>

      {current ? (
        <div className="relative z-10 mt-5 flex flex-wrap items-center gap-3 pl-14">
          {timer ? (
            <TimerChip label={timerLabel} state={timerFinished ? "done" : "running"} />
          ) : step.timer ? (
            <Button variant="outline" size="lg" className="h-11 bg-card" onClick={onStartTimer}>
              <Timer aria-hidden="true" />
              Start timer
            </Button>
          ) : null}
          <Button size="lg" className="h-11" onClick={onDone}>
            <CircleCheck aria-hidden="true" />
            Mark done
          </Button>
        </div>
      ) : null}
    </motion.li>
  );
}
