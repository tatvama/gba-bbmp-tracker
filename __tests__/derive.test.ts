import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildAcNumberToCorp,
  deriveCorporation,
  deriveCorporationCode,
  acNumbers,
} from "@/lib/derive";

const corps = [
  { code: "DAKSHINA", assembly_constituencies: ["175-Bommanahalli", "176-Bengaluru South"] },
  { code: "UTTARA", assembly_constituencies: ["150-Yelahanka"] },
];
const map = buildAcNumberToCorp(corps);

describe("acNumbers", () => {
  it("extracts all AC numbers from combined strings", () => {
    expect(acNumbers("176-Bengaluru South & 177-Anekal")).toEqual(["176", "177"]);
    expect(acNumbers("150-Yelahanka")).toEqual(["150"]);
  });
});

describe("deriveCorporation", () => {
  it("maps a simple AC by number", () => {
    expect(deriveCorporationCode("175-Bommanahalli", map)).toBe("DAKSHINA");
    expect(deriveCorporationCode("150-Yelahanka", map)).toBe("UTTARA");
  });
  it("normalises a combined AC string to the single matching corp", () => {
    const r = deriveCorporation("176-Bengaluru South & 177-Anekal", map);
    expect(r.code).toBe("DAKSHINA");
    expect(r.normalisedFromCombined).toBe(true);
  });
  it("returns null for unknown AC", () => {
    expect(deriveCorporationCode("999-Nowhere", map)).toBeNull();
  });
});

// Integration test against the real data (spec §9): every ward resolves to
// exactly one corporation; total mapped = 225, unmapped = 0.
describe("real data: all 225 wards map to one corporation", () => {
  const wardsPath = join(process.cwd(), "data", "bbmp225_wards.json");
  const gbaPath = join(process.cwd(), "data", "gba_structure.json");
  const hasData = existsSync(wardsPath) && existsSync(gbaPath);

  it.runIf(hasData)("maps all 225 wards, 0 unmapped, 75 sub-divisions", () => {
    const wards = JSON.parse(readFileSync(wardsPath, "utf-8")).wards as {
      ac: string;
      eng_subdiv: string;
    }[];
    const gba = JSON.parse(readFileSync(gbaPath, "utf-8")).corporations;
    const m = buildAcNumberToCorp(gba);

    expect(wards.length).toBe(225);
    const unmapped = wards.filter((w) => deriveCorporationCode(w.ac, m) === null);
    expect(unmapped.length).toBe(0);

    const subdivs = new Set(wards.map((w) => w.eng_subdiv));
    expect(subdivs.size).toBe(75);
  });
});
