import { postJson } from "@/lib/api/aiClient";
import {
  VoiceTurnResponseSchema,
  type VoiceContext,
  type VoiceProvider,
  type VoiceStatus,
  type VoiceToolCall,
  type VoiceTurn,
  type VoiceTurnRequest,
  type VoiceTurnResponse,
} from "./types";
import { matchWakeWord } from "./wakeWord";

// Web Speech voice (PRD §11.1, §11.3): a wake-word listener plus the stub provider
// (SpeechRecognition → POST /api/voice/turn → speechSynthesis). Chrome and Edge only; Chrome sends
// the audio to Google's recognizer.

type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

/** Errors that mean the mic will not work until the user changes something. */
const BLOCKING_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
/** A voice session closes after this long without speech (PRD §5.7). */
const SILENCE_MS = 8000;
/** Once speech starts, how long it may go without producing words (e.g. kitchen noise) before the session closes. */
const SPEECH_CAP_MS = 20_000;
/** After an interim "Hey Saffron", how long to wait for the rest of the sentence. */
const WAKE_SETTLE_MS = 1500;
const TURN_TIMEOUT_MS = 20_000;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function voiceSupported(): boolean {
  return recognitionConstructor() !== null;
}

/** Listens for "Hey Saffron" while armed. Hands over the words said after it, then disarms. */
export class WakeWordListener {
  private armed = false;
  private recognition: Recognition | null = null;
  private settle: ReturnType<typeof setTimeout> | null = null;
  private pendingRest = "";

  constructor(
    private readonly onWake: (rest: string) => void,
    private readonly onBlocked: (error: string) => void,
  ) {}

  get isArmed(): boolean {
    return this.armed;
  }

  arm(): void {
    if (this.armed) return;
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      this.onBlocked("unsupported");
      return;
    }
    this.armed = true;
    this.listen(Ctor);
  }

  disarm(): void {
    this.armed = false;
    if (this.settle) clearTimeout(this.settle);
    this.settle = null;
    const recognition = this.recognition;
    this.recognition = null;
    recognition?.abort();
  }

  private listen(Ctor: RecognitionConstructor): void {
    const recognition = new Ctor();
    const startedAt = Date.now();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      // An aborted recognizer can still deliver late events; only the current one counts.
      if (this.recognition !== recognition) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const match = result ? matchWakeWord(result[0]?.transcript ?? "") : null;
        if (!result || !match) continue;
        if (result.isFinal) {
          this.fire(match.rest);
          return;
        }
        // Interim: keep collecting the sentence, but don't wait forever for the final result.
        this.pendingRest = match.rest;
        this.settle ??= setTimeout(() => this.fire(this.pendingRest), WAKE_SETTLE_MS);
      }
    };
    recognition.onerror = (event) => {
      if (this.recognition !== recognition || !BLOCKING_ERRORS.has(event.error)) return;
      this.disarm();
      this.onBlocked(event.error);
    };
    // Chrome ends continuous recognition now and then. Restart while armed, backing off when it ends at once.
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      if (!this.armed) return;
      const delay = Date.now() - startedAt < 1000 ? 2000 : 250;
      setTimeout(() => {
        if (this.armed && !this.recognition) this.listen(Ctor);
      }, delay);
    };
    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.disarm();
      this.onBlocked("start-failed");
    }
  }

  private fire(rest: string): void {
    if (!this.armed) return;
    this.disarm();
    this.onWake(rest);
  }
}

export type WebSpeechDeps = {
  /** Runs one tool call and returns the sentence to speak. */
  runTool(call: VoiceToolCall): Promise<string>;
  /** Defaults to POST /api/voice/turn. */
  requestTurn?(body: VoiceTurnRequest, signal: AbortSignal): Promise<VoiceTurnResponse>;
};

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/** Open voice sessions. announce() stays quiet while one is open, so the mic doesn't transcribe it. */
let openSessions = 0;

function defaultRequestTurn(body: VoiceTurnRequest, signal: AbortSignal): Promise<VoiceTurnResponse> {
  return postJson("/api/voice/turn", body, VoiceTurnResponseSchema, signal, TURN_TIMEOUT_MS);
}

/** The Web Speech stub provider. One session = listen → think → act → speak, repeated until silence. */
export class WebSpeechProvider implements VoiceProvider {
  private context: VoiceContext | null = null;
  private active = false;
  /** Bumped by every start and stop, so callbacks from an older session do nothing. */
  private session = 0;
  private history: VoiceTurn[] = [];
  private recognition: Recognition | null = null;
  private silence: ReturnType<typeof setTimeout> | null = null;
  /** The silence timer is the speech cap (SPEECH_CAP_MS) rather than the plain countdown. */
  private capped = false;
  private request: AbortController | null = null;
  private readonly statusListeners = new Set<(status: VoiceStatus) => void>();
  private readonly turnListeners = new Set<(turn: VoiceTurn) => void>();

  constructor(private readonly deps: WebSpeechDeps) {}

  async start(opts: { firstUtterance?: string; context: VoiceContext }): Promise<void> {
    if (this.active) await this.stop();
    this.context = opts.context;
    this.active = true;
    openSessions++;
    this.history = [];
    const session = ++this.session;
    const first = opts.firstUtterance?.trim();
    if (first) await this.handle(first, session);
    else this.listen(session);
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    openSessions--;
    this.session++;
    this.clearSilence();
    this.request?.abort();
    this.request = null;
    const recognition = this.recognition;
    this.recognition = null;
    recognition?.abort();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    this.setStatus("idle");
  }

  updateContext(ctx: VoiceContext): void {
    this.context = ctx;
  }

  onStatus(cb: (status: VoiceStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onTurn(cb: (turn: VoiceTurn) => void): () => void {
    this.turnListeners.add(cb);
    return () => this.turnListeners.delete(cb);
  }

  private setStatus(status: VoiceStatus): void {
    for (const cb of this.statusListeners) cb(status);
  }

  private emit(turn: VoiceTurn): void {
    this.history = [...this.history, turn].slice(-8);
    for (const cb of this.turnListeners) cb(turn);
  }

  private clearSilence(): void {
    if (this.silence) clearTimeout(this.silence);
    this.silence = null;
    this.capped = false;
  }

  private listen(session: number): void {
    if (!this.active || session !== this.session) return;
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      void this.stop();
      return;
    }
    this.setStatus("listening");
    // The countdown runs across recognizer restarts and is extended once the cook starts talking, so a
    // sentence begun at second 7 is not cut off.
    this.silence ??= setTimeout(() => {
      this.silence = null;
      if (session === this.session) void this.stop();
    }, SILENCE_MS);

    const recognition = new Ctor();
    let heard = false;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      if (!result?.isFinal || session !== this.session) return;
      const text = (result[0]?.transcript ?? "").trim();
      // Saying the wake phrase again mid-session is fine: only the words after it count.
      const utterance = matchWakeWord(text)?.rest ?? text;
      if (!utterance) return;
      heard = true;
      this.clearSilence();
      void this.handle(utterance, session);
    };
    // Speech swaps the silence countdown for a longer cap, once: only words clear it, so repeated
    // noise can't keep the session open. Restarts keep it (??= above).
    recognition.onspeechstart = () => {
      if (session !== this.session || this.capped) return;
      this.clearSilence();
      this.capped = true;
      this.silence = setTimeout(() => {
        this.silence = null;
        if (session === this.session) void this.stop();
      }, SPEECH_CAP_MS);
    };
    recognition.onerror = (event) => {
      if (BLOCKING_ERRORS.has(event.error) && session === this.session) void this.stop();
    };
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null;
      // Ended without words (Chrome's no-speech timeout, or sound that wasn't speech): listen again.
      // listen() restarts the silence countdown if speech had paused it; stop() bumps the session.
      if (!heard && this.active && session === this.session) setTimeout(() => this.listen(session), 100);
    };
    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      void this.stop();
    }
  }

  private async handle(text: string, session: number): Promise<void> {
    const context = this.context;
    if (!context) return;
    const history = this.history;
    this.emit({ who: "you", text: clip(text, 500) });
    this.setStatus("thinking");
    const controller = new AbortController();
    this.request = controller;
    let speech: string;
    try {
      const response = await (this.deps.requestTurn ?? defaultRequestTurn)(
        { context, transcript: clip(text, 500), history },
        controller.signal,
      );
      if (session !== this.session) return;
      const parts = [response.say];
      for (const call of response.toolCalls) {
        if (session !== this.session) return;
        try {
          parts.push(await this.deps.runTool(call));
        } catch {
          parts.push("I couldn't do that one.");
        }
      }
      speech = parts.map((part) => part.trim()).filter(Boolean).join(" ") || "Okay.";
    } catch {
      if (session !== this.session) return;
      speech = "Sorry, I couldn't reach Saffron just now. Try again in a moment.";
    } finally {
      if (this.request === controller) this.request = null;
    }
    if (session !== this.session) return;
    this.emit({ who: "saffron", text: clip(speech, 500) });
    await this.speak(speech, session);
    this.listen(session);
  }

  private speak(text: string, session: number): Promise<void> {
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      return Promise.resolve();
    }
    this.setStatus("speaking");
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      // Some browsers never fire onend (no voices, background tab), so a timer bounds the wait.
      const guard = setTimeout(finish, Math.min(30_000, 1500 + text.length * 90));
      function finish() {
        clearTimeout(guard);
        resolve();
      }
      utterance.onend = finish;
      utterance.onerror = finish;
      if (session !== this.session) {
        finish();
        return;
      }
      // cancel() right before speak() can swallow the utterance in some Chrome builds; only clear real leftovers.
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }
}

/**
 * Speaks one sentence outside a voice session, e.g. "Your simmer timer is done". Skipped while a
 * session is open: the session's mic would hear it as the cook speaking. The chime and toast still show.
 */
export function announce(text: string): void {
  if (openSessions > 0) return;
  if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}
