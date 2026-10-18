import { beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ runEdit: vi.fn() }));

vi.mock("@/lib/ai/edit", () => ({ runEdit: mocks.runEdit }));

import { POST } from "./route";

const URL_ = "http://localhost/api/ai/edit";

function post(body: Record<string, unknown>): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipe: butterChicken, baseVersion: 2, allergies: [], ...body }),
  });
}

beforeEach(() => {
  mocks.runEdit.mockReset();
});

describe("POST /api/ai/edit target check (review item 7)", () => {
  it("returns 400 for an ingredient ID that is not in the recipe, without calling Gemini", async () => {
    const res = await POST(post({ target: { kind: "ingredient", id: "i99" }, action: "substitute", message: "oat milk" }));

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: expect.stringContaining("isn't in this recipe") });
    expect(mocks.runEdit).not.toHaveBeenCalled();
  });

  it("returns 400 when substitute targets a step", async () => {
    const res = await POST(post({ target: { kind: "step", id: "s1" }, action: "substitute", message: "oat milk" }));

    expect(res.status).toBe(400);
    expect(mocks.runEdit).not.toHaveBeenCalled();
  });

  it("returns 400 when missing_appliance targets an ingredient", async () => {
    const res = await POST(post({ target: { kind: "ingredient", id: "i9" }, action: "missing_appliance" }));

    expect(res.status).toBe(400);
    expect(mocks.runEdit).not.toHaveBeenCalled();
  });

  it("runs a valid request and echoes baseVersion", async () => {
    mocks.runEdit.mockResolvedValue({ kind: "answer", text: "Coconut milk is thinner." });

    const res = await POST(post({ target: { kind: "ingredient", id: "i9" }, action: "substitute", message: "coconut milk" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ baseVersion: 2, result: { kind: "answer", text: "Coconut milk is thinner." } });
    expect(mocks.runEdit).toHaveBeenCalledTimes(1);
  });
});
