import { describe, it, expect } from "vitest";
import { matchOfficerByDesignation, type OfficerMatchRow } from "@/lib/distribution/officer-match";

const rows: OfficerMatchRow[] = [
  { full_name: "Justice B.S. Patil", designation: "Lokayukta", office_address: "Multi-Storeyed Building, Bengaluru", officer_status: "Active" },
  { full_name: "M. Maheshwara Rao, IAS", designation: "Chief Commissioner", office_address: "Kempegowda Civic Hall", officer_status: "Active" },
  { full_name: "Old Holder", designation: "Chief Minister", office_address: "Vidhana Soudha", officer_status: "Transferred" },
  { full_name: "Sri D.K. Shivakumar", designation: "Chief Minister", office_address: "Vidhana Soudha", officer_status: "Active" },
];

describe("matchOfficerByDesignation", () => {
  it("matches a role's designation and returns name + address (office left null)", () => {
    const m = matchOfficerByDesignation(rows, ["Lokayukta"]);
    expect(m).toEqual({ name: "Justice B.S. Patil", office: null, address: "Multi-Storeyed Building, Bengaluru" });
  });

  it("is case-insensitive on designation", () => {
    expect(matchOfficerByDesignation(rows, ["lokayukta"])?.name).toBe("Justice B.S. Patil");
  });

  it("prefers an Active officer over a transferred one for the same role", () => {
    expect(matchOfficerByDesignation(rows, ["Chief Minister"])?.name).toBe("Sri D.K. Shivakumar");
  });

  it("returns null when no contact matches (role stays title-only)", () => {
    expect(matchOfficerByDesignation(rows, ["Chief Secretary"])).toBeNull();
  });

  it("returns null for an empty designation list", () => {
    expect(matchOfficerByDesignation(rows, [])).toBeNull();
  });

  it("handles a slash designation faithfully", () => {
    const acb: OfficerMatchRow[] = [
      { full_name: "ACB Karnataka", designation: "Director / ADGP", office_address: "Khanija Bhavan", officer_status: "Active" },
    ];
    expect(matchOfficerByDesignation(acb, ["Director / ADGP"])?.address).toBe("Khanija Bhavan");
  });
});
