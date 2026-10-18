import { z } from "zod";
import { LineRefSchema, WorkingCopySchema } from "../recipe/schema";
import type { SavePayload } from "../api/savedClient";

const DraftSchema = z.object({
  updatedAt: z.string().min(1), copy: WorkingCopySchema,
  saveAsNew: z.boolean().optional(),
  messages: z.array(z.object({ id: z.string(), role: z.enum(["user", "assistant"]), content: z.string().min(1).max(10000), contextRefs: z.array(LineRefSchema).max(10).optional() })).max(200),
});
export type SavedDraft = z.infer<typeof DraftSchema>;
// Per-tab recovery avoids two tabs overwriting each other's unacknowledged work. Memory is
// a fallback for SPA navigation when storage is blocked; beforeunload covers full page exits.
const memory = new Map<string, SavedDraft>();
const key = (id: string) => `saffron:pending:${id}`;

export function readSavedDraft(id: string): SavedDraft | null {
  if (memory.has(id)) return memory.get(id)!;
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(sessionStorage.getItem(key(id)) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
export function writeSavedDraft(id: string, updatedAt: string, payload: SavePayload, saveAsNew = false) {
  const draft = { updatedAt, ...payload, ...(saveAsNew ? { saveAsNew: true } : {}) };
  memory.set(id, draft);
  try { sessionStorage.setItem(key(id), JSON.stringify(draft)); } catch { /* Keep in memory. */ }
}
export function clearSavedDraft(id: string) {
  memory.delete(id);
  try { sessionStorage.removeItem(key(id)); } catch { /* Storage may be blocked. */ }
}
