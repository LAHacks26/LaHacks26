import { describe, expect, it } from "vitest";
import { databaseUnavailableCode } from "./errors";

describe("databaseUnavailableCode", () => {
  it("finds a connection code anywhere in the cause chain", () => {
    expect(databaseUnavailableCode(Object.assign(new Error("x"), { code: "CONNECT_TIMEOUT" }))).toBe("CONNECT_TIMEOUT");
    const wrapped = new Error("Failed query", { cause: new Error("read", { cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }) }) });
    expect(databaseUnavailableCode(wrapped)).toBe("ECONNRESET");
  });

  it("ignores query errors and non-errors", () => {
    expect(databaseUnavailableCode(Object.assign(new Error("dup"), { code: "23505" }))).toBeNull();
    expect(databaseUnavailableCode(new Error("plain"))).toBeNull();
    expect(databaseUnavailableCode(null)).toBeNull();
    expect(databaseUnavailableCode("ECONNRESET")).toBeNull();
  });
});
