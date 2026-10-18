import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceContext, VoiceStatus, VoiceTurn, VoiceTurnRequest, VoiceTurnResponse } from "./types";
import { WakeWordListener, WebSpeechProvider, announce, voiceSupported } from "./webSpeech";

// A scripted SpeechRecognition. Tests push results, errors and ends into the latest instance.
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  started = false;
  aborted = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  abort() {
    this.aborted = true;
  }
  say(transcript: string, isFinal = true) {
    const result = Object.assign([{ transcript }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  end() {
    this.onend?.();
  }
}

const latest = () => FakeRecognition.instances.at(-1)!;
/** Providers are stopped after each test, as CookMode does on unmount, so open-session counts don't leak. */
const providers: WebSpeechProvider[] = [];
const context: VoiceContext = { title: "Butter chicken", steps: [{ n: 1, text: "Cut the chicken." }], ingredients: [], currentStep: 1 };

beforeEach(() => {
  FakeRecognition.instances = [];
  vi.useFakeTimers();
  // No speechSynthesis: speaking resolves at once.
  vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
});

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.stop()));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WakeWordListener", () => {
  it("hands over the words after the wake phrase and stops listening", () => {
    const onWake = vi.fn();
    const listener = new WakeWordListener(onWake, vi.fn());
    listener.arm();
    expect(latest()).toMatchObject({ started: true, continuous: true, interimResults: true, lang: "en-US" });

    latest().say("hey saffron next step");
    expect(onWake).toHaveBeenCalledWith("next step");
    expect(latest().aborted).toBe(true);
    expect(listener.isArmed).toBe(false);
  });

  it("waits briefly after an interim match for the rest of the sentence", () => {
    const onWake = vi.fn();
    new WakeWordListener(onWake, vi.fn()).arm();
    latest().say("hey saffron", false);
    latest().say("hey saffron set a timer", false);
    expect(onWake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(onWake).toHaveBeenCalledExactlyOnceWith("set a timer");
  });

  it("fires once when the final result arrives before the settle timer", () => {
    const onWake = vi.fn();
    new WakeWordListener(onWake, vi.fn()).arm();
    latest().say("hey saffron", false);
    latest().say("hey saffron what's next");
    vi.advanceTimersByTime(5000);
    expect(onWake).toHaveBeenCalledExactlyOnceWith("what's next");
  });

  it("ignores speech without the wake phrase and restarts after the recognizer ends", () => {
    const onWake = vi.fn();
    new WakeWordListener(onWake, vi.fn()).arm();
    latest().say("I love saffron rice");
    vi.advanceTimersByTime(1200);
    latest().end();
    vi.advanceTimersByTime(300);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(onWake).not.toHaveBeenCalled();
  });

  it("stops for good when the mic is blocked", () => {
    const onBlocked = vi.fn();
    const listener = new WakeWordListener(vi.fn(), onBlocked);
    listener.arm();
    latest().onerror?.({ error: "not-allowed" });
    latest().end();
    vi.advanceTimersByTime(5000);
    expect(onBlocked).toHaveBeenCalledWith("not-allowed");
    expect(listener.isArmed).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("ignores late events from a recognizer it already replaced", () => {
    const onWake = vi.fn();
    const onBlocked = vi.fn();
    const listener = new WakeWordListener(onWake, onBlocked);
    listener.arm();
    const stale = latest();
    listener.disarm();
    listener.arm();
    stale.say("hey saffron next step");
    stale.onerror?.({ error: "not-allowed" });
    expect(onWake).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
    expect(listener.isArmed).toBe(true);
  });

  it("reports an unsupported browser", () => {
    vi.stubGlobal("window", {});
    const onBlocked = vi.fn();
    new WakeWordListener(vi.fn(), onBlocked).arm();
    expect(onBlocked).toHaveBeenCalledWith("unsupported");
    expect(voiceSupported()).toBe(false);
  });
});

describe("WebSpeechProvider", () => {
  function setup(response: VoiceTurnResponse = { say: "", toolCalls: [{ name: "next_step" }] }) {
    const requestTurn = vi.fn<(body: VoiceTurnRequest, signal: AbortSignal) => Promise<VoiceTurnResponse>>(async () => response);
    const runTool = vi.fn(async () => "Step 2. Marinate.");
    const provider = new WebSpeechProvider({ runTool, requestTurn });
    providers.push(provider);
    const statuses: VoiceStatus[] = [];
    const turns: VoiceTurn[] = [];
    provider.onStatus((status) => statuses.push(status));
    provider.onTurn((turn) => turns.push(turn));
    return { provider, requestTurn, runTool, statuses, turns };
  }

  it("sends the first utterance, runs the tools, speaks, then listens again", async () => {
    const { provider, requestTurn, runTool, statuses, turns } = setup();
    await provider.start({ firstUtterance: "next step", context });

    expect(requestTurn).toHaveBeenCalledWith({ context, transcript: "next step", history: [] }, expect.any(AbortSignal));
    expect(runTool).toHaveBeenCalledWith({ name: "next_step" });
    expect(turns).toEqual([{ who: "you", text: "next step" }, { who: "saffron", text: "Step 2. Marinate." }]);
    expect(statuses).toEqual(["thinking", "listening"]);
    expect(latest()).toMatchObject({ started: true, continuous: false });
  });

  it("sends earlier turns as history and the latest context", async () => {
    const { provider, requestTurn } = setup({ say: "Fold means to mix gently.", toolCalls: [] });
    await provider.start({ firstUtterance: "next step", context });
    const updated = { ...context, currentStep: 2 };
    provider.updateContext(updated);
    latest().say("what does fold mean");
    await vi.waitFor(() => expect(requestTurn).toHaveBeenCalledTimes(2));
    expect(requestTurn.mock.calls[1]![0]).toMatchObject({
      context: updated,
      transcript: "what does fold mean",
      history: [{ who: "you", text: "next step" }, { who: "saffron", text: "Fold means to mix gently." }],
    });
  });

  it("closes the session after 8 seconds of silence, across recognizer restarts", async () => {
    const { provider, statuses } = setup();
    await provider.start({ context });
    vi.advanceTimersByTime(5000);
    latest().end();
    vi.advanceTimersByTime(200);
    expect(FakeRecognition.instances).toHaveLength(2);
    vi.advanceTimersByTime(3000);
    expect(statuses.at(-1)).toBe("idle");
    expect(latest().aborted).toBe(true);
  });

  it("does not cut off a sentence that starts just before the silence limit", async () => {
    const { provider, requestTurn, statuses } = setup();
    await provider.start({ context });
    vi.advanceTimersByTime(7000);
    latest().onspeechstart?.();
    vi.advanceTimersByTime(3000);
    expect(statuses).not.toContain("idle");
    latest().say("what does fold mean");
    await vi.waitFor(() => expect(requestTurn).toHaveBeenCalledTimes(1));
  });

  it("keeps listening after speech without words, but caps it (kitchen noise)", async () => {
    const { provider, statuses } = setup();
    await provider.start({ context });
    latest().onspeechstart?.();
    vi.advanceTimersByTime(10_000);
    latest().end();
    vi.advanceTimersByTime(200);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(statuses).not.toContain("idle");
    // More noise does not extend the cap that the first speech started.
    latest().onspeechstart?.();
    vi.advanceTimersByTime(9000);
    expect(statuses).not.toContain("idle");
    vi.advanceTimersByTime(1000);
    expect(statuses.at(-1)).toBe("idle");
  });

  it("keeps timer announcements quiet while a session is open", async () => {
    const speak = vi.fn();
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition, speechSynthesis: { speak, cancel: vi.fn(), speaking: false, pending: false } });
    vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} });
    const { provider } = setup();
    await provider.start({ context });
    announce("Your rice timer is done.");
    expect(speak).not.toHaveBeenCalled();
    await provider.stop();
    announce("Your rice timer is done.");
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("ignores a repeated wake phrase on its own and keeps listening", async () => {
    const { provider, requestTurn } = setup();
    await provider.start({ context });
    latest().say("hey saffron");
    latest().end();
    vi.advanceTimersByTime(200);
    expect(requestTurn).not.toHaveBeenCalled();
    latest().say("hey saffron next step");
    await vi.waitFor(() => expect(requestTurn).toHaveBeenCalledWith(expect.objectContaining({ transcript: "next step" }), expect.any(AbortSignal)));
  });

  it("apologizes when the turn request fails", async () => {
    const { provider, requestTurn, turns } = setup();
    requestTurn.mockRejectedValueOnce(new Error("offline"));
    await provider.start({ firstUtterance: "next step", context });
    expect(turns.at(-1)).toEqual({ who: "saffron", text: "Sorry, I couldn't reach Saffron just now. Try again in a moment." });
  });

  it("drops a reply that arrives after stop", async () => {
    let release: (value: VoiceTurnResponse) => void = () => {};
    const requestTurn = vi.fn<(body: VoiceTurnRequest, signal: AbortSignal) => Promise<VoiceTurnResponse>>(
      () => new Promise((resolve) => (release = resolve)),
    );
    const provider = new WebSpeechProvider({ runTool: vi.fn(), requestTurn });
    const turns: VoiceTurn[] = [];
    provider.onTurn((turn) => turns.push(turn));
    const started = provider.start({ firstUtterance: "how long left", context });
    await provider.stop();
    release({ say: "Five minutes.", toolCalls: [] });
    await started;
    expect(turns).toEqual([{ who: "you", text: "how long left" }]);
    expect(requestTurn.mock.calls[0]![1].aborted).toBe(true);
  });
});
