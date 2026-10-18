"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CookTimer = {
  id: string;
  label: string;
  /** Epoch milliseconds when the timer ends. */
  endsAt: number;
  /** The step this timer belongs to, if any. */
  stepId?: string;
};

/** Timer as seeded from data: remaining seconds are turned into endsAt on mount. */
export type CookTimerSeed = {
  id: string;
  label: string;
  stepId?: string;
  remainingSec: number;
};

export type TimerTrayProps = {
  timers: CookTimer[];
  onCancel: (id: string) => void;
  className?: string;
};

/**
 * Current time in ms, ticking once a second while enabled.
 * Returns null before mount so server and client render the same markup.
 */
export function useNow(enabled = true): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return now;
}

/** 8:42 under an hour, 1:02:03 at an hour or more. Never negative. */
export function formatClock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

export function TimerTray({ timers, onCancel, className }: TimerTrayProps) {
  const now = useNow(timers.length > 0);

  if (timers.length === 0) return null;

  const isFinished = (timer: CookTimer) => now !== null && timer.endsAt - now <= 0;

  // Only finished timers are announced. A live region around the whole tray
  // would read out every countdown tick.
  const announcement = timers
    .filter(isFinished)
    .map((timer) => `${timer.label} timer done`)
    .join(". ");

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <ul aria-label="Timers" className="flex flex-col items-start gap-2">
        {timers.map((timer) => {
          const remaining = now === null ? null : timer.endsAt - now;
          const finished = isFinished(timer);
          const clock = finished
            ? "Done"
            : remaining === null
              ? "--:--"
              : formatClock(remaining);

          return (
            <li
              key={timer.id}
              className={cn(
                "flex min-h-11 items-center gap-1 rounded-full py-1 pr-1 pl-4 text-sm font-medium tabular-nums shadow-md",
                finished
                  ? "animate-pulse [animation-iteration-count:3] bg-saffron text-ink motion-reduce:animate-none"
                  : "bg-ink text-background"
              )}
            >
              <span>
                {timer.label} · {clock}
              </span>
              <button
                type="button"
                aria-label={`Cancel ${timer.label} timer`}
                onClick={() => onCancel(timer.id)}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  finished ? "hover:bg-ink/10" : "hover:bg-background/15"
                )}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
