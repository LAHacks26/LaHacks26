// Fixture data for the search mock screens (/mocks/search). Nothing here is
// fetched; the search pipeline replaces it in a later phase (PRD §10).

export type AgentStep = {
  text: string;
  status: "done" | "active";
};

export type CachedItem = {
  id: string;
  title: string;
  site: string;
  totalMin: number;
};

export type Candidate = {
  id: string;
  title: string;
  site: string;
  totalMin: number;
  difficulty: number;
  /** Allergen tags on the recipe, e.g. ["dairy"]. */
  allergens: string[];
  fitsReadyBy: boolean;
};

export type LiveStatus = "browsing" | "reading" | "done";

export const mockSearch = {
  query: "butter chicken",
  /** Constraint labels, as shown on ConstraintChips. */
  constraints: [] as string[],
  /** 24-hour "HH:MM" from the time input. Empty string means not set. */
  readyBy: "19:30",
  userAllergies: ["dairy"],
  cached: [
    { id: "cached-bbc", title: "Butter Chicken", site: "BBC Good Food", totalMin: 50 },
    { id: "cached-bb", title: "Easy Murgh Makhani", site: "Budget Bytes", totalMin: 45 },
  ] satisfies CachedItem[],
  liveUrl: "https://www.seriouseats.com/butter-chicken",
  liveStatus: "reading" as LiveStatus,
  steps: [
    {
      text: 'Searching Serious Eats, BBC Good Food and AllRecipes for "butter chicken" under 55 min',
      status: "done",
    },
    { text: "Opened Serious Eats · reading ingredients", status: "done" },
    { text: "Found a match on Serious Eats · 55 min", status: "done" },
    { text: "Checking BBC Good Food…", status: "active" },
  ] satisfies AgentStep[],
  // Ranked per PRD §5.9: candidates containing a listed allergen go last.
  candidates: [
    {
      id: "cand-simply",
      title: "Dairy-Free Butter Chicken",
      site: "Simply Recipes",
      totalMin: 50,
      difficulty: 3,
      allergens: [],
      fitsReadyBy: true,
    },
    {
      id: "cand-budget",
      title: "Easy Murgh Makhani",
      site: "Budget Bytes",
      totalMin: 40,
      difficulty: 2,
      allergens: ["dairy"],
      fitsReadyBy: true,
    },
    {
      id: "cand-seriouseats",
      title: "Restaurant-Style Butter Chicken",
      site: "Serious Eats",
      totalMin: 55,
      difficulty: 2,
      allergens: ["dairy"],
      fitsReadyBy: true,
    },
  ] satisfies Candidate[],
  errorReason: "The browser session timed out on allrecipes.com after 150 seconds.",
};

/** A pasted link imports the page directly and skips the agent (PRD §5.1, §10.4). */
export function isRecipeUrl(value: string): boolean {
  return recipeUrlFrom(value) !== null;
}

/** A host with a dot and a TLD, then an optional port and path, with no spaces: "www.allrecipes.com/recipe/1/x". */
const BARE_LINK = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

/**
 * The link to import when the box holds one, or null for a dish search. A pasted link usually has
 * https://, but a typed one often doesn't ("allrecipes.com/recipe/…"), so that gets https:// added.
 */
export function recipeUrlFrom(value: string): string | null {
  const text = value.trim();
  if (/^https?:\/\//i.test(text)) return text;
  return BARE_LINK.test(text) ? `https://${text}` : null;
}

/** "19:30" becomes "7:30 PM". Unparseable values are returned unchanged. */
export function formatReadyBy(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${period}`;
}
