import { describe, it, expect } from "vitest";
import {
  normalizeTarget,
  isFullCode,
  isWardYear,
  cleanFilename,
  sanitizeFilename,
  fileInfo,
  mapPortalFileToDocType,
  isBlankTemplate,
  looksLikeLoginHtml,
  extractJobCode,
  resolveTargets,
  stripHtml,
  parseAmount,
  PORTAL_FILES,
} from "@/lib/ifms/downloader";

describe("normalizeTarget", () => {
  it("normalises ward+year in any loose form", () => {
    expect(normalizeTarget("44-22")).toBe("044-22");
    expect(normalizeTarget("044-22")).toBe("044-22");
    expect(normalizeTarget("44 2022")).toBe("044-22");
    expect(normalizeTarget("ward 44 year 2022")).toBe("044-22");
  });
  it("normalises a full job code (pads serial to 6)", () => {
    expect(normalizeTarget("44 2022 11")).toBe("044-22-000011");
    expect(normalizeTarget("044-22-000011")).toBe("044-22-000011");
  });
  it("returns null when it can't find a ward and a year", () => {
    expect(normalizeTarget("44")).toBeNull();
    expect(normalizeTarget("not a code")).toBeNull();
    expect(normalizeTarget("")).toBeNull();
    expect(normalizeTarget(null)).toBeNull();
  });
});

describe("isFullCode / isWardYear", () => {
  it("classifies canonical targets", () => {
    expect(isFullCode("044-22-000011")).toBe(true);
    expect(isFullCode("044-22")).toBe(false);
    expect(isWardYear("044-22")).toBe(true);
    expect(isWardYear("044-22-000011")).toBe(false);
  });
});

describe("cleanFilename", () => {
  it("collapses the --<digits>- middle id segment", () => {
    expect(cleanFilename("WO-1--14976594-Estimate-PN.pdf")).toBe("WO-1-Estimate-PN.pdf");
    expect(cleanFilename("WB-MB.pdf")).toBe("WB-MB.pdf"); // unchanged
  });
  it("takes the basename of a path", () => {
    expect(cleanFilename("downloads/044-22-000011/WB-Bill.pdf")).toBe("WB-Bill.pdf");
  });
});

describe("sanitizeFilename", () => {
  it("strips reserved punctuation but keeps spaces and hyphens", () => {
    expect(sanitizeFilename("WO-1-Estimate PN.pdf")).toBe("WO-1-Estimate PN.pdf");
    expect(sanitizeFilename('WB:Bill?<x>.pdf')).toBe("WBBillx.pdf");
  });
  it("never returns an empty string", () => {
    expect(sanitizeFilename("///")).toBe("file");
  });
});

describe("fileInfo", () => {
  it("builds the file URL from rFileName + raddl", () => {
    const fi = fileInfo({ rFileName: "WO-1-Estimate.pdf", raddl: "1" });
    expect(fi).toEqual({ name: "WO-1-Estimate.pdf", url: `${PORTAL_FILES}1/WO-1-Estimate.pdf` });
  });
  it("percent-encodes spaces and parentheses in the name", () => {
    const fi = fileInfo({ rFileName: "WO-1 Estimate (final).pdf", raddl: "" });
    expect(fi?.url).toBe(`${PORTAL_FILES}/WO-1%20Estimate%20%28final%29.pdf`);
  });
  it("accepts legacy field names and bare strings", () => {
    expect(fileInfo({ filename: "x.pdf" })?.name).toBe("x.pdf");
    expect(fileInfo("WB-MB.pdf")?.url).toBe(`${PORTAL_FILES}/WB-MB.pdf`);
  });
  it("returns null when there is no usable name", () => {
    expect(fileInfo({ raddl: "1" })).toBeNull();
  });
});

describe("mapPortalFileToDocType", () => {
  it("maps the documented portal prefixes to canonical document types", () => {
    expect(mapPortalFileToDocType("WO-1-Estimate-PN.pdf")).toBe("Estimate copy");
    expect(mapPortalFileToDocType("WO-3-TS.pdf")).toBe("Technical Sanction");
    expect(mapPortalFileToDocType("WO-4-ScheduleB.pdf")).toBe("Schedule B");
    expect(mapPortalFileToDocType("WO-6-KW-4-Agreement.pdf")).toBe("KW-4 agreement");
    expect(mapPortalFileToDocType("WB-Bill.pdf")).toBe("Bill copy");
    expect(mapPortalFileToDocType("WB-MB.pdf")).toBe("MB Book copy");
    expect(mapPortalFileToDocType("WB-photo1.pdf")).toBe("Geo-tagged site photo");
    expect(mapPortalFileToDocType("WB-QC.pdf")).toBe("Quality test report");
    expect(mapPortalFileToDocType("Royalty-Challan.pdf")).toBe("Royalty challan");
    expect(mapPortalFileToDocType("mystery-file.pdf")).toBe("Other evidence");
  });

  // Real filenames observed on the live portal (job 047-25-000003). The abbreviated
  // "SCHE B" / "AGREE" forms must map by content, not by the unreliable WO-N prefix
  // (this job filed Schedule B as both WO-4 AND WO-5).
  it("maps abbreviated real-world portal names by content, not WO-number", () => {
    expect(mapPortalFileToDocType("WO-4--54974471-SCHE B.pdf")).toBe("Schedule B");
    expect(mapPortalFileToDocType("WO-5--84756722-SCHE B.pdf")).toBe("Schedule B");
    expect(mapPortalFileToDocType("WO-6--21935909-AGREE.pdf")).toBe("KW-4 agreement");
    expect(mapPortalFileToDocType("WO-1--22036683-EST.pdf")).toBe("Estimate copy");
    expect(mapPortalFileToDocType("WO-3--41728738-TS.pdf")).toBe("Technical Sanction");
  });

  // Contract: the strings this returns MUST satisfy the job-audit classifiers in
  // lib/actions/job-audit.ts so the downloaded docs route to the right extractor.
  it("produces doc types that the job-audit classifiers recognise", () => {
    const isBill = (t: string) => /bill|estimate|schedule b/.test(t);
    const isMb = (t: string) => /mb book|measurement/.test(t);
    const isTender = (t: string) => /tender|technical bid|financial bid|registration/.test(t);
    const isInsurance = (t: string) => /insurance|kw-4 agreement/.test(t);
    const isRoyalty = (t: string) => /royalty|trip sheet|weighbridge|c&d|salvage/.test(t);

    const lc = (f: string) => mapPortalFileToDocType(f).toLowerCase();
    expect(isBill(lc("WB-Bill.pdf"))).toBe(true);
    expect(isBill(lc("WO-1-Estimate.pdf"))).toBe(true);
    expect(isBill(lc("WO-4-ScheduleB.pdf"))).toBe(true);
    expect(isMb(lc("WB-MB.pdf"))).toBe(true);
    expect(isTender(lc("WO-9-tech-eval.pdf"))).toBe(true);
    expect(isTender(lc("WO-13-License.pdf"))).toBe(true);
    expect(isInsurance(lc("WO-6-KW-4-Agreement.pdf"))).toBe(true);
    expect(isInsurance(lc("Insurance-Policy.pdf"))).toBe(true);
    expect(isRoyalty(lc("Royalty.pdf"))).toBe(true);
    expect(isRoyalty(lc("Weighbridge-trip.pdf"))).toBe(true);
  });
});

describe("isBlankTemplate", () => {
  it("flags BLANK template files", () => {
    expect(isBlankTemplate("WB-QC-BLANK.pdf")).toBe(true);
    expect(isBlankTemplate("WB-QC.pdf")).toBe(false);
  });
});

describe("looksLikeLoginHtml", () => {
  it("treats arrays/objects as valid (not login html)", () => {
    expect(looksLikeLoginHtml([{ wbid: 1 }])).toBe(false);
    expect(looksLikeLoginHtml([])).toBe(false);
  });
  it("flags html/login text payloads", () => {
    expect(looksLikeLoginHtml("<!DOCTYPE html><html>...")).toBe(true);
    expect(looksLikeLoginHtml("Please login to continue")).toBe(true);
  });
});

describe("extractJobCode", () => {
  it("pulls a job code out of a description string", () => {
    expect(extractJobCode("Work 044-22-000011 road asphalting")).toBe("044-22-000011");
    expect(extractJobCode("no code here")).toBeNull();
  });
});

describe("resolveTargets", () => {
  it("splits loose inputs into code / wardyear targets and collects invalid ones", () => {
    const { targets, invalid } = resolveTargets(["44-22", "044-22-000011", "garbage"]);
    expect(targets).toEqual([
      { kind: "wardyear", value: "044-22" },
      { kind: "code", value: "044-22-000011" },
    ]);
    expect(invalid).toEqual(["garbage"]);
  });
});

describe("stripHtml / parseAmount", () => {
  it("strips tags and decodes entities", () => {
    expect(stripHtml("<b>Road</b> &amp; drain")).toBe("Road & drain");
  });
  it("parses Indian-formatted amounts", () => {
    expect(parseAmount("4,78,170.00")).toBe(478170);
    expect(parseAmount("Rs 12,345")).toBe(12345);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
  });
});
