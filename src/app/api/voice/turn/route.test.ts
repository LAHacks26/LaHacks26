import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiError } from "@/lib/ai/gemini";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ runVoiceTurn: vi.fn() }));

vi.mock("@/lib/ai/voice", () => ({ runVoiceTurn: mocks.runVoiceTurn }));

import { POST } from "./route";

const URL_ = "http://localhost/api/voice/turn";

const context = {
  title: "Butter chicken",
  steps: [
    { n: 1, text: "Marinate the chicken in yogurt and spices." },
    { n: 2, text: "Simmer the sauce for 10 minutes.", timerMin: 10 },
  ],
  ingredients: ["500 g chicken thigh", "1 cup heavy cream"],
  currentStep: 1,
  doneSteps: [],
  timers: [],
  allergies: [],
};

function post(body: unknown): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.runVoiceTurn.mockReset();
});

describe("POST /api/voice/turn", () => {
  it("returns 400 for an empty transcript without calling Gemini", async () => {
    const res = await POST(post({ context, transcript: "   ", history: [] }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That request isn't valid." });
    expect(mocks.runVoiceTurn).not.toHaveBeenCalled();
  });

  it("returns 400 when the context is missing", async () => {
    const res = await POST(post({ transcript: "next step", history: [] }));

    expect(res.status).toBe(400);
    expect(mocks.runVoiceTurn).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that is not JSON", async () => {
    const res = await POST(
      new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" }),
    );

    expect(res.status).toBe(400);
    expect(mocks.runVoiceTurn).not.toHaveBeenCalled();
  });

  it("returns 200 with the result of runVoiceTurn", async () => {
    mocks.runVoiceTurn.mockResolvedValue({ say: "", toolCalls: [{ name: "next_step" }] });

    const res = await POST(post({ context, transcript: "next step" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ say: "", toolCalls: [{ name: "next_step" }] });
    expect(mocks.runVoiceTurn).toHaveBeenCalledTimes(1);
    expect(mocks.runVoiceTurn.mock.calls[0]?.[0]).toMatchObject({ transcript: "next step", history: [] });
  });

  it("maps a timeout from the AI layer to 504", async () => {
    mocks.runVoiceTurn.mockRejectedValue(new AiError("The AI request timed out. Try again.", "timeout"));

    const res = await POST(post({ context, transcript: "what's next" }));

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "Saffron took too long to answer. Try again." });
  });
});
