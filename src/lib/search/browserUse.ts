import "server-only";
import { MockBrowserUseClient } from "./mockBrowserUse";

// The Browser Use agent (PRD §10 step 3, §13.1). The mock is the default until the key arrives.
// The real client below is a stub; it is written when BROWSER_USE_API_KEY is set.

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

/** The real Browser Use Cloud client. Not written yet: it fails clearly until the key arrives (PRD §13.1). */
class BrowserUseCloudClient implements BrowserUseClient {
  async start(): Promise<{ taskId: string; liveUrl: string | null }> {
    throw new Error("Browser Use is not configured yet.");
  }

  async poll(): Promise<AgentPoll> {
    throw new Error("Browser Use is not configured yet.");
  }

  async cancel(): Promise<void> {
    throw new Error("Browser Use is not configured yet.");
  }
}

/** The mock runs unless BROWSER_USE_MOCK is "false" and BROWSER_USE_API_KEY is set. */
function isRealClientConfigured(): boolean {
  return process.env.BROWSER_USE_MOCK === "false" && Boolean(process.env.BROWSER_USE_API_KEY);
}

// One client per process. Cached on globalThis so dev hot reloads keep the mock's task state.
const globalForBrowserUse = globalThis as unknown as { __saffronBrowserUse?: BrowserUseClient };

export function getBrowserUseClient(): BrowserUseClient {
  if (!globalForBrowserUse.__saffronBrowserUse) {
    globalForBrowserUse.__saffronBrowserUse = isRealClientConfigured()
      ? new BrowserUseCloudClient()
      : new MockBrowserUseClient();
  }
  return globalForBrowserUse.__saffronBrowserUse;
}
