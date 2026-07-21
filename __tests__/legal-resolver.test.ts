import { describe, it, expect } from "vitest";
import { resolveLegalFramework, MAX_REFERENCES } from "../lib/legal/resolver";
import { buildLegalResolutionContext } from "../lib/legal/context";
import { getKnowledgeBase } from "../lib/legal/knowledge";
import type { LegalResolutionContext } from "../lib/legal/types";

function dto(partial: Partial<LegalResolutionContext>): LegalResolutionContext {
  return {
    type: "Other",
    receivingAuthority: "BBMP",
    draftKind: "followup_letter",
    hasForensicFindings: false,
    ...partial,
  };
}

const instruments = (c: Partial<LegalResolutionContext>) =>
  resolveLegalFramework(dto(c)).references.map((r) => r.reference.instrument);

describe("legal resolver — multi-factor resolution", () => {
  it("garbage → Solid Waste Management Rules 2026 + Environment (Protection) Act", () => {
    const r = resolveLegalFramework(dto({ type: "Health", description: "garbage dumping and a black spot near the park" }));
    const names = r.references.map((x) => x.reference.instrument);
    expect(names).toContain("Solid Waste Management Rules");
    expect(names).toContain("Environment (Protection) Act");
    const swm = r.references.find((x) => x.reference.instrument === "Solid Waste Management Rules");
    expect(swm?.reference.year).toBe(2026); // never the superseded 2016 rules
  });

  it("tree felling → Karnataka Preservation of Trees Act with Section 8", () => {
    const r = resolveLegalFramework(dto({ type: "Other", description: "illegal felling and cutting of avenue trees" }));
    const trees = r.references.find((x) => x.reference.instrument === "Karnataka Preservation of Trees Act");
    expect(trees).toBeTruthy();
    expect(trees?.provisions.some((p) => p.ref === "Section 8")).toBe(true);
  });

  it("illegal construction → KMC Act §321 + KTCP Act", () => {
    const names = instruments({ type: "Town Planning", description: "unauthorised construction in deviation of the sanctioned plan" });
    expect(names).toContain("Karnataka Municipal Corporations Act");
    expect(names).toContain("Karnataka Town and Country Planning Act");
    const kmc = resolveLegalFramework(dto({ type: "Town Planning", description: "unauthorised construction in deviation of the sanctioned plan" }))
      .references.find((x) => x.reference.instrument === "Karnataka Municipal Corporations Act");
    expect(kmc?.provisions.some((p) => p.ref === "Section 321")).toBe(true);
  });

  it("bribery → Prevention of Corruption Act boosted to High + Lokayukta Act", () => {
    const r = resolveLegalFramework(dto({ type: "Other", description: "the assistant engineer demanded a bribe to clear the file" }));
    const pc = r.references.find((x) => x.reference.instrument === "Prevention of Corruption Act");
    expect(pc).toBeTruthy();
    expect(pc?.effectivePriority).toBe("High"); // Medium base, boosted by the "bribe" keyword
    expect(r.references.some((x) => x.reference.instrument === "Karnataka Lokayukta Act")).toBe(true);
  });

  it("routine road complaint does NOT drag in unrelated law", () => {
    const names = instruments({ type: "Road Infrastructure", description: "the road has potholes and needs asphalting" });
    expect(names).toContain("Karnataka Municipal Corporations Act");
    expect(names).not.toContain("Prevention of Corruption Act");
    expect(names).not.toContain("Karnataka Preservation of Trees Act");
    expect(names).not.toContain("Solid Waste Management Rules");
  });
});

describe("legal resolver — authority-aware resolution", () => {
  it("a BESCOM letter carries the Electricity Act and NOT the BWSSB Act", () => {
    const names = instruments({ type: "Electrical", receivingAuthority: "BESCOM", description: "frequent power cut and transformer failure" });
    expect(names).toContain("Electricity Act");
    expect(names).not.toContain("Bangalore Water Supply and Sewerage Act");
  });

  it("a water complaint surfaces the BWSSB Act", () => {
    const names = instruments({ type: "Storm Water Drain", description: "there is no water supply and sewage is overflowing" });
    expect(names).toContain("Bangalore Water Supply and Sewerage Act");
  });

  it("a Lokayukta-addressed complaint surfaces the Karnataka Lokayukta Act", () => {
    const names = instruments({ type: "Other", receivingAuthority: "Lokayukta", description: "systemic inaction and maladministration" });
    expect(names).toContain("Karnataka Lokayukta Act");
  });
});

describe("legal resolver — filters, dedup, safety", () => {
  it("never emits a Low-confidence provision, and never an instrument outside the catalog", () => {
    const kb = getKnowledgeBase();
    const cases: Partial<LegalResolutionContext>[] = [
      { type: "Health", description: "garbage and plastic waste dumping" },
      { type: "Town Planning", description: "encroachment and unauthorised construction, bribe demanded" },
      { type: "Lakes", description: "lake encroachment and sewage discharge" },
    ];
    for (const c of cases) {
      const r = resolveLegalFramework(dto(c));
      for (const ref of r.references) {
        expect(kb.byId(ref.reference.id)).toBe(ref.reference); // in-catalog
        expect(ref.provisions.every((p) => p.confidence !== "Low")).toBe(true);
      }
    }
  });

  it("merges a multi-issue complaint into one deduped, ranked, capped set (each Act once)", () => {
    const r = resolveLegalFramework(dto({
      type: "Town Planning",
      description: "illegal construction, cutting of trees, damaged road and a bribe demanded by the officer",
    }));
    const names = r.references.map((x) => x.reference.instrument);
    expect(names).toContain("Karnataka Municipal Corporations Act");
    expect(names).toContain("Karnataka Preservation of Trees Act");
    expect(names).toContain("Prevention of Corruption Act");
    // Each instrument+year appears at most once.
    const keys = r.references.map((x) => `${x.reference.instrument}__${x.reference.year}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.references.length).toBeLessThanOrEqual(MAX_REFERENCES);
    // High-priority references rank ahead of Medium ones.
    const priorities = r.references.map((x) => x.effectivePriority);
    const firstMedium = priorities.indexOf("Medium");
    if (firstMedium !== -1) expect(priorities.slice(firstMedium).every((p) => p !== "High")).toBe(true);
  });

  it("returns an empty framework (no crash) for a contentless complaint", () => {
    const r = resolveLegalFramework(dto({ type: "IT" }));
    expect(Array.isArray(r.references)).toBe(true);
  });
});

describe("context adapter — authority derivation", () => {
  it("derives BWSSB from the responsible department", () => {
    const ctx = buildLegalResolutionContext(
      { type: "Other", responsible_department: "BWSSB", description: "no water" },
      { draftKind: "followup_letter", hasForensicFindings: false },
    );
    expect(ctx.receivingAuthority).toBe("BWSSB");
  });

  it("routes a Lokayukta complaint kind to the Lokayukta authority", () => {
    const ctx = buildLegalResolutionContext(
      { type: "Other" },
      { draftKind: "lokayukta_complaint", hasForensicFindings: false },
    );
    expect(ctx.receivingAuthority).toBe("Lokayukta");
  });

  it("defaults to BBMP", () => {
    const ctx = buildLegalResolutionContext(
      { type: "Road Infrastructure" },
      { draftKind: "followup_letter", hasForensicFindings: false },
    );
    expect(ctx.receivingAuthority).toBe("BBMP");
  });
});
