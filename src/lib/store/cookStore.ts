import { create } from "zustand";
import { z } from "zod";

// Cook-mode state (PRD §5.6): focused step, step states and timers. Clicks and voice tools both
// change this one store. Each recipe's state is saved in localStorage, so a refresh resumes it.

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

const MAX_TIMERS = 10;
const MAX_TIMER_MINUTES = 600;
const MAX_LABEL_CHARS = 40;

const TimerSchema = z.object({
  id: z.string(),
  label: z.string(),
  stepId: z.string().optional(),
  endsAt: z.number(),
  durationSec: z.number(),
  firedAt: z.number().optional(),
});

const CookRecordSchema = z.object({
  v: z.literal(1),
  active: z.boolean(),
  currentStepId: z.string().nullable(),
  doneStepIds: z.array(z.string()),
  timers: z.array(TimerSchema),
});

/** The persisted cook state for one recipe (version 1). */
export type CookRecord = z.infer<typeof CookRecordSchema>;

// localStorage can be missing (SSR), throw (private mode, blocked site data) or hold junk.
// Every access goes through try/catch, so the store keeps working in memory.
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The saved cook state for a recipe, or null when none is saved or the data is invalid. */
export function readCookState(recipeKey: string): CookRecord | null {
  try {
    const raw = storage()?.getItem(cookStateKey(recipeKey));
    if (!raw) return null;
    const parsed = CookRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function persist(state: CookStoreState): void {
  if (state.recipeKey === null) return;
  const record: CookRecord = {
    v: 1,
    active: state.active,
    currentStepId: state.currentStepId,
    doneStepIds: state.doneStepIds,
    timers: state.timers,
  };
  try {
    storage()?.setItem(cookStateKey(state.recipeKey), JSON.stringify(record));
  } catch {
    // Quota or blocked storage: the in-memory state still works.
  }
}

function newTimerId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function firstNotDone(stepIds: string[], done: string[]): string | null {
  return stepIds.find((id) => !done.includes(id)) ?? null;
}

/** The step to focus after `id` is marked done: the next open step, else the first open one before it. */
function focusAfterDone(stepIds: string[], done: string[], id: string): string | null {
  const idx = stepIds.indexOf(id);
  const order = [...stepIds.slice(idx + 1), ...stepIds.slice(0, idx)];
  return order.find((other) => !done.includes(other)) ?? null;
}

/** Clears the step link on timers whose step is gone. Returns the same array when nothing changed. */
function dropStaleSteps(timers: CookTimer[], stepIds: string[]): CookTimer[] {
  const stale = (t: CookTimer) => t.stepId !== undefined && !stepIds.includes(t.stepId);
  if (!timers.some(stale)) return timers;
  return timers.map((t) => {
    if (!stale(t)) return t;
    const next = { ...t };
    delete next.stepId;
    return next;
  });
}

function oldestBy(list: CookTimer[], key: (t: CookTimer) => number): CookTimer | undefined {
  return list.reduce<CookTimer | undefined>(
    (best, t) => (best === undefined || key(t) < key(best) ? t : best),
    undefined,
  );
}

/** Drops timers until there is room for one more: the oldest fired one, else the one ending soonest. */
function makeRoom(timers: CookTimer[]): CookTimer[] {
  let rest = timers;
  while (rest.length >= MAX_TIMERS) {
    const fired = rest.filter((t) => t.firedAt !== undefined);
    const victim =
      oldestBy(fired, (t) => t.firedAt ?? 0) ?? oldestBy(rest, (t) => t.endsAt);
    if (!victim) break;
    rest = rest.filter((t) => t !== victim);
  }
  return rest;
}

/** Timers that have ended but have not rung yet (the UI ticks this to ring the chime). */
export function dueTimers(timers: CookTimer[], now: number): CookTimer[] {
  return timers.filter((t) => t.endsAt <= now && t.firedAt === undefined);
}

export const useCookStore = create<CookStore>()((set, get) => {
  // Applies a change and saves it for the recipe.
  function commit(partial: Partial<CookStoreState>): void {
    set(partial);
    persist(get());
  }

  // Focuses a step by ID (undefined means there is no such step).
  function move(id: string | undefined): string | null {
    if (id === undefined) return null;
    commit({ currentStepId: id });
    return id;
  }

  function removeTimer(id: string): void {
    const s = get();
    if (!s.timers.some((t) => t.id === id)) return;
    commit({ timers: s.timers.filter((t) => t.id !== id) });
  }

  return {
    active: false,
    recipeKey: null,
    stepIds: [],
    currentStepId: null,
    doneStepIds: [],
    timers: [],
    start(recipeKey, stepIds) {
      const saved = readCookState(recipeKey);
      const doneStepIds = unique((saved?.doneStepIds ?? []).filter((id) => stepIds.includes(id)));
      const savedCurrent = saved?.currentStepId ?? null;
      const currentStepId =
        savedCurrent !== null && stepIds.includes(savedCurrent) && !doneStepIds.includes(savedCurrent)
          ? savedCurrent
          : (firstNotDone(stepIds, doneStepIds) ?? stepIds[0] ?? null);
      commit({
        active: true,
        recipeKey,
        stepIds: [...stepIds],
        currentStepId,
        doneStepIds,
        timers: dropStaleSteps(saved?.timers ?? [], stepIds),
      });
    },
    end() {
      commit({ active: false });
    },
    syncSteps(stepIds) {
      const s = get();
      const doneStepIds = s.doneStepIds.filter((id) => stepIds.includes(id));
      const currentStepId =
        s.currentStepId !== null && stepIds.includes(s.currentStepId)
          ? s.currentStepId
          : firstNotDone(stepIds, doneStepIds);
      const timers = dropStaleSteps(s.timers, stepIds);
      // Nothing changed: keep the same state object so subscribers don't re-render.
      if (
        sameList(s.stepIds, stepIds) &&
        sameList(s.doneStepIds, doneStepIds) &&
        s.currentStepId === currentStepId &&
        timers === s.timers
      ) {
        return;
      }
      commit({ stepIds: [...stepIds], doneStepIds, currentStepId, timers });
    },
    focusStep(stepId) {
      const s = get();
      if (!s.stepIds.includes(stepId)) return;
      const doneStepIds = s.doneStepIds.filter((id) => id !== stepId);
      if (doneStepIds.length === s.doneStepIds.length && s.currentStepId === stepId) return;
      commit({ currentStepId: stepId, doneStepIds });
    },
    markDone(stepId) {
      const s = get();
      const id = stepId ?? s.currentStepId;
      if (id === null || !s.stepIds.includes(id)) return;
      const doneStepIds = s.doneStepIds.includes(id) ? s.doneStepIds : [...s.doneStepIds, id];
      const currentStepId =
        id === s.currentStepId ? focusAfterDone(s.stepIds, doneStepIds, id) : s.currentStepId;
      if (doneStepIds === s.doneStepIds && currentStepId === s.currentStepId) return;
      commit({ doneStepIds, currentStepId });
    },
    markUndone(stepId) {
      const s = get();
      if (!s.doneStepIds.includes(stepId)) return;
      commit({ doneStepIds: s.doneStepIds.filter((id) => id !== stepId) });
    },
    // Navigation only moves focus; it doesn't change which steps are done.
    next() {
      const { stepIds, currentStepId } = get();
      if (stepIds.length === 0) return null;
      const idx = currentStepId === null ? -1 : stepIds.indexOf(currentStepId);
      if (idx === -1) return move(stepIds[0]);
      if (idx >= stepIds.length - 1) return null;
      return move(stepIds[idx + 1]);
    },
    previous() {
      const { stepIds, currentStepId } = get();
      if (stepIds.length === 0) return null;
      const idx = currentStepId === null ? -1 : stepIds.indexOf(currentStepId);
      if (idx === -1) return move(stepIds[stepIds.length - 1]);
      if (idx <= 0) return null;
      return move(stepIds[idx - 1]);
    },
    goTo(n) {
      const { stepIds, currentStepId } = get();
      if (!Number.isInteger(n) || n < 1 || n > stepIds.length) return null;
      const id = stepIds[n - 1];
      if (id === undefined) return null;
      return currentStepId === id ? id : move(id);
    },
    startTimer({ label, minutes, stepId }) {
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_TIMER_MINUTES) {
        throw new RangeError(`Timer minutes must be greater than 0 and at most ${MAX_TIMER_MINUTES}`);
      }
      const id = newTimerId();
      const timer: CookTimer = {
        id,
        label: Array.from(label.trim()).slice(0, MAX_LABEL_CHARS).join("").trim() || "Timer",
        ...(stepId ? { stepId } : {}),
        endsAt: Date.now() + minutes * 60_000,
        durationSec: Math.round(minutes * 60),
      };
      commit({ timers: [...makeRoom(get().timers), timer] });
      return id;
    },
    cancelTimer(id) {
      removeTimer(id);
    },
    markFired(id) {
      const s = get();
      const timer = s.timers.find((t) => t.id === id);
      if (!timer || timer.firedAt !== undefined) return;
      commit({
        timers: s.timers.map((t) => (t.id === id ? { ...t, firedAt: Date.now() } : t)),
      });
    },
    dismissTimer(id) {
      removeTimer(id);
    },
  };
});
