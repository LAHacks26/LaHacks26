import "server-only";

// ElevenLabs text-to-speech (PRD §11, sponsor track): Saffron's spoken replies in cook mode.
// Recognition stays on Chrome's Web Speech and the brain stays /api/voice/turn; only the voice
// changes. The API key never leaves the server. Docs: elevenlabs.io/docs/api-reference/text-to-speech/convert

const API_BASE = "https://api.elevenlabs.io/v1";
/** The docs' recommended real-time model (~100 ms). Flash v2.5 is a hair faster but doesn't normalize numbers ("375 degrees"). */
const MODEL_ID = "eleven_v4_turbo";
/** Small enough to arrive fast; spoken replies are one or two sentences. */
const OUTPUT_FORMAT = "mp3_44100_64";
/** "River": a stock voice tagged calm and conversational, for a calm sous-chef. Set ELEVENLABS_VOICE_ID to choose another. */
const DEFAULT_VOICE_ID = "SAz9YHcvj6GT2YYXdXww";
const TIMEOUT_MS = 15_000;
/** Recipe steps can be long; ElevenLabs allows far more, but a reply never needs it. */
export const MAX_SPEECH_CHARS = 1000;

export type SpeechFailure = "not_configured" | "rejected" | "no_credits" | "busy" | "failed";

export class ElevenLabsError extends Error {
  constructor(readonly kind: SpeechFailure, readonly status?: number) {
    super(`ElevenLabs speech failed: ${kind}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "ElevenLabsError";
  }
}

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/** Speaks `text` as MP3. Returns the upstream body to stream to the browser. Never includes the key in errors. */
export async function synthesizeSpeech(
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ElevenLabsError("not_configured");
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;

  let response: Response;
  try {
    response = await fetchImpl(
      `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: text.slice(0, MAX_SPEECH_CHARS),
          model_id: MODEL_ID,
          // A calm, steady sous-chef (PRD §5.7): a little more stable than the default 0.5.
          voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch {
    throw new ElevenLabsError("failed");
  }
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    const status = response.status;
    if (status === 401 || status === 403) throw new ElevenLabsError("rejected", status);
    if (status === 402) throw new ElevenLabsError("no_credits", status);
    if (status === 429) throw new ElevenLabsError("busy", status);
    throw new ElevenLabsError("failed", status);
  }
  return { body: response.body, contentType: response.headers.get("content-type") || "audio/mpeg" };
}
