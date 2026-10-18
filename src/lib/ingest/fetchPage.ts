import "server-only";
import { execFile } from "node:child_process";
import dns from "node:dns/promises";
import { isIP } from "node:net";
import type { FetchedPage } from "./types";
import { isBlockedHost, isBlockedIp } from "./hostGuard";
import { type CurlResponse, parseCurlOutput, WRITE_OUT } from "./curlOutput";

// Server-side fetch of a recipe page. The transport is curl, because Cloudflare blocks Node
// fetch's TLS fingerprint. Every hop re-runs the SSRF guard and pins every address that passed
// it (--resolve), so DNS cannot rebind to a private address. Node fetch is only a fallback for
// when no curl binary exists.

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_BUFFER_BYTES = MAX_BYTES + 1024 * 1024; // body plus headers and the meta trailer
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const EMPTY = new Uint8Array();

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  // Client hints and fetch metadata, as a desktop Chrome sends them.
  "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export type IngestErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "fetch_failed"
  | "timeout"
  | "not_html"
  | "too_large";

/** A failure with a short message that is safe to show the user. */
export class IngestError extends Error {
  code: IngestErrorCode;

  constructor(code: IngestErrorCode, message: string) {
    super(message);
    this.name = "IngestError";
    this.code = code;
  }
}

/** One response from a single hop, with the body already read (empty when it is not needed). */
type Hop = CurlResponse;

/** Fetches a recipe page as text. Throws `IngestError` on any failure. */
export async function fetchPage(url: string): Promise<FetchedPage> {
  const deadline = Date.now() + TIMEOUT_MS;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = parseWebUrl(url);
  let useCurl = true;

  for (let hop = 0; ; hop++) {
    const addresses = await resolvePublicAddresses(current, signal);
    const remainingMs = deadline - Date.now();
    if (remainingMs < 1000) throw timeoutError();

    let result: Hop;
    if (useCurl) {
      try {
        result = await hopWithCurl(current, addresses, remainingMs);
      } catch (err) {
        if (!isMissingBinary(err)) throw err;
        useCurl = false;
        result = await hopWithNode(current, signal);
      }
    } else {
      result = await hopWithNode(current, signal);
    }

    if (REDIRECT_STATUSES.has(result.status) && result.location) {
      if (hop >= MAX_REDIRECTS) throw fetchFailed("That page redirected too many times.");
      let next: URL;
      try {
        next = new URL(result.location, current);
      } catch {
        throw fetchFailed("That page sent a redirect to a broken link.");
      }
      current = parseWebUrl(next.href);
      continue;
    }

    if (!result.status) throw fetchFailed();
    if (result.status < 200 || result.status >= 300) {
      throw fetchFailed(`The site returned an error (HTTP ${result.status}).`);
    }
    if (!isHtml(result.contentType)) {
      throw new IngestError("not_html", "That link doesn't point to a web page.");
    }
    if (result.body.byteLength > MAX_BYTES) throw tooLargeError();

    return { url, finalUrl: current.href, html: decodeBody(result.body, result.contentType) };
  }
}

function parseWebUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new IngestError("invalid_url", "That doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestError("invalid_url", "Only http and https links can be imported.");
  }
  return url;
}

/**
 * The SSRF guard for one hop. Rejects a private host by name, by IP literal, or by any address
 * the name resolves to. Returns every address, all vetted public, so the curl hop can pin them.
 */
async function resolvePublicAddresses(url: URL, signal: AbortSignal): Promise<string[]> {
  const host = url.hostname;
  if (isBlockedHost(host)) throw blockedError();

  const bare = stripBrackets(host);
  if (isIP(bare)) return [bare];

  let addresses: { address: string }[];
  try {
    addresses = await withDeadline(dns.lookup(bare, { all: true }), signal);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw fetchFailed("Couldn't find that site.");
  }
  if (addresses.some(({ address }) => isBlockedIp(address))) throw blockedError();
  if (addresses.length === 0) throw fetchFailed("Couldn't find that site.");
  return addresses.map(({ address }) => address);
}

/** One hop through curl. The vetted addresses are pinned with --resolve. Missing binary errors pass through raw. */
async function hopWithCurl(url: URL, addresses: string[], remainingMs: number): Promise<Hop> {
  const args = [
    // -q must be first: it stops curl from reading a .curlrc that could change the request.
    "-q",
    // No --compressed: with it, Budget Bytes (Cloudflare) answers 403. Identity bodies are capped below.
    "--silent",
    "--show-error",
    "--noproxy",
    "*",
    "--http1.1",
    "--proto",
    "=http,https",
    "--max-redirs",
    "0",
    "--max-time",
    String(Math.floor(remainingMs / 1000)),
    "--max-filesize",
    String(MAX_BYTES),
  ];
  if (!isIP(stripBrackets(url.hostname))) {
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    const pinned = addresses.map((ip) => (ip.includes(":") ? `[${ip}]` : ip)).join(",");
    args.push("--resolve", `${url.hostname}:${port}:${pinned}`);
  }
  for (const [name, value] of Object.entries(HEADERS)) args.push("-H", `${name}: ${value}`);
  args.push("--write-out", WRITE_OUT, "--", url.href);

  let stdout: Buffer;
  try {
    stdout = await runCurl(curlBinary(), args, remainingMs + 1000);
  } catch (err) {
    if (isMissingBinary(err)) throw err;
    throw curlFailure(err);
  }
  const parsed = parseCurlOutput(stdout);
  if (!parsed) throw fetchFailed();
  return parsed;
}

/**
 * One hop through Node fetch. Used only when no curl binary is available.
 * NOTE: no IP pinning here, so DNS rebinding is not closed on this path. It only runs when curl is missing.
 */
async function hopWithNode(url: URL, signal: AbortSignal): Promise<Hop> {
  const res = await request(url, signal);
  const location = res.headers.get("location") ?? undefined;
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const isRedirect = REDIRECT_STATUSES.has(res.status) && !!location;
  if (isRedirect || !res.ok || !isHtml(contentType)) {
    await res.body?.cancel().catch(() => undefined);
    return { status: res.status, location, contentType, body: EMPTY };
  }
  return { status: res.status, location, contentType, body: await readBody(res, signal) };
}

function runCurl(bin: string, args: string[], timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { encoding: "buffer", maxBuffer: MAX_BUFFER_BYTES, timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

function curlBinary(): string {
  const configured = process.env.CURL_PATH?.trim();
  if (configured) return configured;
  return process.platform === "win32" ? "curl.exe" : "curl";
}

function curlFailure(err: unknown): IngestError {
  const e = err as { code?: unknown; killed?: boolean };
  if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" || e.code === 63) return tooLargeError();
  if (e.killed || e.code === 28) return timeoutError();
  return fetchFailed();
}

function isMissingBinary(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

async function request(url: URL, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { redirect: "manual", signal, headers: HEADERS });
  } catch {
    throw signal.aborted ? timeoutError() : fetchFailed("Couldn't load that page.");
  }
}

/** Streams the body and stops at MAX_BYTES. */
async function readBody(res: Response, signal: AbortSignal): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw tooLargeError();
  }

  const reader = res.body?.getReader();
  if (!reader) return EMPTY;

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw tooLargeError();
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw signal.aborted ? timeoutError() : fetchFailed("Couldn't finish loading that page.");
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const charset = /charset="?([^";\s]+)/.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function isHtml(contentType: string): boolean {
  return /^(text\/html|application\/xhtml\+xml)\b/.test(contentType);
}

function stripBrackets(host: string): string {
  return host.replace(/^\[(.*)\]$/, "$1");
}

/** Runs a promise that ignores the signal (DNS) and rejects as soon as the deadline passes. */
function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(timeoutError());
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function blockedError(): IngestError {
  return new IngestError("blocked_url", "That link points to a private network address, so it can't be opened.");
}

function timeoutError(): IngestError {
  return new IngestError("timeout", "That page took too long to load. Try again or paste a different link.");
}

function tooLargeError(): IngestError {
  return new IngestError("too_large", "That page is too large to read.");
}

function fetchFailed(message = "Couldn't load that page."): IngestError {
  return new IngestError("fetch_failed", message);
}
