import { z } from "zod";
import {
  EditResponseSchema,
  SuggestSwapsResponseSchema,
  type EditRequest,
  type EditResponse,
  type ExplainRequest,
  type SuggestSwapsRequest,
} from "../ai/contracts";

// Browser-side helpers for the popover AI routes (PRD §5.4, §9). Responses are checked against the
// shared contracts. Every failure becomes an AiClientError with a message that is safe to show.

const TIMEOUT_MS = 30_000;
const FALLBACK_ERROR = "Saffron couldn't finish that. Try again.";
const NETWORK_ERROR = "Saffron can't be reached right now. Check your connection and try again.";
const TIMEOUT_ERROR = "That took too long. Try again.";
const INVALID_ERROR = "Saffron sent back something unexpected. Try again.";
const STOPPED_ERROR = "Stopped.";

export type AiClientErrorReason = "server" | "network" | "timeout" | "invalid" | "aborted";

export class AiClientError extends Error {
  readonly reason: AiClientErrorReason;

  constructor(message: string, reason: AiClientErrorReason) {
    super(message);
    this.name = "AiClientError";
    this.reason = reason;
  }
}

/**
 * Runs one request with a configurable timeout (30 s by default) that also honors the caller's signal. Anything thrown by
 * the request becomes an AiClientError: the caller's abort, the timeout, or a network failure.
 */
async function withTimeout<T>(
  signal: AbortSignal | undefined,
  run: (requestSignal: AbortSignal) => Promise<T>,
  timeoutMs = TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", forwardAbort);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (signal?.aborted) throw new AiClientError(STOPPED_ERROR, "aborted");
    if (error instanceof AiClientError) throw error;
    if (timedOut) throw new AiClientError(TIMEOUT_ERROR, "timeout");
    throw new AiClientError(NETWORK_ERROR, "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/** The `{ error }` message of a non-2xx response, or the fallback when it has none. */
async function serverError(response: Response): Promise<AiClientError> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return new AiClientError(body.error, "server");
    }
  } catch {
    // Not JSON. Use the fallback.
  }
  return new AiClientError(FALLBACK_ERROR, "server");
}

export async function postJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  timeoutMs = TIMEOUT_MS,
): Promise<T> {
  return withTimeout(signal, async (requestSignal) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: requestSignal,
    });
    if (!response.ok) throw await serverError(response);

    const json: unknown = await response.json().catch((error: unknown) => {
      if (requestSignal.aborted) throw error;
      return undefined;
    });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new AiClientError(INVALID_ERROR, "invalid");
    return parsed.data;
  }, timeoutMs);
}

export type ExplainStreamOptions = {
  signal?: AbortSignal;
  /** Called with the full text so far each time a chunk arrives. */
  onChunk?: (textSoFar: string) => void;
};

/**
 * Streams an explanation from POST /api/ai/explain. Resolves with the full text once the stream
 * ends. Rejects with AiClientError when the stream fails or comes back empty.
 */
export async function explainStream(
  req: ExplainRequest,
  { signal, onChunk }: ExplainStreamOptions = {},
): Promise<string> {
  return withTimeout(signal, async (requestSignal) => {
    const response = await fetch("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: requestSignal,
    });
    if (!response.ok) throw await serverError(response);

    let text = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        onChunk?.(text);
      }
      text += decoder.decode();
    } else {
      text = await response.text();
    }

    const trimmed = text.trim();
    if (!trimmed) throw new AiClientError(INVALID_ERROR, "invalid");
    onChunk?.(trimmed);
    return trimmed;
  });
}

/** Three swap suggestions for an ingredient or appliance (POST /api/ai/suggest-swaps). */
export async function suggestSwaps(req: SuggestSwapsRequest, signal?: AbortSignal): Promise<string[]> {
  const parsed = await postJson("/api/ai/suggest-swaps", req, SuggestSwapsResponseSchema, signal);
  return parsed.suggestions;
}

/** Runs one edit (POST /api/ai/edit). The result is validated, but not applied. */
export async function requestEdit(req: EditRequest, signal?: AbortSignal): Promise<EditResponse> {
  return postJson("/api/ai/edit", req, EditResponseSchema, signal, req.action === "missing_appliance" ? 45_000 : TIMEOUT_MS);
}
