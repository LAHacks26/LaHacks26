import { beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
vi.mock("server-only", () => ({}));
vi.mock("./gemini", async (original) => ({ ...await original<typeof import("./gemini")>(), generateJson: vi.fn() }));
vi.mock("./edit", () => ({ runEdit: vi.fn() }));
vi.mock("./transform", () => ({ runTransform: vi.fn() }));
import { generateJson } from "./gemini";
import { runEdit } from "./edit";
import { runTransform } from "./transform";
import { runChat } from "./chat";
const req = { recipe: butterChicken, baseVersion: 3, allergies: ["peanut"], contextRefs: [], messages: [{ role: "user" as const, content: "make it dairy-free" }] };
beforeEach(() => vi.resetAllMocks());
describe("chat intent routing", () => {
  it.each(["answer", "decline"])("returns %s without editing", async (intent) => {
    vi.mocked(generateJson).mockResolvedValue({ intent, reply: "A cooking reply." });
    expect(await runChat(req)).toEqual({ baseVersion: 3, reply: "A cooking reply." });
    expect(runEdit).not.toHaveBeenCalled(); expect(runTransform).not.toHaveBeenCalled();
  });
  it("runs whole-recipe transforms and reports the applied summary", async () => {
    vi.mocked(generateJson).mockResolvedValue({ intent: "transform", reply: "Working." });
    vi.mocked(runTransform).mockResolvedValue({ kind: "patch", summary: "Removed dairy", ops: [] });
    expect((await runChat(req)).reply).toBe("Removed dairy");
    expect(runTransform).toHaveBeenCalledWith(req);
  });
  it("preserves attached phrase context for targeted edits", async () => {
    vi.mocked(generateJson).mockResolvedValue({ intent: "targeted", reply: "Working.", targetKind: "step", targetId: "s1", instruction: "Explain pat it dry" });
    vi.mocked(runEdit).mockResolvedValue({ kind: "answer", text: "Use a towel." });
    const ref = { kind: "step" as const, id: "s1", selectedText: "pat it dry" };
    expect((await runChat({ ...req, contextRefs: [ref] })).reply).toBe("Use a towel.");
    expect(runEdit).toHaveBeenCalledWith(expect.objectContaining({ target: ref, allergies: ["peanut"] }));
  });
  it("rejects invented targets before editing", async () => {
    vi.mocked(generateJson).mockResolvedValue({ intent: "targeted", reply: "Working.", targetKind: "step", targetId: "s999", instruction: "Change it" });
    await expect(runChat(req)).rejects.toThrow("no longer available");
    expect(runEdit).not.toHaveBeenCalled();
  });
  it("returns a search alternative without a transform", async () => {
    vi.mocked(generateJson).mockResolvedValue({ intent: "impossible", reply: "Choose another dish.", suggestedSearch: "quick curry" });
    expect((await runChat(req)).result).toMatchObject({ kind: "impossible", suggestedSearch: "quick curry" });
    expect(runTransform).not.toHaveBeenCalled();
  });
});
