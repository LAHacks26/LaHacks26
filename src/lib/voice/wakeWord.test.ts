import { describe, expect, it } from "vitest";
import { matchWakeWord } from "./wakeWord";

describe("matchWakeWord", () => {
  it.each([
    ["Hey Saffron, next step", "next step"],
    ["hey sapphire", ""],
    ["okay saffron set a timer for this", "set a timer for this"],
    ["HI SAFRON. what's next?", "what's next?"],
    ["um hey saffran go to step 3", "go to step 3"],
    ["heysaffron next", "next"],
    ["hey safron, repeat that", "repeat that"],
    ["ok saffron", ""],
  ])("matches %j and returns the rest %j", (transcript, rest) => {
    expect(matchWakeWord(transcript)).toEqual({ rest });
  });

  it.each([
    ["I love saffron rice"],
    ["hey siri"],
    [""],
    ["saffron"],
    ["shi saffron"],
  ])("returns null for %j", (transcript) => {
    expect(matchWakeWord(transcript)).toBeNull();
  });
});
