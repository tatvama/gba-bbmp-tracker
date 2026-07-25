import { describe, it, expect } from "vitest";
import { mergeRecipientOptions, type ContactEmailRow } from "@/lib/mail/recipient-options";
import { isValidEmail } from "@/lib/mail/message";

/**
 * Regression: the recipient list was one option per CONTACT and keyed by email, so
 * two officers sharing an office mailbox crashed React with "Encountered two
 * children with the same key, aromsnbbmp@gmail.com". The real directory has three
 * such mailboxes — 64 contacts, 61 distinct addresses.
 */

const row = (over: Partial<ContactEmailRow> & { id: string; email: string | null }): ContactEmailRow => ({
  full_name: "Someone",
  official_title: null,
  designation: "Assistant Revenue Officer",
  officer_status: "Active",
  ...over,
});

/** The exact shared-mailbox pairs present in production. */
const SHARED_REAL: ContactEmailRow[] = [
  row({ id: "c1", full_name: "Ashok", email: "aromsnbbmp@gmail.com" }),
  row({ id: "c2", full_name: "Guru Prasanna", email: "aromsnbbmp@gmail.com" }),
  row({ id: "c3", full_name: "Chandrakantha", email: "arokgn@gmail.com" }),
  row({ id: "c4", full_name: "Venkatesh. N", email: "arokgn@gmail.com" }),
  row({ id: "c5", full_name: "K Srinivasaiah", email: "aropadmanabhanagar@gmail.com" }),
  row({ id: "c6", full_name: "Rajkumar", email: "aropadmanabhanagar@gmail.com" }),
];

const merge = (rows: ContactEmailRow[], suggested: string | null = null) =>
  mergeRecipientOptions(rows, isValidEmail, suggested);

describe("mergeRecipientOptions — shared mailboxes", () => {
  it("produces ONE option per address, so React keys are unique", () => {
    const options = merge(SHARED_REAL);
    expect(options).toHaveLength(3);
    const keys = options.map((o) => o.email);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lists every officer who shares the mailbox", () => {
    const o = merge(SHARED_REAL).find((x) => x.email === "aromsnbbmp@gmail.com")!;
    expect(o.officers.map((p) => p.name)).toEqual(["Ashok", "Guru Prasanna"]);
    expect(o.label).toBe("Ashok (+1 more)");
    expect(o.note).toBe("Shared mailbox — 2 officers");
  });

  it("refuses to attribute a shared mailbox to one of its officers", () => {
    // Naming one of two officers on the letter, and recording their officer_id on
    // the audit row, would both be wrong.
    const o = merge(SHARED_REAL).find((x) => x.email === "arokgn@gmail.com")!;
    expect(o.contactId).toBeNull();
    expect(o.name).toBeNull();
    expect(o.designation).toBeNull();
  });

  it("DOES attribute a shared mailbox when the system resolved one of them", () => {
    // That officer is unambiguous — the resolver picked them specifically.
    const o = merge(SHARED_REAL, "c2").find((x) => x.email === "aromsnbbmp@gmail.com")!;
    expect(o.suggested).toBe(true);
    expect(o.contactId).toBe("c2");
    expect(o.name).toBe("Guru Prasanna");
    expect(o.note).toBe("Resolved for this complaint");
  });
});

describe("mergeRecipientOptions — ordinary cases", () => {
  it("attributes a sole occupant fully", () => {
    const [o] = merge([row({ id: "c1", full_name: "Nataraj", official_title: "Sri", email: "a@bbmp.gov.in" })]);
    expect(o!.label).toBe("Sri Nataraj");
    expect(o!.name).toBe("Sri Nataraj");
    expect(o!.contactId).toBe("c1");
    expect(o!.designation).toBe("Assistant Revenue Officer");
    expect(o!.officers).toHaveLength(1);
  });

  it("puts the suggested option first, then sorts alphabetically", () => {
    const options = merge(
      [
        row({ id: "c1", full_name: "Zubair", email: "z@bbmp.gov.in" }),
        row({ id: "c2", full_name: "Anand", email: "a@bbmp.gov.in" }),
        row({ id: "c3", full_name: "Mohan", email: "m@bbmp.gov.in" }),
      ],
      "c1",
    );
    expect(options.map((o) => o.email)).toEqual(["z@bbmp.gov.in", "a@bbmp.gov.in", "m@bbmp.gov.in"]);
  });

  it("lower-cases addresses so case variants merge rather than duplicating", () => {
    const options = merge([
      row({ id: "c1", full_name: "A", email: "Shared@BBMP.gov.in" }),
      row({ id: "c2", full_name: "B", email: "shared@bbmp.gov.in" }),
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]!.email).toBe("shared@bbmp.gov.in");
    expect(options[0]!.officers).toHaveLength(2);
  });

  it("drops unusable addresses instead of rendering a broken option", () => {
    const options = merge([
      row({ id: "c1", full_name: "Good", email: "ok@bbmp.gov.in" }),
      row({ id: "c2", full_name: "Blank", email: "   " }),
      row({ id: "c3", full_name: "Null", email: null }),
      row({ id: "c4", full_name: "Broken", email: "not-an-email" }),
    ]);
    expect(options.map((o) => o.email)).toEqual(["ok@bbmp.gov.in"]);
  });

  it("copes with a missing name rather than rendering nothing", () => {
    const [o] = merge([row({ id: "c1", full_name: null, official_title: null, email: "a@bbmp.gov.in" })]);
    expect(o!.label).toBe("(unnamed)");
  });

  it("surfaces a non-Active status as the note", () => {
    const [o] = merge([row({ id: "c1", full_name: "X", email: "a@bbmp.gov.in", officer_status: "Transferred" })]);
    expect(o!.note).toBe("Transferred");
  });

  it("returns nothing for an empty directory without throwing", () => {
    expect(merge([])).toEqual([]);
  });
});
