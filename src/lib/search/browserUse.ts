import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MockBrowserUseClient } from "./mockBrowserUse";

// The Browser Use agent (PRD §10 step 3, §13.1). The mock runs unless BROWSER_USE_MOCK=false and
// BROWSER_USE_API_KEY is set; then BrowserUseCloudClient drives Browser Use Cloud API v2.

export type AgentStatus = "running" | "finished" | "failed";

export type AgentCandidate = { url: string; title: string };

export type AgentPoll = {
  status: AgentStatus;
  /** Every step so far, oldest first. runSearch emits the ones it has not shown yet. */
  steps: string[];
  candidates?: AgentCandidate[];
};

export type StartOptions = {
  dishQuery: string;
  constraints: string[];
  maxTotalMin?: number;
  maxSteps: number;
};

export interface BrowserUseClient {
  start(prompt: string, opts: StartOptions): Promise<{ taskId: string; liveUrl: string | null }>;
  poll(taskId: string): Promise<AgentPoll>;
  cancel(taskId: string): Promise<void>;
}

/** Step limit given to the agent (PRD §10 step 3). */
export const AGENT_MAX_STEPS = 25;

/** The task prompt. Wording follows PRD §10 step 3: 3 distinct pages, allowlist first, about 25 steps. */
export function buildAgentPrompt(dishQuery: string, constraints: string[], maxTotalMin?: number): string {
  const lines = [
    `Find 3 distinct recipe pages for ${JSON.stringify(dishQuery)}.`,
    `Dietary and equipment limits: ${constraints.length > 0 ? constraints.join(", ") : "none"}. Each recipe must meet every limit. For example, "Dairy-free" means no butter, milk, cheese or cream, and "No oven" means no baking.`,
  ];
  if (maxTotalMin !== undefined) {
    lines.push(`Total time (prep, cook and rest together) must be at most ${maxTotalMin} minutes. Skip any recipe over that.`);
  }
  lines.push(
    "Prefer these sites: AllRecipes (allrecipes.com), Serious Eats (seriouseats.com), BBC Good Food (bbcgoodfood.com), Budget Bytes (budgetbytes.com), Simply Recipes (simplyrecipes.com) and Food Network (foodnetwork.com).",
    "Fall back to other reputable recipe sites only if those give fewer than 3 pages.",
    "Each candidate must be one single recipe page with its own URL: not a list, a search page, a video or a collection.",
    `Use about ${AGENT_MAX_STEPS} steps at most.`,
    'Return {"candidates":[{"url":"...","title":"..."}]} with 3 distinct URLs.',
  );
  return lines.join("\n");
}

// --- Browser Use Cloud ---
//
// Measured on "mango sticky rice" (2026-10-18): one agent hopping across sites took 60–99 s, and it
// wrote some candidate URLs from memory (Serious Eats links 404'd). So the real client runs one agent
// per site in parallel, each starting on that site's search results and opening its best match.
// The slowest finished in 25–34 s, and each candidate URL is the page the browser actually loaded,
// taken from the step log rather than from the model's text.
//
// Later the same day, obscure dishes ("hong kong dan ta", "khao soi") found nothing on those sites,
// and one agent hung for 151 s without taking a step, holding the whole search until it failed. So a
// fourth agent searches the open web (DuckDuckGo; Google answers bots with a captcha), and a run
// finishes early: at 3 recipes, after SOFT_DEADLINE_MS if anything was found, or at HARD_DEADLINE_MS.

type Site = {
  name: string;
  /** The site's host. Null for the open-web agent: any host except search engines and social sites. */
  host: string | null;
  searchUrl: (dish: string) => string;
  /** Paths of single-recipe pages. Roundups ("mango-recipes-5117647") and other pages don't match. */
  recipePath: RegExp;
};

/** Allowlisted sites whose search pages work in the agent and whose recipes our server can fetch, then the open web. */
export const AGENT_SITES: Site[] = [
  { name: "AllRecipes", host: "allrecipes.com", searchUrl: (dish) => `https://www.allrecipes.com/search?q=${encodeURIComponent(dish)}`, recipePath: /^\/recipe\/\d+\// },
  { name: "BBC Good Food", host: "bbcgoodfood.com", searchUrl: (dish) => `https://www.bbcgoodfood.com/search?q=${encodeURIComponent(dish)}`, recipePath: /^\/recipes\/[^/]+\/?$/ },
  { name: "Serious Eats", host: "seriouseats.com", searchUrl: (dish) => `https://www.seriouseats.com/search?q=${encodeURIComponent(dish)}`, recipePath: /-recipe(?:-\d+)?\/?$/ },
  // Blog recipe URLs end in a slug ("/kao-soi/", "/chinese-egg-tarts.html") or say "recipe"; "/category/asian/" doesn't.
  { name: "the web", host: null, searchUrl: (dish) => `https://duckduckgo.com/?q=${encodeURIComponent(`${dish} recipe`)}`, recipePath: /recipe|\/[^/]*[a-z0-9][-_][a-z0-9][^/]*\/?$/i },
];

/** Hosts the open-web agent's pick can't come from: search engines, video, social and shopping sites. */
const NOT_RECIPE_HOSTS =
  /(^|\.)(duckduckgo\.com|bing\.com|google\.[a-z.]+|yahoo\.[a-z.]+|search\.brave\.com|ecosia\.org|startpage\.com|yandex\.[a-z.]+|youtube\.com|youtu\.be|pinterest\.[a-z.]+|reddit\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|t\.co|tumblr\.com|amazon\.[a-z.]+)$/;

/** Stop waiting once this many recipes are in (runSearch shows 3). */
const ENOUGH_CANDIDATES = 3;
/** After this, finish with whatever was found, including recipe pages a still-running agent has opened. */
const SOFT_DEADLINE_MS = 45_000;
/** After this, finish even with nothing. runSearch's own 150 s limit would fail the whole search. */
const HARD_DEADLINE_MS = 75_000;

const API_BASE = "https://api.browser-use.com/api/v2";
const REQUEST_TIMEOUT_MS = 10_000;
const LIVE_URL_TIMEOUT_MS = 1_000;
/** Browser Use's own agent model. Flash mode skips per-step reasoning, which roughly halves a run. */
const AGENT_LLM = "browser-use-2.0";
/** Read results, click one, confirm. Two or three steps in practice; the cap bounds a confused agent. */
const SITE_MAX_STEPS = 5;
/** A sub-task whose status can't be read this many polls in a row is given up on. */
const MAX_POLL_ERRORS = 3;

const TITLE_JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
});

const SITE_NAMES: Record<string, string> = Object.fromEntries([
  ...AGENT_SITES.flatMap((site) => (site.host ? [[site.host, site.name]] : [])),
  ["duckduckgo.com", "the web"],
  ["budgetbytes.com", "Budget Bytes"],
  ["simplyrecipes.com", "Simply Recipes"],
  ["foodnetwork.com", "Food Network"],
]);

const TaskViewSchema = z.object({
  status: z.string(),
  output: z.string().nullish(),
  steps: z
    .array(z.object({ nextGoal: z.string().nullish(), url: z.string().nullish() }))
    .default([]),
});
const SessionViewSchema = z.object({ liveUrl: z.string().nullish() });
const TitleSchema = z.object({ title: z.string() });

/** One agent's task: open the search result that best matches the dish, then stop. `site` null = the open web. */
export function buildSitePrompt(site: string | null, opts: Pick<StartOptions, "dishQuery" | "constraints" | "maxTotalMin">): string {
  const lines = site
    ? [
        `You are on ${site}'s search results for ${JSON.stringify(opts.dishQuery)}.`,
        "Click the result that best matches the dish. It must be one single recipe, not a list, a roundup, a video or a collection.",
      ]
    : [
        `You are on web search results for ${JSON.stringify(`${opts.dishQuery} recipe`)}.`,
        "Click the result that is one single recipe for this dish on a recipe website or food blog. Not a video, a list or roundup, Pinterest, Reddit, a forum or a shop.",
        "Prefer a site other than AllRecipes, BBC Good Food and Serious Eats; other agents search those.",
      ];
  if (opts.constraints.length > 0) {
    lines.push(`It must meet every limit: ${opts.constraints.join(", ")}. For example, "Dairy-free" means no butter, milk, cheese or cream, and "No oven" means no baking.`);
  }
  if (opts.maxTotalMin !== undefined) lines.push(`Prefer one that takes at most ${opts.maxTotalMin} minutes in total.`);
  lines.push(
    "As soon as that recipe page has loaded, stop and return its title. Do not open anything else.",
    "If no result fits, return an empty title.",
  );
  return lines.join("\n");
}

function hostOf(url: string | null | undefined): string | null {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** "/search?q=…" or any "?q=…". Not a slug that merely contains "search" ("/research-kitchen-pancakes/"). */
const isSearchPage = (url: URL) => /\/search(\/|\.|$)/i.test(url.pathname) || url.searchParams.has("q");

/** "Searching AllRecipes…" or "Reading Serious Eats: thai coconut sticky rice mango…" from a step's page. */
export function describeStep(step: { nextGoal?: string | null; url?: string | null }): string {
  const goal = step.nextGoal?.trim();
  if (goal) return goal.length > 100 ? `${goal.slice(0, 99)}…` : goal;
  let url: URL;
  try {
    url = new URL(step.url ?? "");
  } catch {
    return "Browsing…";
  }
  const host = url.hostname.replace(/^www\./, "");
  const site = SITE_NAMES[host] ?? host;
  if (isSearchPage(url)) return `Searching ${site}…`;
  const slug = url.pathname.split("/").filter((part) => part && !/^\d+$/.test(part)).at(-1);
  const words = slug?.replace(/\.html?$/, "").replace(/[-_]+/g, " ").replace(/\brecipes?\b/gi, "").replace(/\s+/g, " ").trim();
  if (!words) return `Opening ${site}…`;
  const short = words.length > 50 ? words.slice(0, 51).replace(/\s+\S*$/, "") : words;
  return `Reading ${site}: ${short}…`;
}

/**
 * The recipe a finished site agent chose: the last page it loaded on that site, preferring pages
 * shaped like a single recipe over other non-search pages. The URL comes from the browser, so it is
 * real; the title comes from the agent's output. An explicit empty title means "nothing fits".
 */
export function candidateFromRun(
  site: Pick<Site, "host" | "recipePath">,
  view: { output?: string | null; steps: { url?: string | null }[] },
  /** Only pages shaped like a single recipe. For agents still running: a category page isn't a find yet. */
  strict = false,
): AgentCandidate | null {
  let recipe: string | null = null;
  let other: string | null = null;
  for (const step of view.steps) {
    const host = hostOf(step.url);
    if (!host || (site.host ? host !== site.host : NOT_RECIPE_HOSTS.test(host))) continue;
    const parsed = new URL(step.url!);
    if (isSearchPage(parsed) || parsed.pathname.length <= 1) continue;
    if (site.recipePath.test(parsed.pathname)) recipe = parsed.toString();
    else other = parsed.toString();
  }
  const url = strict ? recipe : (recipe ?? other);
  if (!url) return null;

  let title: string | null = null;
  try {
    title = TitleSchema.parse(JSON.parse(view.output ?? "")).title.trim();
  } catch {
    // No usable output: the recipe import reads the real title from the page.
  }
  if (title === "") return null;
  return { url, title: title ?? describeStep({ url }).replace(/^Reading [^:]+: |…$/g, "") };
}

type SiteTask = {
  site: Site;
  taskId: string;
  sessionId: string;
  done: boolean;
  /** How many of this agent's described steps are already in the run log. */
  logged: number;
  errors: number;
  candidate: AgentCandidate | null;
  /** A recipe page this agent has loaded while still running. Used if the run stops waiting for it. */
  partial: AgentCandidate | null;
};

type SiteRun = { tasks: SiteTask[]; log: string[]; startedAt: number };

/** Browser Use Cloud API v2 (docs.browser-use.com/cloud/api-v2-overview). One run = one agent per site. */
export class BrowserUseCloudClient implements BrowserUseClient {
  private readonly runs = new Map<string, SiteRun>();

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** `prompt` is the single-agent prompt for the mock; the site agents get buildSitePrompt instead. */
  async start(_prompt: string, opts: StartOptions): Promise<{ taskId: string; liveUrl: string | null }> {
    const started = await Promise.all(
      AGENT_SITES.map(async (site): Promise<SiteTask | null> => {
        try {
          const created = z.object({ id: z.string(), sessionId: z.string() }).parse(
            await this.request("POST", "/tasks", {
              task: buildSitePrompt(site.host ? site.name : null, opts),
              llm: AGENT_LLM,
              maxSteps: SITE_MAX_STEPS,
              flashMode: true,
              startUrl: site.searchUrl(opts.dishQuery),
              structuredOutput: TITLE_JSON_SCHEMA,
            }),
          );
          return { site, taskId: created.id, sessionId: created.sessionId, done: false, logged: 0, errors: 0, candidate: null, partial: null };
        } catch {
          // One site failing to start (e.g. the concurrency limit) still leaves the others.
          return null;
        }
      }),
    );
    const tasks = started.filter((task): task is SiteTask => task !== null);
    if (tasks.length === 0) throw new Error("Browser Use could not start any agent");

    const runId = randomUUID();
    const names = tasks.map((task) => task.site.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    this.runs.set(runId, { tasks, log: [`Sending agents to ${list}…`], startedAt: this.now() });
    // The page shows one live view: the first site's browser.
    return { taskId: runId, liveUrl: await this.liveUrl(tasks[0]!.sessionId) };
  }

  async poll(runId: string): Promise<AgentPoll> {
    const run = this.runs.get(runId);
    if (!run) throw new Error("Unknown Browser Use run");
    await Promise.all(run.tasks.filter((task) => !task.done).map((task) => this.pollTask(run, task)));

    const unfinished = run.tasks.filter((task) => !task.done);
    // Distinct URLs: the web agent can land on the same page as a site agent, and runSearch dedupes them.
    const foundUrls = new Set(run.tasks.flatMap((task) => (task.candidate ? [task.candidate.url] : [])));
    const found = foundUrls.size;
    const cut: SiteTask[] = [];
    if (unfinished.length > 0) {
      // One slow or hung agent must not hold up (or, at runSearch's 150 s limit, fail) the whole search.
      const elapsed = this.now() - run.startedAt;
      const withPartials = new Set([...foundUrls, ...unfinished.flatMap((task) => (task.partial ? [task.partial.url] : []))]);
      const stopWaiting =
        found >= ENOUGH_CANDIDATES ||
        elapsed >= HARD_DEADLINE_MS ||
        (elapsed >= SOFT_DEADLINE_MS && withPartials.size > 0);
      if (!stopWaiting) return { status: "running", steps: [...run.log] };
      for (const task of unfinished) {
        task.done = true;
        cut.push(task);
        void this.request("PATCH", `/tasks/${encodeURIComponent(task.taskId)}`, { action: "stop_task_and_session" }).catch(() => undefined);
      }
      if (found < ENOUGH_CANDIDATES) run.log.push("Wrapping up with the recipes found so far…");
    }

    this.runs.delete(runId);
    this.stopSession(run.tasks[0]!);
    // Finished agents' picks first, then pages that stopped agents had already opened.
    const candidates = [
      ...run.tasks.flatMap((task) => (task.candidate ? [task.candidate] : [])),
      ...cut.flatMap((task) => (task.partial ? [task.partial] : [])),
    ];
    return { status: "finished", steps: [...run.log], candidates };
  }

  async cancel(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.delete(runId);
    await Promise.all(
      run.tasks.map((task) =>
        this.request("PATCH", `/tasks/${encodeURIComponent(task.taskId)}`, { action: "stop_task_and_session" }).catch(() => undefined),
      ),
    );
  }

  private async pollTask(run: SiteRun, task: SiteTask): Promise<void> {
    let view: z.infer<typeof TaskViewSchema>;
    try {
      view = TaskViewSchema.parse(await this.request("GET", `/tasks/${encodeURIComponent(task.taskId)}`));
      task.errors = 0;
    } catch {
      if (++task.errors >= MAX_POLL_ERRORS) this.finishTask(task, null, task === run.tasks[0]);
      return;
    }
    // Append this agent's new steps, so the combined log only ever grows.
    const described: string[] = [];
    for (const step of view.steps) {
      const text = describeStep(step);
      if (described.at(-1) !== text) described.push(text);
    }
    run.log.push(...described.slice(task.logged));
    task.logged = Math.max(task.logged, described.length);

    if (view.status === "created" || view.status === "started") {
      task.partial = candidateFromRun(task.site, { output: null, steps: view.steps }, true);
      return;
    }
    this.finishTask(task, view.status === "finished" ? candidateFromRun(task.site, view) : null, task === run.tasks[0]);
  }

  /**
   * Records the result and stops the browser, which can otherwise stay up (and billed) for a while.
   * The first site's browser is the page's live view, so it keeps running until the whole run ends.
   */
  private finishTask(task: SiteTask, candidate: AgentCandidate | null, live: boolean): void {
    task.done = true;
    task.candidate = candidate;
    if (!live) this.stopSession(task);
  }

  private stopSession(task: SiteTask): void {
    void this.request("PATCH", `/sessions/${encodeURIComponent(task.sessionId)}`, { action: "stop" }).catch(() => undefined);
  }

  /**
   * The live view, read-only so viewers can't drive the agent's browser. Null if it isn't ready yet.
   * The agents are already running, so this waits briefly (at most ~4.5 s) rather than hold up the page.
   */
  private async liveUrl(sessionId: string): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const session = SessionViewSchema.parse(
          await this.request("GET", `/sessions/${encodeURIComponent(sessionId)}`, undefined, LIVE_URL_TIMEOUT_MS),
        );
        if (session.liveUrl) {
          const url = new URL(session.liveUrl);
          url.searchParams.set("readOnly", "true");
          return url.toString();
        }
      } catch {
        // The search works without a live view; the page shows its placeholder.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }

  /** One API call. Errors carry the method, resource and status only, never the key or response body. */
  private async request(method: string, path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const response = await this.fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: { "X-Browser-Use-API-Key": this.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Browser Use ${method} ${path.split("/")[1]} failed: HTTP ${response.status}`);
    return response.json();
  }
}

/** The mock runs unless BROWSER_USE_MOCK is "false" and BROWSER_USE_API_KEY is set. */
function isRealClientConfigured(): boolean {
  return process.env.BROWSER_USE_MOCK === "false" && Boolean(process.env.BROWSER_USE_API_KEY);
}

// One client per process. Cached on globalThis so dev hot reloads keep in-flight task state.
const globalForBrowserUse = globalThis as unknown as { __saffronBrowserUse?: BrowserUseClient };

export function getBrowserUseClient(): BrowserUseClient {
  if (!globalForBrowserUse.__saffronBrowserUse) {
    globalForBrowserUse.__saffronBrowserUse = isRealClientConfigured()
      ? new BrowserUseCloudClient(process.env.BROWSER_USE_API_KEY!)
      : new MockBrowserUseClient();
  }
  return globalForBrowserUse.__saffronBrowserUse;
}
