import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import type { AiEditResult, LineRef } from "@/lib/recipe/schema";
import { useRecipeStore } from "@/lib/store/recipeStore";
import { createRecipeSession, type RecipeSession } from "./recipeSession";

const target: LineRef = { kind: "step", id: "s1" };
const patch: AiEditResult = {
  kind: "patch",
  ops: [{ op: "update_step", id: "s1", text: "Use the new technique." }],
};
const scopes: RecipeSession[] = [];
function open(id: string) {
  useRecipeStore.getState().load(id, butterChicken);
  const scope = createRecipeSession(id);
  scopes.push(scope);
  return scope;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", undefined);
  useRecipeStore.setState({ copy: null, editing: null, glow: null, toast: null, newTipIds: [] });
});
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.dispose();
  vi.unstubAllGlobals();
});

describe("recipe request ownership", () => {
  it("saves an explanation on the unchanged recipe", () => {
    const scope = open("a");
    expect(scope.saveExplanation(target, "Slice against the grain.", 0)).not.toBeNull();
    expect(useRecipeStore.getState().copy?.recipe.steps[0].tips.at(-1)?.text)
      .toBe("Slice against the grain.");
  });

  it("discards a delayed explanation after navigation, even if transport ignores abort", async () => {
    const scope = open("a");
    let resolve!: (text: string) => void;
    const response = new Promise<string>((done) => { resolve = done; });
    const pending = response.then((text) => scope.saveExplanation(target, text, 0));
    open("b");
    resolve("An explanation of recipe A.");
    expect(await pending).toBeNull();
    expect(scope.signal.aborted).toBe(true);
    expect(useRecipeStore.getState().copy?.recipe).toEqual(butterChicken);
  });

  it("does not revive an old request when returning to the same recipe", () => {
    const old = open("a");
    open("b");
    const current = open("a");
    expect(old.currentCopy()).toBeNull();
    expect(old.saveExplanation(target, "Old answer", 0)).toBeNull();
    expect(current.currentCopy()?.sourceRecipeId).toBe("a");
  });

  it("late cleanup cannot clear the next recipe's edit lock", async () => {
    const old = open("a");
    expect(old.beginEdit(target)).toBe(true);
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_, fail) => { reject = fail; })
      .catch(() => undefined).finally(() => old.finishEdit());
    const current = open("b");
    expect(current.beginEdit(target)).toBe(true);
    reject(new Error("The old request was aborted"));
    await pending;
    expect(current.ownsEdit()).toBe(true);
    expect(old.ownsEdit()).toBe(false);
  });

  it("protects the edit lock when the same recipe remounts", () => {
    const old = open("a");
    old.beginEdit(target);
    old.dispose();
    const current = open("a");
    current.beginEdit(target);
    old.finishEdit();
    expect(current.ownsEdit()).toBe(true);
    expect(old.saveExplanation(target, "Old answer", 0)).toBeNull();
  });

  it("permits one edit, preserves ownership across undo, and allows a retry", () => {
    const scope = open("a");
    expect(scope.beginEdit(target)).toBe(true);
    expect(scope.beginEdit(target)).toBe(false);
    expect(useRecipeStore.getState().applyEdit(patch, 0)).toBe("applied");
    scope.finishEdit();
    expect(scope.beginEdit(target)).toBe(true);
    useRecipeStore.getState().undo();
    expect(scope.ownsEdit()).toBe(true);
    expect(useRecipeStore.getState().applyEdit(patch, 1)).toBe("stale");
    expect(useRecipeStore.getState().applyEdit(patch, 2)).toBe("applied");
  });

  it("does not save explanations of an edited or undone version", () => {
    const scope = open("a");
    scope.beginEdit(target);
    useRecipeStore.getState().applyEdit(patch, 0);
    expect(scope.saveExplanation(target, "Before edit", 0)).toBeNull();
    useRecipeStore.getState().undo();
    expect(scope.saveExplanation(target, "Before undo", 1)).toBeNull();
    expect(scope.saveExplanation(target, "Current answer", 2)).not.toBeNull();
  });

  it("aborts requests and releases its own lock on unmount, without accepting new work", () => {
    const scope = open("a");
    scope.beginEdit(target);
    const requestSignal = AbortSignal.any([scope.signal, new AbortController().signal]);
    scope.dispose();
    scope.dispose();
    expect(requestSignal.aborted).toBe(true);
    expect(useRecipeStore.getState().editing).toBeNull();
    expect(scope.beginEdit(target)).toBe(false);
  });
});
