import { z } from "zod";
import { SavedRequestError, assertSameOrigin } from "@/lib/saved/http";
import { ElevenLabsError, MAX_SPEECH_CHARS, synthesizeSpeech, type SpeechFailure } from "@/lib/voice/elevenlabs";
import { speechRateLimiter } from "@/lib/rateLimit";
import { clientKey, failure, readJsonBody } from "../../ai/shared";

// POST /api/voice/speak {text} → MP3 audio from ElevenLabs (PRD §11). The browser falls back to its
// own speech on any error, so failures are short JSON messages.

export const runtime = "nodejs";

const BodySchema = z.object({ text: z.string().trim().min(1).max(MAX_SPEECH_CHARS) });

const MESSAGES: Record<SpeechFailure, [number, string]> = {
  not_configured: [503, "ElevenLabs voice isn't set up."],
  rejected: [503, "ElevenLabs didn't accept the API key."],
  no_credits: [503, "ElevenLabs is out of credits."],
  busy: [429, "ElevenLabs is busy. Try again in a moment."],
  failed: [502, "ElevenLabs couldn't speak that."],
};

export async function POST(request: Request): Promise<Response> {
  // Same-origin only: otherwise any site could spend the ElevenLabs credits through this route.
  try {
    assertSameOrigin(request);
  } catch (err) {
    return failure(err instanceof SavedRequestError && err.status === 503 ? 503 : 403, "This request isn't allowed.");
  }
  // Off unless the ElevenLabs voice is selected, so a key left in the env can't be used otherwise.
  if (process.env.NEXT_PUBLIC_VOICE_PROVIDER !== "elevenlabs") return failure(...MESSAGES.not_configured);
  const limit = speechRateLimiter.check(clientKey(request));
  if (!limit.ok) {
    return failure(429, "Saffron has talked a lot just now. Try again in a few minutes.", { "Retry-After": String(limit.retryAfterSec) });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "That request isn't valid.");

  try {
    const speech = await synthesizeSpeech(parsed.data.text);
    return new Response(speech.body, { headers: { "Content-Type": speech.contentType, "Cache-Control": "no-store" } });
  } catch (err) {
    const kind = err instanceof ElevenLabsError ? err.kind : "failed";
    console.error("[voice] speech failed", kind, err instanceof ElevenLabsError ? err.status : undefined);
    const [status, message] = MESSAGES[kind];
    return failure(status, message);
  }
}
