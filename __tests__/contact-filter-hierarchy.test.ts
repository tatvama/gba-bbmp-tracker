import { describe, it, expect } from "vitest";
import {
  buildWardIndex,
  contactMatchesHierarchy,
  contactMatchesJurisdictionIds,
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
    expect(idx.get(93)).toEqual({ division: "West Division", subDivision: "West Sub-1", divisionId: null, subDivisionId: null });
    expect(idx.get(62)).toEqual({ division: "East Division", subDivision: "East Sub-1", divisionId: null, subDivisionId: null });
  });
  it("skips wards with a null new_no", () => {
    const m = buildWardIndex([{ new_no: null, division: { name: "X" }, eng_subdivision: null }]);
    expect(m.size).toBe(0);
  });
  it("captures ids too, when the embed carries them (additive)", () => {
    const m = buildWardIndex([{ new_no: 1, division: { id: "div-1", name: "X" }, eng_subdivision: { id: "sub-1", name: "Y" } }]);
    expect(m.get(1)).toEqual({ division: "X", subDivision: "Y", divisionId: "div-1", subDivisionId: "sub-1" });
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

// ── ID-keyed sibling, for matching a real complaint's FKs ──────────────────

const WARDS_WITH_IDS = [
  { new_no: 62, division: { id: "div-east", name: "East Division" }, eng_subdivision: { id: "sub-east-1", name: "East Sub-1" } },
  { new_no: 63, division: { id: "div-east", name: "East Division" }, eng_subdivision: { id: "sub-east-1", name: "East Sub-1" } },
  { new_no: 93, division: { id: "div-west", name: "West Division" }, eng_subdivision: { id: "sub-west-1", name: "West Sub-1" } },
  { new_no: 110, division: { id: "div-west", name: "West Division" }, eng_subdivision: { id: "sub-west-1", name: "West Sub-1" } },
];
const idxWithIds = buildWardIndex(WARDS_WITH_IDS);

const engineerIds = {
  corporation_id: "corp-1",
  division_id: "div-east",
  eng_subdivision_id: "sub-east-1",
  jurisdictions: [],
};
const aroIds = {
  corporation_id: null,
  division_id: null,
  eng_subdivision_id: null,
  jurisdictions: [{ ward_no: 93 }, { ward_no: 110 }],
};

describe("contactMatchesJurisdictionIds", () => {
  it("matches an engineer via their own division/subdivision/corporation FK", () => {
    const paths = contactMatchesJurisdictionIds(
      engineerIds,
      { corporationId: "corp-1", divisionId: "div-east", engSubdivisionId: "sub-east-1" },
      idxWithIds,
    );
    expect(paths).toContain("corporation_fk");
    expect(paths).toContain("division_fk");
    expect(paths).toContain("subdivision_fk");
  });

  it("returns no paths — out of scope — when the FKs don't match", () => {
    const paths = contactMatchesJurisdictionIds(
      engineerIds,
      { corporationId: "corp-2", divisionId: "div-west", engSubdivisionId: "sub-west-1" },
      idxWithIds,
    );
    expect(paths).toEqual([]);
  });

  it("matches an ARO officer with no FK via their ward jurisdiction resolving into scope", () => {
    const paths = contactMatchesJurisdictionIds(
      aroIds,
      { corporationId: null, divisionId: "div-west", engSubdivisionId: null },
      idxWithIds,
    );
    expect(paths).toEqual(["ward_jurisdiction"]);
  });

  it("an ARO officer's ward jurisdiction does NOT match a different division", () => {
    const paths = contactMatchesJurisdictionIds(
      aroIds,
      { corporationId: null, divisionId: "div-east", engSubdivisionId: null },
      idxWithIds,
    );
    expect(paths).toEqual([]);
  });

  it("reports BOTH paths when a contact matches via its own FK and a ward row", () => {
    const both = {
      corporation_id: null,
      division_id: "div-west",
      eng_subdivision_id: null,
      jurisdictions: [{ ward_no: 93 }],
    };
    const paths = contactMatchesJurisdictionIds(both, { corporationId: null, divisionId: "div-west", engSubdivisionId: null }, idxWithIds);
    expect(paths).toContain("division_fk");
    expect(paths).toContain("ward_jurisdiction");
  });

  it("ignores a ward_no with no entry in the index rather than throwing", () => {
    const unknownWard = { corporation_id: null, division_id: null, eng_subdivision_id: null, jurisdictions: [{ ward_no: 9999 }] };
    expect(contactMatchesJurisdictionIds(unknownWard, { corporationId: null, divisionId: "div-west", engSubdivisionId: null }, idxWithIds)).toEqual([]);
  });

  it("an empty scope (no complaint FKs at all) matches nobody", () => {
    expect(
      contactMatchesJurisdictionIds(engineerIds, { corporationId: null, divisionId: null, engSubdivisionId: null }, idxWithIds),
    ).toEqual([]);
  });
});
