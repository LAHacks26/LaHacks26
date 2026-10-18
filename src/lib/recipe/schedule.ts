import type { Step } from "./schema";

// Ready-by timing and clock times (PRD §5.10). Pure: callers pass `now` and the start time.

const MIN_MS = 60_000;

export type ReadyByStatus =
  | { kind: "ahead"; startBy: Date; readyAt: Date }
  | { kind: "late"; readyAt: Date };

/**
 * Start time of each step: cumulative estMin, scaled so the steps sum to totalMin.
 * If every estMin is 0, the steps are spread evenly across totalMin.
 */
export function stepClockTimes(steps: Step[], totalMin: number, start: Date): Date[] {
  if (steps.length === 0) return [];
  const sum = steps.reduce((acc, step) => acc + step.estMin, 0);
  const spreadEvenly = sum <= 0;
  let elapsedMin = 0;
  return steps.map((step, i) => {
    const offsetMin = spreadEvenly ? (i * totalMin) / steps.length : (elapsedMin * totalMin) / sum;
    elapsedMin += step.estMin;
    return new Date(start.getTime() + Math.round(offsetMin * MIN_MS));
  });
}

/**
 * Start by = readyBy − totalMin. While that is still ahead of `now`, returns "ahead".
 * Once it has passed, returns "late" with readyAt = now + totalMin (cooking starts now).
 */
export function readyByStatus(readyBy: Date, totalMin: number, now: Date): ReadyByStatus {
  const startBy = new Date(readyBy.getTime() - totalMin * MIN_MS);
  if (startBy.getTime() > now.getTime()) {
    return { kind: "ahead", startBy, readyAt: new Date(readyBy.getTime()) };
  }
  return { kind: "late", readyAt: new Date(now.getTime() + totalMin * MIN_MS) };
}

/**
 * "6:45 PM" in the user's locale. Optional timeZone and locale override the defaults
 * (tests pass them so the output doesn't depend on the machine). Narrow no-break spaces become normal spaces.
 */
export function formatClock(d: Date, timeZone?: string, locale?: string): string {
  return d
    .toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone })
    .replace(/[  ]/g, " ");
}

/** Whole minutes between now and readyBy, minus the buffer, floored at 0. */
export function maxTotalMinFor(readyBy: Date, now: Date, bufferMin = 5): number {
  const minutes = (readyBy.getTime() - now.getTime()) / MIN_MS - bufferMin;
  return Math.max(0, Math.floor(minutes));
}
