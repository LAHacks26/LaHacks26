import { z } from "zod";

// Contract for cook-mode voice (PRD §5.7, §11). Shared by the voice providers, the tool registry and
// POST /api/voice/turn. Every non-2xx JSON response is `{ error: string }`.

/** Shown by WakePill. "armed" = waiting for "Hey Saffron"; the rest mirror VoiceStatus. */
export type WakeState = "off" | "armed" | "listening" | "thinking" | "speaking";
export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";

/** What the voice brain knows. Rebuilt after every recipe or cook-state change. Steps are 1-based. */
export const VoiceContextSchema = z.object({
  title: z.string().max(200),
  steps: z
    .array(
      z.object({
        n: z.number().int().min(1),
        text: z.string().max(1000),
        /** Minutes of the step's explicit wait, when it has one (its timer max). */
        timerMin: z.number().min(0).optional(),
      }),
    )
    .max(60),
  /** Display strings, e.g. "1 cup heavy cream". */
  ingredients: z.array(z.string().max(200)).max(80),
  currentStep: z.number().int().min(1).nullable(),
  doneSteps: z.array(z.number().int().min(1)).max(60).default([]),
  timers: z.array(z.object({ label: z.string().max(60), remainingSec: z.number() })).max(10).default([]),
  allergies: z.array(z.string().max(60)).max(30).default([]),
});
export type VoiceContext = z.input<typeof VoiceContextSchema>;

export const VOICE_TOOL_NAMES = [
  "next_step",
  "previous_step",
  "go_to_step",
  "repeat_step",
  "mark_step_done",
  "start_timer",
  "list_timers",
  "cancel_timer",
  "edit_recipe",
] as const;
export type VoiceToolName = (typeof VOICE_TOOL_NAMES)[number];

/** PRD §11.2. Navigation tools return the step text, which the client reads aloud. */
export const VoiceToolCallSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("next_step") }),
  z.object({ name: z.literal("previous_step") }),
  z.object({ name: z.literal("go_to_step"), n: z.number().int().min(1) }),
  z.object({ name: z.literal("repeat_step") }),
  z.object({ name: z.literal("mark_step_done") }),
  z.object({
    name: z.literal("start_timer"),
    /** Defaults to the current step's timer. */
    minutes: z.number().positive().max(600).optional(),
    stepNumber: z.number().int().min(1).optional(),
    label: z.string().max(40).optional(),
  }),
  z.object({ name: z.literal("list_timers") }),
  z.object({ name: z.literal("cancel_timer"), label: z.string().max(40) }),
  /** Runs the chat edit pipeline (POST /api/ai/chat) and applies the patch; the client speaks its summary. */
  z.object({ name: z.literal("edit_recipe"), instruction: z.string().min(1).max(300) }),
]);
export type VoiceToolCall = z.infer<typeof VoiceToolCallSchema>;

export const VoiceTurnSchema = z.object({
  who: z.enum(["you", "saffron"]),
  text: z.string().max(500),
});
export type VoiceTurn = z.infer<typeof VoiceTurnSchema>;

/** POST /api/voice/turn (the Web Speech stub's brain): one user utterance → what to say and do. */
export const VoiceTurnRequestSchema = z.object({
  context: VoiceContextSchema,
  transcript: z.string().trim().min(1).max(500),
  /** The last few turns of this voice session, oldest first. */
  history: z.array(VoiceTurnSchema).max(8).default([]),
});
export type VoiceTurnRequest = z.input<typeof VoiceTurnRequestSchema>;

/**
 * `say` is spoken first (1–2 sentences; may be empty when a tool result is spoken instead, e.g.
 * next_step reads the new step). `toolCalls` run in order on the client.
 */
export const VoiceTurnResponseSchema = z.object({
  say: z.string().max(400),
  toolCalls: z.array(VoiceToolCallSchema).max(4),
});
export type VoiceTurnResponse = z.infer<typeof VoiceTurnResponseSchema>;

/** PRD §11.1. WebSpeechProvider now; ElevenLabsProvider once the key arrives (NEXT_PUBLIC_VOICE_PROVIDER). */
export interface VoiceProvider {
  /** Opens a voice session. `firstUtterance` is the text said after the wake phrase, if any. */
  start(opts: { firstUtterance?: string; context: VoiceContext }): Promise<void>;
  stop(): Promise<void>;
  /** Called after every recipe or cook-state change. */
  updateContext(ctx: VoiceContext): void;
  /** Returns an unsubscribe function. */
  onStatus(cb: (status: VoiceStatus) => void): () => void;
  /** Each heard or spoken turn, for the transcript. Returns an unsubscribe function. */
  onTurn(cb: (turn: VoiceTurn) => void): () => void;
}
