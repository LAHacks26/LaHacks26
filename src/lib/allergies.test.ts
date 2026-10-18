import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLERGIES_KEY, normalizeAllergies, parseAllergies, readAllergies, readAllergiesRaw,
  subscribeAllergies, writeAllergies,
} from "./allergies";

let values: Map<string, string>;
let events: EventTarget;
let cleanup: (() => void)[];

beforeEach(() => {
  values = new Map();
  events = new EventTarget();
  cleanup = [];
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("window", events);
  writeAllergies([]);
  values.clear();
});

afterEach(() => {
  cleanup.forEach((unsubscribe) => unsubscribe());
  // Clear any memory fallback while writable storage is still present.
  vi.stubGlobal("localStorage", { setItem: () => {}, getItem: () => null });
  writeAllergies([]);
  vi.unstubAllGlobals();
});

describe("allergy preferences", () => {
  it("normalizes case, spacing and duplicates without truncating allergen names", () => {
    expect(normalizeAllergies([" Dairy ", "dairy", "SOY", "", "  ", "a".repeat(81)])).toEqual(["dairy", "soy"]);
    expect(normalizeAllergies(["a".repeat(80)])).toEqual(["a".repeat(80)]);
    expect(normalizeAllergies(Array.from({ length: 35 }, (_, i) => `allergen ${i}`))).toHaveLength(30);
  });

  it("safely reads malformed storage and normalizes old stored values", () => {
    for (const raw of [null, "bad", "{}", '["dairy",3]']) expect(parseAllergies(raw)).toEqual([]);
    expect(parseAllergies('[" Dairy ", "dairy", "SOY"]')).toEqual(["dairy", "soy"]);
  });

  it("immediately notifies recipe subscribers in the writing tab, with a stable snapshot", () => {
    const seen: string[][] = [];
    const unsubscribe = subscribeAllergies(() => seen.push(readAllergies()));
    cleanup.push(unsubscribe);
    expect(writeAllergies([" DAIRY "])).toBe(true);
    expect(seen).toEqual([["dairy"]]);
    expect(values.get(ALLERGIES_KEY)).toBe('["dairy"]');
    expect(readAllergiesRaw()).toBe(readAllergiesRaw());
    unsubscribe();
    writeAllergies(["soy"]);
    expect(seen).toHaveLength(1);
  });

  it("keeps current choices in memory and notifies subscribers when storage fails", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } });
    const listener = vi.fn();
    cleanup.push(subscribeAllergies(listener));
    expect(writeAllergies(["sesame"])).toBe(false);
    expect(readAllergies()).toEqual(["sesame"]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("responds to other-tab changes and cookie-independent local storage clearing", () => {
    const seen: string[][] = [];
    cleanup.push(subscribeAllergies(() => seen.push(readAllergies())));
    values.set(ALLERGIES_KEY, '["egg"]');
    events.dispatchEvent(Object.assign(new Event("storage"), { key: "unrelated" }));
    expect(seen).toEqual([]);
    events.dispatchEvent(Object.assign(new Event("storage"), { key: ALLERGIES_KEY }));
    expect(seen).toEqual([["egg"]]);
    values.clear();
    events.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
    expect(seen).toEqual([["egg"], []]);
  });
});
