import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { findUserWithProfile } from "@/lib/db/auth";
import type { Profile } from "@/lib/types";
import type { UserRole } from "@/lib/constants";

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile | null;
  role: UserRole;
}

/**
 * Returns the signed-in user with their profile + role, or null.
 * Role falls back to VIEWER if no profile row exists yet.
 *
 * Wrapped in React's `cache()` so repeated calls within the same request
 * (e.g. the root layout + a page + several nested components all checking
 * the session) share one token verification + profile round trip instead of
 * repeating it per call. Same inputs (none) -> same output within a request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!payload) return null;

  // The token proves WHO is asking; it deliberately carries no role. Roles are
  // read from the database on every request so revoking or downgrading someone
  // takes effect immediately rather than whenever their cookie happens to
  // expire.
  const record = await findUserWithProfile(payload.uid);
  if (!record) return null;

  const profile = (record.profile as Profile | null) ?? null;

  return {
    id: record.id,
    email: record.email ?? null,
    profile,
    role: profile?.role ?? "VIEWER",
  };
});

export function hasRole(user: SessionUser | null, allowed: UserRole[]): boolean {
  return !!user && allowed.includes(user.role);
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Guard for Server Actions: returns the user if their role is allowed,
 * otherwise throws AuthorizationError. Enforces authorization on the SERVER,
 * not just in the UI (spec §5/§6).
 */
export async function requireRole(allowed: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("You must be signed in.");
  if (!allowed.includes(user.role)) {
    throw new AuthorizationError(
      `Your role (${user.role}) cannot perform this action.`,
    );
  }
  return user;
}
