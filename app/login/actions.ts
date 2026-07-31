"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

  if (isEmail) {
    if (!z.string().email().safeParse(identifier).success) {
      return { error: "Enter a valid email or phone number" };
    }
  } else if (!isValidIndianMobile(identifier)) {
    return { error: "Enter a valid email or phone number" };
  }

  const supabase = await createClient();
  // Same password-based signInWithPassword either way — phone is just an
  // alternate identifier on the same auth.users row, not an OTP/SMS flow.
  const { error } = isEmail
    ? await supabase.auth.signInWithPassword({ email: identifier, password })
    : await supabase.auth.signInWithPassword({ phone: `+91${normalizePhone(identifier)}`, password });
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
