import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import type { SavedDocument } from "@/lib/saved/contracts";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(), getOrCreateViewer: vi.fn(),
  createSavedRecipe: vi.fn(), listSavedRecipes: vi.fn(), getSavedRecipe: vi.fn(),
  updateSavedRecipe: vi.fn(), shareSavedRecipe: vi.fn(), updateViewerAllergies: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer", async (original) => ({ ...await original<typeof import("@/lib/auth/viewer")>(), getViewer: mocks.getViewer, getOrCreateViewer: mocks.getOrCreateViewer }));
vi.mock("@/lib/saved/repository", () => mocks);

import { GET as LIST, POST as CREATE } from "./route";
import { GET as READ, PATCH } from "./[id]/route";
import { POST as SHARE } from "./[id]/share/route";
import { PUT as ALLERGIES } from "../me/allergies/route";
import { MAX_SAVED_BODY_BYTES, SavedRequestError } from "@/lib/saved/http";

const origin = "https://saffron.example";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const bearer = "55555555-5555-4555-8555-555555555555";
const stamp = "2026-10-18T12:00:00.123456Z";
const copy = { recipe: butterChicken, undoStack: [], version: 3 };
const input = { copy, messages: [] };
const saved: SavedDocument = { id, copy: { ...copy, version: 0, savedId: id }, messages: [], updatedAt: stamp, shareSlug: null };
let currentViewer: string | null;
function params(savedId = id) { return { params: Promise.resolve({ id: savedId }) }; }
function request(method = "POST", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/recipes`, { method, headers: { origin, "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", origin);
  currentViewer = owner;
  mocks.getViewer.mockImplementation(async () => currentViewer ? { id: currentViewer, allergies: ["dairy"] } : null);
  mocks.getOrCreateViewer.mockImplementation(async () => ({ viewer: { id: currentViewer ?? owner, allergies: [] }, ...(currentViewer ? {} : { newToken: bearer }) }));
  mocks.listSavedRecipes.mockImplementation(async (viewer: string) => [{ id: viewer === owner ? id : otherId, title: butterChicken.title, totalMin: 50, updatedAt: stamp, shareSlug: null }]);
  mocks.getSavedRecipe.mockImplementation(async (viewer: string, target: string) => viewer === owner && target === id ? saved : null);
  mocks.updateSavedRecipe.mockImplementation(async (viewer: string, target: string) => viewer === owner && target === id ? saved : null);
  mocks.shareSavedRecipe.mockImplementation(async (viewer: string, target: string) => viewer === owner && target === id ? "a".repeat(32) : null);
  mocks.createSavedRecipe.mockResolvedValue(saved);
  mocks.updateViewerAllergies.mockImplementation(async (_viewer: string, allergies: string[]) => allergies);
});
afterEach(() => vi.unstubAllEnvs());

describe("recipe API ownership boundaries", () => {
  it("returns an empty kitchen without provisioning cookies when there is no viewer", async () => {
    currentViewer = null;
    const response = await LIST();
    expect(await response.json()).toEqual({ recipes: [], allergies: [] });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.getOrCreateViewer).not.toHaveBeenCalled();
    expect(mocks.listSavedRecipes).not.toHaveBeenCalled();
  });
  it.each([owner, other])("lists using only cookie viewer %s", async (viewer) => {
    currentViewer = viewer;
    const response = await LIST();
    const result = await response.json();
    expect(result.recipes.map((recipe: { id: string }) => recipe.id)).toEqual([viewer === owner ? id : otherId]);
    expect(mocks.listSavedRecipes).toHaveBeenCalledWith(viewer);
    expect(result.allergies).toEqual(["dairy"]);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("returns the same private 404 for unknown viewer, non-owner, and missing saved ID", async () => {
    const failures: unknown[] = [];
    for (const [viewer, target] of [[null, id], [other, id], [owner, otherId]]) {
      currentViewer = viewer;
      const response = await READ(request("GET"), params(target!));
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
      failures.push(await response.json());
    }
    expect(failures).toEqual(Array(3).fill({ error: "That recipe wasn't found." }));
  });
  it("lets the owner load and update their own saved document", async () => {
    expect(await (await READ(request("GET"), params())).json()).toEqual(saved);
    const response = await PATCH(request("PATCH", { ...input, expectedUpdatedAt: stamp }), params());
    expect(response.status).toBe(200);
    expect(mocks.updateSavedRecipe).toHaveBeenCalledWith(owner, id, { ...input, expectedUpdatedAt: stamp });
  });
  it("does not allow another viewer to update or share the owner's document", async () => {
    currentViewer = other;
    expect((await PATCH(request("PATCH", { ...input, expectedUpdatedAt: stamp }), params())).status).toBe(404);
    expect((await SHARE(request(), params())).status).toBe(404);
    expect(mocks.updateSavedRecipe).toHaveBeenCalledWith(other, id, expect.anything());
    expect(mocks.shareSavedRecipe).toHaveBeenCalledWith(other, id);
  });
  it("lets the owner create a share and returns only its slug", async () => {
    const response = await SHARE(request(), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slug: "a".repeat(32) });
    expect(mocks.shareSavedRecipe).toHaveBeenCalledWith(owner, id);
  });
  it("creates an anonymous save after validation and sends the credential only as an HttpOnly cookie", async () => {
    currentViewer = null;
    const response = await CREATE(request("POST", input));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(saved);
    expect(response.headers.get("set-cookie")).toContain(`saffron_uid=${bearer}`);
    expect(response.headers.get("set-cookie")).toMatch(/httponly/i);
    expect(mocks.createSavedRecipe).toHaveBeenCalledWith(owner, input);
  });
  it("preserves a 409 conflict without exposing or provisioning identity", async () => {
    mocks.updateSavedRecipe.mockRejectedValue(new SavedRequestError(409, "Reload this recipe."));
    const response = await PATCH(request("PATCH", { ...input, expectedUpdatedAt: stamp }), params());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Reload this recipe." });
    expect(mocks.getOrCreateViewer).not.toHaveBeenCalled();
  });
});

describe("mutation request validation before state changes", () => {
  const actions = [
    ["create", (req: Request) => CREATE(req), "POST", input],
    ["update", (req: Request) => PATCH(req, params()), "PATCH", { ...input, expectedUpdatedAt: stamp }],
    ["share", (req: Request) => SHARE(req, params()), "POST", undefined],
    ["allergies", (req: Request) => ALLERGIES(req), "PUT", { allergies: ["soy"] }],
  ] as const;
  it.each(actions)("rejects foreign origin before identity access: %s", async (_name, action, method, body) => {
    const response = await action(request(method, body, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(mocks.getViewer).not.toHaveBeenCalled();
    expect(mocks.getOrCreateViewer).not.toHaveBeenCalled();
    expect(mocks.createSavedRecipe).not.toHaveBeenCalled();
    expect(mocks.updateSavedRecipe).not.toHaveBeenCalled();
    expect(mocks.shareSavedRecipe).not.toHaveBeenCalled();
    expect(mocks.updateViewerAllergies).not.toHaveBeenCalled();
  });
  it.each(["userId", "ownerId", "forkedFromId"])("rejects forged ownership/lineage field %s without creation", async (field) => {
    const response = await CREATE(request("POST", { ...input, [field]: other }));
    expect(response.status).toBe(400);
    expect(mocks.getOrCreateViewer).not.toHaveBeenCalled();
    expect(mocks.createSavedRecipe).not.toHaveBeenCalled();
  });
  it("does not provision identity for oversized input", async () => {
    const response = await CREATE(request("POST", input, { "content-length": String(MAX_SAVED_BODY_BYTES + 1) }));
    expect(response.status).toBe(413);
    expect(mocks.getOrCreateViewer).not.toHaveBeenCalled();
  });
  it("rejects a forged owner in share input instead of using it", async () => {
    expect((await SHARE(request("POST", { userId: other }), params())).status).toBe(400);
    expect(mocks.shareSavedRecipe).not.toHaveBeenCalled();
  });
  it("sets normalized allergy replacement for the cookie owner and can create their identity", async () => {
    currentViewer = null;
    const response = await ALLERGIES(request("PUT", { allergies: [" SOY ", "soy", "Dairy"] }));
    expect(await response.json()).toEqual({ allergies: ["soy", "dairy"] });
    expect(mocks.updateViewerAllergies).toHaveBeenCalledWith(owner, ["soy", "dairy"]);
    expect(response.headers.get("set-cookie")).toContain("saffron_uid=");
  });
  it("keeps errors non-sensitive and every API response uncacheable", async () => {
    mocks.createSavedRecipe.mockRejectedValue(new Error("secret connection string and private chat"));
    const response = await CREATE(request("POST", input));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/secret|connection|private chat/);
    for (const res of [response, await LIST(), await READ(request("GET"), params())]) expect(res.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
