import { describe, it, expect } from "vitest";
import { readdressLetterToTvcc } from "../lib/distribution/tvcc-copy";
import {
  TVCC_OFFICES,
  TVCC_DIVISION_OPTIONS,
  tvccAddresseeBlock,
  tvccRecipientSnapshot,
  corporationCodeFromName,
  isCorporationCode,
  resolveTvccLanguage,
  mergeTvccOffices,
  tvccRecipientLines,
} from "../lib/distribution/tvcc";
import { CORPORATION_CODES } from "../lib/constants";

const LETTER = `To,
The Executive Engineer
Gottigere Sub-division
Bruhat Bengaluru Mahanagara Palike (BBMP)

Date: 2026-07-23

**Subject: Complaint regarding road work at Job No. 123**

Sir,

1. This is the first substantive point of the complaint.
2. This is the second point.

Yours faithfully,
Raghav Gowda`;

describe("tvcc address directory", () => {
  it("has all five GBA corporations", () => {
    for (const code of CORPORATION_CODES) {
      expect(TVCC_OFFICES[code]).toBeTruthy();
      expect(TVCC_OFFICES[code].addressLinesEn.length).toBeGreaterThan(0);
      expect(TVCC_OFFICES[code].addressLinesKn.length).toBeGreaterThan(0);
    }
    expect(TVCC_DIVISION_OPTIONS).toHaveLength(5);
  });

  it("builds an English addressee block with designation + corporation + PIN", () => {
    const block = tvccAddresseeBlock(TVCC_OFFICES.DAKSHINA);
    expect(block.startsWith("To,")).toBe(true);
    expect(block).toContain("The Executive Engineer");
    expect(block).toContain("Technical Vigilance & Control Cell (T.V.C.C.)");
    expect(block).toContain("Bengaluru South City Corporation");
    expect(block).toContain("560068");
  });

  it("builds a Kannada addressee block when asked", () => {
    const block = tvccAddresseeBlock(TVCC_OFFICES.UTTARA, "kn");
    expect(block.startsWith("ಗೆ,")).toBe(true);
    expect(block).toContain("ಕಾರ್ಯಪಾಲಕ ಅಭಿಯಂತರರು");
    expect(block).toContain("ಟಿ.ವಿ.ಸಿ.ಸಿ.");
    expect(block).toContain("560092");
  });

  it("every division renders a non-empty, distinct block", () => {
    const blocks = CORPORATION_CODES.map((c) => tvccAddresseeBlock(TVCC_OFFICES[c]));
    expect(new Set(blocks).size).toBe(CORPORATION_CODES.length);
  });

  it("resolves DraftLanguage names + short codes to a block mode", () => {
    expect(resolveTvccLanguage("English")).toBe("en");
    expect(resolveTvccLanguage("Kannada")).toBe("kn");
    expect(resolveTvccLanguage("kn")).toBe("kn");
    expect(resolveTvccLanguage("Bilingual")).toBe("both");
    expect(resolveTvccLanguage(undefined)).toBe("en");
  });

  it("bilingual block carries BOTH English and Kannada addressees", () => {
    const block = tvccAddresseeBlock(TVCC_OFFICES.DAKSHINA, "Bilingual");
    expect(block).toContain("The Executive Engineer");
    expect(block).toContain("Bengaluru South City Corporation");
    expect(block).toContain("ಕಾರ್ಯಪಾಲಕ ಅಭಿಯಂತರರು");
    expect(block).toContain("ಟಿ.ವಿ.ಸಿ.ಸಿ.");
    expect(block.startsWith("To,")).toBe(true);
  });

  it("recipient lines (for the AI recipientOverride) have no 'To,' prefix", () => {
    const lines = tvccRecipientLines(TVCC_OFFICES.DAKSHINA);
    expect(lines[0]).toBe("The Executive Engineer");
    expect(lines.some((l) => /^To,?$/i.test(l))).toBe(false);
    expect(lines).toContain("Technical Vigilance & Control Cell (T.V.C.C.)");
    expect(lines[lines.length - 1]).toContain("560068");
  });

  it("snapshot carries designation, office and address", () => {
    const snap = tvccRecipientSnapshot(TVCC_OFFICES.KENDRA);
    expect(snap.designation).toContain("Executive Engineer");
    expect(snap.office).toContain("Bengaluru Central");
    expect(snap.address).toContain("560001");
    expect(snap.name).toBeNull();
  });

  it("maps corporation display names to codes", () => {
    expect(corporationCodeFromName("Bengaluru South")).toBe("DAKSHINA");
    expect(corporationCodeFromName("bengaluru north")).toBe("UTTARA");
    expect(corporationCodeFromName("Bengaluru Central")).toBe("KENDRA");
    expect(corporationCodeFromName("Somewhere Else")).toBeNull();
    expect(corporationCodeFromName(null)).toBeNull();
  });

  it("guards corporation codes", () => {
    expect(isCorporationCode("DAKSHINA")).toBe(true);
    expect(isCorporationCode("nope")).toBe(false);
    expect(isCorporationCode(null)).toBe(false);
  });
});

describe("mergeTvccOffices (saved edits over seed)", () => {
  it("returns the seed for every division when nothing is saved", () => {
    const merged = mergeTvccOffices();
    for (const code of CORPORATION_CODES) {
      expect(merged[code].addressLinesEn).toEqual(TVCC_OFFICES[code].addressLinesEn);
      expect(merged[code].addressLinesKn).toEqual(TVCC_OFFICES[code].addressLinesKn);
    }
  });

  it("overlays a saved English address for one division, leaving others on the seed", () => {
    const merged = mergeTvccOffices({ DAKSHINA: { addressLinesEn: ["New Line 1,", "New Line 2 - 560000."] } });
    expect(merged.DAKSHINA.addressLinesEn).toEqual(["New Line 1,", "New Line 2 - 560000."]);
    // Kannada untouched → seed; other divisions untouched → seed.
    expect(merged.DAKSHINA.addressLinesKn).toEqual(TVCC_OFFICES.DAKSHINA.addressLinesKn);
    expect(merged.UTTARA.addressLinesEn).toEqual(TVCC_OFFICES.UTTARA.addressLinesEn);
  });

  it("falls back to the seed when a saved address is all-empty / blank", () => {
    const merged = mergeTvccOffices({ KENDRA: { addressLinesEn: ["", "   "] } });
    expect(merged.KENDRA.addressLinesEn).toEqual(TVCC_OFFICES.KENDRA.addressLinesEn);
  });
});

describe("readdressLetterToTvcc", () => {
  const toBlock = tvccAddresseeBlock(TVCC_OFFICES.DAKSHINA);

  it("replaces the top To block, keeping Date, Subject, body and signature", () => {
    const { content, readdressed } = readdressLetterToTvcc(LETTER, toBlock);
    expect(readdressed).toBe(true);
    // New addressee present…
    expect(content).toContain("Technical Vigilance & Control Cell (T.V.C.C.)");
    expect(content).toContain("Bengaluru South City Corporation");
    // …old addressee gone…
    expect(content).not.toContain("Gottigere Sub-division");
    // …everything from Date onward preserved.
    expect(content).toContain("Date: 2026-07-23");
    expect(content).toContain("**Subject: Complaint regarding road work at Job No. 123**");
    expect(content).toContain("1. This is the first substantive point of the complaint.");
    expect(content).toContain("Yours faithfully,");
    expect(content).toContain("Raghav Gowda");
    // The new To block sits at the very top.
    expect(content.startsWith("To,")).toBe(true);
  });

  it("keeps the body's signature block (From at the bottom) untouched", () => {
    const { content } = readdressLetterToTvcc(LETTER, toBlock);
    // Only one 'To,' (the top addressee) — no duplicate.
    const toCount = content.split("\n").filter((l) => /^\s*To\b/i.test(l)).length;
    expect(toCount).toBe(1);
  });

  it("inserts the addressee above the Subject when no To block is found", () => {
    const noTo = `**Subject: Road work at Job No. 9**\n\nSir,\n\n1. Body point.\n\nYours faithfully,\nA. Citizen`;
    const { content, readdressed } = readdressLetterToTvcc(noTo, toBlock);
    expect(readdressed).toBe(false);
    expect(content).toContain("Technical Vigilance & Control Cell (T.V.C.C.)");
    const addrIdx = content.indexOf("The Executive Engineer");
    const subjIdx = content.indexOf("**Subject:");
    expect(addrIdx).toBeGreaterThanOrEqual(0);
    expect(addrIdx).toBeLessThan(subjIdx);
  });

  it("prepends the addressee when neither To nor Subject is found", () => {
    const bare = `Sir,\n\nPlease look into the pothole on 5th Main.\n\nRegards,\nA. Citizen`;
    const { content, readdressed } = readdressLetterToTvcc(bare, toBlock);
    expect(readdressed).toBe(false);
    expect(content.startsWith("To,")).toBe(true);
    expect(content).toContain("Please look into the pothole on 5th Main.");
  });

  it("does not treat a body sentence starting with 'To' as the addressee", () => {
    const letter = `**Subject: Drain overflow**\n\nSir,\n\nTo resolve this, the drain must be desilted.\n\nYours faithfully,\nA. Citizen`;
    const { content } = readdressLetterToTvcc(letter, toBlock);
    // The body sentence survives intact.
    expect(content).toContain("To resolve this, the drain must be desilted.");
  });

  it("anchors on a Kannada Subject line", () => {
    const kn = `ಗೆ,\nಕಾರ್ಯಪಾಲಕ ಅಭಿಯಂತರರು\nಗೊಟ್ಟಿಗೆರೆ ಉಪವಿಭಾಗ\n\nವಿಷಯ: ರಸ್ತೆ ಕಾಮಗಾರಿ ದೂರು\n\nಮಾನ್ಯರೇ,\n\n೧. ದೂರಿನ ವಿವರ.\n\nತಮ್ಮ ವಿಶ್ವಾಸಿ,\nಒಬ್ಬ ನಾಗರಿಕ`;
    const { content, readdressed } = readdressLetterToTvcc(kn, tvccAddresseeBlock(TVCC_OFFICES.DAKSHINA, "kn"));
    expect(readdressed).toBe(true);
    expect(content).toContain("ವಿಷಯ: ರಸ್ತೆ ಕಾಮಗಾರಿ ದೂರು");
    expect(content).toContain("ಟಿ.ವಿ.ಸಿ.ಸಿ.");
    expect(content).not.toContain("ಗೊಟ್ಟಿಗೆರೆ ಉಪವಿಭಾಗ");
  });
});
