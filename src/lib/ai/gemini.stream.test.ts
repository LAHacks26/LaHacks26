import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The SDK client is replaced, so each test controls the stream it gets back.
const mocks = vi.hoisted(() => ({ stream: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContentStream: mocks.stream };
  },
  ThinkingLevel: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
}));

import { AiError, streamText } from "./gemini";

const PRIMARY = "gemini-3.6-flash";
const FALLBACK = "gemini-3.5-flash";

const savedEnv = { ...process.env };

beforeAll(() => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_FAST_MODEL;
  delete process.env.GEMINI_FALLBACK_MODEL;
});

afterAll(() => {
  process.env = savedEnv;
});

beforeEach(() => {
  mocks.stream.mockReset();
});

/** A stream that yields each text, or throws each Error in order. */
async function* parts(items: Array<string | Error>): AsyncGenerator<{ text: string }> {
  for (const item of items) {
    if (item instanceof Error) throw item;
    yield { text: item };
  }
}

async function* hangingStream(): AsyncGenerator<{ text: string }> {
  await new Promise(() => {});
  yield { text: "never" };
}

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

const base = { system: "be brief", prompt: "hello", tier: "fast" as const };

describe("streamText", () => {
  it("yields the chunks in order from the primary model", async () => {
    mocks.stream.mockResolvedValueOnce(parts(["Hel", "lo"]));

    expect(await collect(streamText(base))).toEqual(["Hel", "lo"]);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0]?.[0]).toMatchObject({ model: PRIMARY });
  });

  it("falls back to the fallback model when the primary is overloaded before its first chunk", async () => {
    mocks.stream.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(parts(["ok"]));

    expect(await collect(streamText(base))).toEqual(["ok"]);
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    expect(mocks.stream.mock.calls[1]?.[0]).toMatchObject({ model: FALLBACK });
  });

  it("does not fall back once a chunk has been yielded", async () => {
    mocks.stream.mockResolvedValueOnce(parts(["partial", httpError(503)]));

    const error = await collect(streamText(base)).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "overloaded" });
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it("does not fall back on a non-overload error", async () => {
    mocks.stream.mockRejectedValueOnce(httpError(400));

    const error = await collect(streamText(base)).catch((err: unknown) => err);

    expect(error).toMatchObject({ code: "failed" });
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it("reports overloaded when the fallback is overloaded too", async () => {
    mocks.stream.mockRejectedValue(httpError(503));

    const error = await collect(streamText(base)).catch((err: unknown) => err);

    expect(error).toMatchObject({ code: "overloaded" });
    expect(mocks.stream).toHaveBeenCalledTimes(2);
  });

  it("times out when the stream never produces a chunk", async () => {
    mocks.stream.mockResolvedValueOnce(hangingStream());

    const error = await collect(streamText({ ...base, timeoutMs: 30 })).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "timeout" });
  });
});
