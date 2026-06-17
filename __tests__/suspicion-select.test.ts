import { describe, it, expect } from "vitest";
import { preselectSuspicions, mergeSuspicions } from "../lib/ai/suspicion-select";

describe("smart pre-select", () => {
  it("always includes the baseline set (even for an empty summary)", () => {
    const codes = preselectSuspicions("").map((m) => m.code);
    expect(codes).toContain("Q173"); // definite-loss (RED)
    expect(codes).toContain("Q76"); // MB integrity
    expect(codes).toContain("Q178"); // escalation chain
  });

  it("maps thickness + royalty + geo-tag keywords to the right sections", () => {
    const m = preselectSuspicions("BC overlay thickness looks short, no royalty challan, geo-tag photos missing");
    const codes = new Set(m.map((x) => x.code));
    expect(codes.has("Q33")).toBe(true); // billed vs actual thickness (S3)
    expect([...codes].some((c) => ["Q145", "Q146", "Q150", "Q151"].includes(c))).toBe(true); // royalty (S14)
    expect([...codes].some((c) => ["Q113", "Q114", "Q116"].includes(c))).toBe(true); // photos (S11)
  });

  it("returns no duplicate codes and sorts RED first", () => {
    const m = preselectSuspicions("125% excess quantity, duplicate fake bill");
    const codes = m.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(m[0]?.severity).toBe("RED");
  });

  it("merges AI codes without duplicates", () => {
    const base = preselectSuspicions("");
    const merged = mergeSuspicions(base, ["Q1", "Q173"]); // Q173 already in baseline
    const codes = merged.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("Q1");
  });

  it("ignores unknown codes from the AI", () => {
    const merged = mergeSuspicions([], ["Q1", "Q999", "garbage"]);
    expect(merged.map((m) => m.code)).toEqual(["Q1"]);
  });
});
