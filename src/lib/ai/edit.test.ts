import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyEditResult, normalizePatchIds, validatePatch } from "../recipe/patch";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { AiError, generateJson } from "./gemini";
import { runEdit } from "./edit";

vi.mock("server-only", () => ({}));

vi.mock("./gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gemini")>();
  return { ...actual, generateJson: vi.fn() };
});

vi.mock("../recipe/patch", () => ({
  normalizePatchIds: vi.fn(),
  validatePatch: vi.fn(),
  applyEditResult: vi.fn(),
}));

const generateJsonMock = vi.mocked(generateJson);
const normalizeMock = vi.mocked(normalizePatchIds);
const validateMock = vi.mocked(validatePatch);
const applyMock = vi.mocked(applyEditResult);

type Req = Parameters<typeof runEdit>[0];

function request(overrides: Partial<Req> = {}): Req {
  return {
    recipe: butterChicken,
    baseVersion: 3,
    target: { kind: "ingredient", id: "i9" },
    action: "substitute",
    message: "coconut milk",
    allergies: [],
    ...overrides,
  } as Req;
}

const coconutPatch = {
  kind: "patch",
  summary: "Swapped heavy cream for coconut milk",
  ops: [
    { op: "update_ingredient", id: "i9", item: "coconut milk" },
    { op: "update_step", id: "s7", text: "Stir in the coconut milk and the broiled chicken, then simmer gently for 2 minutes more." },
  ],
  meta: { times: { totalMin: 55, activeMin: 25 } },
};

/** The same swap without rewriting s7, which still says "heavy cream". */
const uncascadedPatch = { ...coconutPatch, ops: [coconutPatch.ops[0]] };

/** The prompt sent on the nth call (1-based). */
function promptOf(call: number): string {
  const args = generateJsonMock.mock.calls[call - 1]?.[0];
  return args?.prompt ?? "";
}

beforeEach(() => {
  vi.resetAllMocks();
  normalizeMock.mockImplementation((_recipe, ops) => ops);
  validateMock.mockReturnValue([]);
  applyMock.mockImplementation((recipe) => ({ recipe, touchedIds: [] }));
});

describe("runEdit: patches", () => {
  it("normalizes and validates a patch, then returns it", async () => {
    generateJsonMock.mockResolvedValueOnce(coconutPatch as never);

    const result = await runEdit(request());

    expect(result.kind).toBe("patch");
    expect(result.ops).toEqual(coconutPatch.ops);
    expect(normalizeMock).toHaveBeenCalledWith(butterChicken, coconutPatch.ops);
    expect(validateMock).toHaveBeenCalledWith(butterChicken, coconutPatch.ops);
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
  });

  it("uses the fast tier with low thinking for substitute", async () => {
    generateJsonMock.mockResolvedValueOnce(coconutPatch as never);
    await runEdit(request());
    expect(generateJsonMock.mock.calls[0]?.[0]).toMatchObject({ tier: "fast", thinkingLevel: "low" });
  });

  it("retries an invalid patch exactly once, with the validation messages attached", async () => {
    generateJsonMock.mockResolvedValueOnce(coconutPatch as never).mockResolvedValueOnce(coconutPatch as never);
    validateMock.mockReturnValueOnce(["ops[0] unknown ingredient id i99"]).mockReturnValue([]);

    const result = await runEdit(request());

    expect(result.kind).toBe("patch");
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    expect(promptOf(2)).toContain("ops[0] unknown ingredient id i99");
    expect(promptOf(1)).not.toContain("previous result was rejected");
  });

  it("throws AiError invalid when the retry is also invalid", async () => {
    generateJsonMock.mockResolvedValue(coconutPatch as never);
    validateMock.mockReturnValue(["ops[0] still broken"]);

    const error = await runEdit(request()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "invalid", message: "Couldn't apply that change. Try rephrasing." });
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
  });

  it("treats a patch that applyEditResult rejects as invalid", async () => {
    generateJsonMock.mockResolvedValue(coconutPatch as never);
    applyMock.mockImplementation(() => {
      throw new Error("bad meta");
    });

    await expect(runEdit(request())).rejects.toMatchObject({ code: "invalid" });
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a patch that adds an allergen the user listed, then retries", async () => {
    const butterPatch = {
      kind: "patch",
      summary: "Added butter",
      ops: [
        {
          op: "add_ingredient",
          after: "i8",
          ingredient: { id: "i10", qty: 1, unit: "tbsp", item: "butter", note: "", group: "", allergens: ["dairy"] },
        },
      ],
    };
    const oilPatch = {
      kind: "patch",
      summary: "Added coconut oil",
      ops: [
        {
          op: "add_ingredient",
          after: "i8",
          ingredient: { id: "i10", qty: 1, unit: "tbsp", item: "coconut oil", note: "", group: "", allergens: [] },
        },
      ],
    };
    generateJsonMock.mockResolvedValueOnce(butterPatch as never).mockResolvedValueOnce(oilPatch as never);

    const result = await runEdit(request({ allergies: ["dairy"] }));

    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    expect(promptOf(2)).toContain('which contains "dairy"');
    expect(result.ops?.[0]).toMatchObject({ op: "add_ingredient", ingredient: { item: "coconut oil" } });
  });
});

describe("runEdit: smart cascade", () => {
  it("retries once when a swap leaves a step naming the old ingredient", async () => {
    generateJsonMock.mockResolvedValueOnce(uncascadedPatch as never).mockResolvedValueOnce(coconutPatch as never);

    const result = await runEdit(request());

    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    expect(promptOf(2)).toContain('Step s7 uses i9 and still says "cream"');
    expect(result.ops).toEqual(coconutPatch.ops);
  });

  it("returns the valid but incomplete patch when the retry fails", async () => {
    generateJsonMock
      .mockResolvedValueOnce(uncascadedPatch as never)
      .mockRejectedValueOnce(new AiError("The AI request timed out. Try again.", "timeout"));

    const result = await runEdit(request());

    expect(result.kind).toBe("patch");
    expect(result.ops).toEqual(uncascadedPatch.ops);
  });

  it("returns the valid but incomplete patch when the retry is invalid", async () => {
    generateJsonMock.mockResolvedValueOnce(uncascadedPatch as never).mockResolvedValueOnce(coconutPatch as never);
    validateMock.mockReturnValueOnce([]).mockReturnValueOnce(["ops[1] unknown step id s99"]);

    const result = await runEdit(request());

    expect(result.ops).toEqual(uncascadedPatch.ops);
  });

  it("accepts an incomplete retry after a hard failure, since it passed validation", async () => {
    generateJsonMock.mockResolvedValueOnce(coconutPatch as never).mockResolvedValueOnce(uncascadedPatch as never);
    validateMock.mockReturnValueOnce(["ops[0] unknown ingredient id i99"]).mockReturnValue([]);

    const result = await runEdit(request());

    expect(result.ops).toEqual(uncascadedPatch.ops);
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
  });

  it("returns the incomplete patch without a retry when the time budget is spent", async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    generateJsonMock.mockImplementationOnce(async () => {
      now += 25_000;
      return uncascadedPatch as never;
    });

    const result = await runEdit(request());

    expect(result.ops).toEqual(uncascadedPatch.ops);
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
    clock.mockRestore();
  });

  it("accepts a still-incomplete retry instead of failing the edit", async () => {
    generateJsonMock.mockResolvedValue(uncascadedPatch as never);

    const result = await runEdit(request());

    expect(result.ops).toEqual(uncascadedPatch.ops);
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
  });
});

describe("runEdit: rejections", () => {
  const salt = { kind: "rejected", reason: "Sugar can't replace salt's seasoning role.", suggestions: ["soy sauce", "fish sauce", "miso paste"] };

  it("filters suggestions that mention an allergen, then retries when fewer than 3 remain", async () => {
    generateJsonMock.mockResolvedValueOnce(salt as never).mockResolvedValueOnce({
      kind: "rejected",
      reason: "Sugar can't replace salt's seasoning role.",
      suggestions: ["msg", "seaweed flakes", "lemon zest"],
    } as never);

    const result = await runEdit(
      request({ target: { kind: "ingredient", id: "i4" }, message: "sugar", allergies: ["soy"] }),
    );

    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    expect(promptOf(2)).toContain("were usable");
    expect(result.suggestions).toEqual(["msg", "seaweed flakes", "lemon zest"]);
  });

  it("drops a suggestion that is the target itself, and duplicates", async () => {
    generateJsonMock.mockResolvedValueOnce({
      kind: "rejected",
      reason: "Sugar can't replace salt.",
      suggestions: ["Kosher Salt", "msg", "msg", "seaweed flakes", "lemon zest"],
    } as never);

    const result = await runEdit(request({ target: { kind: "ingredient", id: "i4" }, message: "sugar" }));

    expect(result.suggestions).toEqual(["msg", "seaweed flakes", "lemon zest"]);
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
  });

  it("keeps exactly 3 suggestions when Gemini returns more", async () => {
    generateJsonMock.mockResolvedValueOnce({
      kind: "rejected",
      reason: "Sugar can't replace salt.",
      suggestions: ["msg", "seaweed flakes", "lemon zest", "celery salt"],
    } as never);

    const result = await runEdit(request({ target: { kind: "ingredient", id: "i4" }, message: "sugar" }));

    expect(result.suggestions).toHaveLength(3);
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
  });

  it("throws AiError invalid when the retry still has fewer than 3 safe suggestions", async () => {
    generateJsonMock.mockResolvedValue(salt as never);
    await expect(
      runEdit(request({ target: { kind: "ingredient", id: "i4" }, message: "sugar", allergies: ["soy", "fish"] })),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("runEdit: tips, answers and appliances", () => {
  it("forces a tip's target to the request target", async () => {
    generateJsonMock.mockResolvedValueOnce({
      kind: "tip",
      text: "Coconut milk thins the sauce, so simmer a little longer.",
      target: { kind: "step", id: "s9" },
    } as never);

    const result = await runEdit(request({ action: "ask", message: "any tips?" }));

    expect(result.kind).toBe("tip");
    expect(result.target).toEqual({ kind: "ingredient", id: "i9" });
  });

  it("passes an answer through without ops", async () => {
    generateJsonMock.mockResolvedValueOnce({ kind: "answer", text: "Coconut milk is thinner than cream." } as never);
    const result = await runEdit(request({ action: "ask", message: "is that thinner?" }));
    expect(result).toMatchObject({ kind: "answer", text: "Coconut milk is thinner than cream." });
  });

  it("uses the smart tier for missing_appliance", async () => {
    generateJsonMock.mockResolvedValueOnce({ kind: "answer", text: "Ok." } as never);
    await runEdit(
      request({ target: { kind: "appliance", id: "a2" }, action: "missing_appliance", message: undefined }),
    );
    expect(generateJsonMock.mock.calls[0]?.[0]).toMatchObject({ tier: "smart", thinkingLevel: "low" });
    expect(promptOf(1)).toContain("Blender");
  });
});
