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
 * Per-caller callback for an uncached page. Each caller receives the parsed facts, including
 * callers joining during normalization. Throwing rejects only this caller; normalization starts
 * only if at least one caller accepts the page (search uses this for "too long").
 */
export type ImportHooks = {
  onParsed?(info: ParsedInfo): void;
};

type PreparedImport =
  | { kind: "cached"; result: ImportResult }
  | { kind: "page"; info: ParsedInfo; input: Parameters<typeof normalizeRecipe>[0] };

type SharedImport = {
  prepared: Promise<PreparedImport>;
  result?: Promise<ImportResult>;
  callers: number;
};

// Share fetching/parsing and normalization, but never share a caller's rejection policy.
// Keep parsed facts available until all callers settle so late joiners can run their own hooks.
const inFlight = new Map<string, SharedImport>();

export async function importRecipe(rawUrl: string, hooks?: ImportHooks): Promise<ImportResult> {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) throw invalidUrl();

  let shared = inFlight.get(canonical);
  if (!shared) {
    shared = { prepared: prepareImport(canonical), callers: 0 };
    inFlight.set(canonical, shared);
  }
  shared.callers++;
  try {
    const prepared = await shared.prepared;
    if (prepared.kind === "cached") return prepared.result;
    hooks?.onParsed?.({ ...prepared.info });
    shared.result ??= normalizeAndStore(prepared.input);
    return await shared.result;
  } finally {
    shared.callers--;
    if (shared.callers === 0 && inFlight.get(canonical) === shared) inFlight.delete(canonical);
  }
}

async function prepareImport(canonical: string): Promise<PreparedImport> {
  // Refuse private hosts before any DB lookup. fetchPage repeats this check on every hop.
  if (isBlockedHost(new URL(canonical).hostname)) {
    throw new IngestError("blocked_url", "That link points to a private network address, so it can't be opened.");
  }

  const cached = await getSourceRecipeByUrl(canonical);
  if (cached) return { kind: "cached", result: { sourceRecipeId: cached.id, cached: true } };

  const page = await fetchPage(canonical);
  const finalUrl = canonicalizeUrl(page.finalUrl);
  if (!finalUrl) throw invalidUrl();

  if (finalUrl !== canonical) {
    const redirected = await getSourceRecipeByUrl(finalUrl);
    if (redirected) return { kind: "cached", result: { sourceRecipeId: redirected.id, cached: true } };
  }

  const jsonLd = extractJsonLdRecipe(page.html, finalUrl);
  const siteName = extractSiteName(page.html, finalUrl);
  const jsonLdIncomplete = !jsonLd || jsonLd.ingredients.length < 2 || jsonLd.instructions.length < 1;

  return {
    kind: "page",
    info: {
      url: finalUrl,
      title: jsonLd?.name,
      siteName,
      imageUrl: jsonLd?.imageUrl,
      totalMin: jsonLd?.totalTimeMin,
    },
    input: {
      url: finalUrl,
      siteName,
      jsonLd,
      pageText: jsonLdIncomplete ? extractPageText(page.html) : undefined,
    },
  };
}

async function normalizeAndStore(input: Parameters<typeof normalizeRecipe>[0]): Promise<ImportResult> {
  const recipe = await normalizeRecipe(input);
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
