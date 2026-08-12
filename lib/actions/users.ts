"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/db";
import {
  createAuthUser,
  updateAuthUserPhone,
  updateAuthUserRole,
} from "@/lib/db/auth";
import { USER_ROLES } from "@/lib/constants";
import { isValidIndianMobile, normalizePhone } from "@/lib/phone";
import { writeAudit, diffFields } from "@/lib/audit";
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
  let actingAdmin;
  try {
    actingAdmin = await requireRole(["ADMIN"]);
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

  // E.164 for the phone sign-in identifier — same +91 assumption
  // lib/phone.ts's telLink/waLink already make for a contact number.
  const e164Phone = parsed.data.phone ? `+91${normalizePhone(parsed.data.phone)}` : null;

  // Creates the account AND its profile row in one transaction. There is no
  // separate confirmation step: an admin-created account is confirmed by
  // definition, and no SMS provider is involved in phone sign-in.
  const { id, error } = await createAuthUser({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name ?? "",
    role: parsed.data.role,
    phone: e164Phone,
  });
  if (error || !id) return { error: error ?? "Could not create the account." };

  await writeAudit(createAdminClient(), {
    entityType: "user",
    entityId: id,
    changedBy: actingAdmin.id,
    changes: [
      { field: "created", oldValue: null, newValue: parsed.data.email },
      { field: "role", oldValue: null, newValue: parsed.data.role },
    ],
  });
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

  const admin = createAdminClient();
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
  let actingAdmin;
  try {
    actingAdmin = await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Admins only" };
  }

  const parsed = updatePhoneSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("phone").eq("id", userId).maybeSingle();

  const e164Phone = `+91${normalizePhone(parsed.data.phone)}`;
  // Writes the identifier to app_users and mirrors it onto profiles, which is
  // what app/login reads when someone signs in by phone.
  await updateAuthUserPhone(userId, e164Phone);

  await writeAudit(admin, {
    entityType: "user",
    entityId: userId,
    changedBy: actingAdmin.id,
    changes: diffFields(before ?? null, { phone: e164Phone }),
  });
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
  let actingAdmin;
  try {
    actingAdmin = await requireRole(["ADMIN"]);
  } catch (e) {
    return { error: e instanceof AuthorizationError ? e.message : "Admins only" };
  }

  const parsed = updateRoleSchema.safeParse({ role: formData.get("role") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  // Updates profiles.role (what authorization actually reads) and keeps the
  // copy in app_users' metadata aligned with it.
  await updateAuthUserRole(userId, parsed.data.role);

  // Role changes are the most security-sensitive user-management action
  // (e.g. granting ADMIN) — always worth an audit row even for a same-role no-op,
  // unlike other entities' diff-only auditing.
  await writeAudit(admin, {
    entityType: "user",
    entityId: userId,
    changedBy: actingAdmin.id,
    changes: [{ field: "role", oldValue: before?.role ?? null, newValue: parsed.data.role }],
  });
  revalidatePath("/settings");
  return { success: true };
}
