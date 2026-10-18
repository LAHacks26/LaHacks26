import { describe, expect, it } from "vitest";
import { META_MARK, parseCurlOutput } from "./curlOutput";

describe("parseCurlOutput", () => {
  it("splits the body from the status, content type and redirect trailer", () => {
    const out = Buffer.from(`<html>hi</html>${META_MARK}200\ttext/html; charset=utf-8\t`);
    const parsed = parseCurlOutput(out);
    expect(parsed?.status).toBe(200);
    expect(parsed?.contentType).toBe("text/html; charset=utf-8");
    expect(parsed?.location).toBeUndefined();
    expect(Buffer.from(parsed!.body).toString()).toBe("<html>hi</html>");
  });

  it("reads a redirect location from the trailer", () => {
    const out = Buffer.from(`${META_MARK}301\ttext/html\thttps://example.com/next`);
    expect(parseCurlOutput(out)?.location).toBe("https://example.com/next");
  });

  it("ignores a fake trailer inside the body", () => {
    const body = `<p>old</p>${META_MARK}301\ttext/plain\thttps://evil.example/\n<html>`;
    const out = Buffer.from(`${body}${META_MARK}200\ttext/html\t`);
    const parsed = parseCurlOutput(out);
    expect(parsed?.status).toBe(200);
    expect(parsed?.location).toBeUndefined();
    expect(parsed?.contentType).toBe("text/html");
    expect(Buffer.from(parsed!.body).toString()).toBe(body);
  });

  it("returns null when there is no trailer", () => {
    expect(parseCurlOutput(Buffer.from("<html>cut off"))).toBeNull();
  });
});
