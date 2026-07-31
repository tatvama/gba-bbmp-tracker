"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

    // Supabase Auth's own phone identifier needs an SMS provider (e.g.
    // Twilio) configured project-wide before it'll accept ANY phone sign-in
    // — even this password-only kind with no OTP involved. Rather than take
    // on that dependency, a phone number is resolved to its linked email via
    // profiles (kept in sync by lib/actions/users.ts) and signed in below the
    // same way an email identifier already is.
    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return { error: "Server is misconfigured — contact an admin." };
    }
    const e164Phone = `+91${normalizePhone(identifier)}`;
    const { data: matches } = await admin
      .from("profiles")
      .select("email")
      .eq("phone", e164Phone)
      .limit(2);
    // Exactly one match required — 0 means no account uses this phone, 2+
    // means an admin assigned it to more than one account and the target is
    // ambiguous. Same generic message either way so a login attempt can't be
    // used to probe which phone numbers are registered.
    const match = matches && matches.length === 1 ? matches[0] : undefined;
    if (!match?.email) {
      return { error: "Invalid login credentials" };
    }
    email = match.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
