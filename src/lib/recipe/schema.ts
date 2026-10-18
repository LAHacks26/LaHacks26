import { z } from "zod";

// Shared recipe contract between frontend and backend. Changing it is a team decision.

// --- IDs ---
export const IngredientIdSchema = z.string().regex(/^i\d+$/);
export const StepIdSchema = z.string().regex(/^s\d+$/);
export const ApplianceIdSchema = z.string().regex(/^a\d+$/);
export const TipIdSchema = z.string().regex(/^t\d+$/);

export type IngredientId = z.infer<typeof IngredientIdSchema>;
export type StepId = z.infer<typeof StepIdSchema>;
export type ApplianceId = z.infer<typeof ApplianceIdSchema>;
export type TipId = z.infer<typeof TipIdSchema>;

export const ScoreSchema = z.number().int().min(1).max(5);
export type Score = z.infer<typeof ScoreSchema>;

// http(s) only: blocks javascript:, data:, vbscript: and ftp: URLs from scraped pages.
export const HttpUrlSchema = z.url({ protocol: /^https?$/ });

// Canonical allergen tags. Ingredient.allergens stays free text, but these are the tags to use.
export const COMMON_ALLERGENS = [
  "peanuts",
  "tree nuts",
  "dairy",
  "egg",
  "gluten",
  "soy",
  "fish",
  "shellfish",
  "sesame",
] as const;
export type CommonAllergen = (typeof COMMON_ALLERGENS)[number];

export const LineRefSchema = z.object({
  kind: z.enum(["ingredient", "step", "appliance"]),
  id: z.string(),
  selectedText: z.string().optional(),
});
export type LineRef = z.infer<typeof LineRefSchema>;
export type LineKind = LineRef["kind"];

// Minutes. A countdown uses max.
export const TimerSchema = z
  .object({
    min: z.number().min(0),
    max: z.number().min(0),
  })
  .refine((t) => t.max >= t.min, { message: "timer max must be >= min", path: ["max"] });
export type Timer = z.infer<typeof TimerSchema>;

export const TipSchema = z.object({
  id: TipIdSchema,
  anchorText: z.string().optional(),
  text: z.string().min(1),
});
export type Tip = z.infer<typeof TipSchema>;

export const IngredientSchema = z.object({
  id: IngredientIdSchema,
  qty: z.number().positive().nullable(),
  unit: z.string().nullable(),
  item: z.string().min(1),
  note: z.string().optional(),
  group: z.string().optional(),
  allergens: z.array(z.string()).default([]),
  tips: z.array(TipSchema).default([]),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const ApplianceSchema = z.object({
  id: ApplianceIdSchema,
  name: z.string().min(1),
  tips: z.array(TipSchema).default([]),
});
export type Appliance = z.infer<typeof ApplianceSchema>;

export const StepSchema = z.object({
  id: StepIdSchema,
  text: z.string().min(1),
  ingredientIds: z.array(IngredientIdSchema).default([]),
  applianceIds: z.array(ApplianceIdSchema).default([]),
  estMin: z.number().min(0),
  timer: TimerSchema.optional(),
  tips: z.array(TipSchema).default([]),
});
export type Step = z.infer<typeof StepSchema>;

export const RecipeSchema = z.object({
  title: z.string().min(1),
  source: z.object({
    url: HttpUrlSchema,
    siteName: z.string(),
    author: z.string().optional(),
    imageUrl: HttpUrlSchema.optional(),
  }),
  servings: z.number().int().positive(),
  times: z.object({
    totalMin: z.number().min(0),
    activeMin: z.number().min(0),
  }),
  difficulty: z.object({
    score: ScoreSchema,
    reason: z.string(),
  }),
  cleanup: z.object({
    score: ScoreSchema,
    reason: z.string(),
    dishes: z.array(z.string()),
  }),
  ingredients: z.array(IngredientSchema).min(1),
  appliances: z.array(ApplianceSchema),
  steps: z.array(StepSchema).min(1),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const UNDO_LIMIT = 20;

export const WorkingCopySchema = z.object({
  recipe: RecipeSchema,
  version: z.number().int().min(0),
  undoStack: z.array(RecipeSchema).max(UNDO_LIMIT).default([]),
  readyBy: z.iso.datetime({ offset: true }).optional(),
  sourceRecipeId: z.string().optional(),
  savedId: z.string().optional(),
});
export type WorkingCopy = z.infer<typeof WorkingCopySchema>;

// --- Patches (AI edits apply these in order) ---
export const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("update_ingredient"),
    id: IngredientIdSchema,
    qty: z.number().positive().nullable().optional(),
    unit: z.string().nullable().optional(),
    item: z.string().optional(),
    note: z.string().optional(),
    allergens: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal("add_ingredient"),
    after: IngredientIdSchema.nullable(),
    ingredient: IngredientSchema,
  }),
  z.object({
    op: z.literal("remove_ingredient"),
    id: IngredientIdSchema,
  }),
  z.object({
    op: z.literal("update_step"),
    id: StepIdSchema,
    text: z.string().optional(),
    estMin: z.number().min(0).optional(),
    timer: TimerSchema.nullable().optional(),
    ingredientIds: z.array(IngredientIdSchema).optional(),
    applianceIds: z.array(ApplianceIdSchema).optional(),
  }),
  z.object({
    op: z.literal("insert_step"),
    after: StepIdSchema.nullable(),
    step: StepSchema,
  }),
  z.object({
    op: z.literal("remove_step"),
    id: StepIdSchema,
  }),
  z.object({
    op: z.literal("add_appliance"),
    appliance: ApplianceSchema,
  }),
  z.object({
    op: z.literal("remove_appliance"),
    id: ApplianceIdSchema,
  }),
  z.object({
    // anchorText comes from target.selectedText; the tip ID is assigned by the server.
    op: z.literal("add_tip"),
    target: LineRefSchema,
    text: z.string().min(1),
  }),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

// --- AI edit result (one flat object; Gemini handles flat schemas best) ---
export const AiEditResultSchema = z
  .object({
    kind: z.enum(["patch", "rejected", "answer", "tip", "impossible"]),
    summary: z.string().optional(),
    ops: z.array(PatchOpSchema).optional(),
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
  })
  .superRefine((r, ctx) => {
    // Messages are fed back to Gemini on retry, so each one names the missing field.
    // Whitespace-only strings count as missing.
    if (r.kind === "patch") {
      if (!r.summary?.trim()) {
        ctx.addIssue({ code: "custom", path: ["summary"], message: 'kind "patch" requires a non-empty "summary"' });
      }
      if (!r.ops || r.ops.length === 0) {
        ctx.addIssue({ code: "custom", path: ["ops"], message: 'kind "patch" requires a non-empty "ops" array' });
      }
    }
    if (r.kind === "rejected") {
      if (!r.reason?.trim()) {
        ctx.addIssue({ code: "custom", path: ["reason"], message: 'kind "rejected" requires "reason"' });
      }
      if (!r.suggestions || r.suggestions.length !== 3) {
        ctx.addIssue({
          code: "custom",
          path: ["suggestions"],
          message: `kind "rejected" requires exactly 3 "suggestions" (got ${r.suggestions?.length ?? 0})`,
        });
      }
    }
    if (r.kind === "answer" && !r.text?.trim()) {
      ctx.addIssue({ code: "custom", path: ["text"], message: 'kind "answer" requires "text"' });
    }
    if (r.kind === "tip") {
      if (!r.text?.trim()) {
        ctx.addIssue({ code: "custom", path: ["text"], message: 'kind "tip" requires "text"' });
      }
      if (!r.target) {
        ctx.addIssue({ code: "custom", path: ["target"], message: 'kind "tip" requires "target"' });
      }
    }
    if (r.kind === "impossible") {
      if (!r.reason?.trim()) {
        ctx.addIssue({ code: "custom", path: ["reason"], message: 'kind "impossible" requires "reason"' });
      }
      if (!r.suggestedSearch?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["suggestedSearch"],
          message: 'kind "impossible" requires "suggestedSearch"',
        });
      }
    }
  });
export type AiEditResult = z.infer<typeof AiEditResultSchema>;
