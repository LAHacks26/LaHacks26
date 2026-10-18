import { afterEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { requestChat } from "./chatClient";
import { requestEdit } from "./aiClient";
const req = { recipe: butterChicken, baseVersion: 0, messages: [{ role: "user" as const, content: "Help" }], allergies: [] };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("AI client budgets", () => {
 it("validates chat responses", async () => {
   vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ reply: "No version" })));
   await expect(requestChat(req)).rejects.toMatchObject({ reason: "invalid" });
 });
 it.each(["chat", "appliance"])("allows %s requests past 30 seconds but still times out", async (kind) => {
   vi.useFakeTimers(); let signal: AbortSignal | undefined;
   vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => {
     signal = init.signal!;
     return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("Aborted"))));
   }));
   const pending = kind === "chat" ? requestChat(req) : requestEdit({ recipe: butterChicken, baseVersion: 0, action: "missing_appliance", target: { kind: "appliance", id: "a1" }, allergies: [] });
   const assertion = expect(pending).rejects.toMatchObject({ reason: "timeout" });
   await vi.advanceTimersByTimeAsync(30_001); expect(signal?.aborted).toBe(false);
   await vi.advanceTimersByTimeAsync(45_000); await assertion;
 });
});
