import { create } from "zustand";

// Cook-mode state (PRD §5.6): focused step, step states and timers. Clicks and voice tools both
// change this one store. CONTRACT STUB: the state shape and action signatures are fixed; the bodies
// are implemented in phase 6.

export type StepState = "upcoming" | "current" | "done";

export type CookTimer = {
  id: string;
  label: string;
  stepId?: string;
  /** Epoch ms when the countdown ends. Persisted, so timers survive a refresh. */
  endsAt: number;
  durationSec: number;
  /** Epoch ms when the timer rang (chime + voice). Unset while counting down. */
  firedAt?: number;
};

export type CookStoreState = {
  active: boolean;
  /** The recipe being cooked (sourceRecipeId or savedId). Cook state is persisted per key. */
  recipeKey: string | null;
  /** Step IDs in recipe order. Kept in sync with the recipe via syncSteps after every edit. */
  stepIds: string[];
  currentStepId: string | null;
  doneStepIds: string[];
  timers: CookTimer[];
};

export type CookStoreActions = {
  /**
   * Enters cook mode for a recipe. Restores the persisted state for the same `recipeKey` (done steps
   * and timers), otherwise focuses the first step.
   */
  start(recipeKey: string, stepIds: string[]): void;
  /** Leaves cook mode. Timers keep running. */
  end(): void;
  /** After a recipe edit: drops state for removed steps; keeps the focus if the step still exists. */
  syncSteps(stepIds: string[]): void;
  focusStep(stepId: string): void;
  /** Marks a step done (default: the current one) and focuses the next step that isn't done. */
  markDone(stepId?: string): void;
  /** Un-marks a done step. */
  markUndone(stepId: string): void;
  /** Moves the focus; returns the new current step ID, or null at either end. */
  next(): string | null;
  previous(): string | null;
  /** 1-based. Returns the step ID, or null if out of range. */
  goTo(n: number): string | null;
  /** Returns the new timer's ID. */
  startTimer(opts: { label: string; minutes: number; stepId?: string }): string;
  cancelTimer(id: string): void;
  /** Records that a timer rang. */
  markFired(id: string): void;
  /** Removes a timer that has rung. */
  dismissTimer(id: string): void;
};

export type CookStore = CookStoreState & CookStoreActions;

/** localStorage key for one recipe's cook state. */
export function cookStateKey(recipeKey: string): string {
  return `saffron:cook:${recipeKey}`;
}

/** The state of one step, derived from the store. */
export function stepStateOf(state: CookStoreState, stepId: string): StepState {
  if (state.doneStepIds.includes(stepId)) return "done";
  return state.currentStepId === stepId ? "current" : "upcoming";
}

export const useCookStore = create<CookStore>()(() => ({
  active: false,
  recipeKey: null,
  stepIds: [],
  currentStepId: null,
  doneStepIds: [],
  timers: [],
  start() {
    throw new Error("not implemented");
  },
  end() {
    throw new Error("not implemented");
  },
  syncSteps() {
    throw new Error("not implemented");
  },
  focusStep() {
    throw new Error("not implemented");
  },
  markDone() {
    throw new Error("not implemented");
  },
  markUndone() {
    throw new Error("not implemented");
  },
  next() {
    throw new Error("not implemented");
  },
  previous() {
    throw new Error("not implemented");
  },
  goTo() {
    throw new Error("not implemented");
  },
  startTimer() {
    throw new Error("not implemented");
  },
  cancelTimer() {
    throw new Error("not implemented");
  },
  markFired() {
    throw new Error("not implemented");
  },
  dismissTimer() {
    throw new Error("not implemented");
  },
}));
