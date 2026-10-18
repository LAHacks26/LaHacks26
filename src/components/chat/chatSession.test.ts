import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import { useRecipeStore } from "@/lib/store/recipeStore";
import { useChatStore } from "@/lib/store/chatStore";
import { requestChat } from "@/lib/api/chatClient";
import { createChatSession } from "./chatSession";
vi.mock("@/lib/api/chatClient", () => ({ requestChat: vi.fn() }));
const scopes: ReturnType<typeof createChatSession>[] = [];
const patch = { kind: "patch" as const, ops: [{ op: "update_step" as const, id: "s1", text: "Chop carefully." }], summary: "Updated chopping" };
function open(key = "a") {
  useRecipeStore.getState().load(key, structuredClone(butterChicken));
  useChatStore.getState().load(key);
  const scope = createChatSession(key); scopes.push(scope); return scope;
}
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("localStorage", undefined); });
afterEach(() => { scopes.splice(0).forEach((scope) => scope.dispose()); vi.unstubAllGlobals(); });
describe("chat request lifecycle", () => {
  it("applies one patch and supports undo only at its version", async () => {
    const scope = open();
    vi.mocked(requestChat).mockResolvedValue({ baseVersion: 0, reply: "Done.", result: patch });
    await scope.send("Chop carefully");
    expect(useRecipeStore.getState().copy?.version).toBe(1);
    const id = useChatStore.getState().messages.at(-1)!.id;
    expect(scope.undo(id)).toBe(true); expect(scope.undo(id)).toBe(false);
    expect(useRecipeStore.getState().copy?.recipe).toEqual(butterChicken);
    expect(useRecipeStore.getState().editing).toBeNull();
  });
  it("ignores delayed replies after A to B to A navigation", async () => {
    const scope = open();
    let resolve!: (value: Awaited<ReturnType<typeof requestChat>>) => void;
    vi.mocked(requestChat).mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = scope.send("Change it");
    open("b"); open("a");
    useRecipeStore.getState().setEditing({ kind: "step", id: "s1" });
    const lock = useRecipeStore.getState().editing;
    resolve({ baseVersion: 0, reply: "Done", result: patch }); await pending;
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useRecipeStore.getState().copy?.version).toBe(0);
    expect(useRecipeStore.getState().editing).toBe(lock);
  });
  it("retries a stale reply once with the latest canonical recipe", async () => {
    const scope = open();
    vi.mocked(requestChat).mockImplementationOnce(async () => {
      const copy = useRecipeStore.getState().copy!;
      useRecipeStore.setState({ copy: { ...copy, version: 1 } });
      return { baseVersion: 0, reply: "Old answer" };
    }).mockResolvedValueOnce({ baseVersion: 1, reply: "Current answer" });
    await scope.send("What next?");
    expect(requestChat).toHaveBeenCalledTimes(2);
    expect(useChatStore.getState().messages.at(-1)?.content).toBe("Current answer");
  });
  it("does not compete with an existing line edit", async () => {
    const scope = open(); useRecipeStore.getState().setEditing({ kind: "step", id: "s1" });
    expect(await scope.send("Make it vegan")).toEqual({ ok: false, reason: "busy" });
    expect(requestChat).not.toHaveBeenCalled();
  });
  it("releases busy when disposed mid-send while the recipe stays open (End cooking during a voice edit)", async () => {
    const scope = open();
    const other = createChatSession("a"); scopes.push(other);
    let resolve!: (value: Awaited<ReturnType<typeof requestChat>>) => void;
    vi.mocked(requestChat).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = scope.send("I'm out of butter");
    expect(useChatStore.getState().busy).toBe(true);
    scope.dispose();
    resolve({ baseVersion: 0, reply: "Done", result: patch });
    expect(await pending).toEqual({ ok: false, reason: "gone" });
    expect(useChatStore.getState().busy).toBe(false);
    expect(useRecipeStore.getState().editing).toBeNull();
    vi.mocked(requestChat).mockResolvedValueOnce({ baseVersion: 0, reply: "Sure." });
    expect(await other.send("What next?")).toMatchObject({ ok: true });
  });
  it("does not clear a newer send's busy state after A to B to A", async () => {
    const scope = open();
    let resolveOld!: (value: Awaited<ReturnType<typeof requestChat>>) => void;
    vi.mocked(requestChat).mockReturnValueOnce(new Promise((done) => { resolveOld = done; }));
    const old = scope.send("First");
    open("b"); const again = open("a");
    vi.mocked(requestChat).mockReturnValueOnce(new Promise(() => {}));
    void again.send("Second");
    expect(useChatStore.getState().busy).toBe(true);
    resolveOld({ baseVersion: 0, reply: "Late" }); await old;
    expect(useChatStore.getState().busy).toBe(true);
  });
  it("reports what happened, so voice can say it", async () => {
    const scope = open();
    vi.mocked(requestChat).mockResolvedValueOnce({ baseVersion: 0, reply: "Done.", result: patch }).mockResolvedValueOnce({ baseVersion: 1, reply: "Fold gently." }).mockRejectedValueOnce(new Error("Offline"));
    expect(await scope.send("Chop carefully")).toEqual({ ok: true, reply: "Done.", summary: "Updated chopping" });
    expect(await scope.send("What does fold mean?")).toEqual({ ok: true, reply: "Fold gently.", summary: undefined });
    expect(await scope.send("Help")).toEqual({ ok: false, reason: "failed" });
    expect(await scope.send("   ")).toEqual({ ok: false, reason: "gone" });
  });
  it("shows a retryable error and releases only its own lock", async () => {
    const scope = open(); vi.mocked(requestChat).mockRejectedValueOnce(new Error("Offline"));
    await scope.send("Help");
    expect(useChatStore.getState().error).toBe("Offline");
    expect(useRecipeStore.getState().editing).toBeNull();
    vi.mocked(requestChat).mockResolvedValueOnce({ baseVersion: 0, reply: "Here to help" });
    await scope.send("Help", true);
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().error).toBeNull();
  });
});
