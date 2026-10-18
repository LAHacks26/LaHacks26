"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Recipe, Step } from "@/lib/recipe/schema";
import { CookStepCard, type CookStepStatus } from "./CookStepCard";
import { type CookTimer, TimerTray } from "./TimerTray";
import { TapToTalkButton } from "./TapToTalkButton";
import { type VoiceTurn, VoiceTranscript } from "./VoiceTranscript";
import { type WakeState, WakePill } from "./WakePill";

// Cook mode screen (PRD §5.6). Controlled: the live page drives it from the cook store and the
// voice session; /mocks/cook drives it from local state (CookModeDemo).

export type CookModeViewProps = {
  recipe: Recipe;
  currentStepId: string | null;
  doneStepIds: string[];
  timers: CookTimer[];
  voice: WakeState;
  transcript?: VoiceTurn[];
  /** A short line under the header, e.g. why voice is unavailable. */
  notice?: ReactNode;
  onFocusStep: (stepId: string) => void;
  onMarkDone: (stepId: string) => void;
  onStartTimer: (step: Step, index: number) => void;
  onCancelTimer: (timerId: string) => void;
  onTapToTalk: () => void;
  onEnd: () => void;
};

export function CookModeView({
  recipe,
  currentStepId,
  doneStepIds,
  timers,
  voice,
  transcript = [],
  notice,
  onFocusStep,
  onMarkDone,
  onStartTimer,
  onCancelTimer,
  onTapToTalk,
  onEnd,
}: CookModeViewProps) {
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const lastCurrentId = useRef(currentStepId);
  const allDone = recipe.steps.length > 0 && recipe.steps.every((step) => doneStepIds.includes(step.id));

  // Keep the new current step in view. The first mount is skipped (the ref starts
  // at the initial id), so the page does not scroll on load.
  useEffect(() => {
    if (lastCurrentId.current === currentStepId) return;
    lastCurrentId.current = currentStepId;
    const card = listRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.closest("li");
    card?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [currentStepId, reduce]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-48 sm:px-6 sm:pt-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Cooking · {recipe.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <WakePill state={voice} />
            <Button variant="outline" size="lg" className="h-11 bg-card" onClick={onEnd}>
              End cooking
            </Button>
          </div>
        </div>
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      </header>

      <ol ref={listRef} aria-label="Recipe steps" className="flex flex-col gap-3">
        {recipe.steps.map((step, index) => {
          // Voice navigation can focus a finished step without reopening it; it still shows as the focused one.
          const status: CookStepStatus = step.id === currentStepId
            ? "current"
            : doneStepIds.includes(step.id)
              ? "done"
              : "upcoming";
          // Prefer the step's running timer over one that already rang.
          const stepTimers = timers.filter((timer) => timer.stepId === step.id);
          const timer = stepTimers.find((item) => !item.firedAt) ?? stepTimers[0];
          return (
            <CookStepCard
              key={step.id}
              step={step}
              index={index}
              status={status}
              timer={timer}
              onFocus={() => onFocusStep(step.id)}
              onDone={() => onMarkDone(step.id)}
              onStartTimer={() => onStartTimer(step, index)}
            />
          );
        })}
      </ol>

      {allDone ? (
        <div role="status" className="flex items-center gap-3 rounded-2xl bg-sage-soft p-5 text-ink">
          <PartyPopper aria-hidden="true" className="shrink-0 text-sage" />
          <p className="text-base font-medium">Every step is done. Enjoy your meal!</p>
        </div>
      ) : null}

      <VoiceTranscript turns={transcript} />

      {/* Always visible while cooking: timers at left, mic at right. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-end justify-between gap-3 px-4 py-3 sm:px-6">
          <TimerTray timers={timers} onCancel={onCancelTimer} />
          <TapToTalkButton
            active={voice === "listening" || voice === "thinking" || voice === "speaking"}
            onPress={onTapToTalk}
            className="ml-auto"
          />
        </div>
      </div>
    </div>
  );
}
