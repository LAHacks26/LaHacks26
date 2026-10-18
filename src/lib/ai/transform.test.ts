import { beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
vi.mock("server-only", () => ({}));
vi.mock("./gemini", async (original) => ({ ...await original<typeof import("./gemini")>(), generateJson: vi.fn() }));
import { generateJson } from "./gemini";
import { runTransform } from "./transform";
const req = { recipe: butterChicken, baseVersion: 0, allergies: ["peanut"], contextRefs: [], messages: [{ role: "user" as const, content: "make it dairy-free" }] };
beforeEach(() => vi.resetAllMocks());
describe("whole recipe validation", () => {
  it("uses smart reasoning and validates a real patch", async () => {
    vi.mocked(generateJson).mockResolvedValue({ kind: "patch", summary: "Use coconut", ops: [{ op: "update_ingredient", id: "i9", item: "coconut milk" }] });
    expect((await runTransform(req)).kind).toBe("patch");
    expect(generateJson).toHaveBeenCalledWith(expect.objectContaining({ tier: "smart", thinkingLevel: "medium" }));
  });
  it("rejects allergen introduction after one correction attempt", async () => {
    vi.mocked(generateJson).mockResolvedValue({ kind: "patch", ops: [{ op: "update_ingredient", id: "i9", item: "peanut butter" }] });
    await expect(runTransform(req)).rejects.toThrow("Couldn't apply");
    expect(generateJson).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid IDs and untargeted tips", async () => {
    vi.mocked(generateJson).mockResolvedValueOnce({ kind: "patch", ops: [{ op: "update_step", id: "s999", text: "Stir" }] }).mockResolvedValueOnce({ kind: "tip", text: "Stir gently", target: { kind: "step", id: "s1" } });
    await expect(runTransform(req)).rejects.toThrow("Couldn't apply");
  });
});
