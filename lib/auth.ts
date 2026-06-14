import { createClient } from "@/lib/supabase/server";
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
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    profile: (profile as Profile) ?? null,
    role: (profile as Profile | null)?.role ?? "VIEWER",
  };
}

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
