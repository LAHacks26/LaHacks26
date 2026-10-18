import { create } from "zustand";
import { z } from "zod";
import { AiEditResultSchema, LineRefSchema, type LineRef } from "../recipe/schema";

const MessageSchema = z.object({
  id: z.string(), role: z.enum(["user", "assistant"]), content: z.string().min(1).max(10000),
  result: AiEditResultSchema.optional(), appliedVersion: z.number().int().optional(),
});
const ThreadSchema = z.array(MessageSchema).max(200);
export type StoredChatMessage = z.infer<typeof MessageSchema>;
type Chip = { id: string; label: string; ref: LineRef };
type ChatStore = {
  recipeKey: string | null; messages: StoredChatMessage[]; chips: Chip[]; open: boolean; busy: boolean; error: string | null;
  load(key: string): void; setOpen(open: boolean): void; attach(ref: LineRef, label: string): void;
  removeChip(id: string): void; append(message: Omit<StoredChatMessage, "id">): void;
  setBusy(busy: boolean): void; setError(error: string | null): void;
};
export const useChatStore = create<ChatStore>()((set, get) => ({
  recipeKey: null, messages: [], chips: [], open: false, busy: false, error: null,
  load(recipeKey) {
    let messages: StoredChatMessage[] = [];
    try {
      const parsed = ThreadSchema.safeParse(JSON.parse(localStorage.getItem(`saffron:chat:${recipeKey}`) ?? "[]"));
      if (parsed.success) messages = parsed.data;
    } catch { /* Storage may be disabled. */ }
    set({ recipeKey, messages, chips: [], open: false, busy: false, error: null });
  },
  setOpen(open) { set({ open }); },
  attach(ref, label) {
    if (!get().recipeKey || !LineRefSchema.safeParse(ref).success) return;
    const id = JSON.stringify(ref);
    const chips = [...get().chips.filter((chip) => chip.id !== id), { id, label, ref }].slice(-10);
    set({ chips, open: true });
  },
  removeChip(id) { set({ chips: get().chips.filter((chip) => chip.id !== id) }); },
  append(message) {
    const messages = [...get().messages, { ...message, id: crypto.randomUUID() }].slice(-200);
    set({ messages });
    try { localStorage.setItem(`saffron:chat:${get().recipeKey}`, JSON.stringify(messages)); } catch { /* Keep in memory. */ }
  },
  setBusy(busy) { set({ busy }); },
  setError(error) { set({ error }); },
}));
