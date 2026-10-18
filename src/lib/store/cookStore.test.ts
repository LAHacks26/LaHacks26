import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cookStateKey,
  dueTimers,
  readCookState,
  stepStateOf,
  useCookStore,
  type CookStoreState,
} from "./cookStore";

// A small in-memory localStorage, so persistence can be checked in the node environment.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

const NOW = 1_000_000;
const RESET: Partial<CookStoreState> = {
  active: false,
  recipeKey: null,
  stepIds: [],
  currentStepId: null,
  doneStepIds: [],
  timers: [],
};

let storage: Storage;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  useCookStore.setState(RESET);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function state() {
  return useCookStore.getState();
}

function saveRaw(recipeKey: string, value: unknown) {
  storage.setItem(cookStateKey(recipeKey), typeof value === "string" ? value : JSON.stringify(value));
}

describe("start", () => {
  it("focuses the first step", () => {
    state().start("r1", ["a", "b", "c"]);
    expect(state()).toMatchObject({
      active: true,
      recipeKey: "r1",
      stepIds: ["a", "b", "c"],
      currentStepId: "a",
      doneStepIds: [],
      timers: [],
    });
  });

  it("restores done steps, focus and timers for the same key and drops removed steps", () => {
    saveRaw("r1", {
      v: 1,
      active: false,
      currentStepId: "b",
      doneStepIds: ["a", "gone"],
      timers: [{ id: "t1", label: "Simmer", stepId: "gone", endsAt: NOW + 60_000, durationSec: 60 }],
    });

    state().start("r1", ["a", "b", "c"]);

    expect(state().doneStepIds).toEqual(["a"]);
    expect(state().currentStepId).toBe("b");
    expect(state().timers).toHaveLength(1);
    expect(state().timers[0]?.label).toBe("Simmer");
    expect(state().timers[0]?.stepId).toBeUndefined();
  });

  it("moves focus off a persisted current step that is already done", () => {
    saveRaw("r1", { v: 1, active: true, currentStepId: "a", doneStepIds: ["a"], timers: [] });
    state().start("r1", ["a", "b"]);
    expect(state().currentStepId).toBe("b");
  });

  it("keeps cook state separate per recipe key", () => {
    state().start("saved:abc", ["a", "b"]);
    state().markDone();
    state().start("src-1", ["a", "b"]);

    expect(state().recipeKey).toBe("src-1");
    expect(state().doneStepIds).toEqual([]);
    expect(state().currentStepId).toBe("a");
    expect(readCookState("saved:abc")?.doneStepIds).toEqual(["a"]);
  });

  it("ignores invalid JSON and wrong-version data", () => {
    saveRaw("r1", "{nope");
    state().start("r1", ["a", "b"]);
    expect(state().currentStepId).toBe("a");

    saveRaw("r1", { v: 2, active: true, currentStepId: "b", doneStepIds: ["a"], timers: [] });
    expect(readCookState("r1")).toBeNull();
    state().start("r1", ["a", "b"]);
    expect(state().currentStepId).toBe("a");
    expect(state().doneStepIds).toEqual([]);
  });

  it("focuses null when there are no steps", () => {
    state().start("r1", []);
    expect(state().currentStepId).toBeNull();
  });
});

describe("end", () => {
  it("keeps timers and done steps and persists active:false", () => {
    state().start("r1", ["a", "b"]);
    state().markDone();
    const id = state().startTimer({ label: "Rest", minutes: 5 });

    state().end();

    expect(state()).toMatchObject({ active: false, doneStepIds: ["a"] });
    expect(state().timers.map((t) => t.id)).toEqual([id]);
    expect(readCookState("r1")).toMatchObject({ v: 1, active: false, doneStepIds: ["a"] });
  });
});

describe("syncSteps", () => {
  it("moves focus and cleans done and timer step IDs after a step is removed", () => {
    state().start("r1", ["a", "b", "c"]);
    state().markDone("a");
    state().focusStep("b");
    state().startTimer({ label: "Simmer", minutes: 10, stepId: "b" });

    state().syncSteps(["a", "c"]);

    expect(state().stepIds).toEqual(["a", "c"]);
    expect(state().doneStepIds).toEqual(["a"]);
    expect(state().currentStepId).toBe("c");
    expect(state().timers[0]?.stepId).toBeUndefined();
    expect(readCookState("r1")?.currentStepId).toBe("c");
    expect(readCookState("r1")?.timers[0]?.stepId).toBeUndefined();
  });

  it("keeps the focus when the focused step still exists", () => {
    state().start("r1", ["a", "b", "c"]);
    state().focusStep("b");
    state().syncSteps(["a", "b", "c", "d"]);
    expect(state().currentStepId).toBe("b");
    expect(state().stepIds).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the same state object when nothing changed", () => {
    state().start("r1", ["a", "b"]);
    const before = state();
    state().syncSteps(["a", "b"]);
    expect(state()).toBe(before);
  });

  it("focuses null when every remaining step is done", () => {
    state().start("r1", ["a", "b"]);
    state().markDone("b");
    state().syncSteps(["b"]);
    expect(state().currentStepId).toBeNull();
    expect(state().doneStepIds).toEqual(["b"]);
  });
});

describe("focusStep", () => {
  it("reopens a done step", () => {
    state().start("r1", ["a", "b"]);
    state().markDone("a");
    state().focusStep("a");
    expect(state().currentStepId).toBe("a");
    expect(state().doneStepIds).toEqual([]);
  });

  it("ignores unknown IDs", () => {
    state().start("r1", ["a", "b"]);
    const before = state();
    state().focusStep("zzz");
    expect(state()).toBe(before);
  });
});

describe("markDone", () => {
  it("marks the current step and focuses the next one", () => {
    state().start("r1", ["a", "b", "c"]);
    state().markDone();
    expect(state().doneStepIds).toEqual(["a"]);
    expect(state().currentStepId).toBe("b");
  });

  it("wraps to the first open step before the marked one", () => {
    state().start("r1", ["a", "b", "c"]);
    state().markDone("b");
    state().focusStep("c");
    state().markDone();
    expect(state().currentStepId).toBe("a");
    expect(state().doneStepIds).toEqual(["b", "c"]);
  });

  it("leaves the focus alone when a non-current step is marked", () => {
    state().start("r1", ["a", "b", "c"]);
    state().markDone("c");
    expect(state().currentStepId).toBe("a");
    expect(state().doneStepIds).toEqual(["c"]);
  });

  it("focuses null when every step is done", () => {
    state().start("r1", ["a", "b"]);
    state().markDone();
    state().markDone();
    expect(state().doneStepIds).toEqual(["a", "b"]);
    expect(state().currentStepId).toBeNull();
  });

  it("ignores unknown IDs and a null focus, and does not duplicate", () => {
    state().start("r1", ["a", "b"]);
    const before = state();
    state().markDone("zzz");
    expect(state()).toBe(before);

    state().markDone("a");
    state().markDone("a");
    expect(state().doneStepIds).toEqual(["a"]);

    useCookStore.setState({ currentStepId: null });
    const unfocused = state();
    state().markDone();
    expect(state()).toBe(unfocused);
  });
});

describe("markUndone", () => {
  it("removes a step from the done list", () => {
    state().start("r1", ["a", "b"]);
    state().markDone("a");
    state().markUndone("a");
    expect(state().doneStepIds).toEqual([]);
    expect(readCookState("r1")?.doneStepIds).toEqual([]);
  });
});

describe("next, previous and goTo", () => {
  it("next moves forward and returns the new step; null and no change at the end", () => {
    state().start("r1", ["a", "b"]);
    expect(state().next()).toBe("b");
    const atEnd = state();
    expect(state().next()).toBeNull();
    expect(state()).toBe(atEnd);
  });

  it("previous moves back; null and no change at the start", () => {
    state().start("r1", ["a", "b"]);
    state().next();
    expect(state().previous()).toBe("a");
    const atStart = state();
    expect(state().previous()).toBeNull();
    expect(state()).toBe(atStart);
  });

  it("next from no focus focuses the first step", () => {
    state().start("r1", ["a", "b"]);
    useCookStore.setState({ currentStepId: null });
    expect(state().next()).toBe("a");
    expect(state().currentStepId).toBe("a");
  });

  it("navigation over a done step does not reopen it", () => {
    state().start("r1", ["a", "b"]);
    state().markDone("a");
    state().goTo(1);
    expect(state().currentStepId).toBe("a");
    expect(state().doneStepIds).toEqual(["a"]);
  });

  it("goTo is 1-based and rejects out-of-range or non-integer values", () => {
    state().start("r1", ["a", "b", "c"]);
    expect(state().goTo(2)).toBe("b");
    expect(state().currentStepId).toBe("b");
    expect(state().goTo(3)).toBe("c");

    const before = state();
    for (const n of [0, -1, 4, 1.5, Number.NaN]) {
      expect(state().goTo(n)).toBeNull();
      expect(state()).toBe(before);
    }
  });

  it("navigation persists the focus", () => {
    state().start("r1", ["a", "b"]);
    state().next();
    expect(readCookState("r1")?.currentStepId).toBe("b");
  });
});

describe("timers", () => {
  it("startTimer stores end time, duration and returns the ID", () => {
    const id = state().startTimer({ label: "  Simmer  ", minutes: 2.5, stepId: "a" });
    const timer = state().timers[0];
    expect(timer).toMatchObject({
      id,
      label: "Simmer",
      stepId: "a",
      endsAt: NOW + 150_000,
      durationSec: 150,
    });
    expect(timer?.firedAt).toBeUndefined();
    expect(readCookState("r1")).toBeNull();
  });

  it("falls back to a default label when the label is empty", () => {
    state().startTimer({ label: "   ", minutes: 1 });
    expect(state().timers[0]?.label).toBe("Timer");
  });

  it("cuts labels to 40 characters", () => {
    state().startTimer({ label: "x".repeat(60), minutes: 1 });
    expect(state().timers[0]?.label).toBe("x".repeat(40));
  });

  it("rejects minutes outside 0 < minutes <= 600 and non-finite values", () => {
    for (const minutes of [0, -1, 601, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => state().startTimer({ label: "t", minutes })).toThrow(RangeError);
    }
    expect(state().timers).toHaveLength(0);
    expect(() => state().startTimer({ label: "t", minutes: 600 })).not.toThrow();
    expect(() => state().startTimer({ label: "t", minutes: 0.5 })).not.toThrow();
  });

  it("caps at 10 timers by dropping the one ending soonest", () => {
    const ids: string[] = [];
    for (let k = 1; k <= 10; k++) {
      ids.push(state().startTimer({ label: `T${k}`, minutes: k * 10 }));
    }
    state().startTimer({ label: "new", minutes: 300 });

    expect(state().timers).toHaveLength(10);
    expect(state().timers.some((t) => t.id === ids[0])).toBe(false);
    expect(state().timers.some((t) => t.id === ids[1])).toBe(true);
  });

  it("drops the oldest fired timer before any running one", () => {
    const ids: string[] = [];
    for (let k = 1; k <= 10; k++) {
      ids.push(state().startTimer({ label: `T${k}`, minutes: k * 10 }));
    }
    // ids[6] rang first, so it goes; ids[0] ends soonest but is still running.
    vi.mocked(Date.now).mockReturnValue(NOW + 100);
    state().markFired(ids[6] ?? "");
    vi.mocked(Date.now).mockReturnValue(NOW + 200);
    state().markFired(ids[4] ?? "");

    state().startTimer({ label: "new", minutes: 300 });

    expect(state().timers).toHaveLength(10);
    expect(state().timers.some((t) => t.id === ids[6])).toBe(false);
    expect(state().timers.some((t) => t.id === ids[4])).toBe(true);
    expect(state().timers.some((t) => t.id === ids[0])).toBe(true);
  });

  it("cancelTimer and dismissTimer remove the timer", () => {
    const a = state().startTimer({ label: "a", minutes: 1 });
    const b = state().startTimer({ label: "b", minutes: 2 });
    const c = state().startTimer({ label: "c", minutes: 3 });
    state().cancelTimer(a);
    state().dismissTimer(b);
    expect(state().timers.map((t) => t.id)).toEqual([c]);
  });

  it("markFired sets firedAt once", () => {
    const id = state().startTimer({ label: "a", minutes: 1 });
    state().markFired(id);
    expect(state().timers[0]?.firedAt).toBe(NOW);

    vi.mocked(Date.now).mockReturnValue(NOW + 5_000);
    state().markFired(id);
    expect(state().timers[0]?.firedAt).toBe(NOW);
  });

  it("persists timers for the recipe", () => {
    state().start("r1", ["a"]);
    const id = state().startTimer({ label: "Simmer", minutes: 5, stepId: "a" });
    expect(readCookState("r1")?.timers.map((t) => t.id)).toEqual([id]);
  });

  it("dueTimers returns ended timers that have not rung", () => {
    const timers = [
      { id: "ended", label: "", endsAt: NOW - 1, durationSec: 1 },
      { id: "exact", label: "", endsAt: NOW, durationSec: 1 },
      { id: "rang", label: "", endsAt: NOW - 1, durationSec: 1, firedAt: NOW - 1 },
      { id: "running", label: "", endsAt: NOW + 1, durationSec: 1 },
    ];
    expect(dueTimers(timers, NOW).map((t) => t.id)).toEqual(["ended", "exact"]);
  });
});

describe("persistence", () => {
  it("writes nothing when there is no recipe key", () => {
    useCookStore.setState({ stepIds: ["a", "b"], currentStepId: "a" });
    state().focusStep("b");
    state().markDone("a");
    expect(storage.length).toBe(0);
  });

  it("readCookState returns the saved record or null", () => {
    expect(readCookState("r1")).toBeNull();
    state().start("r1", ["a", "b"]);
    state().markDone();
    expect(readCookState("r1")).toEqual({
      v: 1,
      active: true,
      currentStepId: "b",
      doneStepIds: ["a"],
      timers: [],
    });
  });

  it("keeps working when getItem and setItem throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    });

    expect(() => {
      state().start("r1", ["a", "b"]);
      state().markDone();
      state().startTimer({ label: "t", minutes: 1 });
      state().end();
    }).not.toThrow();
    expect(state().currentStepId).toBe("b");
    expect(state().doneStepIds).toEqual(["a"]);
    expect(readCookState("r1")).toBeNull();
  });

  it("keeps working when localStorage is missing", () => {
    vi.stubGlobal("localStorage", undefined);
    state().start("r1", ["a", "b"]);
    state().next();
    expect(state().currentStepId).toBe("b");
  });

  it("derives step states from the store", () => {
    state().start("r1", ["a", "b", "c"]);
    state().markDone("a");
    expect(stepStateOf(state(), "a")).toBe("done");
    expect(stepStateOf(state(), "b")).toBe("current");
    expect(stepStateOf(state(), "c")).toBe("upcoming");
  });
});
