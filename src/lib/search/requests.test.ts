import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importRecipeLink, SearchClientError, startSearch } from "./client";

const SEARCH_FALLBACK = "Couldn't start the search. Try again.";
const IMPORT_FALLBACK = "Couldn't import that page. Try another link.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

/** Captures the one fetch call a helper makes and returns the mocked response. */
function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

describe("startSearch", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the request and resolves to the searchId", async () => {
    const fetchMock = mockFetch(jsonResponse({ searchId: "abc" }));

    const searchId = await startSearch({
      text: "  butter chicken ",
      constraints: ["Dairy-free"],
      allergies: ["dairy"],
    });

    expect(searchId).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      text: "butter chicken",
      constraints: ["Dairy-free"],
      allergies: ["dairy"],
    });
  });

  it("maps an invalid request to the generic search error without calling the server", async () => {
    const fetchMock = mockFetch(jsonResponse({ searchId: "unused" }));

    const error = await rejection(startSearch({ text: "   ", constraints: [], allergies: [] }));

    expect(error).toBeInstanceOf(SearchClientError);
    expect((error as Error).message).toBe(SEARCH_FALLBACK);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's error message when it sends one", async () => {
    mockFetch(jsonResponse({ error: "Search is busy. Try again in a minute." }, 429));

    const error = await rejection(startSearch({ text: "pasta", constraints: [], allergies: [] }));

    expect(error).toBeInstanceOf(SearchClientError);
    expect((error as Error).message).toBe("Search is busy. Try again in a minute.");
  });

  it("falls back when a failed response has no usable error field", async () => {
    mockFetch(textResponse("<html>bad gateway</html>", 502));

    const error = await rejection(startSearch({ text: "pasta", constraints: [], allergies: [] }));

    expect((error as Error).message).toBe(SEARCH_FALLBACK);
  });

  it("falls back when a 200 response does not carry a searchId", async () => {
    mockFetch(jsonResponse({ id: "wrong-key" }));

    const error = await rejection(startSearch({ text: "pasta", constraints: [], allergies: [] }));

    expect((error as Error).message).toBe(SEARCH_FALLBACK);
  });

  it("falls back when the network request fails", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    const error = await rejection(startSearch({ text: "pasta", constraints: [], allergies: [] }));

    expect(error).toBeInstanceOf(SearchClientError);
    expect((error as Error).message).toBe(SEARCH_FALLBACK);
  });
});

describe("importRecipeLink", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the trimmed url and resolves to the recipe id", async () => {
    const fetchMock = mockFetch(jsonResponse({ sourceRecipeId: "1cd3ee5b", cached: false }));

    const id = await importRecipeLink("  https://example.com/recipe  ");

    expect(id).toBe("1cd3ee5b");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/import");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://example.com/recipe" });
  });

  it("shows the server's message for a rejected link", async () => {
    mockFetch(jsonResponse({ error: "That doesn't look like a web link." }, 400));

    const error = await rejection(importRecipeLink("notaurl"));

    expect(error).toBeInstanceOf(SearchClientError);
    expect((error as Error).message).toBe("That doesn't look like a web link.");
  });

  it("falls back when a failed response is not JSON", async () => {
    mockFetch(textResponse("<html>oops</html>", 500));

    const error = await rejection(importRecipeLink("https://example.com/recipe"));

    expect((error as Error).message).toBe(IMPORT_FALLBACK);
  });

  it("falls back when a 200 response has no sourceRecipeId", async () => {
    mockFetch(jsonResponse({ cached: true }));

    const error = await rejection(importRecipeLink("https://example.com/recipe"));

    expect((error as Error).message).toBe(IMPORT_FALLBACK);
  });

  it("falls back when the network request fails", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    const error = await rejection(importRecipeLink("https://example.com/recipe"));

    expect(error).toBeInstanceOf(SearchClientError);
    expect((error as Error).message).toBe(IMPORT_FALLBACK);
  });
});
