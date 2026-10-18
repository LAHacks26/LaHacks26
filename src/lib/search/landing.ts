import { isRecipeUrl } from "../mocks/search";
import { readyByFromClock, recipeHref } from "../recipe/readyBy";
import { importRecipeLink, SearchClientError, startSearch } from "./client";

/** Resolve navigation only after the real API succeeds; the caller owns busy/error UI. */
export async function landingDestination(
  input: { query: string; constraints: string[]; readyBy: string; allergies: string[] },
  signal: AbortSignal,
  now = new Date(),
): Promise<string> {
  let readyBy: string | undefined;
  try {
    readyBy = readyByFromClock(input.readyBy, now);
  } catch {
    throw new SearchClientError("Choose a valid ready-by time, or clear it.");
  }
  const text = input.query.trim();
  if (isRecipeUrl(text)) {
    const id = await importRecipeLink(text, signal);
    return recipeHref(id, readyBy);
  }
  const id = await startSearch({ text, constraints: input.constraints, readyBy, allergies: input.allergies }, signal);
  return `/search/${encodeURIComponent(id)}`;
}
