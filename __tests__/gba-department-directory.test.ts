import { describe, it, expect } from "vitest";
import {
  buildDepartmentDirectoryPlan,
  GBA_DEPARTMENT_DIRECTORY_SOURCE,
  GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE,
} from "@/lib/contacts/gba-department-directory";
import { GBA_AUTHORITY_SOURCE } from "@/lib/contacts/gba-authorities";

/**
 * This module has no parameters — it is tied to two specific data files
 * (data/gba-department-directory.json + the addendum), so testing it means
 * pinning its actual reconciliation decisions against that real data, the same
 * way __tests__/contact-filter-hierarchy.test.ts pins real BBMP-225 shapes.
 *
 * The one invariant that matters most: the user was explicit that nothing here
 * may create a duplicate contact for an official already in the system. Every
 * assertion below traces back to that.
 */
const plan = buildDepartmentDirectoryPlan();

describe("buildDepartmentDirectoryPlan — never duplicates an existing GBA_AUTHORITIES contact", () => {
  it("enriches all reconcilable authorities via UPDATE, never INSERT", () => {
    const authorityUpdates = plan.updates.filter(
      (u) => "source" in u.matchBy && u.matchBy.source === GBA_AUTHORITY_SOURCE,
    );
    const designations = authorityUpdates.map((u) => ("source" in u.matchBy ? u.matchBy.designation : ""));
    expect(designations).toContain("Chief Commissioner");
    expect(designations).toContain("Chief Minister");
    expect(designations).toContain("Lokayukta");
    expect(designations).toContain("Principal Secretary"); // matched by its OLD designation, corrected via patch

    // None of the 6 known overlaps should ALSO appear as a bare insert under
    // the official source — that would be the exact duplicate the user rejected.
    const insertedFullNames = plan.inserts.filter((i) => i.source === GBA_DEPARTMENT_DIRECTORY_SOURCE).map((i) => i.full_name);
    expect(insertedFullNames.some((n) => /Maheshwara Rao|Maheshwar Rao/i.test(n))).toBe(false);
    expect(insertedFullNames.some((n) => /Shivakumar/i.test(n))).toBe(false);
  });

  it("retires (never deletes) the ACB contact instead of enriching it with a defunct address", () => {
    expect(plan.deactivations).toHaveLength(1);
    const d = plan.deactivations[0]!;
    expect(d.matchBy).toEqual({ source: GBA_AUTHORITY_SOURCE, designation: "Director / ADGP" });
    expect(d.reason).toMatch(/abolished/i);
    // And does NOT also enrich that same contact with the (nonexistent) live ACB address.
    expect(plan.updates.some((u) => "designation" in u.matchBy && u.matchBy.designation === "Director / ADGP")).toBe(false);
  });

  it("inserts the Lokayukta Police ADGP as the office that actually replaced the ACB", () => {
    const adgp = plan.inserts.find((i) => i.designation === "Additional Director General of Police");
    expect(adgp).toBeDefined();
    expect(adgp!.email).toBe("kla-adg@nic.in");
  });

  it("splits the corrected 'Principal Secretary' UDD post into ACS (update) + Secretary (new insert)", () => {
    const acsUpdate = plan.updates.find((u) => "designation" in u.matchBy && u.matchBy.designation === "Principal Secretary");
    expect(acsUpdate!.patch.email).toBe("asc-ud@karnataka.gov.in");
    const secretaryInsert = plan.inserts.find((i) => i.designation === "Secretary" && i.department === "Urban Development Department");
    expect(secretaryInsert).toBeDefined();
    expect(secretaryInsert!.email).toBe("secy-ud@karnataka.gov.in");
  });
});

describe("buildDepartmentDirectoryPlan — addendum reconciliation", () => {
  it("never bare-inserts an addendum entry the JSON itself flags as a near-duplicate", () => {
    const addendumInserts = plan.inserts.filter((i) => i.source === GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE);
    const emails = addendumInserts.map((i) => i.email);
    // These are exactly the entries carrying reconciliation.type "near_duplicate"
    // in the addendum JSON — they must be updates (alternates), not inserts.
    for (const dup of ["cemajorroads@bbmp.gov.in", "ceprojects@bbmp.gov.in", "jcyelahanka@bbmp.gov.in", "zc-east@bbmp.gov.in"]) {
      expect(emails, dup).not.toContain(dup);
    }
  });

  it("records each near-duplicate as an alternate-email note on the OFFICIAL email, not a new row", () => {
    const cemajroad = plan.updates.find((u) => "email" in u.matchBy && u.matchBy.email === "cemajroad@bbmp.gov.in");
    expect(cemajroad).toBeDefined();
    expect(cemajroad!.patch.internal_notes).toContain("cemajorroads@bbmp.gov.in");
  });

  it("surfaces a genuine factual conflict for manual review instead of deciding it in code", () => {
    const emails = plan.needsReview.map((r) => r.email);
    expect(emails).toContain("ceelectrical@bbmp.gov.in");
    expect(emails).toContain("ceinfrastructure@bbmp.gov.in");
    // And a conflict must NOT also silently become an insert or a blind update.
    expect(plan.inserts.some((i) => i.email === "ceelectrical@bbmp.gov.in")).toBe(false);
  });

  it("inserts a genuinely new addendum entry with no official analog", () => {
    const spcommadmin = plan.inserts.find((i) => i.email === "spcommadmin@bbmp.gov.in");
    expect(spcommadmin).toBeDefined();
    expect(spcommadmin!.source).toBe(GBA_DEPARTMENT_DIRECTORY_ADDENDUM_SOURCE);
    expect(spcommadmin!.confidence_score).toBe("MEDIUM");
  });

  it("resolves a zone DC contact's corporation via the addendum's own corporationCode field", () => {
    const dcsouth = plan.inserts.find((i) => i.email === "dcsouth@bbmp.gov.in");
    expect(dcsouth!.corporation_code).toBe("DAKSHINA");
  });
});

describe("buildDepartmentDirectoryPlan — zone/corporation inserts", () => {
  it("inserts all 5 corporation commissioners with their corporation code", () => {
    const codes = plan.inserts.filter((i) => i.designation === "Commissioner").map((i) => i.corporation_code);
    expect(new Set(codes)).toEqual(new Set(["KENDRA", "PURVA", "PASHCHIMA", "UTTARA", "DAKSHINA"]));
  });

  it("inserts all 8 legacy zone JCs, using the designation itself as full_name (no personal name on record)", () => {
    const zoneInserts = plan.inserts.filter((i) => i.office_type === "Zone Office" && i.designation.startsWith("Joint Commissioner"));
    expect(zoneInserts).toHaveLength(8);
    for (const z of zoneInserts) expect(z.full_name).toContain("Joint Commissioner");
  });

  it("leaves corporation_code null for a zone straddling two corporations, rather than guessing", () => {
    const east = plan.inserts.find((i) => i.email === "jceast@bbmp.gov.in");
    expect(east!.corporation_code).toBeNull();
  });

  it("attributes an unambiguous zone to its corporation", () => {
    const yelahanka = plan.inserts.find((i) => i.email === "jcyel@bbmp.gov.in");
    expect(yelahanka!.corporation_code).toBe("UTTARA");
  });
});

describe("buildDepartmentDirectoryPlan — department inserts", () => {
  it("uses the designation itself as full_name when no officer name was ever published", () => {
    const swd = plan.inserts.find((i) => i.email === "ceswd@bbmp.gov.in");
    expect(swd).toBeDefined();
    expect(swd!.full_name).toBe(swd!.designation);
  });

  it("still inserts a named officer with no email on record — /contacts can gain the address later", () => {
    const noEmailButNamed = plan.inserts.filter((i) => !i.email && i.full_name !== i.designation);
    expect(noEmailButNamed.length).toBeGreaterThan(0);
  });
});

describe("buildDepartmentDirectoryPlan — overall integrity", () => {
  it("produces no duplicate email across the insert set (shared mailboxes are a merge-time concern, not an import-time one)", () => {
    // jdtp@bbmp.gov.in legitimately appears twice — two named officers sharing
    // one Town Planning mailbox, the same real-world shape mergeRecipientOptions
    // already handles at read time. Assert that specific, known case rather than
    // a blanket uniqueness rule.
    const emails = plan.inserts.map((i) => i.email).filter((e): e is string => !!e);
    const counts = new Map<string, number>();
    for (const e of emails) counts.set(e, (counts.get(e) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1);
    expect(dupes).toEqual([["jdtp@bbmp.gov.in", 2]]);
  });

  it("every insert has a non-empty full_name (contacts.full_name is NOT NULL)", () => {
    for (const i of plan.inserts) expect(i.full_name.trim().length).toBeGreaterThan(0);
  });

  it("is deterministic — building the plan twice yields the same counts", () => {
    const again = buildDepartmentDirectoryPlan();
    expect(again.inserts.length).toBe(plan.inserts.length);
    expect(again.updates.length).toBe(plan.updates.length);
    expect(again.deactivations.length).toBe(plan.deactivations.length);
    expect(again.needsReview.length).toBe(plan.needsReview.length);
  });
});
