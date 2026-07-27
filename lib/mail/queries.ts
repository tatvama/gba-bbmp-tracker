import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidEmail } from "./message";
import { resolveComplaintEmailRecipients } from "./recipients";
import { mergeRecipientOptions, type ContactEmailRow, type RecipientOption } from "./recipient-options";

export type { RecipientOption } from "./recipient-options";

export {
  listRecommendedRecipients,
  listDepartmentRecipients,
  GBA_DEPARTMENT_DIRECTORY_SOURCE,
  GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE,
} from "./recommend-queries";
export type { RecommendedRecipient, RecommendReason } from "./recommend-recipients";

/**
 * Reads for the letter-email UI.
 *
 * These use the SERVICE-ROLE admin client deliberately. letter_emails is
 * deny-by-default under RLS (migration 0047) because it holds officer email
 * addresses and full letter bodies, so the request-scoped cookie client cannot see
 * it at all. Callers must therefore role-gate before calling — every caller here is
 * a server action that does.
 */

export interface LetterEmailRow {
  id: string;
  letter_kind: string | null;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  to_addresses: string[];
  intended_to: string[];
  cc_addresses: string[];
  redirected: boolean;
  subject: string | null;
  attachment_name: string | null;
  error: string | null;
  mail_mode: string | null;
  recipients: { name?: string | null; email: string; source?: string; role?: string }[] | null;
  sent_at: string | null;
  created_at: string;
}

const OUTBOX_FIELDS =
  "id, letter_kind, status, to_addresses, intended_to, cc_addresses, redirected, subject, attachment_name, error, mail_mode, recipients, sent_at, created_at";

/** Send history for one complaint, newest first. */
export async function listLetterEmails(complaintId: string, limit = 20): Promise<LetterEmailRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("letter_emails")
      .select(OUTBOX_FIELDS)
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[mail] listLetterEmails failed", error.message);
      return [];
    }
    return (data as LetterEmailRow[] | null) ?? [];
  } catch (e) {
    console.warn("[mail] listLetterEmails threw", e);
    return [];
  }
}

/**
 * Candidate recipients, one per ADDRESS (see lib/mail/recipient-options.ts for why
 * merging matters — shared office mailboxes are common in this directory).
 *
 * The suggested entry is the one the automatic send would have used, so showing it
 * lets the user confirm rather than retype.
 */
export async function listRecipientOptions(
  complaintId: string,
): Promise<{ options: RecipientOption[]; resolutionReason: string | null }> {
  try {
    const admin = createAdminClient();
    const resolved = await resolveComplaintEmailRecipients(admin, complaintId);

    const { data } = await admin
      .from("contacts")
      .select("id, full_name, official_title, designation, email, officer_status")
      .not("email", "is", null)
      .order("full_name");

    const rows = (data as ContactEmailRow[] | null) ?? [];
    const options = mergeRecipientOptions(rows, isValidEmail, resolved.officerId);

    return { options, resolutionReason: resolved.to.length ? null : resolved.reason };
  } catch (e) {
    console.warn("[mail] listRecipientOptions failed", e);
    return { options: [], resolutionReason: e instanceof Error ? e.message : "Could not load recipients." };
  }
}
