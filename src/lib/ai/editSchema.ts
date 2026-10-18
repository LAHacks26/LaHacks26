import { z } from "zod";
import {
  AiEditResultSchema,
  type AiEditResult,
  LineRefSchema,
  PatchOpSchema,
  type PatchOp,
  RecipeSchema,
} from "../recipe/schema";
import { toGeminiSchema } from "./jsonSchema";

// Gemini-side shape of an edit result (PRD §6.1, §6.3). PatchOp is a discriminated union, which becomes
// oneOf + const in JSON Schema. Gemini handles that poorly, so Gemini gets one flat object where every
// op field is optional. This file converts it back to PatchOp and validates the result.
// Pure, with no `server-only`, so vitest can cover it.

export const EDIT_OP_NAMES = [
  "update_ingredient",
  "add_ingredient",
  "remove_ingredient",
  "update_step",
  "insert_step",
  "remove_step",
  "add_appliance",
  "remove_appliance",
  "add_tip",
] as const;
export type EditOpName = (typeof EDIT_OP_NAMES)[number];

const FlatTimerSchema = z.object({
  min: z.number().min(0).describe("Shortest wait in minutes."),
  max: z.number().min(0).describe("Longest wait in minutes. Equal to min for a fixed wait."),
});

const FlatIngredientSchema = z.object({
  id: z.string().describe("New ingredient ID, e.g. i10."),
  qty: z.number().nullable().describe("Amount as a number. Null when there is no amount."),
  unit: z.string().nullable().describe('Unit, e.g. "cup". Null for counts.'),
  item: z.string().describe('Ingredient name, e.g. "coconut milk".'),
  note: z.string().describe('Prep note, e.g. "softened". Empty string if none.'),
  group: z.string().describe('Section heading, e.g. "For the sauce". Empty string if none.'),
  allergens: z.array(z.string()).describe("Allergen tags. Empty array if none."),
});

const FlatStepSchema = z.object({
  id: z.string().describe("New step ID, e.g. s9."),
  text: z.string().describe("The instruction. No quantities."),
  estMin: z.number().min(0).describe("Minutes this step takes, including waiting."),
  ingredientIds: z.array(z.string()).describe("IDs of the ingredients this step uses."),
  applianceIds: z.array(z.string()).describe("IDs of the appliances this step uses."),
  timer: FlatTimerSchema.nullable().describe("The explicit wait, or null if the step has none."),
});

const FlatApplianceSchema = z.object({
  id: z.string().describe("New appliance ID, e.g. a4."),
  name: z.string().describe('Equipment name, e.g. "large skillet".'),
});

const OP_HELP =
  "Which op to apply. update_ingredient: id + changed fields. add_ingredient: after + ingredient. " +
  "remove_ingredient: id. update_step: id + changed fields. insert_step: after + step. remove_step: id. " +
  "add_appliance: appliance. remove_appliance: id. add_tip: target + text.";

export const FlatEditOpSchema = z.object({
  op: z.enum(EDIT_OP_NAMES).describe(OP_HELP),
  id: z.string().optional().describe("Line ID for update_* and remove_*."),
  after: z
    .string()
    .nullable()
    .optional()
    .describe("For add_ingredient and insert_step: the ID to insert after, or null for the top."),
  qty: z.number().nullable().optional().describe("update_ingredient: new amount, or null for none."),
  unit: z.string().nullable().optional().describe("update_ingredient: new unit, or null."),
  item: z.string().optional().describe("update_ingredient: new ingredient name."),
  note: z.string().optional().describe("update_ingredient: new prep note."),
  allergens: z.array(z.string()).optional().describe("update_ingredient: new allergen tags."),
  text: z.string().optional().describe("update_step: new step text. add_tip: the tip."),
  estMin: z.number().min(0).optional().describe("update_step: new minutes."),
  timer: FlatTimerSchema.nullable().optional().describe("update_step: new timer, or null to remove it."),
  ingredientIds: z.array(z.string()).optional().describe("update_step: new ingredient IDs."),
  applianceIds: z.array(z.string()).optional().describe("update_step: new appliance IDs."),
  ingredient: FlatIngredientSchema.optional().describe("add_ingredient: the new ingredient."),
  step: FlatStepSchema.optional().describe("insert_step: the new step."),
  appliance: FlatApplianceSchema.optional().describe("add_appliance: the new appliance."),
  target: LineRefSchema.optional().describe("add_tip: the line the tip goes under."),
});
export type FlatEditOp = z.infer<typeof FlatEditOpSchema>;

export const FlatEditResultSchema = z.object({
  kind: z.enum(["patch", "rejected", "answer", "tip", "impossible"]),
  summary: z.string().optional(),
  ops: z.array(FlatEditOpSchema).optional(),
  meta: z
    .object({
      times: RecipeSchema.shape.times.optional(),
      difficulty: RecipeSchema.shape.difficulty.optional(),
      cleanup: RecipeSchema.shape.cleanup.optional(),
    })
    .optional(),
  reason: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  suggestedSearch: z.string().optional(),
  text: z.string().optional(),
  target: LineRefSchema.optional(),
});
export type FlatEditResult = z.infer<typeof FlatEditResultSchema>;

/** The `responseJsonSchema` sent to Gemini for an edit call. Built once. */
export const FLAT_EDIT_GEMINI_SCHEMA: object = toGeminiSchema(FlatEditResultSchema);

/** One op the flat shape cannot express, with a message that names the missing or invalid field. */
export class FlatOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlatOpError";
  }
}

function need<T>(value: T | undefined, field: string, op: EditOpName): T {
  if (value === undefined) throw new FlatOpError(`${op} requires "${field}"`);
  return value;
}

/** Empty strings become absent optional fields, so the PatchOp matches what the schema expects. */
function nonEmpty(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function toIngredient(ing: z.infer<typeof FlatIngredientSchema>) {
  return {
    id: ing.id,
    qty: ing.qty,
    unit: ing.unit,
    item: ing.item,
    note: nonEmpty(ing.note),
    group: nonEmpty(ing.group),
    allergens: ing.allergens,
    tips: [],
  };
}

function toStep(step: z.infer<typeof FlatStepSchema>) {
  return {
    id: step.id,
    text: step.text,
    ingredientIds: step.ingredientIds,
    applianceIds: step.applianceIds,
    estMin: step.estMin,
    timer: step.timer ?? undefined,
    tips: [],
  };
}

/** Builds the candidate PatchOp object for one flat op. Throws FlatOpError when a required field is missing. */
function toCandidate(flat: FlatEditOp): Record<string, unknown> {
  const op = flat.op;
  switch (op) {
    case "update_ingredient":
      return {
        op,
        id: need(flat.id, "id", op),
        qty: flat.qty,
        unit: flat.unit,
        item: flat.item,
        note: flat.note,
        allergens: flat.allergens,
      };
    case "add_ingredient":
      return {
        op,
        after: flat.after ?? null,
        ingredient: toIngredient(need(flat.ingredient, "ingredient", op)),
      };
    case "remove_ingredient":
      return { op, id: need(flat.id, "id", op) };
    case "update_step":
      return {
        op,
        id: need(flat.id, "id", op),
        text: flat.text,
        estMin: flat.estMin,
        timer: flat.timer,
        ingredientIds: flat.ingredientIds,
        applianceIds: flat.applianceIds,
      };
    case "insert_step":
      return {
        op,
        after: flat.after ?? null,
        step: toStep(need(flat.step, "step", op)),
      };
    case "remove_step":
      return { op, id: need(flat.id, "id", op) };
    case "add_appliance": {
      const appliance = need(flat.appliance, "appliance", op);
      return { op, appliance: { id: appliance.id, name: appliance.name, tips: [] } };
    }
    case "remove_appliance":
      return { op, id: need(flat.id, "id", op) };
    case "add_tip":
      return { op, target: need(flat.target, "target", op), text: need(flat.text, "text", op) };
  }
}

function issueText(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ");
}

/**
 * Converts one flat op to a PatchOp, validated with PatchOpSchema. Missing fields and invalid values
 * throw FlatOpError. Missing `after` means null (insert at the top).
 */
export function flatOpToPatchOp(flat: FlatEditOp): PatchOp {
  const candidate = toCandidate(flat);
  const parsed = PatchOpSchema.safeParse(candidate);
  if (!parsed.success) throw new FlatOpError(`${flat.op}: ${issueText(parsed.error)}`);
  return parsed.data;
}

export type FlatResultDraft = { ok: true; draft: AiEditResult } | { ok: false; errors: string[] };

/**
 * Converts a flat result to an AiEditResult draft: every op becomes a PatchOp. Cross-field rules
 * (non-empty summary, exactly 3 suggestions, ...) and recipe checks are left to the caller, which
 * runs AiEditResultSchema after its own fixes. Errors name the failing op by index.
 */
export function flatResultToDraft(flat: FlatEditResult): FlatResultDraft {
  if (!flat.ops) return { ok: true, draft: { ...flat, ops: undefined } as AiEditResult };

  const errors: string[] = [];
  const ops: PatchOp[] = [];
  flat.ops.forEach((op, index) => {
    try {
      ops.push(flatOpToPatchOp(op));
    } catch (err) {
      errors.push(`ops[${index}] ${err instanceof Error ? err.message : "is invalid"}`);
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, draft: { ...flat, ops } as AiEditResult };
}

/** Runs the final cross-field check. Returns the parsed result or the messages to send back to Gemini. */
export function checkAiEditResult(result: AiEditResult): { ok: true; result: AiEditResult } | { ok: false; errors: string[] } {
  const parsed = AiEditResultSchema.safeParse(result);
  if (parsed.success) return { ok: true, result: parsed.data };
  return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`) };
}
