import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the limit, then rejects", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a")).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it("reports when the oldest hit leaves the window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check("a");
    vi.advanceTimersByTime(20_000);
    limiter.check("a");
    vi.advanceTimersByTime(10_000);
    // The first hit expires in 30 s.
    expect(limiter.check("a")).toEqual({ ok: false, retryAfterSec: 30 });
  });

  it("frees the budget once the window has passed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(limiter.check("a").ok).toBe(true);
  });

  it("counts each key separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("b").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(false);
  });

  it("does not record rejected hits, so waiting is enough to recover", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("a");
    for (let i = 0; i < 5; i++) limiter.check("a");
    vi.advanceTimersByTime(60_000);
    expect(limiter.check("a").ok).toBe(true);
  });

  it("prunes keys whose hits have all expired", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
    limiter.check("a");
    limiter.check("b");
    expect(limiter.size()).toBe(2);
    vi.advanceTimersByTime(61_000);
    limiter.check("c");
    expect(limiter.size()).toBe(1);
  });

  it("rejects invalid settings", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow(RangeError);
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow(RangeError);
  });
});
