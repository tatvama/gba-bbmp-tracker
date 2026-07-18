import { describe, it, expect } from "vitest";
import {
  buildWardIndex,
  contactMatchesHierarchy,
} from "@/lib/contacts/filter-hierarchy";
import type { ContactWithRelations } from "@/lib/types";

// Master hierarchy: two divisions, each with one sub-division and two wards.
const WARDS = [
  { new_no: 62, division: { name: "East Division" }, eng_subdivision: { name: "East Sub-1" } },
  { new_no: 63, division: { name: "East Division" }, eng_subdivision: { name: "East Sub-1" } },
  { new_no: 93, division: { name: "West Division" }, eng_subdivision: { name: "West Sub-1" } },
  { new_no: 110, division: { name: "West Division" }, eng_subdivision: { name: "West Sub-1" } },
];
const idx = buildWardIndex(WARDS);

// An ENGINEER: attached at a sub-division FK, no ward jurisdictions.
const engineer = {
  division: { name: "East Division" },
  eng_subdivision: { name: "East Sub-1" },
  jurisdictions: [],
} as unknown as ContactWithRelations;

// An ARO OFFICER: no division/sub-division FK, only ward jurisdictions.
const aro = {
  division: null,
  eng_subdivision: null,
  jurisdictions: [
    { ward_no: 93, ward_name: "Vasanthnagar" },
    { ward_no: 110, ward_name: "Sampangiramnagar" },
  ],
} as unknown as ContactWithRelations;

const ALL = { division: "all", subDivision: "all", ward: "all" };

describe("buildWardIndex", () => {
  it("maps ward new_no to its division + sub-division", () => {
    expect(idx.get(93)).toEqual({ division: "West Division", subDivision: "West Sub-1" });
    expect(idx.get(62)).toEqual({ division: "East Division", subDivision: "East Sub-1" });
  });
  it("skips wards with a null new_no", () => {
    const m = buildWardIndex([{ new_no: null, division: { name: "X" }, eng_subdivision: null }]);
    expect(m.size).toBe(0);
  });
});

describe("contactMatchesHierarchy — no filters", () => {
  it("matches every contact when all dimensions are 'all'", () => {
    expect(contactMatchesHierarchy(engineer, ALL, idx)).toBe(true);
    expect(contactMatchesHierarchy(aro, ALL, idx)).toBe(true);
  });
});

describe("contactMatchesHierarchy — engineer (FK path)", () => {
  it("matches its own division", () => {
    expect(contactMatchesHierarchy(engineer, { ...ALL, division: "East Division" }, idx)).toBe(true);
    expect(contactMatchesHierarchy(engineer, { ...ALL, division: "West Division" }, idx)).toBe(false);
  });
  it("matches its own sub-division", () => {
    expect(contactMatchesHierarchy(engineer, { ...ALL, subDivision: "East Sub-1" }, idx)).toBe(true);
    expect(contactMatchesHierarchy(engineer, { ...ALL, subDivision: "West Sub-1" }, idx)).toBe(false);
  });
  it("covers every ward under its sub-division", () => {
    // wards 62 & 63 both sit under East Sub-1
    expect(contactMatchesHierarchy(engineer, { ...ALL, ward: "62" }, idx)).toBe(true);
    expect(contactMatchesHierarchy(engineer, { ...ALL, ward: "63" }, idx)).toBe(true);
    // ward 93 is under West Sub-1 — not covered
    expect(contactMatchesHierarchy(engineer, { ...ALL, ward: "93" }, idx)).toBe(false);
  });
});

describe("contactMatchesHierarchy — ARO officer (jurisdiction path)", () => {
  it("matches a ward it explicitly covers", () => {
    expect(contactMatchesHierarchy(aro, { ...ALL, ward: "93" }, idx)).toBe(true);
    expect(contactMatchesHierarchy(aro, { ...ALL, ward: "110" }, idx)).toBe(true);
    expect(contactMatchesHierarchy(aro, { ...ALL, ward: "62" }, idx)).toBe(false);
  });
  it("resolves its jurisdiction wards up to their division", () => {
    // wards 93/110 belong to West Division
    expect(contactMatchesHierarchy(aro, { ...ALL, division: "West Division" }, idx)).toBe(true);
    expect(contactMatchesHierarchy(aro, { ...ALL, division: "East Division" }, idx)).toBe(false);
  });
  it("resolves its jurisdiction wards up to their sub-division", () => {
    expect(contactMatchesHierarchy(aro, { ...ALL, subDivision: "West Sub-1" }, idx)).toBe(true);
    expect(contactMatchesHierarchy(aro, { ...ALL, subDivision: "East Sub-1" }, idx)).toBe(false);
  });
});

describe("contactMatchesHierarchy — combined dimensions (AND)", () => {
  it("requires the full drill-down path to match the ARO", () => {
    expect(
      contactMatchesHierarchy(aro, { division: "West Division", subDivision: "West Sub-1", ward: "93" }, idx),
    ).toBe(true);
    // right division, wrong ward within it
    expect(
      contactMatchesHierarchy(aro, { division: "West Division", subDivision: "West Sub-1", ward: "62" }, idx),
    ).toBe(false);
  });
  it("excludes a contact with no location signal at all once a filter is set", () => {
    const orphan = { division: null, eng_subdivision: null, jurisdictions: [] } as unknown as ContactWithRelations;
    expect(contactMatchesHierarchy(orphan, { ...ALL, division: "East Division" }, idx)).toBe(false);
    expect(contactMatchesHierarchy(orphan, ALL, idx)).toBe(true);
  });
});
