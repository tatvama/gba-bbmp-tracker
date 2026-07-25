import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MailConfig } from "@/lib/mail/config";

/**
 * Integration test for the send orchestrator, with the SMTP transport, the R2
 * download and the recipient resolver stubbed. Verifies the parts that only
 * appear when the pieces are wired together:
 *
 *  - an outbox row is ALWAYS written, including when nothing is sent;
 *  - test mode never puts an officer address in the sent envelope;
 *  - a send failure is recorded and swallowed, never thrown at the caller;
 *  - correspondence history is written on success only.
 */

const sendMail = vi.fn();
let config: MailConfig;

vi.mock("@/lib/mail/transport", () => ({
  getMailConfig: () => config,
  getMailTransport: () => ({ sendMail }),
  fromHeader: (c: MailConfig) => `${c.fromName} <${c.user}>`,
}));

vi.mock("@/lib/storage/r2-upload", () => ({
  downloadFromR2ByKey: vi.fn(async () => Buffer.from("%PDF-1.4 fake")),
}));

vi.mock("@/lib/storage/supabase-upload", () => ({ getSignedUrl: vi.fn(async () => null) }));

interface Recipients {
  to: string[];
  cc: string[];
  officerId: string | null;
  officerName: string | null;
  officerDesignation: string | null;
  reason: string | null;
}

const officer: Recipients = {
  to: ["cemajroad@bbmp.gov.in"],
  cc: [],
  officerId: "officer-1",
  officerName: "Sri M. Lokesh",
  officerDesignation: "Chief Engineer (Road Infrastructure)",
  reason: null,
};
let recipients: Recipients = { ...officer };

vi.mock("@/lib/mail/recipients", () => ({
  resolveComplaintEmailRecipients: async () => recipients,
}));

const { sendLetterEmail } = await import("@/lib/mail/send");

// ── A minimal recording stand-in for the Supabase admin client ──────────────
interface Recorded { table: string; op: string; payload?: unknown }

const doc = (id: string, type: string, file: string) => ({
  id,
  document_type: type,
  original_file_name: file,
  storage_bucket: "r2",
  storage_path: `complaints/c1/${file}`,
  mime_type: "application/pdf",
});

const ONE_LETTER = [doc("doc-1", "Generated complaint letter (PDF)", "complaint-letter.pdf")];

/** A case that has accumulated several letters, newest first — the real shape
 *  that exposed the wrong-attachment bug on DM-CMP-2026-000011. */
const MANY_LETTERS = [
  doc("doc-cr", "Counter-reply", "counter-reply-1784797872143.pdf"),
  doc("doc-rem", "Reminder letter", "reminder.pdf"),
  doc("doc-orig", "Generated complaint letter (PDF)", "Job_209-26-000007_complaint_KN.pdf"),
];

let docsOnCase: ReturnType<typeof doc>[] = ONE_LETTER;

function makeAdmin(recorded: Recorded[]) {
  const complaint = {
    id: "c1",
    title: "Road not asphalted",
    complaint_number: "DM-CMP-2026-000011",
    internal_case_number: "DM-CMP-2026-000011",
    job_number: "206-24-000004",
    ward: { new_no: 209, new_name: "Gottigere" },
  };
  // Newest first, as the real .order("created_at", {ascending:false}) returns.
  const documents = docsOnCase;

  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      in: self,
      order: () => ({ data: table === "complaint_documents" ? documents : [], error: null }),
      maybeSingle: async () => ({
        data: table === "complaints" ? complaint : table === "letter_emails" ? { id: "outbox-1" } : null,
        error: null,
      }),
      insert: (payload: unknown) => {
        recorded.push({ table, op: "insert", payload });
        return {
          select: () => ({ maybeSingle: async () => ({ data: { id: "outbox-1" }, error: null }) }),
          then: (r: (v: { data: null; error: null }) => unknown) => r({ data: null, error: null }),
        };
      },
      update: (payload: unknown) => {
        recorded.push({ table, op: "update", payload });
        return { eq: async () => ({ data: null, error: null }) };
      },
    });
    return chain;
  };

  return { from: (table: string) => builder(table) } as never;
}

const CREDS = { user: "rti.gba@gmail.com", password: "abcdefghijklmnop", fromName: "GBA / BBMP Complaint Tracker", replyTo: "" };
const configs = {
  live: { ...CREDS, mode: "live", redirectTo: "" } as MailConfig,
  redirect: { ...CREDS, mode: "redirect", redirectTo: "mani96462@gmail.com" } as MailConfig,
  disabled: { ...CREDS, mode: "disabled", redirectTo: "" } as MailConfig,
};

const outboxInsert = (recorded: Recorded[]) =>
  recorded.find((r) => r.table === "letter_emails" && r.op === "insert")?.payload as Record<string, unknown>;

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: "<abc@gmail.com>" });
  recipients = { ...officer };
  docsOnCase = ONE_LETTER;
});

const attachedName = () =>
  (sendMail.mock.calls[0]![0] as { attachments?: { filename: string }[] }).attachments?.[0]?.filename;

describe("attachment selection when a case has several letters", () => {
  // Regression: this used to take the newest letter PDF regardless of kind, so a
  // filing announced as a "Complaint letter" arrived carrying the counter-reply.
  it("attaches the letter matching the kind being sent, not merely the newest", async () => {
    config = configs.redirect;
    docsOnCase = MANY_LETTERS;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", letterKind: "Complaint letter" });
    expect(attachedName()).toBe("Job_209-26-000007_complaint_KN.pdf");
  });

  it.each([
    ["Counter-reply", "counter-reply-1784797872143.pdf"],
    ["Reminder letter", "reminder.pdf"],
    ["Complaint letter", "Job_209-26-000007_complaint_KN.pdf"],
  ])("attaches the right document for %s", async (kind, expected) => {
    config = configs.redirect;
    docsOnCase = MANY_LETTERS;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", letterKind: kind });
    expect(attachedName()).toBe(expected);
  });

  it("matches a kind carrying a descriptive suffix", async () => {
    config = configs.redirect;
    docsOnCase = MANY_LETTERS;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", letterKind: "Reminder letter (no reply received)" });
    expect(attachedName()).toBe("reminder.pdf");
  });

  it("falls back to the newest letter for an unmapped kind rather than sending nothing", async () => {
    config = configs.redirect;
    docsOnCase = MANY_LETTERS;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", letterKind: "Some New Draft Kind" });
    expect(attachedName()).toBe("counter-reply-1784797872143.pdf");
  });

  it("records the document actually attached on the audit row", async () => {
    config = configs.redirect;
    docsOnCase = MANY_LETTERS;
    const recorded: Recorded[] = [];
    // No documentId supplied, so the picker chooses — the row must point at its
    // choice, not at null.
    await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1", letterKind: "Complaint letter" });
    expect(outboxInsert(recorded).document_id).toBe("doc-orig");
  });
});

describe("sendLetterEmail — test mode (MAIL_REDIRECT_TO set)", () => {
  it("sends only to the test inbox and never to the officer", async () => {
    config = configs.redirect;
    const recorded: Recorded[] = [];
    const r = await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1", letterKind: "Complaint letter" });

    expect(r.status).toBe("sent");
    expect(r.redirected).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);

    const sent = sendMail.mock.calls[0]![0] as { to: string[]; cc?: string[]; subject: string };
    expect(sent.to).toEqual(["mani96462@gmail.com"]);
    expect(sent.cc).toBeUndefined();
    expect(JSON.stringify(sent.to)).not.toContain("bbmp.gov.in");
    expect(sent.subject.startsWith("[TEST] ")).toBe(true);
  });

  it("records who would have been written to", async () => {
    config = configs.redirect;
    const recorded: Recorded[] = [];
    await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1" });

    const row = outboxInsert(recorded);
    expect(row.to_addresses).toEqual(["mani96462@gmail.com"]);
    expect(row.intended_to).toEqual(["cemajroad@bbmp.gov.in"]);
    expect(row.redirected).toBe(true);
    expect(row.mail_mode).toBe("redirect");
    expect(row.officer_id).toBe("officer-1");
  });

  it("attaches the letter PDF", async () => {
    config = configs.redirect;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1" });
    const sent = sendMail.mock.calls[0]![0] as { attachments?: { filename: string; content: Buffer }[] };
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments![0]!.filename).toBe("complaint-letter.pdf");
    expect(sent.attachments![0]!.content.length).toBeGreaterThan(0);
  });

  it("flags the diversion in the correspondence log", async () => {
    config = configs.redirect;
    const recorded: Recorded[] = [];
    await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1" });
    const log = recorded.find((r) => r.table === "communication_logs")?.payload as Record<string, unknown>;
    expect(log.comm_type).toBe("Email");
    expect(String(log.summary)).toContain("TEST MODE");
    expect(log.entity_type).toBe("complaint");
    expect(log.entity_id).toBe("c1");
  });
});

describe("sendLetterEmail — live mode", () => {
  it("addresses the officer and logs it without a test-mode warning", async () => {
    config = configs.live;
    const recorded: Recorded[] = [];
    const r = await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1" });

    expect(r.status).toBe("sent");
    expect(r.redirected).toBe(false);
    const sent = sendMail.mock.calls[0]![0] as { to: string[]; subject: string };
    expect(sent.to).toEqual(["cemajroad@bbmp.gov.in"]);
    expect(sent.subject).not.toContain("[TEST]");

    const log = recorded.find((r) => r.table === "communication_logs")?.payload as Record<string, unknown>;
    expect(String(log.summary)).not.toContain("TEST MODE");
  });
});

describe("sendLetterEmail — nothing is sent", () => {
  it("skips when mail is disabled, but still records the attempt", async () => {
    config = configs.disabled;
    const recorded: Recorded[] = [];
    const r = await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1" });

    expect(r.status).toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
    const row = outboxInsert(recorded);
    expect(row.status).toBe("skipped");
    expect(String(row.error)).toMatch(/MAIL_ENABLED/);
    // No correspondence entry — nothing was actually communicated.
    expect(recorded.find((x) => x.table === "communication_logs")).toBeUndefined();
  });

  it("skips with the resolver's reason when no officer has an email (ward 209 case)", async () => {
    config = configs.live;
    recipients = { ...officer, to: [], officerId: null, officerName: null, officerDesignation: null, reason: "No officer with an email address is on this complaint." };
    const recorded: Recorded[] = [];
    const r = await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1" });

    expect(r.status).toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
    expect(String(outboxInsert(recorded).error)).toMatch(/No officer with an email/);
  });

  it("records an SMTP failure and returns it rather than throwing", async () => {
    config = configs.redirect;
    sendMail.mockRejectedValue(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"));
    const recorded: Recorded[] = [];

    const r = await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1" });

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/Username and Password not accepted/);
    const update = recorded.find((x) => x.table === "letter_emails" && x.op === "update")?.payload as Record<string, unknown>;
    expect(update.status).toBe("failed");
    expect(recorded.find((x) => x.table === "communication_logs")).toBeUndefined();
  });
});
