import { afterEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { savedClient, SaveError } from "./savedClient";

const id = "11111111-1111-4111-8111-111111111111";
const payload = { copy: { recipe: butterChicken, version: 0, undoStack: [] }, messages: [] };
const document = { id, ...payload, updatedAt: "2026-10-18T00:00:00.123456Z", shareSlug: null };
afterEach(() => { vi.unstubAllGlobals(); });

describe("saved recipe HTTP client", () => {
  it("holds the browser identity lock through the entire first response before another creation", async () => {
    let queue: Promise<unknown> = Promise.resolve();
    const locks = { request: vi.fn((_name: string, _options: unknown, run: () => Promise<unknown>) => {
      const next = queue.then(run); queue = next.catch(() => {}); return next;
    }) };
    vi.stubGlobal("navigator", { locks });
    let finish!: (value: unknown) => void;
    const firstBody = new Promise((resolve) => { finish = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: () => firstBody }).mockResolvedValueOnce(Response.json(document));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const first = savedClient.create(payload, signal);
    const second = savedClient.create(payload, signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    finish(document);
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(locks.request.mock.calls.map(([name]) => name)).toEqual(["saffron:device-mutation", "saffron:device-mutation"]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", method: "POST" });
  });
  it("explains unsupported identity locking without creating an inaccessible save", async () => {
    vi.stubGlobal("navigator", {});
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(savedClient.create(payload, new AbortController().signal)).rejects.toThrow("HTTPS or localhost");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves conflict status and the full timestamp token for autosave recovery", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: "Changed in another tab" }, { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(savedClient.update(id, { ...payload, expectedUpdatedAt: document.updatedAt }, new AbortController().signal))
      .rejects.toEqual(new SaveError("Changed in another tab", 409));
    expect(JSON.parse(fetch.mock.calls[0][1].body).expectedUpdatedAt).toBe(document.updatedAt);
  });
  it("fresh owner reads include cookies and bypass the HTTP cache", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(document)); vi.stubGlobal("fetch", fetch);
    expect(await savedClient.get(id, new AbortController().signal)).toEqual(document);
    expect(fetch.mock.calls[0]).toEqual([`/api/recipes/${id}`, expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", body: undefined })]);
  });
});
