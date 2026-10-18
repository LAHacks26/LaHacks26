import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLERGIES_KEY, readAllergies, writeAllergies } from "@/lib/allergies";
import { KitchenSession } from "./kitchenSession";

const fetchMock = vi.fn<typeof fetch>();
let sessions: KitchenSession[];
let stored: Map<string, string>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function startSession() {
  const session = new KitchenSession();
  sessions.push(session);
  session.start();
  return session;
}

function putCalls() {
  return fetchMock.mock.calls.filter(([path]) => path === "/api/me/allergies");
}

beforeEach(() => {
  sessions = [];
  stored = new Map();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", {
    locks: { request: vi.fn((_name: string, _options: unknown, run: () => Promise<unknown>) => run()) },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  writeAllergies([]);
  stored.clear();
});

afterEach(() => {
  sessions.forEach((session) => session.stop());
  vi.useRealTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  writeAllergies([]);
  vi.unstubAllGlobals();
});

describe("kitchen loading and allergy synchronization", () => {
  it("merges local and server allergies on first load and persists the merged list", async () => {
    stored.set(ALLERGIES_KEY, '[" Dairy "]');
    const recipe = { id: "saved-1", title: "Soup", totalMin: 20, updatedAt: "2026-10-18T12:00:00Z", shareSlug: null };
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [recipe], allergies: ["soy"] }));
    fetchMock.mockResolvedValueOnce(Response.json({ allergies: ["dairy", "soy"] }));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("synced"));
    expect(session.getSnapshot().recipes).toEqual([recipe]);
    expect(readAllergies()).toEqual(["dairy", "soy"]);
    expect(JSON.parse(putCalls()[0][1]!.body as string)).toEqual({ allergies: ["dairy", "soy"] });
    expect(putCalls()[0][1]).toMatchObject({ method: "PUT", credentials: "same-origin", cache: "no-store" });
    expect(navigator.locks.request).toHaveBeenCalledOnce();
    expect(navigator.locks.request).toHaveBeenCalledWith("saffron:device-mutation", expect.objectContaining({ mode: "exclusive" }), expect.any(Function));
  });

  it("does not create an anonymous identity just to display an empty kitchen", async () => {
    fetchMock.mockResolvedValue(Response.json({ recipes: [], allergies: [] }));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("ready"));
    expect(session.getSnapshot().recipes).toEqual([]);
    expect(putCalls()).toHaveLength(0);
  });

  it("preserves edits made while the initial GET is still pending", async () => {
    const initial = deferred<Response>();
    fetchMock.mockReturnValueOnce(initial.promise);
    fetchMock.mockResolvedValueOnce(Response.json({ allergies: ["sesame"] }));
    const session = startSession();
    session.saveAllergies(["sesame"]);
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("synced"));
    initial.resolve(Response.json({ recipes: [], allergies: ["dairy"] }));
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("ready"));
    expect(session.getSnapshot().allergies).toEqual(["sesame"]);
    expect(readAllergies()).toEqual(["sesame"]);
  });

  it("serializes rapid edits and never replaces the latest edit with an older PUT response", async () => {
    const first = deferred<Response>();
    const latest = deferred<Response>();
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: [] }));
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("ready"));
    session.saveAllergies(["soy"]);
    session.saveAllergies(["sesame"]);
    expect(putCalls()).toHaveLength(1);
    expect(readAllergies()).toEqual(["sesame"]);
    first.resolve(Response.json({ allergies: ["soy"] }));
    await vi.waitFor(() => expect(putCalls()).toHaveLength(2));
    expect(session.getSnapshot().syncStatus).toBe("syncing");
    expect(session.getSnapshot().allergies).toEqual(["sesame"]);
    latest.resolve(Response.json({ allergies: ["sesame"] }));
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("synced"));
    expect(JSON.parse(putCalls()[1][1]!.body as string)).toEqual({ allergies: ["sesame"] });
  });

  it("keeps local changes when sync fails and retries the saved choices", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: [] }));
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    fetchMock.mockResolvedValueOnce(Response.json({ allergies: ["egg"] }));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("ready"));
    session.saveAllergies([" Egg ", "egg", ""]);
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("error"));
    expect(session.getSnapshot().localPersisted).toBe(true);
    expect(readAllergies()).toEqual(["egg"]);
    expect(session.getSnapshot().syncError).toContain("connection");
    session.retrySync();
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("synced"));
    expect(JSON.parse(putCalls()[1][1]!.body as string)).toEqual({ allergies: ["egg"] });
  });

  it("does not accept a mismatched success response as confirmation or overwrite local choices", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: [] }));
    fetchMock.mockResolvedValueOnce(Response.json({ allergies: ["dairy"] }));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("ready"));
    session.saveAllergies(["soy"]);
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("error"));
    expect(readAllergies()).toEqual(["soy"]);
    expect(session.getSnapshot().syncError).toContain("confirm");
  });

  it("does not present a failed list request as an empty kitchen and can retry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }));
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: [] }));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("error"));
    expect(session.getSnapshot().recipes).toBeNull();
    await session.load();
    expect(session.getSnapshot().loadStatus).toBe("ready");
    expect(session.getSnapshot().recipes).toEqual([]);
  });

  it("keeps edited allergies through a later list retry instead of reintroducing old server values", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    fetchMock.mockResolvedValueOnce(Response.json({ allergies: ["soy"] }));
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: ["dairy"] }));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("error"));
    session.saveAllergies(["soy"]);
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("synced"));
    await session.load();
    expect(session.getSnapshot().allergies).toEqual(["soy"]);
  });

  it("aborts on unmount and ignores late list and sync responses", async () => {
    const initial = deferred<Response>();
    const save = deferred<Response>();
    fetchMock.mockReturnValueOnce(initial.promise).mockReturnValueOnce(save.promise);
    const session = startSession();
    session.saveAllergies(["egg"]);
    const snapshot = session.getSnapshot();
    session.stop();
    expect(fetchMock.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
    initial.resolve(Response.json({ recipes: [], allergies: ["soy"] }));
    save.resolve(Response.json({ allergies: ["egg"] }));
    await new Promise((done) => setTimeout(done, 0));
    expect(session.getSnapshot()).toBe(snapshot);
    expect(readAllergies()).toEqual(["egg"]);
  });

  it("isolates a restarted session from the previous mount's response", async () => {
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise);
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: ["soy"] }));
    const session = startSession();
    session.stop();
    session.start();
    await vi.waitFor(() => expect(session.getSnapshot().allergies).toEqual(["soy"]));
    old.resolve(Response.json({ recipes: [], allergies: ["dairy"] }));
    await new Promise((done) => setTimeout(done, 0));
    expect(session.getSnapshot().allergies).toEqual(["soy"]);
  });

  it("times out a hanging request and leaves loading state", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const session = startSession();
    await vi.advanceTimersByTimeAsync(15_001);
    expect(session.getSnapshot().loadStatus).toBe("error");
    expect(session.getSnapshot().loadError).toContain("too long");
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("reports storage failure while preserving choices in the current tab", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: [] }));
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("ready"));
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("quota"); } });
    session.saveAllergies(["egg"]);
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("error"));
    expect(session.getSnapshot().localPersisted).toBe(false);
    expect(readAllergies()).toEqual(["egg"]);
  });

  it("retains local settings when the browser cannot safely establish an identity", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ recipes: [], allergies: [] }));
    const session = startSession();
    await vi.waitFor(() => expect(session.getSnapshot().loadStatus).toBe("ready"));
    vi.stubGlobal("navigator", {});
    session.saveAllergies(["soy"]);
    await vi.waitFor(() => expect(session.getSnapshot().syncStatus).toBe("error"));
    expect(readAllergies()).toEqual(["soy"]);
    expect(session.getSnapshot().syncError).toContain("HTTPS");
    expect(putCalls()).toHaveLength(0);
  });
});
