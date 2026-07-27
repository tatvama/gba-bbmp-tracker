import { describe, it, expect } from "vitest";
import { buildRecommendedRecipients, type JurisdictionContactRow } from "@/lib/mail/recommend-recipients";
import { buildWardIndex, type ComplaintJurisdictionScope } from "@/lib/contacts/filter-hierarchy";
import { isValidEmail } from "@/lib/mail/message";

/**
 * The multi-match gap this module exists to close: lib/distribution/
 * resolve-recipients.ts's `pool.find(...)` picks only the FIRST Assistant
 * Executive Engineer it meets in a sub-division and silently drops a second.
 * buildRecommendedRecipients must surface both.
 */

const row = (over: Partial<JurisdictionContactRow> & { id: string }): JurisdictionContactRow => ({
  full_name: "Someone",
  official_title: null,
  designation: null,
  email: `${over.id}@bbmp.gov.in`,
  officer_status: "Active",
  role_level: null,
  corporation_id: null,
  division_id: null,
  eng_subdivision_id: null,
  jurisdictions: [],
  ...over,
});

const SCOPE_SOUTH = { corporationId: "corp-south", divisionId: "div-south-1", engSubdivisionId: "sub-south-1a" };

const WARD_INDEX = buildWardIndex([
  { new_no: 200, division: { id: "div-south-1", name: "South Division 1" }, eng_subdivision: { id: "sub-south-1a", name: "South Sub 1A" } },
]);

const build = (rows: JurisdictionContactRow[], scope: ComplaintJurisdictionScope = SCOPE_SOUTH, suggested: string | null = null) =>
  buildRecommendedRecipients(rows, scope, WARD_INDEX, isValidEmail, suggested);

describe("buildRecommendedRecipients — the multi-match gap resolve-recipients.ts has", () => {
  it("surfaces BOTH Assistant Executive Engineers in one sub-division, not just the first", () => {
    const rows = [
      row({ id: "aee-1", full_name: "Sri A", designation: "Assistant Executive Engineer", eng_subdivision_id: "sub-south-1a" }),
      row({ id: "aee-2", full_name: "Sri B", designation: "Assistant Executive Engineer", eng_subdivision_id: "sub-south-1a" }),
    ];
    const out = build(rows);
    expect(out.map((o) => o.email).sort()).toEqual(["aee-1@bbmp.gov.in", "aee-2@bbmp.gov.in"]);
    for (const o of out) {
      expect(o.reasons.some((r) => r.kind === "role_subdivision" && r.label === "Assistant Executive Engineer — Sub-Division Level")).toBe(true);
    }
  });
});

describe("buildRecommendedRecipients — scoping", () => {
  it("excludes a contact from a different division entirely", () => {
    const rows = [row({ id: "other", division_id: "div-north-1" })];
    expect(build(rows)).toEqual([]);
  });

  it("matches via the corporation FK and labels it at zone level using a curated role", () => {
    const rows = [row({ id: "zc", full_name: "Sri Commissioner", designation: "Commissioner", corporation_id: "corp-south" })];
    const out = build(rows);
    expect(out[0]!.reasons[0]).toMatchObject({ kind: "role_zone", label: "Zonal Commissioner — Zone Level" });
  });

  it("matches via division FK and labels it using the curated Executive Engineer role", () => {
    const rows = [row({ id: "ee", full_name: "Sri EE", designation: "Executive Engineer", division_id: "div-south-1" })];
    const out = build(rows);
    expect(out[0]!.reasons[0]).toMatchObject({ kind: "role_division", label: "Executive Engineer — Division Level" });
  });

  it("falls back to a GENERIC label for an in-scope contact whose designation matches no curated role", () => {
    const rows = [row({ id: "clerk", full_name: "Sri Clerk", designation: "Revenue Inspector", division_id: "div-south-1" })];
    const out = build(rows);
    expect(out[0]!.reasons[0]).toMatchObject({ kind: "generic_division", label: "Revenue Inspector — Division Level" });
  });

  it("a contact matching by ward jurisdiction (no FK at all) gets the fixed ward-officer label", () => {
    const rows = [row({ id: "aro", full_name: "Sri ARO", jurisdictions: [{ ward_no: 200 }] })];
    const out = build(rows);
    expect(out[0]!.reasons).toEqual([{ kind: "ward_officer", label: "Ward-responsible officer", contactId: "aro" }]);
  });

  it("reports BOTH reasons when a contact matches via its own FK and a ward row", () => {
    const rows = [
      row({ id: "both", designation: "Executive Engineer", division_id: "div-south-1", jurisdictions: [{ ward_no: 200 }] }),
    ];
    const out = build(rows);
    const kinds = out[0]!.reasons.map((r) => r.kind);
    expect(kinds).toContain("role_division");
    expect(kinds).toContain("ward_officer");
  });
});

describe("buildRecommendedRecipients — the assigned officer is first-class, not a special case of jurisdiction", () => {
  it("splices in the suggested officer even when their own jurisdiction match failed", () => {
    // Assigned engineer from OUTSIDE this complaint's own sub-division.
    const rows = [row({ id: "assigned", full_name: "Sri Assigned", division_id: "div-north-1" })];
    const out = build(rows, SCOPE_SOUTH, "assigned");
    expect(out).toHaveLength(1);
    expect(out[0]!.reasons).toEqual([{ kind: "assigned", label: "Assigned to this case", contactId: "assigned" }]);
  });

  it("tags 'assigned' ALONGSIDE an independent jurisdiction match when both apply", () => {
    const rows = [row({ id: "both", designation: "Executive Engineer", division_id: "div-south-1" })];
    const out = build(rows, SCOPE_SOUTH, "both");
    expect(out[0]!.reasons[0]).toMatchObject({ kind: "assigned" });
    expect(out[0]!.reasons.some((r) => r.kind === "role_division")).toBe(true);
  });

  it("marks the suggested option's `suggested` flag via the existing mergeRecipientOptions contract", () => {
    const rows = [row({ id: "assigned", division_id: "div-south-1" })];
    const out = build(rows, SCOPE_SOUTH, "assigned");
    expect(out[0]!.suggested).toBe(true);
  });
});

describe("buildRecommendedRecipients — shared mailbox (reuses mergeRecipientOptions unchanged)", () => {
  it("merges two in-scope officers sharing one address into one option, and unions their reasons", () => {
    const rows = [
      row({ id: "share-1", full_name: "Sri A", designation: "Assistant Executive Engineer", email: "shared@bbmp.gov.in", eng_subdivision_id: "sub-south-1a" }),
      row({ id: "share-2", full_name: "Sri B", designation: "Revenue Inspector", email: "shared@bbmp.gov.in", division_id: "div-south-1" }),
    ];
    const out = build(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.officers).toHaveLength(2);
    // Attribution stays null for an ambiguous shared mailbox — same as
    // mergeRecipientOptions's existing, live-verified contract.
    expect(out[0]!.contactId).toBeNull();
    const kinds = out[0]!.reasons.map((r) => r.kind);
    expect(kinds).toContain("role_subdivision");
    expect(kinds).toContain("generic_division");
  });

  it("does not duplicate an identical reason when both sharers independently match the same way", () => {
    const rows = [
      row({ id: "s1", designation: "Executive Engineer", email: "dup@bbmp.gov.in", division_id: "div-south-1" }),
      row({ id: "s2", designation: "Executive Engineer", email: "dup@bbmp.gov.in", division_id: "div-south-1" }),
    ];
    const out = build(rows);
    expect(out[0]!.reasons).toHaveLength(1);
  });
});

describe("buildRecommendedRecipients — never throws on messy real-world rows", () => {
  it("skips a row with no usable email even if it's otherwise in scope", () => {
    const rows = [row({ id: "no-email", email: null, division_id: "div-south-1" })];
    expect(build(rows)).toEqual([]);
  });

  it("copes with an empty scope (a complaint with no division/corporation on record) by recommending nobody", () => {
    const rows = [row({ id: "x", division_id: "div-south-1" })];
    expect(build(rows, { corporationId: null, divisionId: null, engSubdivisionId: null })).toEqual([]);
  });

  it("returns [] for an empty contact list", () => {
    expect(build([])).toEqual([]);
  });
});
