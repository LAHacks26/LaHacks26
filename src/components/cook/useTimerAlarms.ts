"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { playChime } from "@/lib/cook/chime";
import { dueTimers, useCookStore, type CookTimer } from "@/lib/store/cookStore";
import { announce } from "@/lib/voice/webSpeech";

const NO_TIMERS: CookTimer[] = [];

/**
 * Rings this recipe's timers when they end (PRD §5.6): chime, toast, and in cook mode a spoken
 * "Your … timer is done". Runs on the recipe page too, since timers keep going after End cooking.
 * The step is not marked done.
 */
export function useTimerAlarms(recipeKey: string): void {
  const timers = useCookStore((state) => (state.recipeKey === recipeKey ? state.timers : NO_TIMERS));
  const waiting = timers.some((timer) => timer.firedAt === undefined);

  useEffect(() => {
    if (!waiting) return;
    function tick() {
      const state = useCookStore.getState();
      if (state.recipeKey !== recipeKey) return;
      for (const timer of dueTimers(state.timers, Date.now())) {
        state.markFired(timer.id);
        playChime();
        toast(`${timer.label} timer is done`);
        if (state.active) announce(`Your ${timer.label} timer is done.`);
      }
    }
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [recipeKey, waiting]);
}
