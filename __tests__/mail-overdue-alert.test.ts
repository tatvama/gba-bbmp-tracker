import { describe, it, expect } from "vitest";
import { buildOverdueAlertEmail } from "@/lib/mail/message";

const base = { senderName: "GBA / BBMP Complaint Tracker" };

const singleComplaint = [
  {
    complaintNumber: "DM-CMP-2026-000011",
    jobNumber: "209-26-000007",
    complaintSubject: "Road resurfacing pending",
    ward: "209 - Gottigere",
    followUpDate: "2026-07-20",
    daysOverdue: 7,
  },
];

describe("buildOverdueAlertEmail", () => {
  it("puts the case reference, job code and 'Overdue Alert' in the subject for a single complaint", () => {
    const { subject } = buildOverdueAlertEmail({ ...base, complaints: singleComplaint });
    expect(subject).toContain("Overdue Alert");
    expect(subject).toContain("DM-CMP-2026-000011");
    expect(subject).toContain("209-26-000007");
    expect(subject).toContain("Ward 209 - Gottigere");
  });

  it("summarizes the subject by count when several complaints are digested together", () => {
    const { subject } = buildOverdueAlertEmail({
      ...base,
      complaints: [...singleComplaint, { complaintNumber: "DM-CMP-2026-000010", jobNumber: "209-26-000004" }],
    });
    expect(subject).toContain("Overdue Alert");
    expect(subject).toContain("2 complaints");
  });

  it("lists every complaint with its reference, job code, ward, due date and day count", () => {
    const { text } = buildOverdueAlertEmail({
      ...base,
      complaints: [
        {
          complaintNumber: "DM-CMP-2026-000011",
          jobNumber: "209-26-000007",
          complaintSubject: "Road resurfacing",
          ward: "209",
          followUpDate: "2026-07-20",
          daysOverdue: 7,
        },
        {
          complaintNumber: "DM-CMP-2026-000010",
          jobNumber: "209-26-000004",
          complaintSubject: "Drain clearance",
          ward: "209",
          followUpDate: "2026-07-25",
          daysOverdue: 2,
        },
      ],
    });
    expect(text).toContain("1. Complaint No. DM-CMP-2026-000011");
    expect(text).toContain("209-26-000007");
    expect(text).toContain("7 days overdue");
    expect(text).toContain("2. Complaint No. DM-CMP-2026-000010");
    expect(text).toContain("209-26-000004");
    expect(text).toContain("2 days overdue");
  });

  it("addresses the officer by designation when known, else falls back neutrally", () => {
    const named = buildOverdueAlertEmail({
      ...base,
      complaints: singleComplaint,
      officerName: "Sri M. Lokesh",
      officerDesignation: "Assistant Executive Engineer",
    });
    expect(named.text).toContain("The Assistant Executive Engineer");
    expect(named.text).toContain("Sri M. Lokesh");

    const anonymous = buildOverdueAlertEmail({ ...base, complaints: singleComplaint });
    expect(anonymous.text).toContain("The concerned officer");
  });

  it("uses singular/plural 'day(s) overdue' phrasing correctly per complaint", () => {
    const { text } = buildOverdueAlertEmail({
      ...base,
      complaints: [
        { complaintNumber: "A", daysOverdue: 1 },
        { complaintNumber: "B", daysOverdue: 2 },
      ],
    });
    expect(text).toContain("1 day overdue");
    expect(text).not.toContain("1 days overdue");
    expect(text).toContain("2 days overdue");
  });

  it("does not overstate a zero or negative day count as overdue", () => {
    const { text } = buildOverdueAlertEmail({
      ...base,
      complaints: [{ complaintNumber: "A", followUpDate: "2026-07-27", daysOverdue: 0 }],
    });
    expect(text).not.toContain("0 days overdue");
  });

  it("never claims an attachment — this is a notice, not a filed letter", () => {
    const { text } = buildOverdueAlertEmail({ ...base, complaints: singleComplaint });
    expect(text).not.toContain("Please find attached");
    expect(text).not.toContain("Attachment:");
  });

  it("closes formally, matching buildLetterEmail's tone", () => {
    const { text } = buildOverdueAlertEmail({ ...base, complaints: singleComplaint, senderContact: "rti.gba@gmail.com" });
    expect(text).toContain("Yours faithfully,");
    expect(text).toContain("GBA / BBMP Complaint Tracker");
    expect(text).toContain("rti.gba@gmail.com");
  });

  it("omits absent identifiers rather than printing empty labels or 'undefined'/'null'", () => {
    const { subject, text } = buildOverdueAlertEmail({ ...base, complaints: [{}] });
    expect(subject).toBe("Overdue Alert");
    expect(subject).not.toContain("undefined");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).toContain("1. Complaint");
  });
});
