import { type SearchSubscription, subscribe } from "@/lib/search/runSearch";
import { formatSseMessage, isTerminalEvent, SSE_PING } from "@/lib/search/sse";
import type { SearchEvent } from "@/lib/search/types";

// GET /api/search/[searchId]/stream: Server-Sent Events (PRD §9, §10 step 3).
// Replays the run so far, then streams live events. Ends after `done` or `error`.

export const runtime = "nodejs";

const PING_INTERVAL_MS = 15_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ searchId: string }> },
): Promise<Response> {
  const { searchId } = await params;
  const encoder = new TextEncoder();
  let teardown: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const subscription: { current: SearchSubscription | null } = { current: null };

      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };

      // Started first, so close() can always clear it. Keeps idle proxies from dropping the stream.
      const ping = setInterval(() => write(SSE_PING), PING_INTERVAL_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        subscription.current?.unsubscribe();
        request.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      teardown = close;

      const send = (event: SearchEvent) => {
        write(formatSseMessage(event));
        if (isTerminalEvent(event)) close();
      };

      subscription.current = subscribe(searchId, send);
      if (!subscription.current) {
        send({
          type: "error",
          code: "not_found",
          message: "That search isn't available any more. Start a new one.",
        });
        return;
      }

      for (const event of subscription.current.replay) {
        send(event);
        if (closed) return;
      }

      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) close();
    },
    cancel() {
      teardown?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
