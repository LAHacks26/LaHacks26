import { describe, expect, it, vi } from "vitest";
import type { SearchEvent } from "@/lib/search/types";
import { subscribe } from "@/lib/search/runSearch";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search/runSearch", () => ({ subscribe: vi.fn() }));

const call = (searchId: string) =>
  GET(new Request(`http://localhost/api/search/${searchId}/stream`), {
    params: Promise.resolve({ searchId }),
  });

describe("GET /api/search/[searchId]/stream", () => {
  it("sends a single not_found error for an unknown search and closes", async () => {
    vi.mocked(subscribe).mockReturnValueOnce(null);

    const res = await call("missing");
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    const body = await res.text();
    expect(body.startsWith("event: error\ndata: ")).toBe(true);
    expect(body.match(/event: /g)).toHaveLength(1);
    expect(body).toContain('"code":"not_found"');
  });

  it("replays a finished run in order and closes after done", async () => {
    const replay: SearchEvent[] = [
      { type: "meta", query: "pasta", constraints: [] },
      { type: "agent_step", text: "Opening Allrecipes…" },
      { type: "done" },
    ];
    vi.mocked(subscribe).mockReturnValueOnce({ replay, unsubscribe: vi.fn() });

    const body = await (await call("finished")).text();
    expect(body.match(/^event: \w+$/gm)).toEqual(["event: meta", "event: agent_step", "event: done"]);
    expect(body.endsWith("\n\n")).toBe(true);
  });
});
