import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_SITES, BrowserUseCloudClient, buildSitePrompt, candidateFromRun, describeStep } from "./browserUse";

vi.mock("server-only", () => ({}));

// Response shapes follow real v2 runs for "mango sticky rice" (2026-10-18).
const OPTS = { dishQuery: "mango sticky rice", constraints: [], maxSteps: 25 };
/** The page each agent opens, by site order: AllRecipes, BBC Good Food, Serious Eats, then the web agent's blog. */
const PAGE = [
  "https://www.allrecipes.com/recipe/150313/thai-sweet-sticky-rice-with-mango-khao-neeo-mamuang/",
  "https://www.bbcgoodfood.com/recipes/sticky-rice-mango",
  "https://www.seriouseats.com/thai-coconut-sticky-rice-mango-recipe",
  "https://www.hungryhuy.com/mango-sticky-rice/",
];
const WEB = AGENT_SITES.findIndex((site) => site.host === null);
const ALL_SITES = "Sending agents to AllRecipes, BBC Good Food, Serious Eats and the web…";

type Call = { method: string; url: string; headers: Record<string, string>; body?: Record<string, unknown> };
type Reply = { status?: number; json: unknown };

/** A fake v2 API. Tasks are numbered by site order: task-0 is AllRecipes … task-3 the web agent. */
function fakeApi(route: (call: Call) => Reply | undefined, now: () => number = () => 0) {
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
  return { calls, client: new BrowserUseCloudClient("bu_test_key", fetchImpl as unknown as typeof fetch, now) };
}

/** The search page an agent starts on. */
function searchStep(index: number) {
  return { nextGoal: "", url: AGENT_SITES[index]!.searchUrl("mango sticky rice") };
}

/** The search page, then (when `opened`) the agent's recipe page. */
function steps(index: number, opened: boolean) {
  return opened ? [searchStep(index), { nextGoal: "", url: PAGE[index]! }] : [searchStep(index)];
}

function taskView(index: number, status: string, taskSteps: { nextGoal: string; url: string }[], title = "Mango sticky rice") {
  return { json: { id: `task-${index}`, status, steps: taskSteps, output: status === "finished" ? JSON.stringify({ title }) : null } };
}

/** Routes GET /tasks/task-N to `view(N)`. */
function tasks(view: (index: number) => Reply) {
  return (call: Call) => {
    const match = /\/tasks\/task-(\d)$/.exec(call.url);
    return match && call.method === "GET" ? view(Number(match[1])) : undefined;
  };
}

const stoppedTasks = (calls: Call[]) =>
  calls.filter((call) => call.method === "PATCH" && call.url.includes("/tasks/")).map((call) => call.url.split("/").at(-1));

afterEach(() => {
  vi.useRealTimers();
});

describe("BrowserUseCloudClient.start", () => {
  it("starts one flash-mode agent per site, plus one on the open web", async () => {
    const { calls, client } = fakeApi(() => undefined);

    const started = await client.start("single-agent prompt", { ...OPTS, constraints: ["Vegan"], maxTotalMin: 40 });

    const creates = calls.filter((call) => call.method === "POST");
    expect(creates.map((call) => call.body?.startUrl)).toEqual([
      "https://www.allrecipes.com/search?q=mango%20sticky%20rice",
      "https://www.bbcgoodfood.com/search?q=mango%20sticky%20rice",
      "https://www.seriouseats.com/search?q=mango%20sticky%20rice",
      "https://duckduckgo.com/?q=mango%20sticky%20rice%20recipe",
    ]);
    for (const create of creates) {
      expect(create.url).toBe("https://api.browser-use.com/api/v2/tasks");
      expect(create.headers["X-Browser-Use-API-Key"]).toBe("bu_test_key");
      expect(create.body).toMatchObject({ llm: "browser-use-2.0", maxSteps: 5, flashMode: true });
      expect(create.body?.task).toContain("Vegan");
      expect(create.body?.task).toContain("40 minutes");
      expect(JSON.parse(create.body?.structuredOutput as string).required).toEqual(["title"]);
    }
    expect(creates[WEB]!.body?.task).toContain("web search results");
    // The page frames the first site's browser, read-only.
    expect(calls.find((call) => call.url.includes("/sessions/"))!.url).toBe("https://api.browser-use.com/api/v2/sessions/sess-0");
    expect(new URL(started.liveUrl!).searchParams.get("readOnly")).toBe("true");
    expect((await client.poll(started.taskId)).steps).toEqual([ALL_SITES]);
  });

  it("goes ahead with the agents that started, and fails only when none did", async () => {
    let posts = 0;
    const partial = fakeApi((call) => (call.method === "POST" && posts++ === 1 ? { status: 429, json: { detail: "busy" } } : undefined));
    const started = await partial.client.start("p", OPTS);
    expect((await partial.client.poll(started.taskId)).steps[0]).toBe("Sending agents to AllRecipes, Serious Eats and the web…");

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
    const { client } = fakeApi(tasks((index) => taskView(index, "started", steps(index, round === 1 && index === 0))));
    const { taskId } = await client.start("p", OPTS);

    const first = await client.poll(taskId);
    round = 1;
    const second = await client.poll(taskId);

    expect(first.status).toBe("running");
    expect(second.steps.slice(0, first.steps.length)).toEqual(first.steps);
    expect(second.steps).toEqual([
      ALL_SITES,
      "Searching AllRecipes…",
      "Searching BBC Good Food…",
      "Searching Serious Eats…",
      "Searching the web…",
      "Reading AllRecipes: thai sweet sticky rice with mango khao neeo…",
    ]);
  });

  it("finishes with the pages the browsers actually loaded, and stops every session", async () => {
    // Serious Eats found nothing: it never left the search page.
    const { calls, client } = fakeApi(
      tasks((index) => (index === 2 ? taskView(index, "finished", steps(index, false), "") : taskView(index, "finished", steps(index, true), `Title ${index}`))),
    );
    const { taskId } = await client.start("p", OPTS);

    const result = await client.poll(taskId);

    expect(result.status).toBe("finished");
    expect(result.candidates).toEqual([
      { url: PAGE[0], title: "Title 0" },
      { url: PAGE[1], title: "Title 1" },
      { url: PAGE[WEB], title: `Title ${WEB}` },
    ]);
    const stopped = calls.filter((call) => call.method === "PATCH").map((call) => call.url.split("/").at(-1));
    expect(stopped.sort()).toEqual(["sess-0", "sess-1", "sess-2", "sess-3"]);
    await expect(client.poll(taskId)).rejects.toThrow("Unknown Browser Use run");
  });

  it("keeps the live-view browser running until the other agents finish", async () => {
    const { calls, client } = fakeApi(tasks((index) => taskView(index, index === 0 ? "finished" : "started", steps(index, false))));
    const { taskId } = await client.start("p", OPTS);
    await client.poll(taskId);
    expect(calls.some((call) => call.method === "PATCH" && call.url.endsWith("/sess-0"))).toBe(false);
  });

  it("gives up on an agent whose status can't be read three times in a row", async () => {
    const { client } = fakeApi((call) => {
      if (call.method !== "GET" || !call.url.includes("/tasks/")) return undefined;
      const index = Number(call.url.at(-1));
      return index === 1 ? { status: 503, json: {} } : taskView(index, "finished", steps(index, index === 0));
    });
    const { taskId } = await client.start("p", OPTS);
    expect((await client.poll(taskId)).status).toBe("running");
    expect((await client.poll(taskId)).status).toBe("running");
    const result = await client.poll(taskId);
    expect(result.status).toBe("finished");
    expect(result.candidates).toEqual([{ url: PAGE[0], title: "Mango sticky rice" }]);
  });

  it("treats failed and stopped agents as finding nothing", async () => {
    const { client } = fakeApi(tasks((index) => taskView(index, index === 0 ? "failed" : "stopped", steps(index, true))));
    const { taskId } = await client.start("p", OPTS);
    expect(await client.poll(taskId)).toMatchObject({ status: "finished", candidates: [] });
  });
});

describe("BrowserUseCloudClient.poll: not waiting on slow agents", () => {
  it("stops waiting once three recipes are in, and stops the slow agent", async () => {
    // Seen live: an agent hung for 151 s without a step while the others had finished.
    const { calls, client } = fakeApi(tasks((index) => (index === 2 ? taskView(index, "started", []) : taskView(index, "finished", steps(index, true)))));
    const { taskId } = await client.start("p", OPTS);

    const result = await client.poll(taskId);

    expect(result.status).toBe("finished");
    expect(result.candidates?.map((candidate) => candidate.url)).toEqual([PAGE[0], PAGE[1], PAGE[WEB]]);
    expect(stoppedTasks(calls)).toEqual(["task-2"]);
    expect(result.steps).not.toContain("Wrapping up with the recipes found so far…");
  });

  it("after the soft deadline, finishes with what was found plus pages stalled agents had opened", async () => {
    let now = 0;
    const { calls, client } = fakeApi(
      tasks((index) => {
        if (index === 0) return taskView(index, "finished", steps(index, true));
        // BBC opened its recipe but never reported back; the others are stuck on their search pages.
        return taskView(index, "started", steps(index, index === 1));
      }),
      () => now,
    );
    const { taskId } = await client.start("p", OPTS);

    now = 30_000;
    expect((await client.poll(taskId)).status).toBe("running");
    now = 46_000;
    const result = await client.poll(taskId);

    expect(result.status).toBe("finished");
    expect(result.candidates?.map((candidate) => candidate.url)).toEqual([PAGE[0], PAGE[1]]);
    expect(result.steps.at(-1)).toBe("Wrapping up with the recipes found so far…");
    expect(stoppedTasks(calls).sort()).toEqual(["task-1", "task-2", "task-3"]);
  });

  it("doesn't count a stalled agent's category page as a find", async () => {
    let now = 0;
    const category = "https://www.allrecipes.com/recipes/233/world-cuisine/asian/";
    const { client } = fakeApi(
      tasks((index) => taskView(index, "started", index === 0 ? [searchStep(0), { nextGoal: "", url: category }] : steps(index, false))),
      () => now,
    );
    const { taskId } = await client.start("p", OPTS);
    now = 50_000;
    // Past the soft deadline, but nothing real is in yet, so the other agents keep their chance.
    expect((await client.poll(taskId)).status).toBe("running");
  });

  it("counts the same page found by two agents once", async () => {
    // The web agent landed on the AllRecipes agent's page; with Serious Eats still running, that's 2 recipes, not 3.
    const { calls, client } = fakeApi(
      tasks((index) => {
        if (index === 2) return taskView(index, "started", steps(index, false));
        if (index === WEB) return taskView(index, "finished", [searchStep(WEB), { nextGoal: "", url: PAGE[0]! }]);
        return taskView(index, "finished", steps(index, true));
      }),
    );
    const { taskId } = await client.start("p", OPTS);
    expect((await client.poll(taskId)).status).toBe("running");
    expect(stoppedTasks(calls)).toEqual([]);
  });

  it("uses a stalled agent's recipe page at the hard deadline", async () => {
    let now = 0;
    const { client } = fakeApi(tasks((index) => taskView(index, "started", steps(index, index === WEB))), () => now);
    const { taskId } = await client.start("p", OPTS);
    now = 76_000;
    const result = await client.poll(taskId);
    expect(result.status).toBe("finished");
    expect(result.candidates?.map((candidate) => candidate.url)).toEqual([PAGE[WEB]]);
  });

  it("keeps waiting past the soft deadline while nothing is found, then gives up at the hard deadline", async () => {
    let now = 0;
    const { client } = fakeApi(tasks((index) => taskView(index, "started", steps(index, false))), () => now);
    const { taskId } = await client.start("p", OPTS);

    now = 60_000;
    expect((await client.poll(taskId)).status).toBe("running");
    now = 76_000;
    expect(await client.poll(taskId)).toMatchObject({ status: "finished", candidates: [] });
  });
});

describe("BrowserUseCloudClient.cancel", () => {
  it("stops every agent with its session, and ignores unknown runs", async () => {
    const { calls, client } = fakeApi(() => undefined);
    const { taskId } = await client.start("p", OPTS);
    await client.cancel(taskId);
    const stops = calls.filter((call) => call.method === "PATCH");
    expect(stops.map((call) => call.url.split("/").at(-1))).toEqual(["task-0", "task-1", "task-2", "task-3"]);
    expect(stops.every((call) => call.body?.action === "stop_task_and_session")).toBe(true);
    await expect(client.cancel("unknown")).resolves.toBeUndefined();
  });
});

describe("candidateFromRun", () => {
  const site = (host: string | null) => AGENT_SITES.find((item) => item.host === host)!;

  it("takes the recipe page the browser loaded on the site, not the model's URL", () => {
    const view = {
      output: JSON.stringify({ title: "Khao Niao Mamuang" }),
      steps: [
        searchStep(2),
        { url: PAGE[2] },
        { url: "https://www.allrecipes.com/recipe/1/other/" },
        // A roundup visited last still loses to the single-recipe page.
        { url: "https://www.seriouseats.com/mango-recipes-5117647" },
      ],
    };
    expect(candidateFromRun(site("seriouseats.com"), view)).toEqual({ url: PAGE[2], title: "Khao Niao Mamuang" });
  });

  it("falls back to the last other page when none looks like a recipe", () => {
    const view = { output: JSON.stringify({ title: "Mango ideas" }), steps: [{ url: "https://www.seriouseats.com/mango-recipes-5117647" }] };
    expect(candidateFromRun(site("seriouseats.com"), view)?.url).toBe("https://www.seriouseats.com/mango-recipes-5117647");
  });

  it("treats an explicit empty title as 'nothing fits', even after opening a page", () => {
    const view = { output: JSON.stringify({ title: "" }), steps: [{ url: PAGE[0] }] };
    expect(candidateFromRun(site("allrecipes.com"), view)).toBeNull();
  });

  it("returns nothing when the agent never left the search page, and derives a title when the output is unusable", () => {
    expect(candidateFromRun(site("allrecipes.com"), { output: "{\"title\":\"x\"}", steps: [searchStep(0)] })).toBeNull();
    expect(candidateFromRun(site("bbcgoodfood.com"), { output: "not json", steps: [{ url: PAGE[1] }] })).toEqual({
      url: PAGE[1],
      title: "sticky rice mango",
    });
  });

  it("lets the web agent pick any recipe site, but not a search engine, video or social page", () => {
    const blog = "https://hot-thai-kitchen.com/kao-soi/";
    const view = (urls: string[]) => ({ output: JSON.stringify({ title: "Khao Soi" }), steps: urls.map((url) => ({ url })) });
    expect(candidateFromRun(site(null), view(["https://duckduckgo.com/?q=khao+soi+recipe", "https://www.youtube.com/watch?v=x", blog]))).toEqual({ url: blog, title: "Khao Soi" });
    expect(candidateFromRun(site(null), view(["https://duckduckgo.com/?q=khao+soi+recipe", "https://www.pinterest.com/pin/1/"]))).toBeNull();
    for (const other of ["https://search.yahoo.com/search?p=x", "https://m.youtube.com/watch?v=x", "https://www.google.co.uk/url?q=x", "https://x.com/someone/status/1"]) {
      expect(candidateFromRun(site(null), view([other]))).toBeNull();
    }
  });

  it("for a still-running agent, counts only pages shaped like a single recipe", () => {
    const view = (url: string) => ({ output: null, steps: [{ url }] });
    expect(candidateFromRun(site("allrecipes.com"), view("https://www.allrecipes.com/recipes/233/world-cuisine/asian/"), true)).toBeNull();
    expect(candidateFromRun(site("allrecipes.com"), view(PAGE[0]!), true)?.url).toBe(PAGE[0]);
    expect(candidateFromRun(site(null), view("https://hot-thai-kitchen.com/category/thai/"), true)).toBeNull();
    expect(candidateFromRun(site(null), view("https://hot-thai-kitchen.com/kao-soi/"), true)?.url).toBe("https://hot-thai-kitchen.com/kao-soi/");
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

  it("points the web agent at search results and away from videos and roundups", () => {
    const web = buildSitePrompt(null, OPTS);
    expect(web).toContain("web search results for \"mango sticky rice recipe\"");
    expect(web).toMatch(/Not a video, a list or roundup, Pinterest/);
    expect(web).toContain("stop and return its title");
  });

  it("names known sites and unknown hosts", () => {
    expect(describeStep({ nextGoal: "Open the second result", url: "https://x.com" })).toBe("Open the second result");
    expect(describeStep({ url: "https://www.bbcgoodfood.com/search?q=curry" })).toBe("Searching BBC Good Food…");
    expect(describeStep({ url: "https://duckduckgo.com/?q=khao+soi+recipe" })).toBe("Searching the web…");
    expect(describeStep({ url: "https://www.allrecipes.com/recipe/150313/thai-sweet-sticky-rice/" })).toBe("Reading AllRecipes: thai sweet sticky rice…");
    expect(describeStep({ url: "https://hot-thai-kitchen.com/" })).toBe("Opening hot-thai-kitchen.com…");
    // A slug containing "search" is a page, not a search.
    expect(describeStep({ url: "https://example.com/research-kitchen-pancakes/" })).toBe("Reading example.com: research kitchen pancakes…");
    expect(describeStep({ url: "not a url" })).toBe("Browsing…");
  });

  it("ends a long page name with a single ellipsis", () => {
    const text = describeStep({ url: "https://www.allrecipes.com/recipe/150313/thai-sweet-sticky-rice-with-mango-khao-neeo-mamuang-extra-long-slug/" });
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("……");
  });
});
