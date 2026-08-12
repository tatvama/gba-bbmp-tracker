"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/session";
import { verifyCredentials, recordSignIn, findEmailByPhone } from "@/lib/db/auth";
import { isValidIndianMobile, normalizePhone } from "@/lib/phone";

const credsSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or phone number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export interface AuthActionState {
  error?: string;
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credsSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // No mode switch in the UI — "@" is what tells an email apart from a phone
  // number here, the same way Instagram's single identifier field works.
  const { identifier, password } = parsed.data;
  const isEmail = identifier.includes("@");

  let email = identifier;

  if (isEmail) {
    if (!z.string().email().safeParse(identifier).success) {
      return { error: "Enter a valid email or phone number" };
    }
  } else {
    if (!isValidIndianMobile(identifier)) {
      return { error: "Enter a valid email or phone number" };
    }

    // A phone number is resolved to its linked email via profiles (kept in sync
    // by lib/actions/users.ts) and then signed in exactly as an email would be.
    // This indirection predates the move off Supabase — it existed because
    // Supabase's own phone identifier required an SMS provider — and is kept
    // because profiles.phone remains the only place a phone is recorded.
    const e164Phone = `+91${normalizePhone(identifier)}`;
    const resolved = await findEmailByPhone(e164Phone);
    // Same generic message whether the number is unknown or assigned twice, so
    // a login attempt cannot be used to probe which numbers are registered.
    if (!resolved) return { error: "Invalid login credentials" };
    email = resolved;
  }

  const { user, banned } = await verifyCredentials(email, password);
  if (banned) return { error: "This account is suspended. Contact an admin." };
  if (!user) return { error: "Invalid login credentials" };

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    await signSessionToken(user.id),
    sessionCookieOptions(),
  );
  await recordSignIn(user.id);

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  revalidatePath("/", "layout");
  redirect("/login");
}
