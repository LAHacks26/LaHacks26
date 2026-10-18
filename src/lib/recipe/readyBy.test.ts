import { describe, expect, it } from "vitest";
import { defaultReadyByClock, parseReadyBy, readyByFromClock, recipeHref } from "./readyBy";

describe("ready-by navigation", () => {
  it("converts local clock time into an absolute deadline", () => {
    const now = new Date(2026, 9, 18, 17, 0);
    const result = readyByFromClock("19:30", now)!;
    expect(new Date(result).getHours()).toBe(19);
    expect(new Date(result).getDate()).toBe(18);
    expect(parseReadyBy(result)).toBe(result);
    expect(now.getHours()).toBe(17);
  });

  it("uses tomorrow for an earlier clock time, including month rollover", () => {
    const now = new Date(2026, 9, 31, 23, 30);
    const deadline = new Date(readyByFromClock("00:30", now)!);
    expect(deadline.getMonth()).toBe(10);
    expect(deadline.getDate()).toBe(1);
    expect(deadline.getHours()).toBe(0);
    expect(defaultReadyByClock(now)).toBe("00:30");
  });

  it("omits an unset clock and rejects malformed times", () => {
    expect(readyByFromClock("", new Date())).toBeUndefined();
    for (const input of ["24:00", "12:60", "7:30", "tomorrow"]) {
      expect(() => readyByFromClock(input, new Date())).toThrow();
    }
  });

  it("round-trips an offset through recipe links without turning + into a space", () => {
    const readyBy = "2026-10-18T19:30:00+05:30";
    const url = new URL(recipeHref("source-id", readyBy), "https://saffron.test");
    expect(url.pathname).toBe("/recipe/source-id");
    expect(parseReadyBy(url.searchParams.get("readyBy"))).toBe(readyBy);
  });

  it("rejects invalid/repeated params and keeps deadline-free links simple", () => {
    expect(parseReadyBy(["2026-10-18T19:30:00Z"])).toBeUndefined();
    expect(parseReadyBy("2026-10-18T19:30:00")).toBeUndefined();
    expect(recipeHref("source-id", "invalid")).toBe("/recipe/source-id");
    expect(recipeHref("source-id")).toBe("/recipe/source-id");
  });
});
