import type { SearchEvent } from "./types";

// Server-Sent Events framing for GET /api/search/[searchId]/stream. No "server-only" here so tests can import it.

/** Keeps idle connections open through proxies (sent every 15 s). */
export const SSE_PING = ": ping\n\n";

/**
 * One message: `event: <type>` and `data: <JSON>`. The data is the whole event, including `type`,
 * so a client can JSON.parse it straight into a SearchEvent. JSON never contains raw newlines.
 */
export function formatSseMessage(event: SearchEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** `done` and `error` end the stream. */
export function isTerminalEvent(event: SearchEvent): boolean {
  return event.type === "done" || event.type === "error";
}
