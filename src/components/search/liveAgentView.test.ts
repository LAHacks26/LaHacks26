import { describe, expect, it } from "vitest";
import { displayAddress } from "./LiveAgentView";

describe("displayAddress", () => {
  it("never shows a live URL's query, which carries the browser's CDP endpoint", () => {
    expect(displayAddress("https://live.browser-use.com/?wss=https%3A%2F%2Fsecret.cdp.browser-use.com&readOnly=true")).toBe("live.browser-use.com");
  });

  it("shows host and path for a page", () => {
    expect(displayAddress("https://www.allrecipes.com/recipe/150313/thai/?utm=x#top")).toBe("www.allrecipes.com/recipe/150313/thai/");
    expect(displayAddress("not a url?token=1")).toBe("not a url");
  });
});
