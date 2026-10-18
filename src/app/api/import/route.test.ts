import { beforeEach, describe, expect, it, vi } from "vitest";
import { importRecipe } from "@/lib/ingest/importRecipe";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/ingest/importRecipe", () => ({ importRecipe: vi.fn() }));

const importMock = vi.mocked(importRecipe);

function post(url: string) {
  return POST(new Request("http://localhost:3000/api/import", { method: "POST", body: JSON.stringify({ url }), headers: { "x-real-ip": `test-${Math.random()}` } }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/import", () => {
  it("returns the imported recipe id", async () => {
    importMock.mockResolvedValue({ sourceRecipeId: "r1", cached: false } as never);
    const response = await post("https://www.allrecipes.com/recipe/1/x/");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sourceRecipeId: "r1", cached: false });
  });

  it("says the database is unreachable instead of blaming the link, and logs only the code", async () => {
    // Drizzle wraps the driver error; this mirrors a hotspot drop seen on 2026-10-18.
    const driverError = Object.assign(new Error("getaddrinfo ENOTFOUND db-host.example"), { code: "ENOTFOUND" });
    importMock.mockRejectedValue(new Error("Failed query: select ... from source_recipes", { cause: driverError }));

    const response = await post("https://www.seriouseats.com/x");

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("Saffron can't reach its recipe database right now. Check your connection and try again.");
    expect(console.error).toHaveBeenCalledWith("[import] database unavailable", "ENOTFOUND");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("db-host.example");
  });

  it("keeps the generic message for other unexpected failures", async () => {
    importMock.mockRejectedValue(new Error("boom"));
    const response = await post("https://www.seriouseats.com/x");
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Couldn't import that page. Try another link.");
  });
});
