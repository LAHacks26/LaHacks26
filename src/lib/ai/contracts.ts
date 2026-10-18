import { z } from "zod";
import { AiEditResultSchema, LineRefSchema, RecipeSchema } from "../recipe/schema";

// Request/response contract for the popover AI routes (PRD §5.4, §9). Shared by routes and client.
// Every non-2xx response is JSON `{ error: string }` with a user-facing message.

const AllergiesSchema = z.array(z.string().max(60)).max(30).default([]);
const MessageSchema = z.string().trim().min(1).max(500);

/**
 * POST /api/ai/explain → 200 `text/plain; charset=utf-8`, streamed.
 * Used by step "Explain", ingredient "What is this?" and appliance "Explain".
 * With `question`, it answers that question about the target instead.
 * The client saves the full text as a tip on the target when the stream ends.
 */
export const ExplainRequestSchema = z.object({
  recipe: RecipeSchema,
  target: LineRefSchema,
  question: MessageSchema.optional(),
  allergies: AllergiesSchema,
});
export type ExplainRequest = z.input<typeof ExplainRequestSchema>;

/** POST /api/ai/suggest-swaps → 200 SuggestSwapsResponse. Prefetched when an ingredient or appliance popover opens. */
export const SuggestSwapsRequestSchema = z.object({
  recipe: RecipeSchema,
  target: LineRefSchema,
  allergies: AllergiesSchema,
});
export type SuggestSwapsRequest = z.input<typeof SuggestSwapsRequestSchema>;

export const SuggestSwapsResponseSchema = z.object({
  suggestions: z.array(z.string().min(1)).length(3),
});
export type SuggestSwapsResponse = z.infer<typeof SuggestSwapsResponseSchema>;

/**
 * `substitute`: `message` is the replacement ("coconut milk"). Target is an ingredient.
 * `missing_appliance`: the user doesn't have the target appliance; `message` optionally says what they have instead.
 * `ask`: free-text request from the popover (`message` required). May return any AiEditResult kind.
 */
export const EditActionSchema = z.enum(["substitute", "missing_appliance", "ask"]);
export type EditAction = z.infer<typeof EditActionSchema>;

/** POST /api/ai/edit → 200 EditResponse. */
export const EditRequestSchema = z
  .object({
    recipe: RecipeSchema,
    baseVersion: z.number().int().min(0),
    target: LineRefSchema,
    action: EditActionSchema,
    message: MessageSchema.optional(),
    allergies: AllergiesSchema,
  })
  .refine((r) => r.action === "missing_appliance" || r.message !== undefined, {
    message: "message is required for substitute and ask",
    path: ["message"],
  });
export type EditRequest = z.input<typeof EditRequestSchema>;

/**
 * `result` is already validated server-side: patch IDs exist, new IDs are free (see normalizePatchIds),
 * and applying it with applyEditResult succeeds. `baseVersion` echoes the request.
 */
export const EditResponseSchema = z.object({
  baseVersion: z.number().int().min(0),
  result: AiEditResultSchema,
});
export type EditResponse = z.infer<typeof EditResponseSchema>;
