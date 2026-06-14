"use server";

import { z } from "zod";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_ROLES } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";

const createUserSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().optional(),
  role: z.enum(USER_ROLES),
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

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { name: parsed.data.name ?? "", role: parsed.data.role },
  });
  if (error) return { error: error.message };

  // Ensure the profile reflects the chosen role (trigger sets it on insert).
  if (data.user) {
    await admin.from("profiles").upsert(
      { id: data.user.id, email: parsed.data.email, name: parsed.data.name ?? "", role: parsed.data.role },
      { onConflict: "id" },
    );
  }
  return { success: true };
}
