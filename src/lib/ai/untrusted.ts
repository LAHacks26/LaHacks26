// Pure helpers for fencing scraped text inside the prompt. No `server-only`, so vitest can cover it.

/** Cap scraped text so one huge page cannot blow up the prompt. */
export const MAX_UNTRUSTED_CHARS = 40_000;

/**
 * Replaces every angle bracket with a look-alike, so scraped text can never contain a tag.
 * Nested or split tags such as `</untr</untrusted>usted_page_text>` cannot form a closing fence.
 */
export function neutralizeAngles(text: string): string {
  return text.replace(/</g, "‹").replace(/>/g, "›");
}

/** Makes scraped text safe to place between `<untrusted_*>` tags, and caps its length. */
export function fenceUntrusted(text: string, maxChars: number = MAX_UNTRUSTED_CHARS): string {
  return neutralizeAngles(text).slice(0, maxChars);
}
