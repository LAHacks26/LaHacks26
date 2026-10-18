"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Recipe, Step } from "@/lib/recipe/schema";
import { CookStepCard, type CookStepStatus } from "./CookStepCard";
import { type CookTimer, type CookTimerSeed, TimerTray } from "./TimerTray";
import { TapToTalkButton } from "./TapToTalkButton";
import { type VoiceTurn, VoiceTranscript } from "./VoiceTranscript";
import { type WakeState, WakePill } from "./WakePill";

export type CookModeViewProps = {
  recipe: Recipe;
  /** Step to focus first. Steps before it start as done. */
  initialStepId: string;
  /** Wake-word state at mount. Defaults to "armed". */
  initialVoice?: WakeState;
  /** Timers already running at mount. */
  initialTimers?: CookTimerSeed[];
  /** Voice transcript shown above the bottom bar. */
  transcript?: VoiceTurn[];
};

export function CookModeView({
  recipe,
  initialStepId,
  initialVoice = "armed",
  initialTimers = [],
  transcript = [],
}: CookModeViewProps) {
  const [currentId, setCurrentId] = useState(initialStepId);
  const [doneIds, setDoneIds] = useState<Set<string>>(() => {
    const index = recipe.steps.findIndex((step) => step.id === initialStepId);
    return new Set(recipe.steps.slice(0, Math.max(index, 0)).map((step) => step.id));
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

  function focusStep(id: string) {
    setCurrentId(id);
    // Focusing a done step reopens it.
    setDoneIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function markDone(step: Step) {
    setDoneIds((prev) => new Set(prev).add(step.id));
    const index = recipe.steps.findIndex((s) => s.id === step.id);
    const next = recipe.steps[index + 1];
    if (next) setCurrentId(next.id);
  }

  function cancelTimer(id: string) {
    setTimers((prev) => prev.filter((timer) => timer.id !== id));
  }

  function tapToTalk() {
    setVoice((prev) => (prev === "listening" ? "armed" : "listening"));
  }

  function endCooking() {
    setVoice("off");
    toast("Cooking ended. Mic is off.");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-48 sm:px-6 sm:pt-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Cooking · {recipe.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <WakePill state={voice} />
          <Button variant="outline" size="lg" className="h-11 bg-card" onClick={endCooking}>
            End cooking
          </Button>
        </div>
      </header>

      <ol aria-label="Recipe steps" className="flex flex-col gap-3">
        {recipe.steps.map((step, index) => {
          const status: CookStepStatus = doneIds.has(step.id)
            ? "done"
            : step.id === currentId
              ? "current"
              : "upcoming";
          return (
            <CookStepCard
              key={step.id}
              step={step}
              index={index}
              status={status}
              timer={timers.find((timer) => timer.stepId === step.id)}
              onFocus={() => focusStep(step.id)}
              onDone={() => markDone(step)}
              onStartTimer={() => {
                if (!step.timer) return;
                const endsAt = Date.now() + step.timer.max * 60_000;
                setTimers((prev) => [
                  ...prev,
                  { id: `${step.id}-${endsAt}`, label: `Step ${index + 1}`, stepId: step.id, endsAt },
                ]);
              }}
            />
          );
        })}
      </ol>

      <VoiceTranscript turns={transcript} />

      {/* Always visible while cooking: timers at left, mic at right. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-end justify-between gap-3 px-4 py-3 sm:px-6">
          <TimerTray timers={timers} onCancel={cancelTimer} />
          <TapToTalkButton
            active={voice === "listening"}
            onPress={tapToTalk}
            className="ml-auto"
          />
        </div>
      </div>
    </div>
  );
}
