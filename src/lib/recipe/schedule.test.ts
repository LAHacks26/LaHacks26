import { describe, expect, it } from "vitest";
import { formatClock, maxTotalMinFor, readyByStatus, stepClockTimes } from "./schedule";
import type { Step } from "./schema";

const MIN = 60_000;

function step(id: string, estMin: number): Step {
  return { id: `s${id}`, text: `Step ${id}`, ingredientIds: [], applianceIds: [], estMin, tips: [] };
}

// Minutes after `start` for each date, so assertions read as offsets.
function offsetsMin(dates: Date[], start: Date): number[] {
  return dates.map((d) => (d.getTime() - start.getTime()) / MIN);
}

// Fixed instants. Only differences and UTC-based formatting are used, so the machine timezone doesn't matter.
const START = new Date("2026-10-18T18:00:00Z");

describe("stepClockTimes", () => {
  it("starts each step at its cumulative estMin when the total matches", () => {
    const steps = [step("1", 10), step("2", 20), step("3", 30)];
    const times = stepClockTimes(steps, 60, START);
    expect(offsetsMin(times, START)).toEqual([0, 10, 30]);
  });

  it("scales cumulative estMin so the steps fill totalMin", () => {
    // Sum is 60 and the total is 120, so every minute counts double.
    const steps = [step("1", 10), step("2", 20), step("3", 30)];
    const times = stepClockTimes(steps, 120, START);
    expect(offsetsMin(times, START)).toEqual([0, 20, 60]);
  });

  it("scales down when the total is shorter than the estimates", () => {
    const steps = [step("1", 30), step("2", 30)];
    const times = stepClockTimes(steps, 30, START);
    expect(offsetsMin(times, START)).toEqual([0, 15]);
  });

  it("spreads steps evenly when every estMin is 0", () => {
    const steps = [step("1", 0), step("2", 0), step("3", 0)];
    const times = stepClockTimes(steps, 90, START);
    expect(offsetsMin(times, START)).toEqual([0, 30, 60]);
  });

  it("gives one step per list entry, in order", () => {
    const steps = [step("1", 5), step("2", 0), step("3", 15), step("4", 10)];
    const times = stepClockTimes(steps, 30, START);
    expect(times).toHaveLength(4);
    const offsets = offsetsMin(times, START);
    for (let i = 1; i < offsets.length; i += 1) expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
  });

  it("starts the first step at the start time", () => {
    const times = stepClockTimes([step("1", 4), step("2", 6)], 20, START);
    expect(times[0].getTime()).toBe(START.getTime());
  });

  it("returns an empty array for no steps", () => {
    expect(stepClockTimes([], 30, START)).toEqual([]);
  });

  it("puts every step at the start when totalMin is 0", () => {
    const times = stepClockTimes([step("1", 5), step("2", 5)], 0, START);
    expect(offsetsMin(times, START)).toEqual([0, 0]);
  });

  it("returns new Date objects and leaves the start date alone", () => {
    const start = new Date("2026-10-18T18:00:00Z");
    const times = stepClockTimes([step("1", 5), step("2", 5)], 10, start);
    expect(times[0]).not.toBe(start);
    expect(start.toISOString()).toBe("2026-10-18T18:00:00.000Z");
  });

  it("rounds to whole milliseconds", () => {
    // Three 1-min steps across 10 min: offsets 0, 3⅓ and 6⅔ min.
    const times = stepClockTimes([step("1", 1), step("2", 1), step("3", 1)], 10, START);
    const offsets = offsetsMin(times, START);
    expect(offsets[1]).toBeCloseTo(10 / 3, 4);
    expect(offsets[2]).toBeCloseTo(20 / 3, 4);
    for (const t of times) expect(Number.isInteger(t.getTime())).toBe(true);
  });
});

describe("readyByStatus", () => {
  const READY_BY = new Date("2026-10-18T19:30:00Z");

  it("is ahead while the start time is still in the future", () => {
    const now = new Date("2026-10-18T18:00:00Z");
    const status = readyByStatus(READY_BY, 45, now);
    expect(status.kind).toBe("ahead");
    if (status.kind !== "ahead") return;
    expect(status.startBy.toISOString()).toBe("2026-10-18T18:45:00.000Z");
    expect(status.readyAt.toISOString()).toBe("2026-10-18T19:30:00.000Z");
  });

  it("is late once the start time has passed, with readyAt = now + totalMin", () => {
    const now = new Date("2026-10-18T19:00:00Z");
    const status = readyByStatus(READY_BY, 45, now);
    expect(status).toEqual({ kind: "late", readyAt: new Date("2026-10-18T19:45:00Z") });
  });

  it("is late exactly at the start time (the start time has passed)", () => {
    const now = new Date("2026-10-18T18:45:00Z");
    const status = readyByStatus(READY_BY, 45, now);
    expect(status).toEqual({ kind: "late", readyAt: new Date("2026-10-18T19:30:00Z") });
  });

  it("is ahead one millisecond before the start time", () => {
    const now = new Date("2026-10-18T18:44:59.999Z");
    expect(readyByStatus(READY_BY, 45, now).kind).toBe("ahead");
  });

  it("is late when the ready-by time is already past", () => {
    const now = new Date("2026-10-18T20:00:00Z");
    const status = readyByStatus(READY_BY, 30, now);
    expect(status).toEqual({ kind: "late", readyAt: new Date("2026-10-18T20:30:00Z") });
  });

  it("handles a zero-minute recipe", () => {
    const now = new Date("2026-10-18T19:00:00Z");
    expect(readyByStatus(READY_BY, 0, now).kind).toBe("ahead");
    expect(readyByStatus(READY_BY, 0, now)).toMatchObject({ readyAt: READY_BY });
  });

  it("does not mutate the readyBy date", () => {
    const readyBy = new Date("2026-10-18T19:30:00Z");
    readyByStatus(readyBy, 45, new Date("2026-10-18T18:00:00Z"));
    expect(readyBy.toISOString()).toBe("2026-10-18T19:30:00.000Z");
  });
});

describe("formatClock", () => {
  const LA = "America/Los_Angeles";

  it("formats the time in the given zone as 12-hour with AM/PM", () => {
    // 18:45 PDT on 18 October 2026 (UTC-7).
    expect(formatClock(new Date("2026-10-19T01:45:00Z"), LA, "en-US")).toBe("6:45 PM");
  });

  it("formats midnight and noon", () => {
    expect(formatClock(new Date("2026-10-18T07:05:00Z"), LA, "en-US")).toBe("12:05 AM");
    expect(formatClock(new Date("2026-10-18T19:00:00Z"), LA, "en-US")).toBe("12:00 PM");
  });

  it("pads minutes to two digits", () => {
    expect(formatClock(new Date("2026-10-19T02:07:00Z"), LA, "en-US")).toBe("7:07 PM");
  });

  it("uses the zone rather than UTC", () => {
    // 19:30 UTC is 12:30 PM in Los Angeles, not 7:30 PM.
    expect(formatClock(new Date("2026-10-18T19:30:00Z"), LA, "en-US")).toBe("12:30 PM");
  });

  it("returns normal spaces, not narrow no-break spaces", () => {
    const text = formatClock(new Date("2026-10-19T01:45:00Z"), LA, "en-US");
    expect(text).not.toMatch(/[  ]/);
    expect(text).toContain(" PM");
  });

  it("falls back to the machine's locale and zone when none are given", () => {
    const text = formatClock(new Date("2026-10-19T01:45:00Z"));
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("maxTotalMinFor", () => {
  const NOW = new Date("2026-10-18T18:00:00Z");

  it("subtracts the default 5 minute buffer from the minutes until ready-by", () => {
    expect(maxTotalMinFor(new Date("2026-10-18T19:30:00Z"), NOW)).toBe(85);
  });

  it("uses the buffer that is passed in", () => {
    expect(maxTotalMinFor(new Date("2026-10-18T19:30:00Z"), NOW, 0)).toBe(90);
    expect(maxTotalMinFor(new Date("2026-10-18T19:30:00Z"), NOW, 10)).toBe(80);
  });

  it("floors to whole minutes", () => {
    // 62.5 min until ready-by, minus 5, is 57.5, which floors to 57.
    expect(maxTotalMinFor(new Date("2026-10-18T19:02:30Z"), NOW)).toBe(57);
    // 7.5 min minus 5 is 2.5, which floors to 2.
    expect(maxTotalMinFor(new Date("2026-10-18T18:07:30Z"), NOW)).toBe(2);
  });

  it("is 0 when the buffer eats all the time", () => {
    expect(maxTotalMinFor(new Date("2026-10-18T18:03:00Z"), NOW)).toBe(0);
  });

  it("floors at 0 when ready-by has passed", () => {
    expect(maxTotalMinFor(new Date("2026-10-18T17:00:00Z"), NOW)).toBe(0);
    expect(maxTotalMinFor(new Date("2026-10-18T18:00:00Z"), NOW)).toBe(0);
  });
});
