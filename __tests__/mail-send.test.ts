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

function makeAdmin(recorded: Recorded[]) {
  const complaint = {
    id: "c1",
    title: "Road not asphalted",
    complaint_number: "DM-CMP-2026-000011",
    internal_case_number: "DM-CMP-2026-000011",
    job_number: "206-24-000004",
    ward: { new_no: 209, new_name: "Gottigere" },
  };
  const document = {
    id: "doc-1",
    document_type: "Generated complaint letter (PDF)",
    original_file_name: "complaint-letter.pdf",
    storage_bucket: "r2",
    storage_path: "complaints/c1/letter.pdf",
    mime_type: "application/pdf",
  };

  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      in: self,
      order: () => ({ data: table === "complaint_documents" ? [document] : [], error: null }),
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
