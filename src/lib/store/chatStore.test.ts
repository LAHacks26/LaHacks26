import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "./chatStore";
let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
describe("chat persistence", () => {
  it("restores history separately for each recipe", () => {
    const chat = useChatStore.getState(); chat.load("a"); chat.append({ role: "user", content: "Hello" });
    chat.load("b"); expect(useChatStore.getState().messages).toEqual([]);
    chat.load("a"); expect(useChatStore.getState().messages[0].content).toBe("Hello");
  });
  it("recovers from corrupt or unavailable storage", () => {
    data.set("saffron:chat:a", "invalid"); useChatStore.getState().load("a");
    expect(useChatStore.getState().messages).toEqual([]);
    vi.stubGlobal("localStorage", { getItem() { throw new Error(); }, setItem() { throw new Error(); } });
    const chat = useChatStore.getState(); chat.load("b"); chat.append({ role: "user", content: "Still works" });
    expect(useChatStore.getState().messages).toHaveLength(1);
  });
  it("deduplicates context chips and clears them on navigation", () => {
    const chat = useChatStore.getState(); chat.load("a");
    chat.attach({ kind: "step", id: "s1" }, "Step 1"); chat.attach({ kind: "step", id: "s1" }, "Step 1");
    expect(useChatStore.getState().chips).toHaveLength(1); expect(useChatStore.getState().open).toBe(true);
    chat.load("b"); expect(useChatStore.getState().chips).toEqual([]);
  });
});
