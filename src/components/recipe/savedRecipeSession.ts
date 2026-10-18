import { savedClient } from "@/lib/api/savedClient";
import type { SavedDocument } from "@/lib/saved/contracts";

export function createSavedRecipeLoader(id: string, get = savedClient.get) {
  let snapshot: { document?: SavedDocument; error?: string } = {};
  let request: AbortController | null = null;
  const listeners = new Set<() => void>();
  function update(next: typeof snapshot) { snapshot = next; listeners.forEach((listener) => listener()); }
  function stop() { request?.abort(); request = null; update({}); }
  async function start() {
    stop();
    const controller = new AbortController();
    request = controller;
    try {
      const document = await get(id, controller.signal);
      if (request === controller && !controller.signal.aborted) update({ document });
    } catch (error) {
      if (request === controller && !controller.signal.aborted) update({ error: error instanceof Error ? error.message : "Couldn't load the saved recipe." });
    }
  }
  return {
    start, stop, getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
