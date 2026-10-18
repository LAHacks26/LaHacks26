import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { MAX_SAVED_BODY_BYTES, assertSameOrigin, readSavedBody, savedError, savedJson } from "./http";

afterEach(() => vi.unstubAllEnvs());
const origin = "https://saffron.example";

describe("saved mutation origin guard", () => {
  it.each([null, "null", "https://evil.example", `${origin}/`, "https://saffron.example.evil.test", "http://saffron.example"])("rejects an untrusted/missing Origin: %s", (value) => {
    vi.stubEnv("APP_URL", origin);
    expect(() => assertSameOrigin(new Request(`${origin}/api/recipes`, { headers: value ? { origin: value } : {} }))).toThrow("isn't allowed");
  });
  it("rejects cross-site fetch metadata even when Origin is otherwise valid", () => {
    vi.stubEnv("APP_URL", origin);
    expect(() => assertSameOrigin(new Request(`${origin}/api/recipes`, { headers: { origin, "sec-fetch-site": "cross-site" } }))).toThrow("isn't allowed");
  });
  it.each(["", "not a URL", "http://saffron.example", "https://name:password@saffron.example"])("fails closed on unsafe production APP_URL: %s", (value) => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_URL", value);
    expect(() => assertSameOrigin(new Request(`${origin}/api/recipes`, { headers: { origin } }))).toThrow("temporarily unavailable");
  });
  it("accepts the configured origin behind a proxy without trusting forwarded hosts", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_URL", origin);
    expect(() => assertSameOrigin(new Request("http://internal:3000/api/recipes", { headers: { origin, "sec-fetch-site": "same-origin", "x-forwarded-host": "evil.example" } }))).not.toThrow();
  });
});

describe("bounded saved JSON requests", () => {
  const schema = z.object({ title: z.string() }).strict();
  const request = (body: string, headers = {}) => new Request(`${origin}/api/recipes`, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
  it("accepts validated JSON", async () => expect(await readSavedBody(request('{"title":"Dinner"}'), schema)).toEqual({ title: "Dinner" }));
  it.each(["{", "null", '{"title":42}', '{"title":"x","userId":"forged"}'])("rejects malformed or extra input %s", async (body) => {
    await expect(readSavedBody(request(body), schema)).rejects.toMatchObject({ status: 400 });
  });
  it("requires JSON content type", async () => {
    await expect(readSavedBody(request('{}', { "content-type": "text/plain" }), schema)).rejects.toMatchObject({ status: 415 });
  });
  it("rejects an oversized declared body without reading it", async () => {
    const req = request('{}', { "content-length": String(MAX_SAVED_BODY_BYTES + 1) });
    await expect(readSavedBody(req, schema)).rejects.toMatchObject({ status: 413 });
    expect(req.bodyUsed).toBe(false);
  });
  it("bounds actual chunked bytes even with a false content length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_SAVED_BODY_BYTES + 1)); }, cancel });
    const req = new Request(origin, { method: "POST", body: stream, headers: { "content-type": "application/json", "content-length": "1" }, duplex: "half" } as RequestInit);
    await expect(readSavedBody(req, schema)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("returns only generic errors and prevents caching", async () => {
    const response = savedError(new Error("DATABASE_URL=secret; private recipe payload"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/secret|DATABASE_URL|payload/);
    for (const res of [response, savedJson({ recipes: [] })]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("vary")).toBe("Cookie");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});
