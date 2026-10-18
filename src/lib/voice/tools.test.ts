import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { useCookStore } from "../store/cookStore";
import { runVoiceTool, spokenDuration, type VoiceToolDeps } from "./tools";

// butterChicken has steps s1–s7; s2 (marinate, 30 min) and s6 (simmer, 5–8 min) have timers.
const steps = butterChicken.steps;
const stepIds = steps.map((step) => step.id);

function deps(editRecipe: VoiceToolDeps["editRecipe"] = async () => "Edited."): VoiceToolDeps {
  return { steps: () => steps, editRecipe };
}

beforeEach(() => {
  useCookStore.setState({ active: false, recipeKey: null, stepIds: [], currentStepId: null, doneStepIds: [], timers: [] });
  useCookStore.getState().start("saved:test", stepIds);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runVoiceTool: navigation", () => {
  it("reads the next, previous and named steps aloud and moves the focus", async () => {
    expect(await runVoiceTool({ name: "next_step" }, deps())).toBe(`Step 2. ${steps[1]!.text}`);
    expect(useCookStore.getState().currentStepId).toBe("s2");
    expect(await runVoiceTool({ name: "previous_step" }, deps())).toBe(`Step 1. ${steps[0]!.text}`);
    expect(await runVoiceTool({ name: "go_to_step", n: 5 }, deps())).toBe(`Step 5. ${steps[4]!.text}`);
    expect(await runVoiceTool({ name: "repeat_step" }, deps())).toBe(`Step 5. ${steps[4]!.text}`);
  });

  it("says so at either end and for a step that doesn't exist", async () => {
    expect(await runVoiceTool({ name: "previous_step" }, deps())).toBe("You're at the first step.");
    expect(await runVoiceTool({ name: "go_to_step", n: 99 }, deps())).toBe("There's no step 99.");
    await runVoiceTool({ name: "go_to_step", n: steps.length }, deps());
    expect(await runVoiceTool({ name: "next_step" }, deps())).toBe("That was the last step.");
  });

  it("marks the current step done and reads the next one", async () => {
    expect(await runVoiceTool({ name: "mark_step_done" }, deps())).toBe(`Done. Step 2. ${steps[1]!.text}`);
    expect(useCookStore.getState().doneStepIds).toEqual(["s1"]);
  });

  it("finishes the recipe after the last step", async () => {
    for (let i = 0; i < steps.length - 1; i++) await runVoiceTool({ name: "mark_step_done" }, deps());
    expect(await runVoiceTool({ name: "mark_step_done" }, deps())).toBe("That was the last step. Enjoy your meal!");
    expect(await runVoiceTool({ name: "mark_step_done" }, deps())).toBe("There's no step in progress.");
  });
});

describe("runVoiceTool: timers", () => {
  it("defaults to the current step's timer and label", async () => {
    useCookStore.getState().goTo(2);
    const text = await runVoiceTool({ name: "start_timer" }, deps());
    expect(useCookStore.getState().timers[0]).toMatchObject({ label: "Step 2", stepId: "s2", durationSec: 30 * 60 });
    expect(text).toBe("Step 2 timer set for 30 minutes.");
  });

  it("uses a spoken duration, step number and label when given", async () => {
    useCookStore.getState().goTo(2);
    expect(await runVoiceTool({ name: "start_timer", minutes: 12, label: "rice" }, deps())).toBe("rice timer set for 12 minutes.");
    expect(await runVoiceTool({ name: "start_timer", stepNumber: 6 }, deps())).toBe("Step 6 timer set for 8 minutes.");
    expect(await runVoiceTool({ name: "start_timer", minutes: 5 }, deps())).toBe("Step 2 timer set for 5 minutes.");
    // The named "rice" timer is not tied to the step in focus; the others belong to their steps.
    expect(useCookStore.getState().timers.map((timer) => timer.stepId)).toEqual([undefined, "s6", "s2"]);
    expect(await runVoiceTool({ name: "start_timer", stepNumber: 42 }, deps())).toBe("There's no step 42.");
  });

  it("asks for a duration when the step has no timer", async () => {
    expect(await runVoiceTool({ name: "start_timer" }, deps())).toBe("How long should the timer be?");
    expect(useCookStore.getState().timers).toEqual([]);
  });

  it("lists running timers and cancels one by label", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(await runVoiceTool({ name: "list_timers" }, deps())).toBe("No timers are running.");
    await runVoiceTool({ name: "start_timer", minutes: 12, label: "Rice" }, deps());
    await runVoiceTool({ name: "start_timer", minutes: 1.5, label: "Garlic" }, deps());
    expect(await runVoiceTool({ name: "list_timers" }, deps())).toBe("Rice has 12 minutes left, Garlic has 90 seconds left.");
    expect(await runVoiceTool({ name: "cancel_timer", label: "rice" }, deps())).toBe("Cancelled the Rice timer.");
    expect(await runVoiceTool({ name: "cancel_timer", label: "pasta" }, deps())).toBe("I couldn't find a pasta timer.");
    expect(await runVoiceTool({ name: "cancel_timer", label: "  " }, deps())).toBe("Which timer should I cancel?");
    expect(useCookStore.getState().timers.map((timer) => timer.label)).toEqual(["Garlic"]);
  });
});

describe("runVoiceTool: edits", () => {
  it("hands recipe changes to the chat pipeline and speaks its answer", async () => {
    const editRecipe = vi.fn(async () => "Swapped butter for olive oil.");
    expect(await runVoiceTool({ name: "edit_recipe", instruction: "I'm out of butter" }, deps(editRecipe))).toBe("Swapped butter for olive oil.");
    expect(editRecipe).toHaveBeenCalledWith("I'm out of butter");
  });
});

describe("spokenDuration", () => {
  it("reads seconds, minutes and hours naturally", () => {
    expect(spokenDuration(45)).toBe("45 seconds");
    expect(spokenDuration(60)).toBe("1 minute");
    expect(spokenDuration(8 * 60)).toBe("8 minutes");
    expect(spokenDuration(3600)).toBe("1 hour");
    expect(spokenDuration(3900)).toBe("1 hour 5 minutes");
  });
});
