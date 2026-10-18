import { z } from "zod";
import { WorkingCopySchema, type Recipe } from "../recipe/schema";

export const SavedIdSchema = z.uuid();
export const ShareSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
export const AllergiesSchema = z.array(z.string().trim().min(1).max(80)).max(30)
  .transform((values) => [...new Set(values.map((value) => value.toLowerCase()))]);

const ContextRefSchema = z.object({
  kind: z.enum(["ingredient", "step", "appliance"]),
  id: z.string().max(40).regex(/^[isa]\d+$/),
  selectedText: z.string().max(2000).optional(),
}).strict().refine((ref) => ref.id.startsWith({ ingredient: "i", step: "s", appliance: "a" }[ref.kind]));

const MessageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(10000),
  contextRefs: z.array(ContextRefSchema).max(10).optional(),
}).strict();

function boundedRecipe(recipe: Recipe): boolean {
  if (recipe.ingredients.length > 200 || recipe.appliances.length > 50 || recipe.steps.length > 200) return false;
  if (recipe.title.length > 300 || recipe.servings > 10000 || recipe.times.totalMin > 525600 || recipe.times.activeMin > 525600) return false;
  // The frozen recipe contract deliberately has few size limits. Apply persistence limits here.
  const pending: unknown[] = [recipe];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string" && value.length > 10000) return false;
    if (Array.isArray(value)) {
      if (value.length > 200) return false;
      pending.push(...value);
    } else if (value && typeof value === "object") pending.push(...Object.values(value));
  }
  return true;
}

const CopySchema = WorkingCopySchema.extend({
  sourceRecipeId: z.string().max(100).optional(),
  savedId: z.string().max(100).optional(),
}).strict().refine((copy) => [copy.recipe, ...copy.undoStack].every(boundedRecipe), "Recipe is too large.");

export const CreateSavedSchema = z.object({
  copy: CopySchema,
  messages: z.array(MessageSchema).max(200),
  sourceRecipeId: SavedIdSchema.optional(),
  forkedFromSlug: ShareSlugSchema.optional(),
  allergies: AllergiesSchema.optional(),
}).strict().refine((body) => !(body.sourceRecipeId && body.forkedFromSlug), "Choose one source.");

export const UpdateSavedSchema = z.object({
  copy: CopySchema,
  messages: z.array(MessageSchema).max(200),
  expectedUpdatedAt: z.iso.datetime({ precision: 6 }),
}).strict();

export const UpdateAllergiesSchema = z.object({ allergies: AllergiesSchema }).strict();
export type CreateSavedInput = z.infer<typeof CreateSavedSchema>;
export type UpdateSavedInput = z.infer<typeof UpdateSavedSchema>;
