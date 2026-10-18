import * as Sentry from "@sentry/nextjs";
import { AiError } from "@/lib/ai/gemini";
import { aiRateLimiter } from "@/lib/rateLimit";

// Helpers shared by the /api/ai routes. Same conventions as /api/import: JSON `{error}` bodies,
// the client IP from the proxy headers, and Sentry for unexpected failures.

/** Request bodies above this size get 413. Recipes are a few KB; this is generous. */
export const MAX_BODY_BYTES = 200_000;

export function failure(status: number, error: string, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers });
}

/** The client's IP. Caddy sets x-forwarded-for; a direct local call has neither header. */
export function clientKey(request: Request): string {
  // Last entry: the one our own proxy appended, so it stays right if a CDN is added in front.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/** A 429 response when the client is over the shared AI budget, otherwise null. */
export function rateLimited(request: Request): Response | null {
  const limit = aiRateLimiter.check(clientKey(request));
  if (limit.ok) return null;
  const minutes = Math.ceil(limit.retryAfterSec / 60);
  return failure(
    429,
    `Saffron is getting a lot of requests. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    { "Retry-After": String(limit.retryAfterSec) },
  );
}

/** Reads the body up to MAX_BODY_BYTES, stopping as soon as the cap is passed, so a chunked body cannot grow unbounded. */
async function readCapped(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: Response };

/**
 * Parses the JSON body. Rejects with 413 when the declared length or the actual bytes exceed the cap,
 * and with 400 when the body is not JSON. The schema check is left to the route.
 */
export async function readJsonBody(request: Request): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: failure(413, "That request is too large.") };
  }
  const bytes = await readCapped(request);
  if (bytes === null) return { ok: false, response: failure(413, "That request is too large.") };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, response: failure(400, "That request isn't valid.") };
  }
}

/** Maps a failure from the AI layer to an HTTP response (PRD §12). Unknown errors are logged and sent to Sentry. */
export function aiErrorResponse(err: unknown, route: string): Response {
  if (err instanceof AiError) {
    switch (err.code) {
      case "overloaded":
        return failure(503, "Saffron is busy. Try again in a moment.");
      case "timeout":
        return failure(504, "Saffron took too long to answer. Try again.");
      case "invalid":
        return failure(422, err.message);
      default:
        break;
    }
  }
  console.error(`[ai/${route}] unexpected failure`, err);
  Sentry.captureException(err);
  return failure(500, "Saffron couldn't finish that. Try again.");
}
