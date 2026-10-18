import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { aiRateLimiter } from "@/lib/rateLimit";
import { startSearch } from "@/lib/search/runSearch";
import { SearchRequestSchema } from "@/lib/search/types";

// POST /api/search {text, constraints, readyBy?, allergies} → {searchId} (PRD §9).
// Results stream from GET /api/search/[searchId]/stream.

export const runtime = "nodejs";

const SESSION_COOKIE = "saffron_sid";
const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const SESSION_ID_PATTERN = /^[\w-]{8,64}$/;
const LINK_MESSAGE = "Paste links import directly.";
const INVALID_MESSAGE = "Tell Saffron what to cook, in 200 characters or fewer.";

export async function POST(request: Request): Promise<Response> {
  const limit = aiRateLimiter.check(clientKey(request));
  if (!limit.ok) {
    const minutes = Math.ceil(limit.retryAfterSec / 60);
    return failure(
      429,
      `Saffron is getting a lot of requests. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      { "Retry-After": String(limit.retryAfterSec) },
    );
  }

  const parsed = SearchRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return failure(400, INVALID_MESSAGE);
  if (/^https?:\/\/\S+$/i.test(parsed.data.text)) return failure(400, LINK_MESSAGE);

  try {
    const sessionKey = await ensureSessionKey();
    const searchId = startSearch(parsed.data, { sessionKey, ip: clientKey(request) });
    return Response.json({ searchId });
  } catch (err) {
    console.error("[search] could not start the search", err instanceof Error ? err.name : "unknown");
    Sentry.captureException(err);
    return failure(500, "Couldn't start the search. Try again.");
  }
}

/** The search session: the saffron_sid cookie, created when missing. A new search from the same session replaces the old one. */
async function ensureSessionKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing && SESSION_ID_PATTERN.test(existing)) return existing;

  const sid = randomUUID();
  store.set(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });
  return sid;
}

/** The client's IP. Caddy sets x-forwarded-for; a direct local call has neither header. */
function clientKey(request: Request): string {
  // Last entry: the one our own proxy appended, so it stays right if a CDN is added in front.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/** Invalid JSON gives undefined, which the schema then rejects. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function failure(status: number, error: string, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers });
}
