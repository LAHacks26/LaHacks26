// Saffron's spoken output (PRD §11). With NEXT_PUBLIC_VOICE_PROVIDER=elevenlabs, replies are spoken by
// ElevenLabs through POST /api/voice/speak; on any failure, and otherwise, the browser's own voice.
// speakText resolves when speech ends, fails or is aborted, so callers can listen again after it.

/** Upper bound on waiting for audio to end, in case a browser never fires `ended`. 1000 characters is ~70 s. */
const MAX_AUDIO_MS = 90_000;
/** /api/voice/speak's limit. Longer text is clipped rather than refused (and spoken by the browser). */
const MAX_SPEECH_CHARS = 1000;

export function elevenLabsVoiceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_PROVIDER === "elevenlabs";
}

export async function speakText(text: string, signal?: AbortSignal): Promise<void> {
  if (!text.trim() || signal?.aborted) return;
  if (elevenLabsVoiceEnabled()) {
    try {
      await playElevenLabs(text, signal);
      return;
    } catch {
      if (signal?.aborted) return;
      // Fall back to the browser voice: a missing key, no credits or a network blip shouldn't silence Saffron.
    }
  }
  await speakWithBrowser(text, signal);
}

async function playElevenLabs(text: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, MAX_SPEECH_CHARS) }),
    signal,
  });
  if (!response.ok) throw new Error(`speech request failed: ${response.status}`);
  const blob = await response.blob();
  // An abort that lands while the body downloads would otherwise start playback with no listener.
  if (signal?.aborted) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      // Stopping, not just giving up: audio left playing would be heard by the re-armed wake word.
      const guard = setTimeout(onAbort, MAX_AUDIO_MS);
      function finish() {
        clearTimeout(guard);
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }
      function onAbort() {
        audio.pause();
        finish();
      }
      audio.onended = finish;
      audio.onerror = () => {
        clearTimeout(guard);
        signal?.removeEventListener("abort", onAbort);
        reject(new Error("audio playback failed"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      audio.play().catch((error: unknown) => {
        clearTimeout(guard);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function speakWithBrowser(text: string, signal?: AbortSignal): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return Promise.resolve();
  }
  const synth = window.speechSynthesis;
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    // Some browsers never fire onend (no voices, background tab), so a timer bounds the wait.
    const guard = setTimeout(finish, Math.min(30_000, 1500 + text.length * 90));
    function finish() {
      clearTimeout(guard);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      synth.cancel();
      finish();
    }
    utterance.onend = finish;
    utterance.onerror = finish;
    signal?.addEventListener("abort", onAbort, { once: true });
    // cancel() right before speak() can swallow the utterance in some Chrome builds; only clear real leftovers.
    if (synth.speaking || synth.pending) synth.cancel();
    synth.speak(utterance);
  });
}
