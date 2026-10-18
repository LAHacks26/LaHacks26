import { beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ streamExplain: vi.fn() }));

vi.mock("@/lib/ai/explain", () => ({ streamExplain: mocks.streamExplain }));

import { AiError } from "@/lib/ai/gemini";
import { POST } from "./route";

const URL_ = "http://localhost/api/ai/explain";

function validBody() {
  return { recipe: butterChicken, target: { kind: "step", id: "s4" }, allergies: [] };
}

function post(body: unknown = validBody(), signal?: AbortSignal): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

beforeEach(() => {
  mocks.streamExplain.mockReset();
});

describe("POST /api/ai/explain", () => {
  it("streams the text with the stream headers", async () => {
    mocks.streamExplain.mockImplementation(async function* () {
      yield "Broil ";
      yield "hot.";
    });

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(await res.text()).toBe("Broil hot.");
  });

  it("answers a failure before the first chunk with a JSON error and status", async () => {
    mocks.streamExplain.mockImplementation(async function* () {
      throw new AiError("busy", "overloaded");
    });

    const res = await POST(post());

    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Saffron is busy. Try again in a moment." });
  });

  it("maps a timeout before the first chunk to 504", async () => {
    mocks.streamExplain.mockImplementation(async function* () {
      throw new AiError("slow", "timeout");
    });

    const res = await POST(post());

    expect(res.status).toBe(504);
  });

  it("errors the stream on a failure after the first chunk, so a cut-off answer is not a success", async () => {
    mocks.streamExplain.mockImplementation(async function* () {
      yield "Part one. ";
      throw new Error("socket reset");
    });

    const res = await POST(post());
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("Part one. ");
    await expect(reader.read()).rejects.toThrow("socket reset");
  });

  it("answers 499 with no body when the client leaves before the first chunk", async () => {
    const abort = new AbortController();
    mocks.streamExplain.mockImplementation(async function* () {
      abort.abort();
      throw new Error("The operation was aborted");
    });

    const res = await POST(post(validBody(), abort.signal));

    expect(res.status).toBe(499);
    expect(res.body).toBeNull();
  });

  it("rejects an invalid body with 400 and does not call the model", async () => {
    const res = await POST(post({ recipe: "nope" }));

    expect(res.status).toBe(400);
    expect(mocks.streamExplain).not.toHaveBeenCalled();
  });
});
