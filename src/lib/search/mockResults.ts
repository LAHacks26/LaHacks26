import type { AgentCandidate } from "./browserUse";

// Canned agent results for the mock client (PRD §10.5). Every URL here was checked with fetchPage
// and extractJsonLdRecipe: it returned 200 with a JSON-LD Recipe whose name matches the page.
// Allowlisted sites only. Budget Bytes and Food Network often 403 from the server, so they are not used.
// Butter chicken must keep the AllRecipes page, which is already cached (instant demo).

type KeywordSet = { keywords: string[]; candidates: AgentCandidate[] };

const BUTTER_CHICKEN: AgentCandidate[] = [
  { url: "https://www.allrecipes.com/recipe/141169/easy-indian-butter-chicken/", title: "Easy Indian Butter Chicken" },
  { url: "https://www.bbcgoodfood.com/recipes/butter-chicken", title: "Butter chicken" },
  { url: "https://www.simplyrecipes.com/recipes/chicken_tikka_masala/", title: "Chicken Tikka Masala" },
];

const CURRY: AgentCandidate[] = [
  { url: "https://www.bbcgoodfood.com/recipes/spinach-chickpea-curry", title: "Spinach & chickpea curry" },
  { url: "https://www.simplyrecipes.com/recipes/chicken_tikka_masala/", title: "Chicken Tikka Masala" },
  { url: "https://www.bbcgoodfood.com/recipes/chicken-tikka-masala", title: "Chicken tikka masala" },
];

const SPINACH: AgentCandidate[] = [
  { url: "https://www.bbcgoodfood.com/recipes/spinach-chickpea-curry", title: "Spinach & chickpea curry" },
  { url: "https://www.allrecipes.com/recipe/158968/spinach-and-feta-turkey-burgers/", title: "Spinach and Feta Turkey Burgers" },
];

const PASTA: AgentCandidate[] = [
  { url: "https://www.allrecipes.com/recipe/23600/worlds-best-lasagna/", title: "World's Best Lasagna" },
  { url: "https://www.bbcgoodfood.com/recipes/classic-spaghetti-bolognese", title: "Classic spaghetti Bolognese" },
];

const BREAKFAST: AgentCandidate[] = [
  { url: "https://www.allrecipes.com/recipe/21014/good-old-fashioned-pancakes/", title: "Good Old-Fashioned Pancakes" },
  { url: "https://www.bbcgoodfood.com/recipes/fluffy-pancakes", title: "Fluffy pancakes" },
  { url: "https://www.bbcgoodfood.com/recipes/easy-pancakes", title: "Easy pancakes" },
];

const DESSERT: AgentCandidate[] = [
  { url: "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/", title: "Best Chocolate Chip Cookies" },
  { url: "https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe", title: "The Food Lab's Chocolate Chip Cookies" },
  { url: "https://www.bbcgoodfood.com/recipes/easy-chocolate-cake", title: "Easy chocolate cake" },
];

const MAC_AND_CHEESE: AgentCandidate[] = [
  { url: "https://www.allrecipes.com/recipe/11679/homemade-mac-and-cheese/", title: "Homemade Mac and Cheese" },
  { url: "https://www.bbcgoodfood.com/recipes/ultimate-macaroni-cheese", title: "Ultimate macaroni cheese" },
];

const DEFAULT: AgentCandidate[] = [
  { url: "https://www.simplyrecipes.com/recipes/homemade_pizza/", title: "Homemade Pizza & Pizza Dough" },
  { url: "https://www.allrecipes.com/recipe/158968/spinach-and-feta-turkey-burgers/", title: "Spinach and Feta Turkey Burgers" },
  { url: "https://www.bbcgoodfood.com/recipes/cauliflower-cheese", title: "Quick cauliflower cheese" },
];

/** Checked in order; the first set whose keyword appears in the dish wins. Keep the specific ones first. */
const KEYWORD_SETS: KeywordSet[] = [
  { keywords: ["butter chicken"], candidates: BUTTER_CHICKEN },
  { keywords: ["mac and cheese", "macaroni", "mac & cheese"], candidates: MAC_AND_CHEESE },
  { keywords: ["breakfast", "pancake", "waffle"], candidates: BREAKFAST },
  { keywords: ["pasta", "spaghetti", "lasagna", "lasagne"], candidates: PASTA },
  { keywords: ["spinach"], candidates: SPINACH },
  { keywords: ["curry", "tikka", "masala"], candidates: CURRY },
  { keywords: ["cookie", "dessert", "cake", "brownie", "chocolate", "sweet"], candidates: DESSERT },
];

/** Up to three verified candidates for a dish. Matching ignores case. Unmatched dishes get the default set. */
export function mockCandidatesFor(dishQuery: string): AgentCandidate[] {
  const dish = dishQuery.toLowerCase();
  const set = KEYWORD_SETS.find(({ keywords }) => keywords.some((keyword) => dish.includes(keyword)));
  return (set?.candidates ?? DEFAULT).slice(0, 3);
}
