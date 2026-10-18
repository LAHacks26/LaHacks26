import { z } from "zod";
import { normalizeAllergies, readAllergies, subscribeAllergies, writeAllergies } from "@/lib/allergies";
import { withDeviceMutationLock } from "@/lib/api/deviceMutation";

// Client-safe response contracts; no identity or database modules enter the browser.
const AllergyResponseSchema = z.object({ allergies: z.array(z.string().min(1).max(80)).max(30) });
const KitchenResponseSchema = AllergyResponseSchema.extend({
  recipes: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    imageUrl: z.string().optional(),
    totalMin: z.number().nonnegative(),
    updatedAt: z.string(),
    shareSlug: z.string().nullable(),
  })),
});

export type SavedKitchenRecipe = z.infer<typeof KitchenResponseSchema>["recipes"][number];
export type KitchenSnapshot = {
  recipes: SavedKitchenRecipe[] | null;
  loadStatus: "loading" | "ready" | "error";
  loadError: string | null;
  allergies: string[];
  syncStatus: "idle" | "syncing" | "synced" | "error";
  syncError: string | null;
  localPersisted: boolean;
};

const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, allergies?: string[]): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  try {
    const run = async () => {
      controller.signal.throwIfAborted();
      const response = await fetch(path, {
        method: allergies ? "PUT" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        ...(allergies ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allergies }) } : {}),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => undefined);
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error("Saffron couldn't complete that request. Try again.");
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new Error("Saffron returned an unexpected response. Try again.");
      return parsed.data;
    };
    // This mutation can create the first HttpOnly identity. The cross-tab lock also
    // covers reading the response, so later requests use the established cookie.
    return await (allergies ? withDeviceMutationLock(controller.signal, run) : run());
  } catch (error) {
    if (signal.aborted) throw error;
    if (timedOut) throw new Error("That took too long. Try again.");
    if (error instanceof TypeError) throw new Error("Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

function sameAllergies(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** One mounted kitchen owns its requests. Allergy writes are serialized, latest local edit wins. */
export class KitchenSession {
  private snapshot: KitchenSnapshot = {
    recipes: null, loadStatus: "loading", loadError: null, allergies: [],
    syncStatus: "idle", syncError: null, localPersisted: true,
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private active = false;
  private revision = 0;
  private localEdited = false;
  private mergedInitial = false;
  private pendingSync = false;
  private loadController: AbortController | null = null;
  private syncController: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<KitchenSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  start() {
    this.active = true;
    this.epoch += 1;
    this.update({ allergies: readAllergies() });
    this.unsubscribe = subscribeAllergies(() => {
      const allergies = readAllergies();
      if (!sameAllergies(allergies, this.snapshot.allergies)) {
        this.revision += 1;
        this.localEdited = true;
        this.update({ allergies });
        this.retrySync();
      }
    });
    void this.load();
  }

  stop() {
    this.active = false;
    this.epoch += 1;
    this.loadController?.abort();
    this.syncController?.abort();
    this.loadController = null;
    this.syncController = null;
    this.pendingSync = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private saveLocally(allergies: string[]) {
    // Publish before writeAllergies notifies subscribers, so our own write isn't a new edit.
    this.update({ allergies });
    this.update({ localPersisted: writeAllergies(allergies) });
  }

  async load() {
    if (!this.active) return;
    const epoch = this.epoch;
    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    this.update({ loadStatus: "loading", loadError: null });
    try {
      const result = await request("/api/recipes", KitchenResponseSchema, controller.signal);
      if (!this.active || this.epoch !== epoch || this.loadController !== controller) return;
      this.update({ recipes: result.recipes, loadStatus: "ready" });
      if (!this.mergedInitial) {
        this.mergedInitial = true;
        // A user edit after mounting takes priority over the older GET response.
        if (!this.localEdited) {
          const serverAllergies = normalizeAllergies(result.allergies);
          const merged = normalizeAllergies([...this.snapshot.allergies, ...serverAllergies]);
          this.saveLocally(merged);
          if (!sameAllergies(merged, serverAllergies)) this.retrySync();
          else this.update({ syncStatus: "synced", syncError: null });
        }
      }
    } catch (error) {
      if (!this.active || this.epoch !== epoch || controller.signal.aborted) return;
      this.update({
        loadStatus: "error",
        loadError: error instanceof Error ? error.message : "Saffron couldn't load your kitchen. Try again.",
      });
    } finally {
      if (this.loadController === controller) this.loadController = null;
    }
  }

  saveAllergies(allergies: string[]) {
    if (!this.active) return;
    this.revision += 1;
    this.localEdited = true;
    this.saveLocally(normalizeAllergies(allergies));
    this.retrySync();
  }

  retrySync() {
    if (!this.active) return;
    this.pendingSync = true;
    this.update({ syncStatus: "syncing", syncError: null });
    if (!this.syncController) void this.sync();
  }

  private async sync() {
    const epoch = this.epoch;
    const revision = this.revision;
    const allergies = this.snapshot.allergies;
    const controller = new AbortController();
    this.syncController = controller;
    this.pendingSync = false;
    try {
      const result = await request("/api/me/allergies", AllergyResponseSchema, controller.signal, allergies);
      if (!this.active || this.epoch !== epoch) return;
      if (!sameAllergies(normalizeAllergies(result.allergies), allergies)) {
        throw new Error("Saffron couldn't confirm your allergy changes. Try again.");
      }
      if (revision === this.revision) this.update({ syncStatus: "synced", syncError: null });
    } catch (error) {
      if (!this.active || this.epoch !== epoch || controller.signal.aborted) return;
      if (revision === this.revision) {
        this.update({
          syncStatus: "error",
          syncError: error instanceof Error ? error.message : "Saffron couldn't sync your allergies. Try again.",
        });
      }
    } finally {
      if (this.syncController === controller) {
        this.syncController = null;
        if (this.active && this.pendingSync) void this.sync();
      }
    }
  }
}
