import { describe, it, expect } from "vitest";
import { mapColumns, validateRows, projectRow } from "@/lib/import-mapper";

describe("mapColumns", () => {
  it("maps a known header row (case/space/punctuation-insensitive)", () => {
    const headers = ["Officer Name", "Designation", "Mobile No.", "Email ID", "Sub Division"];
    const m = mapColumns(headers);
    expect(m.fullName).toBe(0);
    expect(m.designation).toBe(1);
    expect(m.phone).toBe(2);
    expect(m.email).toBe(3);
    expect(m.engSubDivision).toBe(4);
  });

  it("ignores unknown headers", () => {
    const m = mapColumns(["random", "name"]);
    expect(m.fullName).toBe(1);
    expect(m.designation).toBeUndefined();
  });
});

describe("validateRows", () => {
  const headers = ["Name", "Designation", "Mobile"];
  const mapping = mapColumns(headers);

  it("accepts a valid row", () => {
    const res = validateRows([["Sri Ramesh", "Assistant Engineer", "9876543210"]], mapping);
    expect(res[0]?.errors).toEqual([]);
    expect(res[0]?.data?.fullName).toBe("Sri Ramesh");
  });

  it("reports errors on a malformed row", () => {
    const res = validateRows([["", "Engineer", "123"]], mapping);
    expect(res[0]?.errors.length).toBeGreaterThan(0);
  });
});

describe("projectRow", () => {
  it("projects a row into a candidate object by mapping", () => {
    const mapping = { fullName: 0, phone: 1 } as const;
    expect(projectRow(["Anita", "9876543210"], mapping)).toEqual({
      fullName: "Anita",
      phone: "9876543210",
    });
  });
});
