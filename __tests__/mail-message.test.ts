import { describe, it, expect } from "vitest";
import { buildLetterEmail } from "@/lib/mail/message";
import { mayAutoEmailOfficer, OFFICER_ADDRESSED_DRAFT_KINDS } from "@/lib/mail/routing";
import { pickEmailableOfficer } from "@/lib/mail/recipients";

const base = {
  letterKind: "Reminder letter",
  senderName: "GBA / BBMP Complaint Tracker",
};

describe("buildLetterEmail", () => {
  it("puts the case references in the subject so the officer can search for them", () => {
    const { subject } = buildLetterEmail({
      ...base,
      complaintNumber: "DM-CMP-2026-000074",
      jobNumber: "206-24-000004",
      ward: "52 - K.R.Puram",
    });
    expect(subject).toContain("Reminder letter");
    expect(subject).toContain("DM-CMP-2026-000074");
    expect(subject).toContain("206-24-000004");
    expect(subject).toContain("Ward 52 - K.R.Puram");
  });

  it("omits absent identifiers rather than printing empty labels", () => {
    const { subject } = buildLetterEmail({ ...base });
    expect(subject).toBe("Reminder letter");
    expect(subject).not.toContain("undefined");
    expect(subject).not.toContain("null");
  });

  it("addresses the officer by designation when known", () => {
    const { text } = buildLetterEmail({
      ...base,
      officerName: "Sri M. Lokesh",
      officerDesignation: "Chief Engineer (Road Infrastructure)",
    });
    expect(text).toContain("The Chief Engineer (Road Infrastructure)");
    expect(text).toContain("Sri M. Lokesh");
  });

  it("falls back to a neutral addressee with no name or designation", () => {
    const { text } = buildLetterEmail({ ...base });
    expect(text).toContain("The concerned officer");
  });

  it("mentions the attachment only when there is one", () => {
    const withFile = buildLetterEmail({ ...base, attachmentName: "reminder.pdf" });
    expect(withFile.text).toContain("Please find attached");
    expect(withFile.text).toContain("Attachment: reminder.pdf");

    const withoutFile = buildLetterEmail({ ...base });
    expect(withoutFile.text).not.toContain("Please find attached");
    expect(withoutFile.text).not.toContain("Attachment:");
  });

  it("states that the email supplements rather than replaces the physical letter", () => {
    const { text } = buildLetterEmail({ ...base, submittedOn: "2026-07-25" });
    expect(text).toContain("2026-07-25");
    expect(text).toContain("does not replace it");
  });
});

describe("mayAutoEmailOfficer", () => {
  it("allows letters addressed to the complaint's own officer", () => {
    for (const kind of OFFICER_ADDRESSED_DRAFT_KINDS) {
      expect(mayAutoEmailOfficer(kind), kind).toBe(true);
    }
  });

  it("refuses letters that go over that officer's head", () => {
    for (const kind of [
      "escalation_letter",
      "lokayukta_complaint",
      "chief_secretary_letter",
      "cm_office_letter",
      "legal_notice",
      "tvcc_complaint",
      "records_preservation",
      "rti_from_complaint",
    ]) {
      expect(mayAutoEmailOfficer(kind), kind).toBe(false);
    }
  });

  it("denies by default for unknown or missing kinds", () => {
    expect(mayAutoEmailOfficer(null)).toBe(false);
    expect(mayAutoEmailOfficer(undefined)).toBe(false);
    expect(mayAutoEmailOfficer("")).toBe(false);
    expect(mayAutoEmailOfficer("something_new")).toBe(false);
  });
});

describe("pickEmailableOfficer", () => {
  const officer = (id: string, email: string | null) => ({
    id,
    full_name: "X",
    official_title: null,
    designation: null,
    email,
    officer_status: "Active",
  });

  it("takes the first candidate that has a usable email", () => {
    const picked = pickEmailableOfficer([officer("a", null), officer("b", "b@bbmp.gov.in")]);
    expect(picked?.id).toBe("b");
  });

  it("respects precedence — an earlier candidate with an email wins", () => {
    const picked = pickEmailableOfficer([officer("a", "a@bbmp.gov.in"), officer("b", "b@bbmp.gov.in")]);
    expect(picked?.id).toBe("a");
  });

  it("skips candidates whose email is malformed", () => {
    const picked = pickEmailableOfficer([officer("a", "not an email"), officer("b", "b@bbmp.gov.in")]);
    expect(picked?.id).toBe("b");
  });

  it("returns null when nobody is emailable", () => {
    expect(pickEmailableOfficer([officer("a", null), null, undefined])).toBeNull();
    expect(pickEmailableOfficer([])).toBeNull();
  });
});
