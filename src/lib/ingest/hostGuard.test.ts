import { describe, expect, it } from "vitest";
import { isBlockedHost, isBlockedIp } from "./hostGuard";

describe("isBlockedHost", () => {
  it.each([
    "localhost",
    "LOCALHOST.",
    "printer.local",
    "api.internal",
    "app.localhost",
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "100.127.255.255",
    "224.0.0.1",
    "255.255.255.255",
    "[::1]",
    "::1",
    "[::]",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "[::ffff:127.0.0.1]",
    "::ffff:7f00:1",
    "[64:ff9b::a00:1]",
    "198.51.100.7",
    "203.0.113.9",
    "192.0.2.10",
    "192.0.0.5",
    "[2002:c0a8:101::1]",
    "[2002::1]",
    "[2001:0:4136:e378:8000:63bf:3fff:fdd2]",
    "[2001:0::1]",
  ])("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each([
    "allrecipes.com",
    "www.budgetbytes.com",
    "example.com.",
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "1.1.1.1",
    "[2606:4700:4700::1111]",
    "[2001:4860:4860::8888]",
    "192.0.1.1",
    "192.0.43.10",
    "198.51.101.1",
    "203.0.114.1",
  ])("allows %s", (host) => {
    expect(isBlockedHost(host)).toBe(false);
  });
});

describe("isBlockedIp", () => {
  it("checks resolved addresses for both families", () => {
    expect(isBlockedIp("10.0.0.5")).toBe(true);
    expect(isBlockedIp("104.18.1.1")).toBe(false);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("2606:4700::6810:84e5")).toBe(false);
  });

  it("fails closed on a value that is not an IP", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
});
