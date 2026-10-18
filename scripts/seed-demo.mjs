// Seeds the demo recipe cache by calling the running app's POST /api/import (PRD §14).
// Usage: node scripts/seed-demo.mjs [baseUrl]   (default http://localhost:3000)

const BASE_URL = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
// Gemini allows 5 requests per minute, so new (non-cached) imports are spaced out.
const GAP_MS = 15_000;

const URLS = [
  "https://www.allrecipes.com/recipe/141169/easy-indian-butter-chicken/",
  "https://www.simplyrecipes.com/recipes/chicken_tikka_masala/",
  "https://www.bbcgoodfood.com/recipes/spinach-chickpea-curry",
  "https://www.allrecipes.com/recipe/11679/homemade-mac-and-cheese/",
  "https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function importOne(url) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const body = (await res.json().catch(() => null)) ?? {};
    return { ok: res.ok, status: res.status, body, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, status: 0, body: { error: `network error: ${err.message}` }, ms: Date.now() - started };
  }
}

let failures = 0;
let previousWasNew = false;

for (let i = 0; i < URLS.length; i++) {
  const url = URLS[i];
  if (previousWasNew) await sleep(GAP_MS);

  const result = await importOne(url);
  const seconds = (result.ms / 1000).toFixed(1);
  const label = `${i + 1}/${URLS.length}`;

  if (result.ok) {
    const kind = result.body.cached ? "cached" : "new";
    console.log(`${label}  ${result.status}  ${kind.padEnd(6)}  ${result.body.sourceRecipeId}  ${seconds}s  ${url}`);
    previousWasNew = !result.body.cached;
  } else {
    failures++;
    const message = result.body.error ?? `HTTP ${result.status}`;
    console.log(`${label}  ${result.status}  failed  ${message}  ${seconds}s  ${url}`);
    // A failed import may still have reached Gemini, so keep the spacing.
    previousWasNew = true;
  }
}

console.log(failures === 0 ? "All demo recipes are cached." : `${failures} of ${URLS.length} imports failed.`);
process.exitCode = failures === 0 ? 0 : 1;
