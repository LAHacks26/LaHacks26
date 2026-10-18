import { describe, expect, it } from "vitest";
import { formatSseMessage, isTerminalEvent } from "./sse";
import type { SearchEvent } from "./types";

describe("formatSseMessage", () => {
  it("writes an event line and a data line, ended by a blank line", () => {
    const message = formatSseMessage({ type: "agent_step", text: "Reading ingredients…" });
    expect(message).toBe(
      'event: agent_step\ndata: {"type":"agent_step","text":"Reading ingredients…"}\n\n',
    );
  });

  it("keeps the data on one line even when the text has newlines", () => {
    const message = formatSseMessage({ type: "error", code: "failed", message: "line one\nline two" });
    const dataLines = message.split("\n").filter((line) => line.startsWith("data: "));
    expect(dataLines).toHaveLength(1);
    expect(JSON.parse(dataLines[0].slice("data: ".length))).toEqual({
      type: "error",
      code: "failed",
      message: "line one\nline two",
    });
  });
});

describe("isTerminalEvent", () => {
  it("treats done and error as terminal", () => {
    expect(isTerminalEvent({ type: "done" })).toBe(true);
    expect(isTerminalEvent({ type: "error", code: "failed", message: "x" })).toBe(true);
  });

  it("treats the other events as non-terminal", () => {
    const events: SearchEvent[] = [
      { type: "meta", query: "x", constraints: [] },
      { type: "cached", items: [] },
      { type: "agent_started", liveUrl: null },
      { type: "agent_step", text: "x" },
    ];
    for (const event of events) expect(isTerminalEvent(event)).toBe(false);
  });
});
