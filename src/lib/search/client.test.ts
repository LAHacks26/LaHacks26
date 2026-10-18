import { afterEach, describe, expect, it, vi } from "vitest";
import { readAllergies } from "./client";

describe("readAllergies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty list when there is no window (server render)", () => {
    expect(readAllergies()).toEqual([]);
  });

  it("returns the shared stored string array", () => {
    vi.stubGlobal("localStorage", { getItem: () => '["dairy", "egg"]' });
    expect(readAllergies()).toEqual(["dairy", "egg"]);
  });

  it("returns an empty list when nothing is stored", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    expect(readAllergies()).toEqual([]);
  });

  it("returns an empty list for malformed JSON or a non-array value", () => {
    vi.stubGlobal("localStorage", { getItem: () => "{nope" });
    expect(readAllergies()).toEqual([]);

    vi.stubGlobal("localStorage", { getItem: () => '{"dairy":true}' });
    expect(readAllergies()).toEqual([]);
  });

  it("returns an empty list when storage access throws", () => {
    vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("blocked");
        },
    });
    expect(readAllergies()).toEqual([]);
  });
});
