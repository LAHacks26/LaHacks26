// Recognizes "the database can't be reached" (network drop, DNS failure, timeout), as opposed to a
// bad query. Drizzle wraps the driver's error as `cause`, so the chain is walked. On venue Wi-Fi or a
// flaky hotspot this is the common failure (CLAUDE.md "Database access").

const CONNECTION_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

/** The connection error code, if `err` (or anything in its cause chain) is one. */
export function databaseUnavailableCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CONNECTION_CODES.has(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export const DATABASE_UNAVAILABLE_MESSAGE = "Saffron can't reach its recipe database right now. Check your connection and try again.";
