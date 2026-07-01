import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Write an in-app notification (the alerts bell). Best-effort — never throws
 * into the caller (a failed alert must not fail the job it reports on). Lives
 * outside the "use server" action files so it can take an admin client arg and
 * be shared by any server module (jobs, forensic import, cron, …).
 */
export async function notifyUser(
  admin: SupabaseClient,
  userId: string,
  n: { type: string; title: string; body?: string | null; link?: string | null; entityType?: string | null; entityId?: string | null },
): Promise<void> {
  try {
    await admin.from("notifications").insert({
      user_id: userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      entity_type: n.entityType ?? null,
      entity_id: n.entityId ?? null,
    });
  } catch (e) {
    console.warn("[notifyUser] failed", e);
  }
}
