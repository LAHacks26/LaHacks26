import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speakText } from "./speech";

// Browser doubles: an <audio> element that "plays" until told to end, and speechSynthesis.
class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const synth = { speak: vi.fn(), cancel: vi.fn(), speaking: false, pending: false };

beforeEach(() => {
  FakeAudio.instances = [];
  synth.speak.mockReset().mockImplementation((utterance: { onend: () => void }) => setTimeout(() => utterance.onend(), 0));
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function audioFetch(status = 200) {
  return vi.fn(async () => new Response(status === 200 ? new Blob([new Uint8Array([1, 2])], { type: "audio/mpeg" }) : "{}", { status }));
}

describe("speakText", () => {
  it("uses the browser voice when ElevenLabs isn't selected", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "webspeech");
    const fetchMock = audioFetch();
    vi.stubGlobal("fetch", fetchMock);
    await speakText("Step 2. Melt the butter.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("plays ElevenLabs audio and resolves when it ends", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    const fetchMock = audioFetch();
    vi.stubGlobal("fetch", fetchMock);

    const done = speakText("Step 2. Melt the butter.");
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    let resolved = false;
    void done.then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);
    FakeAudio.instances[0]!.onended?.();
    await done;

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/voice/speak");
    expect(JSON.parse(String(init.body))).toEqual({ text: "Step 2. Melt the butter." });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("falls back to the browser voice when ElevenLabs fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    vi.stubGlobal("fetch", audioFetch(503));
    await speakText("Your rice timer is done.");
    expect(FakeAudio.instances).toHaveLength(0);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("stops the audio when aborted, without falling back", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    vi.stubGlobal("fetch", audioFetch());
    const controller = new AbortController();
    const done = speakText("A long step to read aloud.", controller.signal);
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    controller.abort();
    await done;
    expect(FakeAudio.instances[0]!.paused).toBe(true);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("falls back to the browser voice when autoplay is blocked", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    vi.stubGlobal("fetch", audioFetch());
    const play = vi.spyOn(FakeAudio.prototype, "play").mockRejectedValueOnce(new Error("NotAllowedError"));
    await speakText("Step 2.");
    expect(play).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("stops audio that never reports ending, and frees its URL", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    vi.stubGlobal("fetch", audioFetch());
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const done = speakText("Step 2.");
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(90_000);
    await done;
    expect(FakeAudio.instances[0]!.paused).toBe(true);
    expect(revoke).toHaveBeenCalledWith(FakeAudio.instances[0]!.src);
    vi.useRealTimers();
  });

  it("doesn't start playback if cancelled while the audio downloads", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      const response = new Response(new Blob([new Uint8Array([1])], { type: "audio/mpeg" }));
      const blob = response.blob.bind(response);
      response.blob = async () => {
        const result = await blob();
        controller.abort();
        return result;
      };
      return response;
    }));
    await speakText("Step 2.", controller.signal);
    expect(FakeAudio.instances).toHaveLength(0);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("clips long text to the route's limit", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    const fetchMock = audioFetch();
    vi.stubGlobal("fetch", fetchMock);
    const done = speakText("x".repeat(1500));
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    FakeAudio.instances[0]!.onended?.();
    await done;
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).text).toHaveLength(1000);
  });

  it("does nothing for empty text", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
    const fetchMock = audioFetch();
    vi.stubGlobal("fetch", fetchMock);
    await speakText("   ");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
  });
});
