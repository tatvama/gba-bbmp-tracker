import { describe, it, expect } from "vitest";
import {
  GBA_AUTHORITIES,
  GBA_AUTHORITY_SOURCE,
  authorityToContactRow,
  authorityDedupeKey,
} from "@/lib/contacts/gba-authorities";
import { DESIGNATIONS, OFFICIAL_TITLES, DESIGNATION_CATEGORIES, OFFICE_TYPES } from "@/lib/constants";

const byDesignation = (d: string) => GBA_AUTHORITIES.find((a) => a.designation === d)!;

describe("GBA_AUTHORITIES data integrity", () => {
  it("has the six expected authorities", () => {
    expect(GBA_AUTHORITIES).toHaveLength(6);
    expect(GBA_AUTHORITIES.map((a) => a.designation)).toEqual([
      "Chief Commissioner",
      "Minister in-charge",
      "Chief Minister",
      "Principal Secretary",
      "Lokayukta",
      "Director / ADGP",
    ]);
  });

  it("every designation exists in the DESIGNATIONS vocabulary", () => {
    for (const a of GBA_AUTHORITIES) {
      expect(DESIGNATIONS as readonly string[]).toContain(a.designation);
    }
  });

  it("every title / category / office type is a valid vocabulary value", () => {
    for (const a of GBA_AUTHORITIES) {
      if (a.officialTitle) expect(OFFICIAL_TITLES as readonly string[]).toContain(a.officialTitle);
      expect(DESIGNATION_CATEGORIES as readonly string[]).toContain(a.designationCategory);
      expect(OFFICE_TYPES as readonly string[]).toContain(a.officeType);
    }
  });

  it("every authority carries an address (letters need a postal block)", () => {
    for (const a of GBA_AUTHORITIES) expect(a.officeAddress.length).toBeGreaterThan(10);
  });

  it("dedupe keys are unique and case-normalized", () => {
    const keys = GBA_AUTHORITIES.map(authorityDedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(authorityDedupeKey({ ...byDesignation("Lokayukta") })).toBe("b.s. patil");
  });
});

describe("authorityToContactRow", () => {
  it("maps a person authority (Lokayukta) faithfully", () => {
    const row = authorityToContactRow(byDesignation("Lokayukta"));
    expect(row).toMatchObject({
      full_name: "B.S. Patil",
      official_title: "Justice",
      designation: "Lokayukta",
      designation_category: "Legal",
      office_type: "Head Office",
      letter_salutation: "Hon'ble Sir",
      verification_status: "PENDING",
      confidence_score: "HIGH",
      source: GBA_AUTHORITY_SOURCE,
      officer_status: "Active",
      jurisdiction_notes: null,
      zone: null,
    });
    expect(row.office_address).toContain("Ambedkar Veedhi");
  });

  it("applies default workflow flags (complaint/appeal/legal on, rti/tvcc off)", () => {
    const cm = authorityToContactRow(byDesignation("Chief Minister"));
    expect(cm.can_receive_complaint).toBe(true);
    expect(cm.can_receive_appeal).toBe(true);
    expect(cm.can_receive_legal_notice).toBe(true);
    expect(cm.can_receive_rti).toBe(false);
    expect(cm.can_receive_tvcc_notice).toBe(false);
  });

  it("honours per-authority canReceive overrides", () => {
    // Lokayukta: appeal off, tvcc on
    const lok = authorityToContactRow(byDesignation("Lokayukta"));
    expect(lok.can_receive_appeal).toBe(false);
    expect(lok.can_receive_tvcc_notice).toBe(true);
    // Chief Commissioner GBA: rti on, tvcc on
    const cc = authorityToContactRow(byDesignation("Chief Commissioner"));
    expect(cc.can_receive_rti).toBe(true);
    expect(cc.can_receive_tvcc_notice).toBe(true);
    // UDD: rti on (secretariat handles RTI)
    const udd = authorityToContactRow(byDesignation("Principal Secretary"));
    expect(udd.can_receive_rti).toBe(true);
  });

  it("leaves phone/email null and never carries a ward jurisdiction", () => {
    for (const a of GBA_AUTHORITIES) {
      const row = authorityToContactRow(a);
      expect(row.phone).toBeNull();
      expect(row.email).toBeNull();
      expect(row.jurisdiction_notes).toBeNull();
    }
  });

  it("preserves the IAS credential on the Chief Commissioner's name", () => {
    const cc = authorityToContactRow(byDesignation("Chief Commissioner"));
    expect(cc.full_name).toBe("M. Maheshwara Rao, IAS");
    expect(cc.official_title).toBeNull();
  });
});
