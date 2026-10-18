import { describe, expect, it } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import type { CookTimer } from "../store/cookStore";
import { buildVoiceContext } from "./context";
import { VoiceContextSchema } from "./types";

const NOW = 1_000_000;

function timer(overrides: Partial<CookTimer>): CookTimer {
  return { id: "t", label: "Rice", endsAt: NOW + 90_000, durationSec: 600, ...overrides };
}

describe("buildVoiceContext", () => {
  it("numbers steps from 1 and maps the cook state onto them", () => {
    const context = buildVoiceContext(
      butterChicken,
      { currentStepId: "s3", doneStepIds: ["s1", "s2"], timers: [timer({}), timer({ id: "rang", label: "Old", firedAt: NOW })] },
      ["peanuts"],
      "us",
      NOW,
    );
    expect(context.currentStep).toBe(3);
    expect(context.doneSteps).toEqual([1, 2]);
    expect(context.steps[1]).toMatchObject({ n: 2, timerMin: 30 });
    expect(context.steps[0]).not.toHaveProperty("timerMin");
    expect(context.ingredients[8]).toBe("1 cup heavy cream");
    // Rung timers are history, not something the cook can ask about.
    expect(context.timers).toEqual([{ label: "Rice", remainingSec: 90 }]);
    expect(context.allergies).toEqual(["peanuts"]);
    expect(VoiceContextSchema.safeParse(context).success).toBe(true);
  });

  it("clamps a huge recipe to the schema's limits, so /api/voice/turn never rejects it", () => {
    const step = butterChicken.steps[0]!;
    const recipe = {
      ...butterChicken,
      title: "T".repeat(500),
      steps: Array.from({ length: 70 }, (_, i) => ({ ...step, id: `s${i + 1}`, text: "x".repeat(2000) })),
      ingredients: Array.from({ length: 90 }, (_, i) => ({ ...butterChicken.ingredients[0]!, id: `i${i + 1}`, item: "y".repeat(300) })),
    };
    const timers = Array.from({ length: 12 }, (_, i) => timer({ id: `t${i}`, label: "z".repeat(80) }));
    const context = buildVoiceContext(
      recipe,
      { currentStepId: "s65", doneStepIds: ["s1", "s65"], timers },
      Array.from({ length: 40 }, () => "a".repeat(90)),
      "metric",
      NOW,
    );
    expect(context.steps).toHaveLength(60);
    expect(context.currentStep).toBeNull();
    expect(context.doneSteps).toEqual([1]);
    expect(VoiceContextSchema.safeParse(context).success).toBe(true);
  });

  it("never reports negative time left", () => {
    const context = buildVoiceContext(butterChicken, { currentStepId: null, doneStepIds: [], timers: [timer({ endsAt: NOW - 5000 })] }, [], "us", NOW);
    expect(context.timers?.[0]?.remainingSec).toBe(0);
  });
});
