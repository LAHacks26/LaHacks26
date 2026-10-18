import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES, readJsonBody } from "./shared";

vi.mock("server-only", () => ({}));

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ai/edit", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("readJsonBody", () => {
  it("parses a small JSON body", async () => {
    const result = await readJsonBody(jsonRequest('{"a":1}'));
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects invalid JSON with 400", async () => {
    const result = await readJsonBody(jsonRequest("{not json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("rejects a declared content-length over the cap with 413", async () => {
    const result = await readJsonBody(jsonRequest("{}", { "content-length": String(MAX_BODY_BYTES + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("rejects an actual body over the cap with 413 even without content-length", async () => {
    const big = JSON.stringify({ text: "x".repeat(MAX_BODY_BYTES + 10) });
    const stream = new Request("http://localhost/api/ai/edit", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(big));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    const result = await readJsonBody(stream);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
});
