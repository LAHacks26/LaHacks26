import { beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { AiError, generateJson } from "./gemini";
import { suggestSwaps } from "./swaps";

vi.mock("server-only", () => ({}));

vi.mock("./gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./gemini")>();
  return { ...actual, generateJson: vi.fn() };
});

const generateJsonMock = vi.mocked(generateJson);

type Req = Parameters<typeof suggestSwaps>[0];

function request(overrides: Partial<Req> = {}): Req {
  return {
    recipe: butterChicken,
    target: { kind: "ingredient", id: "i9" },
    allergies: [],
    ...overrides,
  } as Req;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("suggestSwaps", () => {
  it("returns exactly 3 swaps in one call on the fast tier with low thinking", async () => {
    generateJsonMock.mockResolvedValueOnce({ suggestions: ["coconut milk", "oat milk", "silken tofu"] });

    const result = await suggestSwaps(request());

    expect(result).toEqual(["coconut milk", "oat milk", "silken tofu"]);
    expect(generateJsonMock).toHaveBeenCalledTimes(1);
    expect(generateJsonMock.mock.calls[0]?.[0]).toMatchObject({ tier: "fast", thinkingLevel: "low" });
  });

  it("returns only the first 3 when Gemini gives more", async () => {
    generateJsonMock.mockResolvedValueOnce({ suggestions: ["oat milk", "coconut milk", "silken tofu", "cashew cream"] });
    const result = await suggestSwaps(request());
    expect(result).toHaveLength(3);
  });

  it("filters allergens and retries once when fewer than 3 remain", async () => {
    generateJsonMock
      .mockResolvedValueOnce({ suggestions: ["soy milk", "oat milk", "rice milk"] })
      .mockResolvedValueOnce({ suggestions: ["pea milk", "almond milk", "cashew milk"] });

    const result = await suggestSwaps(request({ allergies: ["soy"] }));

    expect(result).toEqual(["oat milk", "rice milk", "pea milk"]);
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
    expect(generateJsonMock.mock.calls[1]?.[0]?.prompt).toContain("soy milk");
    expect(result.some((s) => /soy/i.test(s))).toBe(false);
  });

  it("drops names over four words, duplicates and the target itself", async () => {
    generateJsonMock
      .mockResolvedValueOnce({
        suggestions: ["Heavy Cream", "coconut milk", "coconut milk", "a very long swap name here", "oat milk"],
      })
      .mockResolvedValueOnce({ suggestions: ["silken tofu", "cashew cream", "evaporated milk"] });

    const result = await suggestSwaps(request());

    expect(result).toEqual(["coconut milk", "oat milk", "silken tofu"]);
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
  });

  it("throws AiError invalid when the retry is still short", async () => {
    generateJsonMock.mockResolvedValue({ suggestions: ["soy milk", "soy cream"] });

    const error = await suggestSwaps(request({ allergies: ["soy"] })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "invalid" });
    expect(generateJsonMock).toHaveBeenCalledTimes(2);
  });

  it("suggests appliance alternatives for an appliance target", async () => {
    generateJsonMock.mockResolvedValueOnce({ suggestions: ["food processor", "immersion blender", "mortar and pestle"] });

    const result = await suggestSwaps(request({ target: { kind: "appliance", id: "a2" } }));

    expect(result).toEqual(["food processor", "immersion blender", "mortar and pestle"]);
    expect(generateJsonMock.mock.calls[0]?.[0]?.prompt).toContain("Blender");
  });
});
