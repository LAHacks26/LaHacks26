import { beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "../recipe/fixtures/butterChicken";
import { testDb } from "./testDb";
import type { CreateSavedInput, UpdateSavedInput } from "./validation";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDb: () => mocks.db }));
import { createSavedRecipe, getSavedRecipe, getSharedRecipe, listSavedRecipes, shareSavedRecipe, updateSavedRecipe, updateViewerAllergies } from "./repository";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const savedId = "33333333-3333-4333-8333-333333333333";
const sourceId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const slug = "a".repeat(32);
const token = "2026-10-18T19:30:20.123456Z";
const nextToken = "2026-10-18T19:30:20.123457Z";
const copy = { recipe: butterChicken, version: 7, undoStack: [butterChicken], readyBy: "2026-10-18T20:00:00.000Z" };
const messages = [{ id: messageId, role: "user" as const, content: "Can I prepare this ahead?", contextRefs: [{ kind: "step" as const, id: "s1" }] }];
const createInput: CreateSavedInput = { copy, messages };
const updateInput: UpdateSavedInput = { copy, messages, expectedUpdatedAt: token };
const row = (updatedAt = token, shareSlug: string | null = null) => [savedId, sourceId, butterChicken, [butterChicken], copy.readyBy, shareSlug, updatedAt];
let driver: ReturnType<typeof testDb>;
beforeEach(() => { driver = testDb(); mocks.db = driver.db; });

function assertOwnerClause(call: (typeof driver.calls)[number], viewerId: string) {
  expect(call.sql).toMatch(/"(?:saved_recipes"\.)?user_id" = \$\d/);
  expect(call.params).toContain(viewerId);
}

describe("owner-scoped reads using actual compiled SQL", () => {
  it.each([owner, other])("lists only the requesting viewer %s", async (viewerId) => {
    driver.replies.push([[savedId, butterChicken.title, null, 30, token, null]]);
    expect(await listSavedRecipes(viewerId)).toEqual([{ id: savedId, title: butterChicken.title, totalMin: 30, updatedAt: token, shareSlug: null }]);
    assertOwnerClause(driver.calls[0], viewerId);
    expect(driver.calls[0].sql).not.toContain("undo_stack");
  });
  it("reads recipe and chat under one parent-row share lock, scoped to the same owner", async () => {
    driver.replies.push([row()], [[messageId, "user", messages[0].content, messages[0].contextRefs]]);
    const result = await getSavedRecipe(owner, savedId);
    expect(result).toEqual({ id: savedId, copy: { ...copy, version: 0, sourceRecipeId: sourceId, savedId }, messages, updatedAt: token, shareSlug: null });
    expect(driver.transactions).toEqual(["begin", "commit"]);
    expect(driver.calls[0].sql).toContain("for share");
    for (const call of driver.calls) assertOwnerClause(call, owner);
    expect(driver.calls[1].sql).toContain("inner join");
  });
  it.each([owner, other])("returns no document and never queries chat for a missing/non-owner row (%s)", async (viewerId) => {
    driver.replies.push([]);
    expect(await getSavedRecipe(viewerId, savedId)).toBeNull();
    expect(driver.calls).toHaveLength(1);
    assertOwnerClause(driver.calls[0], viewerId);
  });
  it("returns a public projection containing only recipe and slug", async () => {
    driver.replies.push([[butterChicken, slug]]);
    expect(await getSharedRecipe(slug)).toEqual({ recipe: butterChicken, slug });
    expect(driver.calls[0].sql).toMatch(/^select "recipe", "share_slug" from "saved_recipes" where "saved_recipes"\."share_slug" =/);
    expect(driver.calls[0].sql).not.toMatch(/user_id|undo_stack|ready_by|chat_messages|source_recipe_id/);
  });
  it("treats a saved ID as an invalid public share slug", async () => {
    expect(await getSharedRecipe(savedId)).toBeNull();
    expect(await getSavedRecipe(owner, "not-an-id")).toBeNull();
    expect(driver.calls).toHaveLength(0);
  });
});

describe("transactional creation and lineage", () => {
  it("saves recipe/undo/deadline/chat together, with server-generated chat IDs and no trusted copy identity", async () => {
    driver.replies.push([row()], [], []);
    const result = await createSavedRecipe(owner, { ...createInput, copy: { ...copy, savedId: other, sourceRecipeId: other } });
    expect(driver.transactions).toEqual(["begin", "commit"]);
    const insert = driver.calls[0];
    expect(insert.sql).toMatch(/^insert into "saved_recipes"/);
    expect(insert.params).toContain(owner);
    expect(insert.params).not.toContain(other);
    expect(insert.params).toContain(JSON.stringify(copy.undoStack));
    expect(insert.params).toContain(copy.readyBy);
    expect(result.messages[0].id).not.toBe(messageId);
    expect(result.messages[0]).toMatchObject({ content: messages[0].content, role: "user", contextRefs: messages[0].contextRefs });
    assertOwnerClause(driver.calls[1], owner);
    expect(driver.calls[2].params).toContain(savedId);
    expect(driver.calls[2].params).not.toContain(messageId);
  });
  it("checks an explicit source against public source_recipes before inserting", async () => {
    driver.replies.push([[sourceId]], [row()], [], []);
    await createSavedRecipe(owner, { ...createInput, sourceRecipeId: sourceId });
    expect(driver.calls[0].sql).toContain('from "source_recipes"');
    expect(driver.calls[0].params).toContain(sourceId);
    expect(driver.calls[1].params).toContain(sourceId);
  });
  it("rejects an unknown explicit source before writing", async () => {
    driver.replies.push([]);
    await expect(createSavedRecipe(owner, { ...createInput, sourceRecipeId: other })).rejects.toMatchObject({ status: 404 });
    expect(driver.calls).toHaveLength(1);
    expect(driver.transactions).toEqual(["begin", "rollback"]);
  });
  it("resolves fork lineage exclusively through a valid public slug", async () => {
    driver.replies.push([[other, sourceId]], [row()], [], []);
    await createSavedRecipe(owner, { ...createInput, forkedFromSlug: slug });
    expect(driver.calls[0].sql).toContain('"saved_recipes"."share_slug" =');
    expect(driver.calls[0].params).toContain(slug);
    expect(driver.calls[1].params).toContain(other);
    expect(driver.calls[1].params).toContain(sourceId);
  });
  it("rejects a nonexistent/unshared fork without exposing the parent's state", async () => {
    driver.replies.push([]);
    await expect(createSavedRecipe(owner, { ...createInput, forkedFromSlug: slug })).rejects.toMatchObject({ status: 404 });
    expect(driver.calls).toHaveLength(1);
  });
  it("merges initial allergies while locking only the viewer's user row", async () => {
    driver.replies.push([[["dairy"]]], [], [row()], [], []);
    await createSavedRecipe(owner, { ...createInput, allergies: ["dairy", "soy"] });
    expect(driver.calls[0].sql).toContain('"users"."id" =');
    expect(driver.calls[0].params).toContain(owner);
    expect(driver.calls[0].sql).toContain("for update");
    expect(driver.calls[1].params).toContain('{"dairy","soy"}');
  });
  it("rolls back recipe and chat together when chat insertion fails", async () => {
    driver.replies.push([row()], [], new Error("DB insert failed"));
    await expect(createSavedRecipe(owner, createInput)).rejects.toThrow();
    expect(driver.transactions).toEqual(["begin", "rollback"]);
  });
});

describe("autosave conflicts and sharing", () => {
  it("writes with an owner condition and exact microsecond CAS, then replaces chat in the same transaction", async () => {
    driver.replies.push([[savedId]], [row(nextToken)], [], []);
    const result = await updateSavedRecipe(owner, savedId, updateInput);
    expect(result?.updatedAt).toBe(nextToken);
    expect(driver.transactions).toEqual(["begin", "commit"]);
    expect(driver.calls[0].sql).toContain("for update");
    assertOwnerClause(driver.calls[0], owner);
    assertOwnerClause(driver.calls[1], owner);
    assertOwnerClause(driver.calls[2], owner);
    expect(driver.calls[1].params).toContain(token);
    expect(driver.calls[1].sql).toContain("::timestamptz");
    expect(driver.calls[1].sql).toContain("greatest(clock_timestamp()");
    expect(driver.calls[1].sql).toContain("interval '1 microsecond'");
  });
  it("returns 409 on a stale token and never changes chat", async () => {
    driver.replies.push([[savedId]], []);
    await expect(updateSavedRecipe(owner, savedId, updateInput)).rejects.toMatchObject({ status: 409 });
    expect(driver.calls).toHaveLength(2);
    expect(driver.calls.some((call) => call.sql.includes("chat_messages"))).toBe(false);
    expect(driver.transactions).toEqual(["begin", "rollback"]);
  });
  it("does not update or share a non-owner's row", async () => {
    driver.replies.push([], []);
    expect(await updateSavedRecipe(other, savedId, updateInput)).toBeNull();
    expect(await shareSavedRecipe(other, savedId)).toBeNull();
    expect(driver.calls).toHaveLength(2);
    for (const call of driver.calls) {
      assertOwnerClause(call, other);
      expect(call.sql).toMatch(/^select /);
    }
  });
  it("generates an unguessable share slug under a write lock without changing the autosave token", async () => {
    driver.replies.push([[null]], []);
    const result = await shareSavedRecipe(owner, savedId);
    expect(result).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(driver.calls[0].sql).toContain("for update");
    expect(driver.calls[1].sql).toContain('"updated_at" = "saved_recipes"."updated_at"');
    for (const call of driver.calls) assertOwnerClause(call, owner);
  });
  it("returns the existing slug idempotently without any write", async () => {
    driver.replies.push([[slug]]);
    expect(await shareSavedRecipe(owner, savedId)).toBe(slug);
    expect(driver.calls).toHaveLength(1);
    expect(driver.calls[0].sql).toContain("for update");
  });
  it("replaces only the viewer's allergies", async () => {
    driver.replies.push([[[]]]);
    expect(await updateViewerAllergies(owner, [])).toEqual([]);
    expect(driver.calls[0].sql).toContain('where "users"."id" =');
    expect(driver.calls[0].params).toContain(owner);
  });
});
