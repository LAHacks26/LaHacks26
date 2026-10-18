// Fuzzy "Hey Saffron" matcher for the wake listener (PRD §11.3). Pure, with no `server-only`, so vitest can cover it.

// A greeting, optional whitespace or comma, then the wake name as whole words. Spoken variants are
// accepted because speech recognizers often mishear the name.
const WAKE_PATTERN = /\b(?:hey|hi|okay|ok|a)[\s,]*(?:saffron|sapphire|safron|saffran)\b/i;

/**
 * Finds the wake phrase anywhere in a transcript. Returns the text after it, with leading punctuation
 * and whitespace removed and trailing whitespace trimmed (possibly empty). Returns null when there is no
 * wake phrase.
 */
export function matchWakeWord(transcript: string): { rest: string } | null {
  const match = WAKE_PATTERN.exec(transcript);
  if (!match) return null;
  const after = transcript.slice(match.index + match[0].length);
  return { rest: after.replace(/^[\s\p{P}]+/u, "").trimEnd() };
}
