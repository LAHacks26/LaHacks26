import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

/** Undo snapshots plus up to 200 chat messages; cap bytes while reading, not after buffering. */
export const MAX_SAVED_BODY_BYTES = 3_000_000;

export class SavedRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function savedJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Vary": "Cookie", "Referrer-Policy": "no-referrer" },
  });
}

export function savedError(error: unknown): NextResponse {
  if (error instanceof SavedRequestError) return savedJson({ error: error.message }, error.status);
  // Database errors can include recipe/chat payloads or credentials. Do not log or return them.
  return savedJson({ error: "Saffron couldn't save or load that. Try again." }, 500);
}

/** Fail closed in production. Do not trust forwarded host headers as a CSRF allow-list. */
export function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new SavedRequestError(403, "This request isn't allowed.");
  }
  let expected: string;
  try {
    const base = process.env.APP_URL;
    if (!base && process.env.NODE_ENV === "production") throw new Error("Missing APP_URL");
    const configured = new URL(base || request.url);
    if (!/^https?:$/.test(configured.protocol) || configured.username || configured.password) throw new Error("Invalid APP_URL");
    if (process.env.NODE_ENV === "production" && configured.protocol !== "https:") throw new Error("HTTPS required");
    expected = configured.origin;
  } catch {
    throw new SavedRequestError(503, "Saving is temporarily unavailable.");
  }
  if (request.headers.get("origin") !== expected) throw new SavedRequestError(403, "This request isn't allowed.");
}

export async function readSavedBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new SavedRequestError(415, "Send this request as JSON.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_SAVED_BODY_BYTES) throw new SavedRequestError(413, "That request is too large.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_SAVED_BODY_BYTES) {
          await reader.cancel();
          throw new SavedRequestError(413, "That request is too large.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = schema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (!parsed.success) throw new Error("Invalid schema");
    return parsed.data;
  } catch { throw new SavedRequestError(400, "That request isn't valid."); }
}
