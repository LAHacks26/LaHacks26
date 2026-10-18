"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Recipe } from "@/lib/recipe/schema";
import { CookModeView } from "./CookModeView";
import type { CookTimer, CookTimerSeed } from "./TimerTray";
import type { VoiceTurn } from "./VoiceTranscript";
import type { WakeState } from "./WakePill";

// /mocks/cook only: CookModeView driven by local state, with no store, mic or AI.

export type CookModeDemoProps = {
  recipe: Recipe;
  /** Step to focus first. Steps before it start as done. */
  initialStepId: string;
  initialVoice?: WakeState;
  initialTimers?: CookTimerSeed[];
  transcript?: VoiceTurn[];
};

export function CookModeDemo({
  recipe,
  initialStepId,
  initialVoice = "armed",
  initialTimers = [],
  transcript = [],
}: CookModeDemoProps) {
  const [currentId, setCurrentId] = useState<string | null>(initialStepId);
  const [doneIds, setDoneIds] = useState<string[]>(() => {
    const index = recipe.steps.findIndex((step) => step.id === initialStepId);
    return recipe.steps.slice(0, Math.max(index, 0)).map((step) => step.id);
  });
  const [timers, setTimers] = useState<CookTimer[]>(() => {
    const start = Date.now();
    return initialTimers.map((timer) => ({
      id: timer.id,
      label: timer.label,
      stepId: timer.stepId,
      endsAt: start + timer.remainingSec * 1000,
    }));
  });
  const [voice, setVoice] = useState<WakeState>(initialVoice);

  return (
    <CookModeView
      recipe={recipe}
      currentStepId={currentId}
      doneStepIds={doneIds}
      timers={timers}
      voice={voice}
      transcript={transcript}
      onFocusStep={(id) => {
        setCurrentId(id);
        // Focusing a done step reopens it.
        setDoneIds((prev) => prev.filter((done) => done !== id));
      }}
      onMarkDone={(id) => {
        setDoneIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
        const index = recipe.steps.findIndex((step) => step.id === id);
        const next = recipe.steps[index + 1];
        if (next) setCurrentId(next.id);
      }}
      onStartTimer={(step, index) => {
        if (!step.timer) return;
        const endsAt = Date.now() + step.timer.max * 60_000;
        setTimers((prev) => [...prev, { id: `${step.id}-${endsAt}`, label: `Step ${index + 1}`, stepId: step.id, endsAt }]);
      }}
      onCancelTimer={(id) => setTimers((prev) => prev.filter((timer) => timer.id !== id))}
      onTapToTalk={() => setVoice((prev) => (prev === "listening" ? "armed" : "listening"))}
      onEnd={() => {
        setVoice("off");
        toast("Cooking ended. Mic is off.");
      }}
    />
  );
}
