import { readAllergies } from "@/lib/allergies";
import { savedClient, SaveError, type SavePayload } from "@/lib/api/savedClient";
import type { SavedDocument } from "@/lib/saved/contracts";
import { useChatStore } from "@/lib/store/chatStore";
import { useRecipeStore } from "@/lib/store/recipeStore";
import { clearSavedDraft, readSavedDraft, writeSavedDraft } from "@/lib/store/savedDraft";

export type SaveState = {
  status: "unsaved" | "saved" | "pending" | "saving" | "error";
  id?: string; error?: string; conflict?: boolean;
};
export type SaveSessionOptions = {
  recipeKey: string; sourceRecipeId?: string; forkedFromSlug?: string;
  initial?: SavedDocument; onChange: (state: SaveState) => void;
};

/** Serializes writes, keeps edits made during a request, and never retries a conflict automatically. */
export function createSaveSession(options: SaveSessionOptions, api: Pick<typeof savedClient, "create" | "update" | "share"> = savedClient) {
  const controller = new AbortController();
  let id = options.initial?.id;
  const recovered = id ? readSavedDraft(id) : null;
  let updatedAt = recovered?.updatedAt ?? options.initial?.updatedAt;
  // Keep the old recovery identity until a separate copy is actually created. The intent
  // is persisted too, so reloading after a failed create cannot autosave into the old recipe.
  let creatingNew = recovered?.saveAsNew ?? false;
  let state: SaveState = { status: id ? "saved" : "unsaved", id };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<string | null> | null = null;
  let acknowledged = options.initial ? fingerprint(cleanPayload(options.initial)) : "";

  function cleanPayload(payload: SavePayload): SavePayload {
    const { recipe, version, undoStack, readyBy } = payload.copy;
    return { copy: { recipe, version, undoStack, ...(readyBy ? { readyBy } : {}) }, messages: payload.messages.map(({ id, role, content, contextRefs }) => ({ id, role, content, ...(contextRefs ? { contextRefs } : {}) })) };
  }

  function snapshot(): SavePayload | null {
    const recipe = useRecipeStore.getState();
    const chat = useChatStore.getState();
    if (controller.signal.aborted || recipe.recipeKey !== options.recipeKey || !recipe.copy || chat.recipeKey !== options.recipeKey) return null;
    // The route is authoritative for saved/source IDs. Never accept identity from stored JSON.
    const { recipe: content, version, undoStack, readyBy } = recipe.copy;
    return {
      copy: { recipe: content, version, undoStack, ...(readyBy ? { readyBy } : {}) },
      messages: chat.messages.map(({ id: messageId, role, content, contextRefs }) => ({ id: messageId, role, content, ...(contextRefs ? { contextRefs } : {}) })),
    };
  }
  function fingerprint(payload: SavePayload | null) { return payload ? JSON.stringify(payload) : ""; }
  function publish(next: SaveState) {
    state = next;
    if (!controller.signal.aborted) options.onChange(next);
  }
  function changed() {
    const payload = snapshot();
    if (!payload) { dispose(); return; }
    if ((!creatingNew && fingerprint(payload) === acknowledged) || !id) return;
    writeSavedDraft(id, updatedAt!, payload, creatingNew);
    if (running || state.status === "error") return;
    clearTimeout(timer);
    publish({ status: "pending", id });
    timer = setTimeout(() => { void flush(); }, 1000);
  }
  async function write(): Promise<string | null> {
    try {
      for (;;) {
        const payload = snapshot();
        if (!payload) return null;
        const sent = fingerprint(payload);
        if (id && !creatingNew && sent === acknowledged) { publish({ status: "saved", id }); return id; }
        publish({ status: "saving", id });
        const previousId = id;
        const result = id && !creatingNew
          ? await api.update(id, { ...payload, expectedUpdatedAt: updatedAt! }, controller.signal)
          : await api.create({ ...payload, sourceRecipeId: options.sourceRecipeId, forkedFromSlug: options.forkedFromSlug, allergies: readAllergies() }, controller.signal);
        if (!snapshot()) return null;
        id = result.id;
        updatedAt = result.updatedAt;
        creatingNew = false;
        acknowledged = sent;
        const latest = snapshot()!;
        if (fingerprint(latest) === acknowledged) clearSavedDraft(id);
        else writeSavedDraft(id, updatedAt, latest);
        if (previousId && previousId !== id) clearSavedDraft(previousId);
        // Loop only when there really were newer changes during the last write.
      }
    } catch (error) {
      if (!controller.signal.aborted) publish({
        status: "error", id,
        conflict: error instanceof SaveError && (error.status === 409 || error.status === 404),
        error: error instanceof Error ? error.message : "Couldn't save. Keep this page open and retry.",
      });
      return null;
    }
  }
  function flush(): Promise<string | null> {
    clearTimeout(timer);
    if (controller.signal.aborted) return Promise.resolve(null);
    if (running) return running;
    const payload = snapshot();
    if (id && payload && (creatingNew || fingerprint(payload) !== acknowledged)) writeSavedDraft(id, updatedAt!, payload, creatingNew);
    running = write().finally(() => { running = null; });
    return running;
  }
  const unsubscribeRecipe = useRecipeStore.subscribe(changed);
  const unsubscribeChat = useChatStore.subscribe(changed);
  function dispose() {
    clearTimeout(timer);
    controller.abort();
    unsubscribeRecipe(); unsubscribeChat();
  }
  if (creatingNew) {
    publish({ status: "error", id, conflict: true, error: "Your unfinished Save as new recipe was recovered. Save it as a new recipe or reload the saved version." });
  } else if (recovered && recovered.updatedAt !== options.initial?.updatedAt) {
    publish({ status: "error", id, conflict: true, error: "Your unsaved draft was recovered, but the saved recipe changed. Save it as a new recipe or reload the saved version." });
  } else changed();
  return {
    flush, dispose,
    dirty: () => Boolean(id && snapshot() && (creatingNew || fingerprint(snapshot()) !== acknowledged)),
    getState: () => state,
    async saveAsNew() {
      if (running) await running;
      if (controller.signal.aborted) return null;
      creatingNew = true;
      return flush();
    },
    async share() {
      const savedId = await flush();
      if (!savedId || controller.signal.aborted) return null;
      try {
        const result = await api.share(savedId, controller.signal);
        return controller.signal.aborted ? null : result.slug;
      } catch (error) {
        if (!controller.signal.aborted) publish({ status: "error", id, error: error instanceof Error ? error.message : "Couldn't share. Try again." });
        return null;
      }
    },
  };
}
