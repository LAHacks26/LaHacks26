// Pure parsing of curl's stdout for the page fetcher. No "server-only" here so tests can import it.

/** Written after the response body by --write-out. The body itself is never trusted to contain it. */
export const META_MARK = "\n<<saffron-curl-meta>>";

/** --write-out format: the body, then the marker, status, content type and redirect URL, tab separated. */
export const WRITE_OUT = `${META_MARK}%{http_code}\t%{content_type}\t%{redirect_url}`;

export type CurlResponse = {
  status: number;
  location?: string;
  contentType: string;
  body: Uint8Array;
};

/**
 * Splits curl's stdout into the body and the trailer. The last marker wins, so a page that
 * contains the marker text cannot fake a status. Returns null when there is no trailer.
 */
export function parseCurlOutput(out: Buffer): CurlResponse | null {
  const at = out.lastIndexOf(META_MARK);
  if (at < 0) return null;
  const [status, contentType = "", redirect = ""] = out
    .subarray(at + META_MARK.length)
    .toString("utf8")
    .trim()
    .split("\t");
  return {
    status: Number(status) || 0,
    location: redirect || undefined,
    contentType: contentType.toLowerCase(),
    body: out.subarray(0, at),
  };
}
