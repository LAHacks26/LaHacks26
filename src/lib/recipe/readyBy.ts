import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });

/** Invalid or repeated query parameters must not replace a stored deadline. */
export function parseReadyBy(value: unknown): string | undefined {
  const parsed = isoDateTime.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** The time picker describes the next occurrence of a local wall-clock time. */
export function readyByFromClock(clock: string, now: Date): string | undefined {
  if (!clock) return undefined;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new Error("Invalid ready-by time");
  const [hours, minutes] = clock.split(":").map(Number);
  const deadline = new Date(now);
  deadline.setHours(hours, minutes, 0, 0);
  if (deadline.getTime() <= now.getTime()) deadline.setDate(deadline.getDate() + 1);
  return deadline.toISOString();
}

export function defaultReadyByClock(now: Date): string {
  const nextHour = new Date(now.getTime() + 60 * 60_000);
  return `${String(nextHour.getHours()).padStart(2, "0")}:${String(nextHour.getMinutes()).padStart(2, "0")}`;
}

export function recipeHref(sourceRecipeId: string, readyBy?: string): string {
  const path = `/recipe/${encodeURIComponent(sourceRecipeId)}`;
  const deadline = parseReadyBy(readyBy);
  return deadline ? `${path}?${new URLSearchParams({ readyBy: deadline })}` : path;
}
