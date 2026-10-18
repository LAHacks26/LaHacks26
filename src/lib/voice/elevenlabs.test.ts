import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsError, synthesizeSpeech } from "./elevenlabs";

vi.mock("server-only", () => ({}));

const KEY = "sk_test_elevenlabs_key";

function audioResponse(status = 200) {
  return new Response(status === 200 ? new Uint8Array([0xff, 0xf3, 1, 2]) : JSON.stringify({ detail: { code: "x", message: `bad key ${KEY}` } }), {
    status,
    headers: { "content-type": status === 200 ? "audio/mpeg" : "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("ELEVENLABS_API_KEY", KEY);
  vi.stubEnv("ELEVENLABS_VOICE_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("synthesizeSpeech", () => {
  it("asks ElevenLabs for low-latency MP3 with the key in the xi-api-key header", async () => {
    const fetchImpl = vi.fn(async () => audioResponse());
    const speech = await synthesizeSpeech("Step 2. Melt the butter.", fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/SAz9YHcvj6GT2YYXdXww?output_format=mp3_44100_64");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    expect(JSON.parse(String(init.body))).toMatchObject({ text: "Step 2. Melt the butter.", model_id: "eleven_v4_turbo" });
    expect(speech.contentType).toBe("audio/mpeg");
    expect(new Uint8Array(await new Response(speech.body).arrayBuffer())).toEqual(new Uint8Array([0xff, 0xf3, 1, 2]));
  });

  it("uses ELEVENLABS_VOICE_ID when set", async () => {
    vi.stubEnv("ELEVENLABS_VOICE_ID", " voice123 ");
    const fetchImpl = vi.fn(async () => audioResponse());
    await synthesizeSpeech("Hi", fetchImpl as unknown as typeof fetch);
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toContain("/text-to-speech/voice123?");
  });

  it("maps failures to kinds without leaking the key or the response body", async () => {
    const cases: [number, string][] = [[401, "rejected"], [403, "rejected"], [402, "no_credits"], [429, "busy"], [500, "failed"]];
    for (const [status, kind] of cases) {
      const error = await synthesizeSpeech("Hi", (async () => audioResponse(status)) as unknown as typeof fetch).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ElevenLabsError);
      expect(error).toMatchObject({ kind, status });
      expect((error as Error).message).not.toContain(KEY);
    }
    const network = await synthesizeSpeech("Hi", (async () => { throw new Error(`socket ${KEY}`); }) as unknown as typeof fetch).catch((e: unknown) => e);
    expect(network).toMatchObject({ kind: "failed" });
    expect((network as Error).message).not.toContain(KEY);
  });

  it("refuses to call ElevenLabs without a key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(synthesizeSpeech("Hi", fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ kind: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
