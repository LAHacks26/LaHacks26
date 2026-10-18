import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../saved/testDb";

const mocks = vi.hoisted(() => ({ db: null as unknown, token: undefined as string | undefined, cookieNames: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDb: () => mocks.db }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => { mocks.cookieNames.push(name); return mocks.token ? { value: mocks.token } : undefined; } }) }));

import { anonymousSubject, attachViewerCookie, getOrCreateViewer, getViewer } from "./viewer";

const token = "822c3525-c592-4f19-8dc7-c88b171b978e";
const userId = "11111111-1111-4111-8111-111111111111";
let driver: ReturnType<typeof testDb>;
beforeEach(() => { driver = testDb(); mocks.db = driver.db; mocks.token = undefined; mocks.cookieNames = []; });
afterEach(() => vi.unstubAllEnvs());

describe("anonymous device identity", () => {
  it("only accepts the protected production cookie name, with no unprefixed fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await getViewer()).toBeNull();
    expect(mocks.cookieNames).toEqual(["__Host-saffron_uid"]);
    expect(driver.calls).toHaveLength(0);
  });
  it.each([undefined, "not-a-uuid", "11111111-1111-1111-8111-111111111111", `${token}; extra=1`])("ignores missing or invalid cookies without DB writes: %s", async (value) => {
    mocks.token = value;
    expect(await getViewer()).toBeNull();
    expect(driver.calls).toHaveLength(0);
  });

  it("looks up a bearer digest and only exposes a minimal server-side viewer", async () => {
    mocks.token = token;
    driver.replies.push([[userId, ["dairy"]]]);
    expect(await getViewer()).toEqual({ id: userId, allergies: ["dairy"] });
    expect(driver.calls[0].params).toContain(`anon:${createHash("sha256").update(token).digest("hex")}`);
    expect(JSON.stringify(driver.calls)).not.toContain(token);
    expect(driver.calls[0].sql).toContain('"users"."google_sub" =');
  });

  it("ignores an unknown valid bearer on a read, without creating identity", async () => {
    mocks.token = token;
    driver.replies.push([]);
    expect(await getViewer()).toBeNull();
    expect(driver.calls).toHaveLength(1);
    expect(driver.calls[0].sql).toMatch(/^select /);
  });

  it("generates a different server token for an unknown supplied bearer", async () => {
    mocks.token = token;
    driver.replies.push([], [[userId, []]]);
    const identity = await getOrCreateViewer();
    expect(identity.newToken).toMatch(/^[a-f0-9-]{14}4[a-f0-9-]{21}$/);
    expect(identity.newToken).not.toBe(token);
    expect(driver.calls[1].params).toContain(anonymousSubject(identity.newToken!));
    expect(driver.calls[1].params).not.toContain(anonymousSubject(token));
    expect(JSON.stringify(driver.calls)).not.toContain(identity.newToken);
  });

  it("reuses an existing viewer without inserting or rotating cookies", async () => {
    mocks.token = token;
    driver.replies.push([[userId, []]]);
    const identity = await getOrCreateViewer();
    expect(identity).toEqual({ viewer: { id: userId, allergies: [] } });
    expect(attachViewerCookie(NextResponse.json({}), identity).headers.has("set-cookie")).toBe(false);
    expect(driver.calls).toHaveLength(1);
  });

  it.each(["production", "development"])("sets a persistent host-only HttpOnly SameSite=Lax cookie in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const response = attachViewerCookie(NextResponse.json({}), { viewer: { id: userId, allergies: [] }, newToken: token });
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie.startsWith(`${environment === "production" ? "__Host-saffron_uid" : "saffron_uid"}=${token};`)).toBe(true);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).not.toMatch(/Domain=/i);
    expect(/; Secure/i.test(cookie)).toBe(environment === "production");
    expect(JSON.stringify(response.body)).not.toContain(token);
  });
});
