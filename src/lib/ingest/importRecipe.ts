import "server-only";
import { AiError, embed } from "../ai/gemini";
import { embeddingText, normalizeRecipe } from "../ai/normalize";
import { getSourceRecipeByUrl, upsertSourceRecipe } from "../db/sourceRecipes";
import type { Recipe } from "../recipe/schema";
import { canonicalizeUrl } from "./canonicalUrl";
import { fetchPage, IngestError } from "./fetchPage";
import { isBlockedHost } from "./hostGuard";
import { extractJsonLdRecipe, extractPageText, extractSiteName } from "./jsonld";

// Pasted URL → cached source recipe (PRD §10.4). Fetch, parse JSON-LD, normalize with Gemini,
// embed, then store. The route maps the typed errors to HTTP responses.

export type ImportResult = { sourceRecipeId: string; cached: boolean };

/** Basic facts from the page's JSON-LD, emitted before Gemini normalization (search uses them for cards). */
export type ParsedInfo = {
  url: string;
  title?: string;
  siteName: string;
  imageUrl?: string;
  totalMin?: number;
};

/**
 * Optional callbacks for one import. `onParsed` runs after JSON-LD is read and before normalization.
 * Throwing from it aborts the import before any Gemini call (search uses this for "too long").
 */
export type ImportHooks = {
  onParsed?(info: ParsedInfo): void;
};

// Concurrent imports of the same URL share one run, so they make one Gemini call between them.
// An entry is removed as soon as its run settles. A sharer's hooks are not called for that run.
const inFlight = new Map<string, Promise<ImportResult>>();

export async function importRecipe(rawUrl: string, hooks?: ImportHooks): Promise<ImportResult> {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) throw invalidUrl();

  const running = inFlight.get(canonical);
  if (running) return running;

  const run = runImport(canonical, hooks).finally(() => inFlight.delete(canonical));
  inFlight.set(canonical, run);
  return run;
}

async function runImport(canonical: string, hooks?: ImportHooks): Promise<ImportResult> {
  // Refuse private hosts before any DB lookup. fetchPage repeats this check on every hop.
  if (isBlockedHost(new URL(canonical).hostname)) {
    throw new IngestError("blocked_url", "That link points to a private network address, so it can't be opened.");
  }

  const cached = await getSourceRecipeByUrl(canonical);
  if (cached) return { sourceRecipeId: cached.id, cached: true };

  const page = await fetchPage(canonical);
  const finalUrl = canonicalizeUrl(page.finalUrl);
  if (!finalUrl) throw invalidUrl();

  if (finalUrl !== canonical) {
    const redirected = await getSourceRecipeByUrl(finalUrl);
    if (redirected) return { sourceRecipeId: redirected.id, cached: true };
  }

  const jsonLd = extractJsonLdRecipe(page.html, finalUrl);
  const siteName = extractSiteName(page.html, finalUrl);
  const jsonLdIncomplete = !jsonLd || jsonLd.ingredients.length < 2 || jsonLd.instructions.length < 1;

  hooks?.onParsed?.({
    url: finalUrl,
    title: jsonLd?.name,
    siteName,
    imageUrl: jsonLd?.imageUrl,
    totalMin: jsonLd?.totalTimeMin,
  });

  const recipe = await normalizeRecipe({
    url: finalUrl,
    siteName,
    jsonLd,
    pageText: jsonLdIncomplete ? extractPageText(page.html) : undefined,
  });

  const embedding = await embedRecipe(recipe);
  const sourceRecipeId = await upsertSourceRecipe(recipe, embedding);
  return { sourceRecipeId, cached: false };
}

/** Embedding is best effort. A failure is logged and the recipe is stored without one. */
async function embedRecipe(recipe: Recipe): Promise<number[] | null> {
  try {
    return await embed(embeddingText(recipe));
  } catch (err) {
    console.error("[import] embedding failed, storing without one", err instanceof AiError ? err.code : "unknown");
    return null;
  }
}

function invalidUrl(): IngestError {
  return new IngestError("invalid_url", "That doesn't look like a web address.");
}
