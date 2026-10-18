import { isIP } from "node:net";

// Pure SSRF host checks. No "server-only" here so vitest can import it.

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost"];

/** True when a hostname (or IP literal) must not be fetched by the server. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
  if (!host) return true;
  if (host === "localhost" || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // Names are checked again after DNS lookup; only IP literals can be decided here.
  if (isIP(host)) return isBlockedIp(host);
  return false;
}

/** True when a resolved IP address is private, loopback, link-local or reserved. Fails closed on non-IPs. */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true;
}

function isBlockedV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT 100.64.0.0/10
    (a === 169 && b === 254) || // link-local and cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments 192.0.0.0/24, TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18.0.0/15
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2 198.51.100.0/24
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3 203.0.113.0/24
    a >= 224 // multicast, reserved and broadcast
  );
}

/** Expands an IPv6 address into eight 16-bit groups. Returns undefined when it cannot be parsed. */
function ipv6Groups(ip: string): number[] | undefined {
  let s = ip.toLowerCase();
  const embedded = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (embedded) {
    const [a, b, c, d] = embedded.slice(1).map(Number);
    s = `${s.slice(0, embedded.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const parts =
    halves.length === 2
      ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail]
      : head;
  if (parts.length !== 8) return undefined;
  return parts.map((part) => parseInt(part, 16));
}

function isBlockedV6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const v4Tail = (): string => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  const zeroPrefix = (count: number) => g.slice(0, count).every((x) => x === 0);

  if (zeroPrefix(8)) return true; // ::
  if (zeroPrefix(6)) return true; // ::/96 (deprecated IPv4-compatible) and ::1
  if (zeroPrefix(5) && g[5] === 0xffff) return isBlockedV4(v4Tail()); // ::ffff:0:0/96 mapped IPv4
  if (g[0] === 0x64 && g[1] === 0xff9b) return isBlockedV4(v4Tail()); // NAT64 64:ff9b::/96
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (g[0] === 0x2002) return true; // 6to4 2002::/16, can embed a private IPv4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo 2001:0::/32, can embed a private IPv4
  return false;
}
