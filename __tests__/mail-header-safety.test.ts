import { describe, it, expect } from "vitest";
import { buildLetterEmail, sanitizeHeaderText } from "@/lib/mail/message";
import { sanitizeLetterKind, SELECTABLE_LETTER_KINDS } from "@/lib/mail/routing";

/**
 * The subject is assembled from a complaint title, an officer name, a job code and
 * a caller-supplied letter kind — all user- or import-supplied. A CR/LF in any of
 * them would terminate the Subject header and let the remainder be read as further
 * headers.
 */

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

describe("sanitizeHeaderText", () => {
  it("removes CR and LF, defeating header injection", () => {
    const out = sanitizeHeaderText(`Complaint letter${CR}${LF}Bcc: attacker@example.com`);
    expect(out).not.toContain(CR);
    expect(out).not.toContain(LF);
    expect(out).toBe("Complaint letter Bcc: attacker@example.com");
  });

  it("removes other control characters", () => {
    expect(sanitizeHeaderText(`a${NUL}b`)).toBe("a b");
  });

  it("PRESERVES hyphens, em dashes and digits — these are real subject content", () => {
    // A previous version used a character class that swallowed the hyphen, which
    // would have mangled every "Ward 209 - Gottigere" and every job code.
    expect(sanitizeHeaderText("Reminder letter — Job Code 209-26-000007 — Ward 209 - Gottigere")).toBe(
      "Reminder letter — Job Code 209-26-000007 — Ward 209 - Gottigere",
    );
  });

  it("collapses runs of whitespace and trims", () => {
    expect(sanitizeHeaderText("  a    b  ")).toBe("a b");
  });

  it("leaves ordinary text untouched", () => {
    expect(sanitizeHeaderText("Counter-reply to department reply")).toBe("Counter-reply to department reply");
  });
});

describe("buildLetterEmail subject safety", () => {
  it("cannot be made to carry a newline through any field", () => {
    const { subject } = buildLetterEmail({
      letterKind: `Complaint letter${CR}${LF}Bcc: a@b.com`,
      complaintNumber: `DM-1${LF}X-Header: y`,
      jobNumber: `209${CR}`,
      ward: `209 - Gottigere${LF}`,
      senderName: "GBA / BBMP Complaint Tracker",
    });
    expect(subject).not.toContain(CR);
    expect(subject).not.toContain(LF);
  });

  it("still reads correctly for ordinary input", () => {
    const { subject } = buildLetterEmail({
      letterKind: "Reminder letter",
      complaintNumber: "DM-CMP-2026-000011",
      jobNumber: "209-26-000007",
      ward: "209 - Gottigere",
      senderName: "x",
    });
    expect(subject).toBe("Reminder letter — Complaint No. DM-CMP-2026-000011 / Job Code 209-26-000007 — Ward 209 - Gottigere");
  });
});

describe("sanitizeLetterKind", () => {
  it("accepts every selectable kind unchanged", () => {
    for (const k of SELECTABLE_LETTER_KINDS) {
      expect(sanitizeLetterKind(k)).toBe(k);
    }
  });

  it("is case-insensitive", () => {
    expect(sanitizeLetterKind("reminder LETTER")).toBe("Reminder letter");
  });

  it("matches the decorated labels the internal filing actions pass", () => {
    expect(sanitizeLetterKind("Reminder letter (no reply received)")).toBe("Reminder letter");
    expect(sanitizeLetterKind("Counter-reply to department reply")).toBe("Counter-reply");
  });

  it("refuses arbitrary attacker-supplied text, falling back to a safe label", () => {
    // The subject is where this lands, so free text would let an unauthenticated
    // caller send official-looking mail saying anything.
    expect(sanitizeLetterKind("URGENT — remit Rs 5,00,000 to A/c 123456")).toBe("Complaint letter");
    expect(sanitizeLetterKind(`Complaint letter${CR}${LF}Bcc: a@b.com`)).toBe("Complaint letter");
  });

  it("falls back for empty or missing input", () => {
    expect(sanitizeLetterKind(null)).toBe("Complaint letter");
    expect(sanitizeLetterKind(undefined)).toBe("Complaint letter");
    expect(sanitizeLetterKind("   ")).toBe("Complaint letter");
  });
});
