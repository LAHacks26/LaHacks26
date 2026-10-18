import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { searches } from "../db/schema";

// Logs for each search run in the `searches` table (PRD §8.2). Best effort: every failure is
// logged and swallowed, so a database problem never breaks a search.

export type SearchLogUpdate = {
  parsed?: unknown;
  status?: string;
  error?: string;
  browserUseTaskId?: string;
};

/** Inserts the row when a run starts. Returns its id, or null when the insert failed. */
export async function logSearchStart(query: string): Promise<string | null> {
  try {
    const [row] = await getDb().insert(searches).values({ query }).returning({ id: searches.id });
    return row?.id ?? null;
  } catch (err) {
    console.warn("[search] could not log the search start", errorName(err));
    return null;
  }
}

/** Updates a run's row. Only the fields given are written. */
export async function logSearchUpdate(id: string, update: SearchLogUpdate): Promise<void> {
  try {
    const values: Partial<typeof searches.$inferInsert> = {};
    if (update.parsed !== undefined) values.parsed = update.parsed;
    if (update.status !== undefined) values.status = update.status;
    if (update.error !== undefined) values.error = update.error;
    if (update.browserUseTaskId !== undefined) values.browserUseTaskId = update.browserUseTaskId;
    if (Object.keys(values).length === 0) return;
    await getDb().update(searches).set(values).where(eq(searches.id, id));
  } catch (err) {
    console.warn("[search] could not update the search log", errorName(err));
  }
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}
