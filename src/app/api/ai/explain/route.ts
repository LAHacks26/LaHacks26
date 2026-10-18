import * as Sentry from "@sentry/nextjs";
import { streamExplain } from "@/lib/ai/explain";
import { ExplainRequestSchema } from "@/lib/ai/contracts";
import { AiError } from "@/lib/ai/gemini";
import { aiErrorResponse, failure, readJsonBody, rateLimited } from "../shared";

// POST /api/ai/explain {recipe, target, question?, allergies} → streamed UTF-8 text (PRD §9).
// Errors before the first chunk are JSON {error}. Errors after it error the stream, so the client
// never mistakes a cut-off answer for a complete one.

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(request);
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = ExplainRequestSchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "That request isn't valid.");

  // Stops the Gemini stream when the client disconnects or cancels the body.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const iterator = streamExplain(parsed.data, { signal: abort.signal })[Symbol.asyncIterator]();

  // Pull the first chunk before answering, so a failure there becomes a proper error status.
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (err) {
    abort.abort();
    // The client left before the first chunk: nothing to report, and nobody is listening for a status.
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return aiErrorResponse(err, "explain");
  }

  const encoder = new TextEncoder();
  let pending: string | null = first.done ? null : first.value;
  let finished = first.done === true;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (pending !== null) {
        controller.enqueue(encoder.encode(pending));
        pending = null;
        return;
      }
      if (finished) {
        controller.close();
        return;
      }
      try {
        const next = await iterator.next();
        if (next.done) {
          finished = true;
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(next.value));
      } catch (err) {
        finished = true;
        // A client that left caused this error on purpose: it is not a failure to log or report.
        if (!(cancelled || request.signal.aborted)) {
          console.error("[ai/explain] stream failed mid-way", err instanceof Error ? err.name : typeof err);
          if (!(err instanceof AiError && err.code === "timeout")) Sentry.captureException(err);
        }
        // Error the stream rather than close it: a closed stream would look like a complete answer.
        if (!cancelled) controller.error(err);
      }
    },
    cancel() {
      cancelled = true;
      abort.abort();
      // Runs the generator's finally block, which stops the Gemini request.
      void iterator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Tells nginx-style proxies not to buffer the stream. Caddy is configured separately (deploy/Caddyfile).
      "X-Accel-Buffering": "no",
    },
  });
}
