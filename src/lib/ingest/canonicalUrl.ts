// Pure URL canonicalization for the recipe cache key. No "server-only" here so tests can import it.

// Tracking parameters that never change the recipe a page shows.
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid)$/i;

/**
 * Canonical form of a recipe URL: http(s) only, no fragment, no tracking parameters.
 * Returns null when the input is not a web address.
 */
export function canonicalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.username = "";
  url.password = "";
  const tracking = [...url.searchParams.keys()].filter((key) => TRACKING_PARAM.test(key));
  for (const key of tracking) url.searchParams.delete(key);
  return url.href;
}
