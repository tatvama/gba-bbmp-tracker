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

/** A prior successful send for the same job id, as the idempotency guard reads it.
 *  null = this job has not delivered yet. */
let priorSentForJob: { id: string; to_addresses: string[]; redirected: boolean } | null = null;

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
    // Honour .in() rather than ignoring it. A mock that treats every filter as a
    // no-op makes query-level guarantees untestable — the attachment-safety guard
    // lives in the .in("document_type", …) allowlist, so a permissive mock would
    // report a leak that cannot actually happen (and, worse, would hide a real
    // one if the allowlist were dropped).
    let inFilter: { column: string; values: unknown[] } | null = null;
    Object.assign(chain, {
      select: self,
      eq: self,
      in: (column: string, values: unknown[]) => {
        inFilter = { column, values };
        return chain;
      },
      order: () => {
        if (table !== "complaint_documents") return { data: [], error: null };
        const rows =
          inFilter && inFilter.column === "document_type"
            ? documents.filter((d) => (inFilter as { values: unknown[] }).values.includes(d.document_type))
            : documents;
        return { data: rows, error: null };
      },
      maybeSingle: async () => ({
        data:
          table === "complaints"
            ? complaint
            : table === "complaint_documents"
              ? (documents[0] ?? null)
              : // letter_emails reached via the chain is ONLY the idempotency
                // lookup — the insert supplies its own .select().maybeSingle().
                table === "letter_emails"
                ? priorSentForJob
                : null,
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
  priorSentForJob = null;
});

describe("retry idempotency", () => {
  // Gmail can accept the DATA payload and then drop the pooled connection before
  // nodemailer reads the 250. That surfaces as a retryable error for a send that
  // actually happened; without this guard each retry delivers another copy, up to
  // 1 + maxRetries = 4 letters to the same official.
  it("does not re-send when this job already delivered", async () => {
    config = configs.redirect;
    priorSentForJob = { id: "outbox-earlier", to_addresses: ["mani96462@gmail.com"], redirected: true };
    const recorded: Recorded[] = [];

    const r = await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1", jobId: "job-1" });

    expect(sendMail).not.toHaveBeenCalled();
    expect(r.status).toBe("sent");
    expect(r.ok).toBe(true);
    expect(r.outboxId).toBe("outbox-earlier");
    // No duplicate audit rows either.
    expect(recorded.filter((x) => x.table === "letter_emails" && x.op === "insert")).toHaveLength(0);
    expect(recorded.filter((x) => x.table === "communication_logs")).toHaveLength(0);
  });

  it("sends normally when the job has not delivered yet", async () => {
    config = configs.redirect;
    priorSentForJob = null;
    const r = await sendLetterEmail(makeAdmin([]), { complaintId: "c1", jobId: "job-1" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("sent");
  });

  it("records the job id on the outbox row so the guard can find it", async () => {
    config = configs.redirect;
    const recorded: Recorded[] = [];
    await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1", jobId: "job-42" });
    expect(outboxInsert(recorded).job_id).toBe("job-42");
  });

  it("skips the guard entirely when no job id is supplied", async () => {
    config = configs.redirect;
    priorSentForJob = { id: "outbox-earlier", to_addresses: ["x@y.com"], redirected: true };
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1" });
    // A manual send with no jobId must not be blocked by an unrelated prior row.
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

describe("attachment content type", () => {
  it("declares a DOCX as wordprocessingml, not as a PDF", async () => {
    config = configs.redirect;
    docsOnCase = [
      {
        ...doc("doc-docx", "Generated complaint letter", "letter.docx"),
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ];
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", letterKind: "Complaint letter" });
    const sent = sendMail.mock.calls[0]![0] as { attachments?: { contentType: string; filename: string }[] };
    expect(sent.attachments![0]!.contentType).toContain("wordprocessingml");
    expect(sent.attachments![0]!.filename).toBe("letter.docx");
  });

  it("declares a PDF as application/pdf", async () => {
    config = configs.redirect;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", letterKind: "Complaint letter" });
    const sent = sendMail.mock.calls[0]![0] as { attachments?: { contentType: string }[] };
    expect(sent.attachments![0]!.contentType).toBe("application/pdf");
  });
});

describe("explicit recipient override", () => {
  const OFFICER_A = { name: "Sri A", email: "a@bbmp.gov.in" };
  const OFFICER_B = { name: "Sri B", email: "b@bbmp.gov.in" };

  it("STILL diverts to the test inbox — an override is intent, not delivery", async () => {
    // The whole point of the override is that the directory has no address. It
    // must not become a back door around test mode.
    config = configs.redirect;
    const recorded: Recorded[] = [];
    const r = await sendLetterEmail(makeAdmin(recorded), {
      complaintId: "c1",
      toOverride: [OFFICER_A, OFFICER_B],
    });

    expect(r.status).toBe("sent");
    const sent = sendMail.mock.calls[0]![0] as { to: string[]; cc?: string[] };
    expect(sent.to).toEqual(["mani96462@gmail.com"]);
    expect(JSON.stringify([sent.to, sent.cc])).not.toContain("bbmp.gov.in");
    expect(outboxInsert(recorded).intended_to).toEqual([OFFICER_A.email, OFFICER_B.email]);
  });

  it("addresses every override recipient in live mode", async () => {
    config = configs.live;
    await sendLetterEmail(makeAdmin([]), {
      complaintId: "c1",
      toOverride: [OFFICER_A, OFFICER_B],
      ccOverride: [{ name: "Cc", email: "cc@bbmp.gov.in" }],
    });
    const sent = sendMail.mock.calls[0]![0] as { to: string[]; cc?: string[] };
    expect(sent.to).toEqual([OFFICER_A.email, OFFICER_B.email]);
    expect(sent.cc).toEqual(["cc@bbmp.gov.in"]);
  });

  it("bypasses directory resolution entirely, so an unresolvable complaint can still be emailed", async () => {
    // This is the case the user actually has: ward 209, no assigned officer.
    config = configs.live;
    recipients = { ...officer, to: [], officerId: null, officerName: null, officerDesignation: null, reason: "No officer with an email address is on this complaint." };
    const recorded: Recorded[] = [];

    const r = await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1", toOverride: [OFFICER_A] });

    expect(r.status).toBe("sent");
    const row = outboxInsert(recorded);
    expect(row.error).toBeNull();
    // Not a directory contact, so no FK is asserted.
    expect(row.officer_id).toBeNull();
  });

  it("records the typed names, not just the addresses", async () => {
    config = configs.redirect;
    const recorded: Recorded[] = [];
    await sendLetterEmail(makeAdmin(recorded), { complaintId: "c1", toOverride: [OFFICER_A] });
    expect(outboxInsert(recorded).recipients).toEqual([
      { name: "Sri A", email: "a@bbmp.gov.in", source: "manual", role: "to" },
    ]);
  });

  it("names the addressee in the salutation only when there is exactly one", async () => {
    config = configs.redirect;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", toOverride: [OFFICER_A] });
    expect((sendMail.mock.calls[0]![0] as { text: string }).text).toContain("Sri A");

    sendMail.mockClear();
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", toOverride: [OFFICER_A, OFFICER_B] });
    const text = (sendMail.mock.calls[0]![0] as { text: string }).text;
    expect(text).toContain("The concerned officer");
    // Addressing two people by one of their names would be wrong.
    expect(text.split("Yours faithfully")[0]).not.toContain("Sri A");
  });

  it("ignores malformed override addresses and falls back to the directory when none survive", async () => {
    config = configs.live;
    const recorded: Recorded[] = [];
    await sendLetterEmail(makeAdmin(recorded), {
      complaintId: "c1",
      toOverride: [{ name: "Broken", email: "not-an-email" }],
    });
    // officer.to from the directory mock, not the junk address.
    expect((sendMail.mock.calls[0]![0] as { to: string[] }).to).toEqual(["cemajroad@bbmp.gov.in"]);
    expect(outboxInsert(recorded).officer_id).toBe("officer-1");
  });

  it("de-duplicates an address appearing in both to and cc", async () => {
    config = configs.live;
    await sendLetterEmail(makeAdmin([]), {
      complaintId: "c1",
      toOverride: [OFFICER_A],
      ccOverride: [OFFICER_A],
    });
    const sent = sendMail.mock.calls[0]![0] as { to: string[]; cc?: string[] };
    expect(sent.to).toEqual([OFFICER_A.email]);
    expect(sent.cc).toBeUndefined();
  });
});

describe("attachment safety", () => {
  it("never picks a TVCC or PIL document via the untyped fallback", async () => {
    // The Submit panel puts "Prepare TVCC copy" directly above "Record the
    // submission". The fallback takes the NEWEST document, so before this guard a
    // TVCC vigilance copy — a complaint ABOUT this officer's division — could be
    // emailed to that officer under a note saying "the complaint letter".
    config = configs.redirect;
    docsOnCase = [
      doc("doc-tvcc", "TVCC copy (PDF)", "tvcc-copy-KENDRA-123.pdf"),
      doc("doc-pil", "Legal notice", "pil.pdf"),
      doc("doc-orig", "Generated complaint letter (PDF)", "complaint.pdf"),
    ];
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1", letterKind: "Some Unmapped Kind" });
    expect(attachedName()).toBe("complaint.pdf");
  });
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

  it("puts no officer address ANYWHERE in the payload handed to nodemailer", async () => {
    // This assertion used to inspect only `to`, so adding a line like
    // `bcc: envelope.intendedTo` to send.ts would have leaked an officer address
    // with every test still passing. Scan every routing field instead, and pin
    // the exact set of delivery-bearing keys so a new one must be added here
    // deliberately.
    config = configs.redirect;
    await sendLetterEmail(makeAdmin([]), { complaintId: "c1" });
    const payload = sendMail.mock.calls[0]![0] as Record<string, unknown>;

    const routing = Object.fromEntries(
      Object.entries(payload).filter(([k]) => !["subject", "text", "html", "attachments"].includes(k)),
    );
    expect(JSON.stringify(routing)).not.toContain("bbmp.gov.in");

    const deliveryKeys = Object.keys(payload)
      .filter((k) => /^(to|cc|bcc|envelope|sender)$/.test(k) && payload[k] !== undefined)
      .sort();
    expect(deliveryKeys).toEqual(["to"]);
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
