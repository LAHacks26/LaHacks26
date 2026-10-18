import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "./canonicalUrl";

describe("canonicalizeUrl", () => {
  it("drops the hash", () => {
    expect(canonicalizeUrl("https://example.com/recipe#reviews")).toBe("https://example.com/recipe");
  });

  it("drops utm_*, fbclid and gclid, and keeps other parameters", () => {
    expect(
      canonicalizeUrl("https://example.com/r?id=7&utm_source=x&UTM_medium=y&fbclid=abc&gclid=def&page=2"),
    ).toBe("https://example.com/r?id=7&page=2");
  });

  it("leaves no trailing question mark when every parameter was tracking", () => {
    expect(canonicalizeUrl("https://example.com/r?utm_campaign=spring")).toBe("https://example.com/r");
  });

  it("keeps the URL unchanged when there is nothing to remove", () => {
    expect(canonicalizeUrl("https://www.allrecipes.com/recipe/141169/easy-indian-butter-chicken/")).toBe(
      "https://www.allrecipes.com/recipe/141169/easy-indian-butter-chicken/",
    );
  });

  it("trims whitespace and lowercases the host", () => {
    expect(canonicalizeUrl("  HTTPS://Example.COM/Recipe  ")).toBe("https://example.com/Recipe");
  });

  it("gives the same key for URLs that differ only in tracking or hash", () => {
    const a = canonicalizeUrl("https://example.com/a?utm_source=news#top");
    const b = canonicalizeUrl("https://example.com/a");
    expect(a).toBe(b);
  });

  it("returns null for non-web links", () => {
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("ftp://example.com/file")).toBeNull();
    expect(canonicalizeUrl("not a url")).toBeNull();
    expect(canonicalizeUrl("")).toBeNull();
  });
});
