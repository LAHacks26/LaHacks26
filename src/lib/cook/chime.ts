// Timer chime (PRD §5.6): two soft sine notes from Web Audio, so no audio file ships.
// Browsers start an AudioContext suspended until a user gesture, so Start cooking calls unlockChime().

type AudioContextConstructor = new () => AudioContext;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** Call from a click handler. Creates or resumes the shared AudioContext. */
export function unlockChime(): void {
  const ctx = audioContext();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}

/** Plays the timer chime. Silent when Web Audio is unavailable or still locked. */
export function playChime(): void {
  playNotes([
    [0, 880],
    [0.22, 1318.5],
  ]);
}

/** A short rising blip when the wake word is heard (PRD §11.3). */
export function playEarcon(): void {
  playNotes([[0, 1046.5]], 0.12, 0.18);
}

function playNotes(notes: readonly (readonly [offset: number, frequency: number])[], peak = 0.25, length = 0.6): void {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  const start = ctx.currentTime + 0.02;
  for (const [offset, frequency] of notes) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(peak, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + length);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + length + 0.05);
  }
}
