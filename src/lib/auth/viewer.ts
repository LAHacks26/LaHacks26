import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getDb } from "../db/client";
import { users } from "../db/schema";

// The production prefix also prevents sibling subdomains from planting a Domain cookie
// with a known bearer. Never accept the development name as a production fallback.
export function viewerCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-saffron_uid" : "saffron_uid";
}
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type Viewer = { id: string; allergies: string[] };
export type ViewerIdentity = { viewer: Viewer; newToken?: string };

/** The database stores a one-way digest, never the anonymous bearer credential. */
export function anonymousSubject(token: string): string {
  return `anon:${createHash("sha256").update(token.toLowerCase()).digest("hex")}`;
}

/** Read-only, including in Server Components. Unknown cookies never create or adopt an identity. */
export async function getViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(viewerCookieName())?.value;
  if (!token || !UUID_V4.test(token)) return null;
  const [viewer] = await getDb().select({ id: users.id, allergies: users.allergies })
    .from(users).where(eq(users.googleSub, anonymousSubject(token))).limit(1);
  return viewer ?? null;
}

/** Call only after origin and input validation in a mutation route. */
export async function getOrCreateViewer(): Promise<ViewerIdentity> {
  const existing = await getViewer();
  if (existing) return { viewer: existing };
  // Never register a supplied, unknown bearer: that would let its sender fix another device's identity.
  const newToken = randomUUID();
  const [viewer] = await getDb().insert(users).values({ googleSub: anonymousSubject(newToken) })
    .returning({ id: users.id, allergies: users.allergies });
  if (!viewer) throw new Error("Could not create viewer");
  return { viewer, newToken };
}

export function attachViewerCookie(response: NextResponse, identity: ViewerIdentity): NextResponse {
  if (identity.newToken) {
    response.cookies.set(viewerCookieName(), identity.newToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      // Deliberately host-only (no Domain). Cookie loss means anonymous saves cannot be recovered.
    });
  }
  return response;
}
