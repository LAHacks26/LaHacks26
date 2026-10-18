import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import { useRecipeStore } from "@/lib/store/recipeStore";
import { useChatStore } from "@/lib/store/chatStore";
import { SaveError, type SavePayload } from "@/lib/api/savedClient";
import type { SavedDocument } from "@/lib/saved/contracts";
import { createSaveSession, type SaveState } from "./saveSession";
import { clearSavedDraft, readSavedDraft } from "@/lib/store/savedDraft";

const id = "11111111-1111-4111-8111-111111111111";
const key = `saved:${id}`;
const scopes: ReturnType<typeof createSaveSession>[] = [];
function document(payload?: SavePayload, stamp = "2026-10-18T00:00:00.000001Z"): SavedDocument {
  return { id, copy: { recipe: butterChicken, version: 0, undoStack: [], ...payload?.copy, savedId: id }, messages: payload?.messages ?? [], updatedAt: stamp, shareSlug: null };
}
function setup(saved = true) {
  const recipeKey = saved ? key : "source";
  if (saved) useRecipeStore.getState().loadWorkingCopy(recipeKey, document().copy);
  else useRecipeStore.getState().load(recipeKey, butterChicken);
  useChatStore.getState().load(recipeKey, []);
  const states: SaveState[] = [];
  const api = {
    create: vi.fn(async (payload: SavePayload) => document(payload)),
    update: vi.fn(async (_id: string, payload: SavePayload) => document(payload, "2026-10-18T00:00:00.000002Z")),
    share: vi.fn(async () => ({ slug: "longRandomPublicShareSlug" })),
  };
  const scope = createSaveSession({ recipeKey, sourceRecipeId: "source", initial: saved ? document() : undefined, onChange: (state) => states.push(state) }, api);
  scopes.push(scope);
  return { api, scope, states };
}
function addTip() { useRecipeStore.getState().addTip({ kind: "step", id: "s1" }, "A useful tip."); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("localStorage", undefined); vi.stubGlobal("sessionStorage", undefined); clearSavedDraft(id); });
afterEach(() => { scopes.splice(0).forEach((scope) => scope.dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("saved recipe writes", () => {
  it("leaves an unsaved working copy local until Save is requested", async () => {
    const { api, scope } = setup(false);
    addTip();
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.create).not.toHaveBeenCalled();
    useChatStore.getState().append({ role: "user", content: "Can I use a pan?", contextRefs: [{ kind: "step", id: "s1" }] });
    expect(await scope.flush()).toBe(id);
    expect(api.create).toHaveBeenCalledOnce();
    const payload = api.create.mock.calls[0][0];
    expect(payload.copy.recipe.steps[0].tips.at(-1)?.text).toBe("A useful tip.");
    expect(payload.messages[0].contextRefs).toEqual([{ kind: "step", id: "s1" }]);
    expect(payload.copy.savedId).toBeUndefined();
  });
  it("debounces recipe and chat changes together for one second", async () => {
    const { api, scope } = setup();
    addTip();
    await vi.advanceTimersByTimeAsync(800);
    useChatStore.getState().append({ role: "assistant", content: "Yes." });
    await vi.advanceTimersByTimeAsync(999);
    expect(api.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.update).toHaveBeenCalledOnce();
    expect(api.update.mock.calls[0][1].messages).toHaveLength(1);
    expect(scope.dirty()).toBe(false);
  });
  it("serializes concurrent Save/Share and flushes newer changes before sharing", async () => {
    const { api, scope } = setup(false);
    const first = deferred<SavedDocument>();
    api.create.mockImplementationOnce(() => first.promise);
    const saving = scope.flush();
    const sharing = scope.share();
    addTip();
    useChatStore.getState().append({ role: "user", content: "Latest question." });
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.share).not.toHaveBeenCalled();
    first.resolve(document());
    await saving;
    expect(await sharing).toBe("longRandomPublicShareSlug");
    expect(api.update).toHaveBeenCalledOnce();
    expect(api.update.mock.calls[0][1].messages[0].content).toBe("Latest question.");
    expect(api.share).toHaveBeenCalledOnce();
  });
  it("uses the latest opaque revision without dropping microseconds", async () => {
    const { api, scope } = setup();
    addTip(); await scope.flush();
    useChatStore.getState().append({ role: "user", content: "Second save" });
    await scope.flush();
    expect(api.update.mock.calls.map((args) => (args[1] as SavePayload & { expectedUpdatedAt: string }).expectedUpdatedAt))
      .toEqual(["2026-10-18T00:00:00.000001Z", "2026-10-18T00:00:00.000002Z"]);
  });
  it("retains edits on failure and offers an explicit retry", async () => {
    const { api, scope, states } = setup();
    api.update.mockRejectedValueOnce(new SaveError("Offline"));
    addTip();
    await scope.flush();
    expect(scope.dirty()).toBe(true);
    expect(states.at(-1)?.error).toBe("Offline");
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.update).toHaveBeenCalledOnce();
    await scope.flush();
    expect(scope.dirty()).toBe(false);
  });
  it("stops automatic retries after a conflict; Save as new preserves the draft", async () => {
    const { api, scope, states } = setup();
    api.update.mockRejectedValueOnce(new SaveError("Changed in another tab", 409));
    addTip(); await scope.flush();
    useChatStore.getState().append({ role: "user", content: "Keep me" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.update).toHaveBeenCalledOnce();
    expect(states.at(-1)?.conflict).toBe(true);
    await scope.saveAsNew();
    expect(api.create.mock.calls[0][0].messages[0].content).toBe("Keep me");
    expect(api.create.mock.calls[0][0].copy.recipe.steps[0].tips.at(-1)?.text).toBe("A useful tip.");
  });
  it("does not share if saving fails", async () => {
    const { api, scope } = setup();
    api.update.mockRejectedValueOnce(new SaveError("No access", 404));
    addTip();
    expect(await scope.share()).toBeNull();
    expect(api.share).not.toHaveBeenCalled();
  });
  it("retains later edits and separate-copy intent when Save as new fails, including after returning", async () => {
    const { api, scope } = setup();
    api.update.mockRejectedValueOnce(new SaveError("Changed in another tab", 409));
    addTip(); await scope.flush();
    const failedCreate = deferred<SavedDocument>();
    api.create.mockImplementationOnce(() => failedCreate.promise);
    const creating = scope.saveAsNew();
    useChatStore.getState().append({ role: "user", content: "During failed creation" });
    failedCreate.reject(new SaveError("Offline"));
    expect(await creating).toBeNull();
    useChatStore.getState().append({ role: "user", content: "After failed creation" });
    expect(scope.dirty()).toBe(true);
    const draft = readSavedDraft(id)!;
    expect(draft.saveAsNew).toBe(true);
    expect(draft.messages.at(-1)?.content).toBe("After failed creation");
    scope.dispose();
    useRecipeStore.getState().load("another-page", butterChicken);
    useRecipeStore.getState().loadWorkingCopy(key, { ...draft.copy, savedId: id });
    useChatStore.getState().load(key, draft.messages);
    const recoveryStates: SaveState[] = [];
    const recovered = createSaveSession({ recipeKey: key, initial: document(), onChange: (state) => recoveryStates.push(state) }, api);
    scopes.push(recovered);
    expect(recovered.dirty()).toBe(true);
    expect(recoveryStates.at(-1)?.conflict).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.update).toHaveBeenCalledOnce();
    expect(api.create).toHaveBeenCalledOnce();
    const newId = "22222222-2222-4222-8222-222222222222";
    api.create.mockImplementationOnce(async (payload) => ({ ...document(payload), id: newId }));
    expect(await recovered.flush()).toBe(newId);
    expect(api.create.mock.calls.at(-1)?.[0].messages.at(-1)?.content).toBe("After failed creation");
    expect(readSavedDraft(id)).toBeNull();
  });
  it("ignores late responses and cancels pending debounce on navigation", async () => {
    const { api, scope, states } = setup();
    const response = deferred<SavedDocument>();
    api.update.mockImplementationOnce(() => response.promise);
    addTip();
    const saving = scope.flush();
    useRecipeStore.getState().load("other", butterChicken);
    const count = states.length;
    response.resolve(document());
    expect(await saving).toBeNull();
    expect(states).toHaveLength(count);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.update).toHaveBeenCalledOnce();
  });
  it("never autosaves an unchanged initial server document", async () => {
    const { api, scope } = setup();
    useChatStore.getState().setOpen(true);
    useRecipeStore.getState().dismissToast();
    await vi.advanceTimersByTimeAsync(1500);
    await scope.flush();
    expect(api.update).not.toHaveBeenCalled();
  });
  it("keeps pending recipe and chat drafts across SPA navigation before debounce", async () => {
    const { api } = setup();
    addTip();
    useChatStore.getState().append({ role: "user", content: "Don't lose this" });
    useRecipeStore.getState().load("another-page", butterChicken);
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.update).not.toHaveBeenCalled();
    const draft = readSavedDraft(id)!;
    expect(draft.messages[0].content).toBe("Don't lose this");
    expect(draft.copy.recipe.steps[0].tips.at(-1)?.text).toBe("A useful tip.");
    useRecipeStore.getState().loadWorkingCopy(key, { ...draft.copy, savedId: id });
    useChatStore.getState().load(key, draft.messages);
    const recovered = createSaveSession({ recipeKey: key, initial: document(), onChange: () => {} }, api);
    scopes.push(recovered);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.update).toHaveBeenCalledOnce();
    expect(readSavedDraft(id)).toBeNull();
  });
  it("does not automatically overwrite a newer server revision with a recovered draft", async () => {
    const { api, scope } = setup();
    addTip(); scope.dispose();
    const states: SaveState[] = [];
    const recovered = createSaveSession({ recipeKey: key, initial: document(undefined, "2026-10-18T01:00:00.000001Z"), onChange: (state) => states.push(state) }, api);
    scopes.push(recovered);
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.update).not.toHaveBeenCalled();
    expect(states.at(-1)?.conflict).toBe(true);
  });
});
