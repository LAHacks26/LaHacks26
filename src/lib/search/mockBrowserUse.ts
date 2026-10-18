import type { AgentPoll, BrowserUseClient, StartOptions } from "./browserUse";
import { mockCandidatesFor } from "./mockResults";

// Stands in for Browser Use until the key arrives (PRD §10.5). It keeps the same interface and
// reveals a scripted step log over about 8 seconds, then returns verified candidates. No timers:
// progress is computed from the clock when poll() runs, so it is easy to test.

export const MOCK_DURATION_MS = 8_000;

const STEP_SCRIPT = [
  "Opening Allrecipes…",
  "Searching for {dish}…",
  "Opening BBC Good Food…",
  "Reading ingredients…",
  "Checking cook times…",
  "Comparing the best matches…",
  "Picked 3 recipe pages.",
];

type MockTask = {
  startedAt: number;
  dishQuery: string;
  cancelled: boolean;
};

export type MockClientOptions = {
  now?: () => number;
  durationMs?: number;
};

export class MockBrowserUseClient implements BrowserUseClient {
  private readonly tasks = new Map<string, MockTask>();
  private readonly now: () => number;
  private readonly durationMs: number;

  constructor(options: MockClientOptions = {}) {
    this.now = options.now ?? Date.now;
    this.durationMs = options.durationMs ?? MOCK_DURATION_MS;
  }

  async start(_prompt: string, opts: StartOptions): Promise<{ taskId: string; liveUrl: string | null }> {
    const taskId = globalThis.crypto.randomUUID();
    this.tasks.set(taskId, { startedAt: this.now(), dishQuery: opts.dishQuery, cancelled: false });
    return { taskId, liveUrl: null };
  }

  async poll(taskId: string): Promise<AgentPoll> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("Unknown mock task.");

    const steps = stepsSoFar(task.dishQuery, this.now() - task.startedAt, this.durationMs);
    if (task.cancelled) return { status: "failed", steps };

    const elapsed = this.now() - task.startedAt;
    if (elapsed < this.durationMs) return { status: "running", steps };
    return { status: "finished", steps: stepsSoFar(task.dishQuery, this.durationMs, this.durationMs), candidates: mockCandidatesFor(task.dishQuery) };
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) task.cancelled = true;
  }
}

/** Steps revealed so far: step i appears at i * duration / count, so the first one shows at once. */
export function stepsSoFar(dishQuery: string, elapsedMs: number, durationMs: number): string[] {
  const count = STEP_SCRIPT.length;
  const shown = Math.min(count, Math.floor((Math.max(0, elapsedMs) * count) / durationMs) + 1);
  return STEP_SCRIPT.slice(0, shown).map((text) => text.replace("{dish}", dishQuery));
}
