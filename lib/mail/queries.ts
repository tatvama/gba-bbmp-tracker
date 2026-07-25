import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { officerDisplayName } from "@/lib/contacts/officer-recipient";
import { isValidEmail } from "./message";
import { resolveComplaintEmailRecipients } from "./recipients";

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

export interface RecipientOption {
  contactId: string | null;
  name: string;
  designation: string | null;
  email: string;
  /** True for the officer the system itself would have written to. */
  suggested: boolean;
  /** Why this one is suggested, for the UI to explain the pick. */
  note: string | null;
}

/**
 * Candidate recipients: the officer the system resolves for this complaint first
 * (when there is one), then every directory contact holding a usable email.
 *
 * The suggested entry matters because it is the one the automatic send would have
 * used — showing it lets the user confirm rather than retype.
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

    const rows = (data as
      | { id: string; full_name: string | null; official_title: string | null; designation: string | null; email: string | null; officer_status: string | null }[]
      | null) ?? [];

    const suggestedIds = new Set(resolved.officerId ? [resolved.officerId] : []);
    const options: RecipientOption[] = [];

    for (const r of rows) {
      if (!isValidEmail(r.email)) continue;
      options.push({
        contactId: r.id,
        name: officerDisplayName(r) || "(unnamed)",
        designation: r.designation ?? null,
        email: String(r.email).trim().toLowerCase(),
        suggested: suggestedIds.has(r.id),
        note: suggestedIds.has(r.id) ? "Resolved for this complaint" : r.officer_status && r.officer_status !== "Active" ? r.officer_status : null,
      });
    }

    // Suggested first, then alphabetical — the list is long and the pick that
    // matters should not need scrolling for.
    options.sort((a, b) => (a.suggested === b.suggested ? a.name.localeCompare(b.name) : a.suggested ? -1 : 1));

    return { options, resolutionReason: resolved.to.length ? null : resolved.reason };
  } catch (e) {
    console.warn("[mail] listRecipientOptions failed", e);
    return { options: [], resolutionReason: e instanceof Error ? e.message : "Could not load recipients." };
  }
}
