import { beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/chat", () => ({ runChat: vi.fn() }));
import { runChat } from "@/lib/ai/chat";
import { POST } from "./route";
function post(extra: Record<string, unknown> = {}) {
 return new Request("http://localhost/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipe: butterChicken, baseVersion: 2, messages: [{ role: "user", content: "Help" }], allergies: [], ...extra }) });
}
beforeEach(() => vi.resetAllMocks());
describe("chat route", () => {
 it("rejects invalid history and invented context before AI", async () => {
   expect((await POST(post({ messages: [] }))).status).toBe(400);
   expect((await POST(post({ contextRefs: [{ kind: "step", id: "s999" }] }))).status).toBe(400);
   expect(runChat).not.toHaveBeenCalled();
 });
 it("passes the parsed request and returns the versioned response", async () => {
   vi.mocked(runChat).mockResolvedValue({ baseVersion: 2, reply: "Hello" });
   const response = await POST(post());
   expect(response.status).toBe(200); expect(await response.json()).toEqual({ baseVersion: 2, reply: "Hello" });
 });
});
