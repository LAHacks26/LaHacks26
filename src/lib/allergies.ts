// Client-safe allergy list (PRD §5.9). Stored per browser; sent with every AI request.
// Storage can be missing or throw (private mode, blocked site data), so every access is guarded.

export const ALLERGIES_KEY = "saffron:allergies";
export const MAX_ALLERGIES = 30;
export const MAX_ALLERGY_LENGTH = 80;

const listeners = new Set<() => void>();
// Preserve the current tab's preferences when the browser blocks storage writes.
let memoryFallback: string | undefined;

/** Client/API limits, with stable ordering and no silently truncated allergen names. */
export function normalizeAllergies(list: readonly string[]): string[] {
  const normalized = list
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0 && item.length <= MAX_ALLERGY_LENGTH);
  return [...new Set(normalized)].slice(0, MAX_ALLERGIES);
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The raw stored value. Stable between calls, so it can back useSyncExternalStore. */
export function readAllergiesRaw(): string | null {
  if (memoryFallback !== undefined) return memoryFallback;
  try {
    return storage()?.getItem(ALLERGIES_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Parses a stored value. Anything that is not a string array comes back as an empty list. */
export function parseAllergies(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) return [];
    return normalizeAllergies(parsed);
  } catch {
    return [];
  }
}

/** The saved allergy list. */
export function readAllergies(): string[] {
  return parseAllergies(readAllergiesRaw());
}

/** Updates subscribers for both this tab's writes and storage events from other tabs. */
export function subscribeAllergies(onChange: () => void): () => void {
  listeners.add(onChange);
  const listener = (event: StorageEvent) => {
    if (event.key === null || event.key === ALLERGIES_KEY) {
      memoryFallback = undefined;
      onChange();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", listener);
  };
}

/** Saves and announces the list. False means it is kept in this tab's memory only. */
export function writeAllergies(list: string[]): boolean {
  const raw = JSON.stringify(normalizeAllergies(list));
  let persisted = false;
  try {
    const target = storage();
    if (target) {
      target.setItem(ALLERGIES_KEY, raw);
      persisted = true;
    }
  } catch {
    // Private mode or a full quota: retain this tab's current choices.
  }
  memoryFallback = persisted ? undefined : raw;
  for (const listener of listeners) listener();
  return persisted;
}
