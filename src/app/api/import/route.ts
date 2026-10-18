import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { AiError } from "@/lib/ai/gemini";
import { DATABASE_UNAVAILABLE_MESSAGE, databaseUnavailableCode } from "@/lib/db/errors";
import { IngestError } from "@/lib/ingest/fetchPage";
import { importRecipe } from "@/lib/ingest/importRecipe";
import { aiRateLimiter } from "@/lib/rateLimit";
import { HttpUrlSchema } from "@/lib/recipe/schema";

// POST /api/import {url} → {sourceRecipeId, cached} (PRD §9).

export const runtime = "nodejs";

const BodySchema = z.object({ url: HttpUrlSchema });

const INVALID_LINK = "That doesn't look like a web link.";
const BLOCKED_BY_SITE =
  "That site wouldn't let us read the page. Some sites block automated imports, so try another link.";

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

  const parsed = BodySchema.safeParse(await readJson(request));
  if (!parsed.success) return failure(400, INVALID_LINK);

  try {
    const { sourceRecipeId, cached } = await importRecipe(parsed.data.url);
    return Response.json({ sourceRecipeId, cached });
  } catch (err) {
    return errorResponse(err);
  }
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

function errorResponse(err: unknown): Response {
  if (err instanceof IngestError) {
    switch (err.code) {
      case "invalid_url":
        return failure(400, INVALID_LINK);
      case "blocked_url":
        return failure(400, "That link can't be imported.");
      case "timeout":
        return failure(504, "That site took too long to respond.");
      case "not_html":
        return failure(502, "That link doesn't point to a web page. Try another link.");
      case "too_large":
        return failure(502, "That page is too large to read. Try another link.");
      case "fetch_failed":
        return failure(502, BLOCKED_BY_SITE);
    }
  }

  if (err instanceof AiError) {
    switch (err.code) {
      case "not_recipe":
        return failure(422, "That page doesn't look like a recipe.");
      case "overloaded":
        return failure(503, "Saffron is busy. Try again in a moment.");
      case "timeout":
        return failure(504, "Saffron took too long to read that page. Try again.");
      default:
        break;
    }
  }

  // The link is fine; the database isn't reachable. Log the code only: the driver's message names the host.
  const dbCode = databaseUnavailableCode(err);
  if (dbCode) {
    console.error("[import] database unavailable", dbCode);
    return failure(503, DATABASE_UNAVAILABLE_MESSAGE);
  }

  console.error("[import] unexpected failure", err);
  Sentry.captureException(err);
  return failure(500, "Couldn't import that page. Try another link.");
}

function failure(status: number, error: string, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers });
}
