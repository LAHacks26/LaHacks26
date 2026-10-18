import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/client";
import { chatMessages, savedRecipes, sourceRecipes, users } from "../db/schema";
import type { PublicRecipe, SavedDocument, SavedSummary, SavedThreadMessage } from "./contracts";
import { SavedRequestError } from "./http";
import { AllergiesSchema, SavedIdSchema, ShareSlugSchema, type CreateSavedInput, type UpdateSavedInput } from "./validation";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
// postgres timestamps carry microseconds; JavaScript Date would truncate the optimistic-lock token.
const updatedToken = sql<string>`to_char(${savedRecipes.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const savedFields = {
  id: savedRecipes.id,
  sourceRecipeId: savedRecipes.sourceRecipeId,
  recipe: savedRecipes.recipe,
  undoStack: savedRecipes.undoStack,
  readyBy: savedRecipes.readyBy,
  shareSlug: savedRecipes.shareSlug,
  updatedAt: updatedToken,
};
type SavedRow = {
  id: string;
  sourceRecipeId: string | null;
  recipe: SavedDocument["copy"]["recipe"];
  undoStack: SavedDocument["copy"]["undoStack"];
  readyBy: Date | null;
  shareSlug: string | null;
  updatedAt: string;
};

function ownerWhere(viewerId: string, id: string) {
  return and(eq(savedRecipes.userId, viewerId), eq(savedRecipes.id, id));
}

function document(row: SavedRow, messages: SavedThreadMessage[]): SavedDocument {
  return {
    id: row.id,
    copy: {
      recipe: row.recipe,
      undoStack: row.undoStack,
      version: 0,
      savedId: row.id,
      ...(row.sourceRecipeId ? { sourceRecipeId: row.sourceRecipeId } : {}),
      ...(row.readyBy ? { readyBy: row.readyBy.toISOString() } : {}),
    },
    messages,
    updatedAt: row.updatedAt,
    shareSlug: row.shareSlug,
  };
}

async function readMessages(tx: Tx, viewerId: string, id: string): Promise<SavedThreadMessage[]> {
  return tx.select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content, contextRefs: chatMessages.contextRefs })
    .from(chatMessages).innerJoin(savedRecipes, eq(chatMessages.savedRecipeId, savedRecipes.id))
    .where(ownerWhere(viewerId, id)).orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
}

/** The caller holds the saved parent row's write lock, so replacing chat cannot race another save. */
async function replaceMessages(tx: Tx, viewerId: string, id: string, messages: SavedThreadMessage[]): Promise<SavedThreadMessage[]> {
  await tx.delete(chatMessages).where(inArray(chatMessages.savedRecipeId,
    tx.select({ id: savedRecipes.id }).from(savedRecipes).where(ownerWhere(viewerId, id))));
  if (!messages.length) return [];
  const start = Date.now();
  const rows = messages.map((message, index) => ({
    // A client ID could collide with another owner's global chat primary key; never trust it.
    id: randomUUID(), savedRecipeId: id, role: message.role, content: message.content,
    contextRefs: message.contextRefs ?? [], createdAt: new Date(start + index),
  }));
  await tx.insert(chatMessages).values(rows);
  return rows.map(({ id: messageId, role, content, contextRefs }) => ({ id: messageId, role, content, contextRefs }));
}

export async function getSavedRecipe(viewerId: string, id: string): Promise<SavedDocument | null> {
  if (!SavedIdSchema.safeParse(id).success) return null;
  return getDb().transaction(async (tx) => {
    // Share lock keeps the recipe and chat on the same committed revision while both are read.
    const [row] = await tx.select(savedFields).from(savedRecipes).where(ownerWhere(viewerId, id)).limit(1).for("share");
    if (!row) return null;
    return document(row, await readMessages(tx, viewerId, id));
  });
}

export async function listSavedRecipes(viewerId: string): Promise<SavedSummary[]> {
  const rows = await getDb().select({
    id: savedRecipes.id, title: savedRecipes.title,
    imageUrl: sql<string | null>`${savedRecipes.recipe}->'source'->>'imageUrl'`,
    totalMin: sql<number>`(${savedRecipes.recipe}->'times'->>'totalMin')::double precision`,
    updatedAt: updatedToken, shareSlug: savedRecipes.shareSlug,
  }).from(savedRecipes).where(eq(savedRecipes.userId, viewerId)).orderBy(desc(savedRecipes.updatedAt), desc(savedRecipes.id));
  return rows.map(({ imageUrl, ...row }) => ({ ...row, ...(imageUrl ? { imageUrl } : {}) }));
}

export async function getSharedRecipe(slug: string): Promise<PublicRecipe | null> {
  if (!ShareSlugSchema.safeParse(slug).success) return null;
  const [row] = await getDb().select({ recipe: savedRecipes.recipe, slug: savedRecipes.shareSlug })
    .from(savedRecipes).where(eq(savedRecipes.shareSlug, slug)).limit(1);
  return row?.slug ? { recipe: row.recipe, slug: row.slug } : null;
}

export async function createSavedRecipe(viewerId: string, input: CreateSavedInput): Promise<SavedDocument> {
  return getDb().transaction(async (tx) => {
    let sourceRecipeId: string | null = null;
    let forkedFromId: string | null = null;
    if (input.forkedFromSlug) {
      const [parent] = await tx.select({ id: savedRecipes.id, sourceRecipeId: savedRecipes.sourceRecipeId })
        .from(savedRecipes).where(eq(savedRecipes.shareSlug, input.forkedFromSlug)).limit(1);
      if (!parent) throw new SavedRequestError(404, "That shared recipe wasn't found.");
      forkedFromId = parent.id;
      sourceRecipeId = parent.sourceRecipeId;
    } else if (input.sourceRecipeId) {
      const [source] = await tx.select({ id: sourceRecipes.id }).from(sourceRecipes)
        .where(eq(sourceRecipes.id, input.sourceRecipeId)).limit(1);
      if (!source) throw new SavedRequestError(404, "That source recipe wasn't found.");
      sourceRecipeId = source.id;
    }
    if (input.allergies?.length) {
      const [viewer] = await tx.select({ allergies: users.allergies }).from(users).where(eq(users.id, viewerId)).for("update");
      if (!viewer) throw new SavedRequestError(404, "This kitchen wasn't found.");
      const merged = [...new Set([...viewer.allergies, ...input.allergies].map((item) => item.trim().toLowerCase()))];
      const parsed = AllergiesSchema.safeParse(merged);
      if (!parsed.success) throw new SavedRequestError(400, "Keep your allergy list to 30 items of 80 characters each.");
      await tx.update(users).set({ allergies: parsed.data }).where(eq(users.id, viewerId));
    }
    const [row] = await tx.insert(savedRecipes).values({
      userId: viewerId, sourceRecipeId, forkedFromId,
      title: input.copy.recipe.title, recipe: input.copy.recipe, undoStack: input.copy.undoStack,
      readyBy: input.copy.readyBy ? new Date(input.copy.readyBy) : null,
    }).returning(savedFields);
    if (!row) throw new Error("No saved recipe returned");
    return document(row, await replaceMessages(tx, viewerId, row.id, input.messages));
  });
}

export async function updateSavedRecipe(viewerId: string, id: string, input: UpdateSavedInput): Promise<SavedDocument | null> {
  if (!SavedIdSchema.safeParse(id).success) return null;
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select({ id: savedRecipes.id }).from(savedRecipes)
      .where(ownerWhere(viewerId, id)).limit(1).for("update");
    if (!existing) return null;
    const [row] = await tx.update(savedRecipes).set({
      title: input.copy.recipe.title, recipe: input.copy.recipe, undoStack: input.copy.undoStack,
      readyBy: input.copy.readyBy ? new Date(input.copy.readyBy) : null,
      // Even two writes in one millisecond must have distinct tokens. Do not use a JS Date here.
      updatedAt: sql`greatest(clock_timestamp(), ${savedRecipes.updatedAt} + interval '1 microsecond')`,
    }).where(and(ownerWhere(viewerId, id), eq(savedRecipes.updatedAt, sql`${input.expectedUpdatedAt}::timestamptz`)))
      .returning(savedFields);
    if (!row) throw new SavedRequestError(409, "This recipe changed in another tab. Reload it before saving again.");
    return document(row, await replaceMessages(tx, viewerId, id, input.messages));
  });
}

export async function shareSavedRecipe(viewerId: string, id: string): Promise<string | null> {
  if (!SavedIdSchema.safeParse(id).success) return null;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select({ shareSlug: savedRecipes.shareSlug }).from(savedRecipes)
      .where(ownerWhere(viewerId, id)).limit(1).for("update");
    if (!row) return null;
    if (row.shareSlug) return row.shareSlug;
    const slug = randomBytes(24).toString("base64url");
    // Sharing does not change recipe/chat content; keep a pending autosave token valid.
    await tx.update(savedRecipes).set({ shareSlug: slug, updatedAt: savedRecipes.updatedAt }).where(ownerWhere(viewerId, id));
    return slug;
  });
}

export async function updateViewerAllergies(viewerId: string, allergies: string[]): Promise<string[]> {
  const [row] = await getDb().update(users).set({ allergies }).where(eq(users.id, viewerId)).returning({ allergies: users.allergies });
  if (!row) throw new SavedRequestError(404, "This kitchen wasn't found.");
  return row.allergies;
}
