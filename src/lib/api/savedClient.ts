import { z } from "zod";
import { LineRefSchema, WorkingCopySchema, type WorkingCopy } from "../recipe/schema";
import type { SavedDocument, SavedThreadMessage } from "../saved/contracts";
import { withDeviceMutationLock } from "./deviceMutation";

const DocumentSchema = z.object({
  id: z.uuid(), copy: WorkingCopySchema, updatedAt: z.string().min(1),
  shareSlug: z.string().nullable(),
  messages: z.array(z.object({
    id: z.string(), role: z.enum(["user", "assistant"]), content: z.string(),
    contextRefs: z.array(LineRefSchema).optional(),
  })),
});
const ShareSchema = z.object({ slug: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) });

export type SavePayload = { copy: WorkingCopy; messages: SavedThreadMessage[] };
export class SaveError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

async function request<T>(path: string, method: string, body: unknown, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(20_000);
  try {
    const response = await fetch(path, {
      method, headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
      body: JSON.stringify(body), signal: AbortSignal.any([signal, timeout]),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new SaveError(typeof data?.error === "string" ? data.error : "Couldn't save. Try again.", response.status);
    }
    const result = schema.safeParse(await response.json());
    if (!result.success) throw new SaveError("The save response wasn't valid. Please reload My Kitchen before saving again.");
    return result.data;
  } catch (error) {
    if (error instanceof SaveError || signal.aborted) throw error;
    throw new SaveError(timeout.aborted ? "Saving took too long. Check My Kitchen before retrying." : "Couldn't connect. Keep this page open and retry saving.");
  }
}

export const savedClient = {
  get(id: string, signal: AbortSignal): Promise<SavedDocument> {
    return request(`/api/recipes/${encodeURIComponent(id)}`, "GET", undefined, DocumentSchema, signal);
  },
  create(payload: SavePayload & { sourceRecipeId?: string; forkedFromSlug?: string; allergies?: string[] }, signal: AbortSignal): Promise<SavedDocument> {
    return withDeviceMutationLock(signal, () => request("/api/recipes", "POST", payload, DocumentSchema, signal));
  },
  update(id: string, payload: SavePayload & { expectedUpdatedAt: string }, signal: AbortSignal): Promise<SavedDocument> {
    return request(`/api/recipes/${encodeURIComponent(id)}`, "PATCH", payload, DocumentSchema, signal);
  },
  share(id: string, signal: AbortSignal) {
    return request(`/api/recipes/${encodeURIComponent(id)}/share`, "POST", {}, ShareSchema, signal);
  },
};
