import type { Step } from "@/lib/recipe/schema";
import { useCookStore } from "@/lib/store/cookStore";
import type { VoiceToolCall } from "./types";

// The one voice tool registry (PRD §11.2). Every tool changes the same cook store that clicks use,
// and returns the sentence to speak. Steps are 1-based, as the cook hears them.

export type VoiceToolDeps = {
  /** The recipe's steps as shown right now. */
  steps(): Step[];
  /** Runs the chat edit pipeline and returns what to say about the result. */
  editRecipe(instruction: string): Promise<string>;
};

/** "8 minutes", "1 minute", "90 seconds", "1 hour 5 minutes". */
export function spokenDuration(totalSec: number): string {
  const seconds = Math.max(0, Math.round(totalSec));
  if (seconds < 120 && seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (hours === 0) return plural(minutes, "minute");
  return rest === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(rest, "minute")}`;
}

function readStep(steps: Step[], id: string | null): string | null {
  const index = id ? steps.findIndex((step) => step.id === id) : -1;
  return index === -1 ? null : `Step ${index + 1}. ${steps[index]!.text}`;
}

export async function runVoiceTool(call: VoiceToolCall, deps: VoiceToolDeps): Promise<string> {
  const cook = useCookStore.getState();
  const steps = deps.steps();
  switch (call.name) {
    case "next_step":
      return readStep(steps, cook.next()) ?? "That was the last step.";
    case "previous_step":
      return readStep(steps, cook.previous()) ?? "You're at the first step.";
    case "go_to_step":
      return readStep(steps, cook.goTo(call.n)) ?? `There's no step ${call.n}.`;
    case "repeat_step":
      return readStep(steps, cook.currentStepId) ?? "We haven't started a step yet.";
    case "mark_step_done": {
      if (!cook.currentStepId) return "There's no step in progress.";
      cook.markDone();
      const next = readStep(steps, useCookStore.getState().currentStepId);
      return next ? `Done. ${next}` : "That was the last step. Enjoy your meal!";
    }
    case "start_timer": {
      const index = call.stepNumber !== undefined
        ? call.stepNumber - 1
        : steps.findIndex((step) => step.id === cook.currentStepId);
      const step = index >= 0 ? steps[index] : undefined;
      if (call.stepNumber !== undefined && !step) return `There's no step ${call.stepNumber}.`;
      const minutes = call.minutes ?? step?.timer?.max;
      if (!minutes) return "How long should the timer be?";
      const custom = call.label?.trim();
      const label = custom || (step ? `Step ${index + 1}` : "Timer");
      // A named timer ("rice") is its own thing; it belongs to a step only when the cook said which.
      const linked = call.stepNumber !== undefined || !custom ? step : undefined;
      cook.startTimer({ label, minutes, stepId: linked?.id });
      return `${label} timer set for ${spokenDuration(minutes * 60)}.`;
    }
    case "list_timers": {
      const now = Date.now();
      const running = cook.timers.filter((timer) => !timer.firedAt && timer.endsAt > now);
      if (running.length === 0) return "No timers are running.";
      return `${running.map((timer) => `${timer.label} has ${spokenDuration((timer.endsAt - now) / 1000)} left`).join(", ")}.`;
    }
    case "cancel_timer": {
      const wanted = call.label.trim().toLowerCase();
      if (!wanted) return "Which timer should I cancel?";
      const timer =
        cook.timers.find((item) => item.label.toLowerCase() === wanted) ??
        cook.timers.find((item) => item.label.toLowerCase().includes(wanted));
      if (!timer) return `I couldn't find a ${call.label} timer.`;
      cook.cancelTimer(timer.id);
      return `Cancelled the ${timer.label} timer.`;
    }
    case "edit_recipe":
      return deps.editRecipe(call.instruction);
  }
}
