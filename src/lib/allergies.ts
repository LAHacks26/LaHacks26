// Client-safe allergy list (PRD §5.9). Stored per browser; sent with every AI request.
// Storage can be missing or throw (private mode, blocked site data), so every access is guarded.

export const ALLERGIES_KEY = "saffron:allergies";
export const MAX_ALLERGIES = 30;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The raw stored value. Stable between calls, so it can back useSyncExternalStore. */
export function readAllergiesRaw(): string | null {
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
    return parsed.slice(0, MAX_ALLERGIES);
  } catch {
    return [];
  }
}

/** The saved allergy list. */
export function readAllergies(): string[] {
  return parseAllergies(readAllergiesRaw());
}

/** Calls `onChange` when another tab changes the list. Returns the unsubscribe function. */
export function subscribeAllergies(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: StorageEvent) => {
    if (event.key === null || event.key === ALLERGIES_KEY) onChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

/** Saves the allergy list. Silently does nothing when storage is unavailable. */
export function writeAllergies(list: string[]): void {
  try {
    storage()?.setItem(ALLERGIES_KEY, JSON.stringify(list.slice(0, MAX_ALLERGIES)));
  } catch {
    // Private mode or a full quota: the list simply is not kept.
  }
}
