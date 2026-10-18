import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";

function speak(body: unknown, headers: Record<string, string> = { origin: ORIGIN }) {
  return POST(
    new Request(`${ORIGIN}/api/voice/speak`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", "x-real-ip": `test-${Math.random()}`, ...headers },
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("APP_URL", ORIGIN);
  vi.stubEnv("ELEVENLABS_API_KEY", "sk_test");
  vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "elevenlabs");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/voice/speak", () => {
  it("streams ElevenLabs audio back to the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } })));
    const response = await speak({ text: "Step 2. Melt the butter." });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("only serves this site, so other sites can't spend the credits", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await speak({ text: "hi" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await speak({ text: "hi" }, { origin: ORIGIN, "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await speak({ text: "hi" }, {})).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("stays off unless the ElevenLabs voice is selected, even with a key set", async () => {
    vi.stubEnv("NEXT_PUBLIC_VOICE_PROVIDER", "webspeech");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await speak({ text: "hi" });
    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("has its own, tighter rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } })));
    const headers = { origin: ORIGIN, "x-real-ip": "same-client" };
    const statuses: number[] = [];
    for (let i = 0; i < 41; i++) statuses.push((await speak({ text: "hi" }, headers)).status);
    expect(statuses.slice(0, 40).every((status) => status === 200)).toBe(true);
    expect(statuses[40]).toBe(429);
  });

  it("rejects empty, oversized and non-JSON bodies", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await speak({ text: "   " })).status).toBe(400);
    expect((await speak({ text: "x".repeat(1001) })).status).toBe(400);
    expect((await speak("not json")).status).toBe(400);
  });

  it("explains configuration and credit problems, so the page can fall back to the browser voice", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const notSetUp = await speak({ text: "hi" });
    expect(notSetUp.status).toBe(503);
    expect((await notSetUp.json()).error).toBe("ElevenLabs voice isn't set up.");

    vi.stubEnv("ELEVENLABS_API_KEY", "sk_test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 402 })));
    const noCredits = await speak({ text: "hi" });
    expect(noCredits.status).toBe(503);
    expect((await noCredits.json()).error).toBe("ElevenLabs is out of credits.");
    expect(console.error).toHaveBeenCalledWith("[voice] speech failed", "no_credits", 402);
  });
});
