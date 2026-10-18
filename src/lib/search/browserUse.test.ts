import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_SITES, BrowserUseCloudClient, buildSitePrompt, candidateFromRun, describeStep } from "./browserUse";

vi.mock("server-only", () => ({}));

// Response shapes follow real v2 runs for "mango sticky rice" (2026-10-18).
const OPTS = { dishQuery: "mango sticky rice", constraints: [], maxSteps: 25 };
const PAGES: Record<string, string> = {
  "allrecipes.com": "https://www.allrecipes.com/recipe/150313/thai-sweet-sticky-rice-with-mango-khao-neeo-mamuang/",
  "bbcgoodfood.com": "https://www.bbcgoodfood.com/recipes/sticky-rice-mango",
  "seriouseats.com": "https://www.seriouseats.com/thai-coconut-sticky-rice-mango-recipe",
};

type Call = { method: string; url: string; headers: Record<string, string>; body?: Record<string, unknown> };
type Reply = { status?: number; json: unknown };

/** A fake v2 API. Tasks are numbered by site order: task-0 is AllRecipes, task-1 BBC, task-2 Serious Eats. */
function fakeApi(route: (call: Call) => Reply | undefined) {
  const calls: Call[] = [];
  let created = 0;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const reply =
      route(call) ??
      (call.method === "POST" && call.url.endsWith("/tasks")
        ? { status: 202, json: { id: `task-${created}`, sessionId: `sess-${created++}` } }
        : call.url.includes("/sessions/")
          ? { json: { liveUrl: "https://live.browser-use.com/?wss=https%3A%2F%2Fsecret.cdp.browser-use.com" } }
          : { json: {} });
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200 });
  });
  return { calls, client: new BrowserUseCloudClient("bu_test_key", fetchImpl as unknown as typeof fetch) };
}

function searchStep(host: string) {
  return { nextGoal: "", url: `https://www.${host}/search?q=mango+sticky+rice` };
}

function taskView(index: number, status: string, steps: { nextGoal: string; url: string }[], title = "Mango sticky rice") {
  return { json: { id: `task-${index}`, status, steps, output: status === "finished" ? JSON.stringify({ title }) : null } };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("BrowserUseCloudClient.start", () => {
  it("starts one flash-mode agent per site on that site's search results", async () => {
    const { calls, client } = fakeApi(() => undefined);

    const started = await client.start("single-agent prompt", { ...OPTS, constraints: ["Vegan"], maxTotalMin: 40 });

    const creates = calls.filter((call) => call.method === "POST");
    expect(creates.map((call) => call.body?.startUrl)).toEqual(AGENT_SITES.map((site) => site.searchUrl("mango sticky rice")));
    for (const create of creates) {
      expect(create.url).toBe("https://api.browser-use.com/api/v2/tasks");
      expect(create.headers["X-Browser-Use-API-Key"]).toBe("bu_test_key");
      expect(create.body).toMatchObject({ llm: "browser-use-2.0", maxSteps: 5, flashMode: true });
      expect(create.body?.task).toContain("Vegan");
      expect(create.body?.task).toContain("40 minutes");
      expect(JSON.parse(create.body?.structuredOutput as string).required).toEqual(["title"]);
    }
    // The page frames the first site's browser, read-only.
    expect(calls.find((call) => call.url.includes("/sessions/"))!.url).toBe("https://api.browser-use.com/api/v2/sessions/sess-0");
    expect(new URL(started.liveUrl!).searchParams.get("readOnly")).toBe("true");
    expect((await client.poll(started.taskId)).steps).toEqual(["Sending agents to AllRecipes, BBC Good Food and Serious Eats…"]);
  });

  it("goes ahead with the sites that started, and fails only when none did", async () => {
    let posts = 0;
    const partial = fakeApi((call) => (call.method === "POST" && posts++ === 1 ? { status: 429, json: { detail: "busy" } } : undefined));
    const started = await partial.client.start("p", OPTS);
    expect((await partial.client.poll(started.taskId)).steps[0]).toBe("Sending agents to AllRecipes and Serious Eats…");

    const none = fakeApi((call) => (call.method === "POST" ? { status: 429, json: { detail: "Too many sessions for bu_test_key" } } : undefined));
    const error = await none.client.start("p", OPTS).catch((e: unknown) => e);
    expect((error as Error).message).toBe("Browser Use could not start any agent");
    expect((error as Error).message).not.toContain("bu_test_key");
  });

  it("starts without a live view when the session has none yet", async () => {
    vi.useFakeTimers();
    const { client } = fakeApi((call) => (call.url.includes("/sessions/") ? { json: { liveUrl: null } } : undefined));
    const pending = client.start("p", OPTS);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).liveUrl).toBeNull();
  });
});

describe("BrowserUseCloudClient.poll", () => {
  it("merges every agent's steps into one log that only grows", async () => {
    let round = 0;
    const { client } = fakeApi((call) => {
      const match = /\/tasks\/task-(\d)$/.exec(call.url);
      if (!match || call.method !== "GET") return undefined;
      const index = Number(match[1]);
      const host = AGENT_SITES[index]!.host;
      const steps = round === 0 || index !== 0 ? [searchStep(host)] : [searchStep(host), { nextGoal: "", url: PAGES[host]! }];
      return taskView(index, "started", steps);
    });
    const { taskId } = await client.start("p", OPTS);

    const first = await client.poll(taskId);
    round = 1;
    const second = await client.poll(taskId);

    expect(first.status).toBe("running");
    expect(second.steps.slice(0, first.steps.length)).toEqual(first.steps);
    expect(second.steps).toEqual([
      "Sending agents to AllRecipes, BBC Good Food and Serious Eats…",
      "Searching AllRecipes…",
      "Searching BBC Good Food…",
      "Searching Serious Eats…",
      "Reading AllRecipes: thai sweet sticky rice with mango khao neeo…",
    ]);
  });

  it("finishes with the pages the browsers actually loaded, and stops every session", async () => {
    const { calls, client } = fakeApi((call) => {
      const match = /\/tasks\/task-(\d)$/.exec(call.url);
      if (!match || call.method !== "GET") return undefined;
      const index = Number(match[1]);
      const host = AGENT_SITES[index]!.host;
      // Serious Eats found nothing: it never left the search page.
      if (index === 2) return taskView(index, "finished", [searchStep(host)], "");
      return taskView(index, "finished", [searchStep(host), { nextGoal: "", url: PAGES[host]! }], `Title ${index}`);
    });
    const { taskId } = await client.start("p", OPTS);

    const result = await client.poll(taskId);

    expect(result.status).toBe("finished");
    expect(result.candidates).toEqual([
      { url: PAGES["allrecipes.com"], title: "Title 0" },
      { url: PAGES["bbcgoodfood.com"], title: "Title 1" },
    ]);
    const stopped = calls.filter((call) => call.method === "PATCH").map((call) => call.url.split("/").at(-1));
    expect(stopped.sort()).toEqual(["sess-0", "sess-1", "sess-2"]);
    await expect(client.poll(taskId)).rejects.toThrow("Unknown Browser Use run");
  });

  it("keeps the live-view browser running until the other agents finish", async () => {
    const { calls, client } = fakeApi((call) => {
      const match = /\/tasks\/task-(\d)$/.exec(call.url);
      if (!match || call.method !== "GET") return undefined;
      const index = Number(match[1]);
      return taskView(index, index === 0 ? "finished" : "started", [searchStep(AGENT_SITES[index]!.host)]);
    });
    const { taskId } = await client.start("p", OPTS);
    await client.poll(taskId);
    expect(calls.some((call) => call.method === "PATCH" && call.url.endsWith("/sess-0"))).toBe(false);
  });

  it("gives up on an agent whose status can't be read three times in a row", async () => {
    const { client } = fakeApi((call) => {
      if (call.method !== "GET" || !call.url.includes("/tasks/")) return undefined;
      return call.url.endsWith("task-1")
        ? { status: 503, json: {} }
        : taskView(Number(call.url.at(-1)), "finished", [{ nextGoal: "", url: PAGES[AGENT_SITES[Number(call.url.at(-1))]!.host]! }]);
    });
    const { taskId } = await client.start("p", OPTS);
    expect((await client.poll(taskId)).status).toBe("running");
    expect((await client.poll(taskId)).status).toBe("running");
    const result = await client.poll(taskId);
    expect(result.status).toBe("finished");
    expect(result.candidates).toHaveLength(2);
  });

  it("treats failed and stopped agents as finding nothing", async () => {
    const { client } = fakeApi((call) => {
      const match = /\/tasks\/task-(\d)$/.exec(call.url);
      if (!match || call.method !== "GET") return undefined;
      return taskView(Number(match[1]), Number(match[1]) === 0 ? "failed" : "stopped", [{ nextGoal: "", url: PAGES["allrecipes.com"]! }]);
    });
    const { taskId } = await client.start("p", OPTS);
    expect(await client.poll(taskId)).toMatchObject({ status: "finished", candidates: [] });
  });
});

describe("BrowserUseCloudClient.cancel", () => {
  it("stops every agent with its session, and ignores unknown runs", async () => {
    const { calls, client } = fakeApi(() => undefined);
    const { taskId } = await client.start("p", OPTS);
    await client.cancel(taskId);
    const stops = calls.filter((call) => call.method === "PATCH");
    expect(stops.map((call) => call.url.split("/").at(-1))).toEqual(["task-0", "task-1", "task-2"]);
    expect(stops.every((call) => call.body?.action === "stop_task_and_session")).toBe(true);
    await expect(client.cancel("unknown")).resolves.toBeUndefined();
  });
});

describe("candidateFromRun", () => {
  const site = (host: string) => AGENT_SITES.find((item) => item.host === host)!;

  it("takes the recipe page the browser loaded on the site, not the model's URL", () => {
    const view = {
      output: JSON.stringify({ title: "Khao Niao Mamuang" }),
      steps: [
        searchStep("seriouseats.com"),
        { url: PAGES["seriouseats.com"] },
        { url: "https://www.allrecipes.com/recipe/1/other/" },
        // A roundup visited last still loses to the single-recipe page.
        { url: "https://www.seriouseats.com/mango-recipes-5117647" },
      ],
    };
    expect(candidateFromRun(site("seriouseats.com"), view)).toEqual({ url: PAGES["seriouseats.com"], title: "Khao Niao Mamuang" });
  });

  it("falls back to the last other page when none looks like a recipe", () => {
    const view = { output: JSON.stringify({ title: "Mango ideas" }), steps: [{ url: "https://www.seriouseats.com/mango-recipes-5117647" }] };
    expect(candidateFromRun(site("seriouseats.com"), view)?.url).toBe("https://www.seriouseats.com/mango-recipes-5117647");
  });

  it("treats an explicit empty title as 'nothing fits', even after opening a page", () => {
    const view = { output: JSON.stringify({ title: "" }), steps: [{ url: PAGES["allrecipes.com"] }] };
    expect(candidateFromRun(site("allrecipes.com"), view)).toBeNull();
  });

  it("returns nothing when the agent never left the search page, and derives a title when the output is unusable", () => {
    expect(candidateFromRun(site("allrecipes.com"), { output: "{\"title\":\"x\"}", steps: [searchStep("allrecipes.com")] })).toBeNull();
    expect(candidateFromRun(site("bbcgoodfood.com"), { output: "not json", steps: [{ url: PAGES["bbcgoodfood.com"] }] })).toEqual({
      url: PAGES["bbcgoodfood.com"],
      title: "sticky rice mango",
    });
  });
});

describe("buildSitePrompt and describeStep", () => {
  it("asks for one opened recipe and adds only the limits that apply", () => {
    const plain = buildSitePrompt("AllRecipes", OPTS);
    expect(plain).toContain("AllRecipes's search results for \"mango sticky rice\"");
    expect(plain).toContain("stop and return its title");
    expect(plain).not.toContain("limit");
    expect(buildSitePrompt("AllRecipes", { ...OPTS, constraints: ["No oven"], maxTotalMin: 30 })).toMatch(/No oven[\s\S]*30 minutes/);
  });

  it("names known sites and unknown hosts", () => {
    expect(describeStep({ nextGoal: "Open the second result", url: "https://x.com" })).toBe("Open the second result");
    expect(describeStep({ url: "https://www.bbcgoodfood.com/search?q=curry" })).toBe("Searching BBC Good Food…");
    expect(describeStep({ url: "https://www.allrecipes.com/recipe/150313/thai-sweet-sticky-rice/" })).toBe("Reading AllRecipes: thai sweet sticky rice…");
    expect(describeStep({ url: "https://hot-thai-kitchen.com/" })).toBe("Opening hot-thai-kitchen.com…");
    expect(describeStep({ url: "not a url" })).toBe("Browsing…");
  });

  it("ends a long page name with a single ellipsis", () => {
    const text = describeStep({ url: "https://www.allrecipes.com/recipe/150313/thai-sweet-sticky-rice-with-mango-khao-neeo-mamuang-extra-long-slug/" });
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("……");
  });
});
