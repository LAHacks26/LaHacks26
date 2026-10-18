import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECT_TIMEOUT_MS, STALL_TIMEOUT_MS, subscribeSearch } from "./client";
import type { SearchEvent } from "./types";

/** A stand-in for the browser's EventSource: tests drive open, messages and failures by hand. */
class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  open() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  /** A named SSE message with a string payload. */
  send(name: string, payload: object | string) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data });
    }
  }

  /** A connection failure: readyState says whether the browser will retry (CONNECTING) or gave up (CLOSED). */
  fail(readyState: number) {
    this.readyState = readyState;
    // Native connection errors arrive as plain events with no data.
    for (const listener of this.listeners.get("error") ?? []) {
      listener({});
    }
    this.onerror?.();
  }

  static latest(): FakeEventSource {
    const source = FakeEventSource.instances.at(-1);
    if (!source) {
      throw new Error("no EventSource was created");
    }
    return source;
  }
}

function stepText(event: SearchEvent): string {
  return event.type === "agent_step" ? event.text : event.type;
}

describe("subscribeSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens the stream for the given search id", () => {
    subscribeSearch("abc 123", () => {});
    expect(FakeEventSource.latest().url).toBe("/api/search/abc%20123/stream");
  });

  it("drops replayed events after a reconnect and delivers only the new ones", () => {
    const events: SearchEvent[] = [];
    subscribeSearch("s1", (event) => events.push(event));
    const first = FakeEventSource.latest();

    first.open();
    first.send("agent_step", { type: "agent_step", text: "A" });
    first.fail(FakeEventSource.CONNECTING);

    // The browser reconnects. The server replays A, then sends B.
    first.open();
    first.send("agent_step", { type: "agent_step", text: "A" });
    first.send("agent_step", { type: "agent_step", text: "B" });

    expect(events.map(stepText)).toEqual(["A", "B"]);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("delivers a terminal event that arrives inside the replay window", () => {
    const events: SearchEvent[] = [];
    const onError = vi.fn();
    subscribeSearch("s2", (event) => events.push(event), onError);
    const source = FakeEventSource.latest();

    // The first message is malformed, so it is counted but never delivered.
    source.open();
    source.send("error", "not json");
    source.fail(FakeEventSource.CONNECTING);

    // The replay sends the real error at index 0, which the skip window covers.
    source.open();
    source.send("error", { type: "error", code: "agent_failed", message: "Timed out." });

    expect(events).toEqual([{ type: "error", code: "agent_failed", message: "Timed out." }]);
    expect(source.closed).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("closes after done and ignores anything that arrives later", () => {
    const events: SearchEvent[] = [];
    subscribeSearch("s3", (event) => events.push(event));
    const source = FakeEventSource.latest();

    source.open();
    source.send("done", { type: "done" });
    source.send("agent_step", { type: "agent_step", text: "late" });

    expect(events.map((event) => event.type)).toEqual(["done"]);
    expect(source.closed).toBe(true);
  });

  it("closes after error and ignores anything that arrives later", () => {
    const events: SearchEvent[] = [];
    subscribeSearch("s4", (event) => events.push(event));
    const source = FakeEventSource.latest();

    source.open();
    source.send("error", { type: "error", code: "not_food", message: "Not a dish." });
    source.send("done", { type: "done" });

    expect(events).toEqual([{ type: "error", code: "not_food", message: "Not a dish." }]);
    expect(source.closed).toBe(true);
  });

  it("unsubscribe closes the stream and stops delivery", () => {
    const events: SearchEvent[] = [];
    const unsubscribe = subscribeSearch("s5", (event) => events.push(event));
    const source = FakeEventSource.latest();

    source.open();
    unsubscribe();
    source.send("agent_step", { type: "agent_step", text: "after unsubscribe" });

    expect(source.closed).toBe(true);
    expect(events).toEqual([]);
  });

  it("skips malformed and unknown payloads without ending the stream", () => {
    const events: SearchEvent[] = [];
    subscribeSearch("s6", (event) => events.push(event));
    const source = FakeEventSource.latest();

    source.open();
    source.send("agent_step", "{not json");
    source.send("agent_step", { type: "agent_step", text: 42 });
    source.send("agent_step", { type: "agent_step", text: "ok" });

    expect(events.map(stepText)).toEqual(["ok"]);
    expect(source.closed).toBe(false);
  });

  it("fills in the type from the SSE event name when the payload omits it", () => {
    const events: SearchEvent[] = [];
    subscribeSearch("s7", (event) => events.push(event));
    const source = FakeEventSource.latest();

    source.open();
    source.send("agent_step", { text: "no type field" });

    expect(events).toEqual([{ type: "agent_step", text: "no type field" }]);
  });

  it("gives up when the stream never opens within the connect window", () => {
    const onError = vi.fn();
    subscribeSearch("s8", () => {}, onError);
    const source = FakeEventSource.latest();

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1);
    expect(onError).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
  });

  it("opening clears the connect watchdog and starts the stall watchdog", () => {
    const onError = vi.fn();
    subscribeSearch("s9", () => {}, onError);
    const source = FakeEventSource.latest();

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1000);
    source.open();

    // Past the connect window, but still inside the stall window.
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(onError).not.toHaveBeenCalled();

    // The stall window is measured from the open: 90 s in total.
    vi.advanceTimersByTime(STALL_TIMEOUT_MS - CONNECT_TIMEOUT_MS - 1);
    expect(onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
  });

  it("any traffic resets the stall watchdog", () => {
    const onError = vi.fn();
    subscribeSearch("s10", () => {}, onError);
    const source = FakeEventSource.latest();

    source.open();
    vi.advanceTimersByTime(STALL_TIMEOUT_MS - 1000);
    source.send("agent_step", { type: "agent_step", text: "still here" });

    vi.advanceTimersByTime(STALL_TIMEOUT_MS - 1);
    expect(onError).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("gives a browser retry the connect window before failing", () => {
    const onError = vi.fn();
    subscribeSearch("s11", () => {}, onError);
    const source = FakeEventSource.latest();

    source.open();
    source.fail(FakeEventSource.CONNECTING);
    expect(onError).not.toHaveBeenCalled();

    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
  });

  it("reports a closed connection at once and closes", () => {
    const onError = vi.fn();
    subscribeSearch("s12", () => {}, onError);
    const source = FakeEventSource.latest();

    source.open();
    source.fail(FakeEventSource.CLOSED);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
  });

  it("does not report an error after the run finished", () => {
    const onError = vi.fn();
    subscribeSearch("s13", () => {}, onError);
    const source = FakeEventSource.latest();

    source.open();
    source.send("done", { type: "done" });
    source.fail(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(STALL_TIMEOUT_MS * 2);

    expect(onError).not.toHaveBeenCalled();
  });
});
