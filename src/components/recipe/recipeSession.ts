import type { LineRef } from "@/lib/recipe/schema";
import { useRecipeStore, type RecipeStoreState } from "@/lib/store/recipeStore";

/** Owns requests and the edit lock for one mounted recipe editor. Never persisted. */
export function createRecipeSession(sourceRecipeId: string) {
  const controller = new AbortController();
  let ownedEdit: RecipeStoreState["editing"] = null;

  function currentCopy() {
    const copy = useRecipeStore.getState().copy;
    return !controller.signal.aborted && copy?.sourceRecipeId === sourceRecipeId ? copy : null;
  }

  function finishEdit() {
    const store = useRecipeStore.getState();
    if (ownedEdit && store.editing === ownedEdit) store.setEditing(null);
    ownedEdit = null;
  }

  function dispose() {
    controller.abort();
    unsubscribe();
    finishEdit();
  }

  // Invalidate permanently on navigation, including A → B → A before a response arrives.
  const unsubscribe = useRecipeStore.subscribe((state) => {
    if (state.copy?.sourceRecipeId !== sourceRecipeId) dispose();
  });

  return {
    signal: controller.signal,
    currentCopy,
    dispose,
    beginEdit(target: LineRef | null) {
      const store = useRecipeStore.getState();
      if (!currentCopy() || store.editing) return false;
      if (target) store.setEditing(target);
      else store.beginWholeRecipeEdit();
      ownedEdit = useRecipeStore.getState().editing;
      return true;
    },
    ownsEdit() {
      return Boolean(currentCopy() && ownedEdit && useRecipeStore.getState().editing === ownedEdit);
    },
    finishEdit,
    saveExplanation(target: LineRef, text: string, baseVersion: number) {
      const copy = currentCopy();
      if (!copy || copy.version !== baseVersion) return null;
      return useRecipeStore.getState().addTip(target, text);
    },
  };
}

export type RecipeSession = ReturnType<typeof createRecipeSession>;
