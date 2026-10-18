// Contract between the page fetcher, the JSON-LD parser and Gemini normalization (PRD §10 step 4).

/** A fetched recipe page. `finalUrl` is the URL after redirects. */
export type FetchedPage = {
  url: string;
  finalUrl: string;
  html: string;
};

/**
 * Fields read from a page's JSON-LD `Recipe`, before Gemini normalizes them.
 * Every string is plain text (HTML tags and entities removed). Missing fields are omitted.
 */
export type RawRecipe = {
  name?: string;
  description?: string;
  author?: string;
  /** From og:site_name, JSON-LD publisher, or the hostname. */
  siteName?: string;
  /** Absolute http(s) URL. */
  imageUrl?: string;
  /** As written on the page, for example "4 servings" or "4". */
  recipeYield?: string;
  totalTimeMin?: number;
  prepTimeMin?: number;
  cookTimeMin?: number;
  /** One entry per ingredient line, as written. */
  ingredients: string[];
  /** One entry per step. A HowToSection name becomes its own entry, prefixed "Section: ". */
  instructions: string[];
};

/** What normalization receives. At least one of `jsonLd` and `pageText` is set. */
export type NormalizeInput = {
  url: string;
  siteName: string;
  jsonLd: RawRecipe | null;
  /** Stripped visible page text, used when JSON-LD is missing or incomplete. */
  pageText?: string;
};
