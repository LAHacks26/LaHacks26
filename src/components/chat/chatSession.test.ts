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
    await scope.send("Make it vegan"); expect(requestChat).not.toHaveBeenCalled();
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
