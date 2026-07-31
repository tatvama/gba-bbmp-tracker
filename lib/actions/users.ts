"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_ROLES } from "@/lib/constants";
import { isValidIndianMobile, normalizePhone } from "@/lib/phone";
import type { ActionState } from "@/lib/actions/contacts";

const createUserSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().optional(),
  role: z.enum(USER_ROLES),
  // Optional: when set, this user can also sign in by phone (see app/login).
  // A 10-digit Indian mobile only — the same shape lib/phone.ts already
  // validates contact numbers against everywhere else in the app.
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidIndianMobile(v), "Phone must be a valid 10-digit mobile number"),
});

export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Admins only" };
  }

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    role: formData.get("role"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — cannot create users." };
  }

  // E.164 for Supabase Auth's phone identifier — same +91 assumption
  // lib/phone.ts's telLink/waLink already make for a contact number.
  const e164Phone = parsed.data.phone ? `+91${normalizePhone(parsed.data.phone)}` : null;

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    // phone_confirm bypasses the SMS-verification step admin-created accounts
    // have no need for — see app/login for how this becomes a sign-in option.
    ...(e164Phone ? { phone: e164Phone, phone_confirm: true } : {}),
    user_metadata: { name: parsed.data.name ?? "", role: parsed.data.role },
  });
  if (error) {
    // Supabase rejects a phone identifier outright when the project's Phone
    // auth provider isn't enabled (Dashboard → Authentication → Providers) —
    // surface that as an actionable message rather than a raw API error.
    if (e164Phone && /phone/i.test(error.message)) {
      return { error: `${error.message} — enable the Phone provider in Supabase Dashboard → Authentication → Providers to allow phone sign-in.` };
    }
    return { error: error.message };
  }

  // Ensure the profile reflects the chosen role (trigger sets it on insert).
  if (data.user) {
    await admin.from("profiles").upsert(
      { id: data.user.id, email: parsed.data.email, name: parsed.data.name ?? "", role: parsed.data.role, phone: e164Phone },
      { onConflict: "id" },
    );
  }
  return { success: true };
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  phone: string | null;
}

/** For the Settings page's "Existing users" list — admin-only, so an ADMIN can
 *  add phone sign-in to an account created before this feature existed. */
export async function listUsers(): Promise<{ users?: AdminUserRow[]; error?: string }> {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Admins only" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const { data, error } = await admin.from("profiles").select("id, email, name, role, phone").order("email");
  if (error) return { error: error.message };
  return { users: (data as AdminUserRow[] | null) ?? [] };
}

const updatePhoneSchema = z.object({
  phone: z.string().trim().refine(isValidIndianMobile, "Enter a valid 10-digit mobile number"),
});

/** Adds/updates the phone sign-in identifier on an EXISTING account — the
 *  Create User form (createUser above) only ever sets this at creation time,
 *  so this is the only way to add phone sign-in to a user created earlier. */
export async function updateUserPhone(
  userId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Admins only" };
  }

  const parsed = updatePhoneSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const e164Phone = `+91${normalizePhone(parsed.data.phone)}`;
  const { error } = await admin.auth.admin.updateUserById(userId, { phone: e164Phone, phone_confirm: true });
  if (error) {
    if (/phone/i.test(error.message)) {
      return { error: `${error.message} — enable the Phone provider in Supabase Dashboard → Authentication → Providers to allow phone sign-in.` };
    }
    return { error: error.message };
  }

  await admin.from("profiles").update({ phone: e164Phone }).eq("id", userId);
  revalidatePath("/settings");
  return { success: true };
}

const updateRoleSchema = z.object({ role: z.enum(USER_ROLES) });

/** Changes an EXISTING user's role — e.g. promoting a VIEWER created earlier
 *  to ADMIN. createUser's role choice only applies at creation time. */
export async function updateUserRole(
  userId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Admins only" };
  }

  const parsed = updateRoleSchema.safeParse({ role: formData.get("role") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const { data: current } = await admin.auth.admin.getUserById(userId);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...current?.user?.user_metadata, role: parsed.data.role },
  });
  if (error) return { error: error.message };

  await admin.from("profiles").update({ role: parsed.data.role }).eq("id", userId);
  revalidatePath("/settings");
  return { success: true };
}
