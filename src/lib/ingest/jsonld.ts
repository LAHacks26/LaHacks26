import { load, type CheerioAPI } from "cheerio";
import type { RawRecipe } from "./types";

// Pure parsing of recipe pages: JSON-LD Recipe fields and stripped page text.
// No "server-only" here so tests can import it.

type Obj = Record<string, unknown>;

const MAX_DEPTH = 10;
// Forms are handled separately: ASP.NET wraps the whole page in one, so only small forms are dropped.
const DROP_TAGS = "script,style,noscript,svg,nav,header,footer,aside,iframe";
const BLOCK_TAGS = "p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,section,article,main,tr,table,blockquote,dt,dd,figcaption,pre";
const ISO_DURATION = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

/** The Recipe found in a page's JSON-LD, or null when there is none. */
export function extractJsonLdRecipe(html: string, pageUrl: string): RawRecipe | null {
  const $ = load(html);
  const blocks = jsonLdBlocks($);
  const recipes: Obj[] = [];
  collectRecipes(blocks, recipes);

  const recipe = recipes.find((r) => collectStrings(r.recipeIngredient ?? r.ingredients).length > 0) ?? recipes[0];
  if (!recipe) return null;

  const instructions: string[] = [];
  collectSteps(recipe.recipeInstructions, instructions);
  const prepTimeMin = parseIsoDurationMin(recipe.prepTime);
  const cookTimeMin = parseIsoDurationMin(recipe.cookTime);

  return compact<RawRecipe>({
    name: textOf(recipe.name),
    description: textOf(recipe.description),
    author: personNames(recipe.author),
    siteName: siteNameFrom($, blocks, pageUrl),
    imageUrl: imageUrl(recipe.image, pageUrl),
    recipeYield: recipeYield(recipe.recipeYield),
    totalTimeMin:
      parseIsoDurationMin(recipe.totalTime) ??
      (prepTimeMin !== undefined && cookTimeMin !== undefined ? prepTimeMin + cookTimeMin : undefined),
    prepTimeMin,
    cookTimeMin,
    ingredients: collectStrings(recipe.recipeIngredient ?? recipe.ingredients),
    instructions,
  });
}

/** og:site_name, else JSON-LD publisher name, else the hostname without "www.". Empty if the URL has no host. */
export function extractSiteName(html: string, pageUrl: string): string {
  const $ = load(html);
  return siteNameFrom($, jsonLdBlocks($), pageUrl) ?? "";
}

/** Visible text of the page, for the Gemini fallback. Prefers article or main when it has enough text. */
export function extractPageText(html: string, maxChars = 30000): string {
  const $ = load(html);

  // A page title can sit inside a header, so move any h1 out before the header is dropped.
  $("header").each((_, el) => {
    const header = $(el);
    const headings = header.find("h1");
    if (headings.length > 0) header.before(headings).remove();
  });

  // Keep a form that wraps the content (ASP.NET) or holds an article/main; drop the rest.
  const bodyChars = $("body").text().length;
  $("form").each((_, el) => {
    const form = $(el);
    const wrapsContent = form.find("article, main").length > 0 || form.text().length > bodyChars / 2;
    if (!wrapsContent) form.remove();
  });

  $(DROP_TAGS).remove();

  const root =
    [$("article").first(), $("main").first()].find((el) => el.text().trim().length >= 200) ?? $("body").first();
  root.find("br").after("\n").remove();
  root.find(BLOCK_TAGS).before("\n").after("\n");

  const text = root
    .text()
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .join("\n");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/** Parses an ISO 8601 duration ("PT1H30M", "P0DT0H45M", "PT90M") into whole minutes. Garbage gives undefined. */
export function parseIsoDurationMin(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const match = ISO_DURATION.exec(raw.trim());
  if (!match || match.slice(1).every((part) => part === undefined)) return undefined;
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => (part ? Number(part) : 0));
  return Math.round(days * 24 * 60 + hours * 60 + minutes + seconds / 60);
}

// --- Finding Recipe nodes ---

function jsonLdBlocks($: CheerioAPI): unknown[] {
  const blocks: unknown[] = [];
  $("script").each((_, el) => {
    if ($(el).attr("type")?.trim().toLowerCase() !== "application/ld+json") return;
    const parsed = parseJson($(el).text());
    if (parsed !== undefined) blocks.push(parsed);
  });
  return blocks;
}

/**
 * Parses one JSON-LD block. Invalid JSON gives undefined so the other blocks still count.
 * Retries once with raw line breaks turned into spaces, since some sites put them inside strings.
 */
function parseJson(raw: string): unknown {
  const body = raw.trim().replace(/^<!--/, "").replace(/-->$/, "").trim();
  for (const candidate of [body, body.replace(/[\r\n]+/g, " ")]) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

function collectRecipes(node: unknown, out: Obj[], depth = 0): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectRecipes(item, out, depth + 1);
    return;
  }
  const obj = node as Obj;
  if (hasType(obj, "Recipe")) out.push(obj);
  collectRecipes(obj["@graph"], out, depth + 1);
  collectRecipes(obj.mainEntity, out, depth + 1);
}

// --- Field helpers ---

function collectSteps(node: unknown, out: string[], depth = 0): void {
  if (depth > MAX_DEPTH || node === null || node === undefined) return;
  if (typeof node === "string") {
    out.push(...cleanLines(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectSteps(item, out, depth + 1);
    return;
  }
  if (!isObj(node)) return;

  if (hasType(node, "HowToSection")) {
    const name = textOf(node.name);
    if (name) out.push(`Section: ${name}`);
    collectSteps(node.itemListElement, out, depth + 1);
    return;
  }

  const isStep = hasType(node, "HowToStep") || (typesOf(node).length === 0 && "text" in node);
  if (isStep) {
    const text = textOf(node.text) ?? textOf(node.name);
    if (text) out.push(text);
  }
  collectSteps(node.itemListElement, out, depth + 1);
}

function collectStrings(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => (typeof item === "string" ? cleanLines(item) : []));
}

function imageUrl(value: unknown, pageUrl: string): string | undefined {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    const raw = isObj(item) ? firstString(item.url) ?? firstString(item.contentUrl) : firstString(item);
    const resolved = resolveHttp(raw, pageUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

function resolveHttp(raw: string | undefined, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function personNames(value: unknown): string | undefined {
  const items = Array.isArray(value) ? value : [value];
  const names = items.map((item) => (isObj(item) ? textOf(item.name) : textOf(item)));
  const unique = [...new Set(names.filter((name): name is string => Boolean(name)))];
  return unique.length > 0 ? unique.join(", ") : undefined;
}

/** Prefers the first entry with a digit ("4 servings", 4), otherwise the first entry. */
function recipeYield(value: unknown): string | undefined {
  const items = Array.isArray(value) ? value : [value];
  const entries = items.flatMap((item) => {
    if (typeof item === "number") return [String(item)];
    if (typeof item === "string") {
      const text = cleanText(item);
      return text ? [text] : [];
    }
    return [];
  });
  return entries.find((entry) => /\d/.test(entry)) ?? entries[0];
}

function siteNameFrom($: CheerioAPI, blocks: unknown[], pageUrl: string): string | undefined {
  return ogSiteName($) ?? findPublisher(blocks) ?? hostLabel(pageUrl);
}

function ogSiteName($: CheerioAPI): string | undefined {
  const content = $('meta[property="og:site_name"], meta[name="og:site_name"]').first().attr("content");
  return content ? cleanText(content) || undefined : undefined;
}

function findPublisher(node: unknown, depth = 0): string | undefined {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPublisher(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const obj = node as Obj;
  const publisher = Array.isArray(obj.publisher) ? obj.publisher[0] : obj.publisher;
  const name = isObj(publisher) ? textOf(publisher.name) : undefined;
  if (name) return name;
  return findPublisher(obj["@graph"], depth + 1) ?? findPublisher(obj.mainEntity, depth + 1);
}

function hostLabel(pageUrl: string): string | undefined {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

// --- Text helpers ---

function typesOf(obj: Obj): string[] {
  const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
  return types.filter((t): t is string => typeof t === "string");
}

function hasType(obj: Obj, name: string): boolean {
  return typesOf(obj).some((t) => t === name || t.endsWith(`/${name}`) || t.endsWith(`:${name}`));
}

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string");
  return undefined;
}

/** Cleaned single-line text from a string or the first string in an array. */
function textOf(value: unknown): string | undefined {
  const raw = firstString(value);
  return raw ? cleanText(raw) || undefined : undefined;
}

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "")) as T;
}

const cleanLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Strips tags and decodes entities. Block breaks become newlines. */
function htmlToText(value: string): string {
  if (!/[<&]/.test(value)) return value;
  const withBreaks = value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n");
  return load(`<div>${withBreaks}</div>`, null, false).root().text();
}

function cleanText(value: string): string {
  return cleanLine(htmlToText(value));
}

function cleanLines(value: string): string[] {
  return htmlToText(value).split("\n").map(cleanLine).filter(Boolean);
}
