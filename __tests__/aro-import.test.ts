import { describe, it, expect } from "vitest";
import {
  parseOfficerName,
  normalizeEmail,
  normalizePhone,
  aroOfficerToContactRow,
  aroOfficerToJurisdictions,
  officerDedupeKey,
  type AroOfficer,
} from "../lib/contacts/aro-import";
import { buildOfficerRecipient, officerDisplayName, wardLabel } from "../lib/contacts/officer-recipient";
import type { Contact, ContactJurisdiction } from "../lib/types";

describe("parseOfficerName", () => {
  it("extracts an honorific and title-cases the name", () => {
    expect(parseOfficerName("SMT.JYOTHILAKSHMI.S")).toEqual({ title: "Smt", name: expect.stringMatching(/Jyothilakshmi/i) });
    expect(parseOfficerName("Sri Nataraj")).toEqual({ title: "Sri", name: "Nataraj" });
  });
  it("keeps initials upper and has no title when none is present", () => {
    expect(parseOfficerName("K SRINIVASAIAH")).toEqual({ title: null, name: "K Srinivasaiah" });
    expect(parseOfficerName("Satish K R")).toEqual({ title: null, name: "Satish K R" });
  });
  it("handles trailing/spaced dots", () => {
    expect(parseOfficerName("Venkatappa. D").name).toMatch(/^Venkatappa/);
    expect(parseOfficerName("Venkatappa. D").title).toBeNull();
  });
});

describe("normalizeEmail / normalizePhone", () => {
  it("strips internal whitespace and lowercases email", () => {
    expect(normalizeEmail("arohalsubzone @gmail.com")).toBe("arohalsubzone@gmail.com");
    expect(normalizeEmail("ARO.WhiteField@Gmail.com")).toBe("aro.whitefield@gmail.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
  });
  it("reduces phone to 10 digits", () => {
    expect(normalizePhone("9844753625")).toBe("9844753625");
    expect(normalizePhone("+91 98447 53625")).toBe("9844753625");
  });
});

const OFFICER: AroOfficer = {
  zone: "Mahadevapura",
  aroOfficeDivision: "K.R.PURAM",
  officer: "Satish K R",
  mobile: "9844753625",
  email: "arokrpura.bbmp@gmail.com",
  address: "K.R. Puram Old CMC Office, Old Madras Road, K.R. Puram, Bangalore",
  wards: [
    { wardNo: 55, wardName: "Devasandra" },
    { wardNo: 52, wardName: "K.R.Puram" },
    { wardNo: 53, wardName: "Basavanapura" },
  ],
};

describe("aroOfficerToContactRow", () => {
  const row = aroOfficerToContactRow(OFFICER);
  it("maps ARO identity + classification", () => {
    expect(row.full_name).toBe("Satish K R");
    expect(row.designation).toBe("Assistant Revenue Officer");
    expect(row.department).toBe("Revenue Department");
    expect(row.designation_category).toBe("Revenue");
    expect(row.office_type).toBe("ARO Office");
    expect(row.office_name).toBe("BBMP ARO Office, K.R.Puram");
    expect(row.zone).toBe("Mahadevapura");
  });
  it("uses phone as whatsapp when no separate whatsapp exists (spec)", () => {
    expect(row.phone).toBe("9844753625");
    expect(row.whatsapp).toBe("9844753625");
  });
  it("sets audit + workflow defaults and lists all wards in jurisdiction_notes", () => {
    expect(row.verification_status).toBe("PENDING");
    expect(row.confidence_score).toBe("LOW");
    expect(row.can_receive_complaint).toBe(true);
    expect(row.can_receive_tvcc_notice).toBe(false);
    expect(row.jurisdiction_notes).toContain("55 - Devasandra");
    expect(row.jurisdiction_notes).toContain("53 - Basavanapura");
    expect(row.source).toMatch(/ARO Directory/i);
  });
});

describe("aroOfficerToJurisdictions", () => {
  it("emits one row per ward, first is primary", () => {
    const jurs = aroOfficerToJurisdictions(OFFICER);
    expect(jurs).toHaveLength(3);
    expect(jurs.map((j) => j.ward_no)).toEqual([55, 52, 53]);
    expect(jurs[0]!.is_primary).toBe(true);
    expect(jurs[1]!.is_primary).toBe(false);
    expect(jurs.every((j) => j.zone === "Mahadevapura" && j.jurisdiction_type === "ward")).toBe(true);
  });
  it("officerDedupeKey is the 10-digit mobile", () => {
    expect(officerDedupeKey(OFFICER)).toBe("9844753625");
  });
});

describe("buildOfficerRecipient (AI drafting)", () => {
  const contact = {
    full_name: "Nataraj",
    official_title: "Sri",
    designation: "Assistant Revenue Officer",
    office_name: "BBMP ARO Office, K.R.Puram",
    office_address: "Old CMC Office, K.R. Puram, Bangalore",
    zone: "Mahadevapura",
    phone: "9844753625",
    email: "arokrpura.bbmp@gmail.com",
    letter_salutation: null,
  } as unknown as Contact;
  const jur = { ward_no: 52, ward_name: "K.R.Puram", zone: "Mahadevapura" } as unknown as ContactJurisdiction;

  it("builds the display name from title + name", () => {
    expect(officerDisplayName(contact)).toBe("Sri Nataraj");
    expect(wardLabel(jur)).toBe("52 - K.R.Puram");
  });
  it("produces a postal block, ward, and a default salutation", () => {
    const r = buildOfficerRecipient(contact, jur);
    expect(r.name).toBe("Sri Nataraj");
    expect(r.salutation).toBe("Respected Sir / Madam");
    expect(r.ward).toBe("52 - K.R.Puram");
    expect(r.postalBlock[0]).toBe("The Assistant Revenue Officer");
    expect(r.postalBlock).toContain("Sri Nataraj");
    expect(r.postalBlock.some((l) => l.includes("Ward 52 - K.R.Puram"))).toBe(true);
    expect(r.postalBlock[r.postalBlock.length - 1]).toMatch(/BBMP/);
  });
});
