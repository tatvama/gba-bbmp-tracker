/**
 * Chronology / backdating checks (PURE). Builds a date timeline across the
 * tender→payment lifecycle and flags impossible sequences. Frames every finding
 * as "sequence appears inconsistent, produce the file-movement note" — never
 * asserts backdating. Uses parseIndianDate (UTC, 5 formats).
 */
import { parseIndianDate } from "./date-parse";
import type { BillFinding, JobTimelineDates } from "./types";

// before-event must be on/before after-event
const ORDER: [string, string, string][] = [
  ["administrative_sanction", "technical_sanction", "administrative sanction after technical sanction"],
  ["technical_sanction", "tender_notice", "technical sanction after tender notice"],
  ["tender_notice", "bid_deadline", "tender notice after bid deadline"],
  ["bid_deadline", "technical_bid_opening", "technical bid opening before bid deadline"],
  ["technical_bid_opening", "financial_bid_opening", "financial bid opening before technical bid opening"],
  ["financial_bid_opening", "tender_approval", "tender approval before financial bid opening"],
  ["tender_approval", "work_order", "work order before tender approval"],
  ["work_order", "agreement", "agreement before work order"],
  ["agreement", "commencement", "work commencement before agreement"],
  ["commencement", "measurement", "measurement before commencement"],
  ["measurement", "bill", "bill before measurement"],
  ["bill", "payment", "payment before bill"],
  ["measurement", "completion", "completion before measurement"],
];

// late-event after anchor-event
const SPECIAL: [string, string, string][] = [
  ["insurance_start", "commencement", "insurance starts after work commencement"],
  ["photo_capture", "bill", "photo captured after bill date"],
  ["photo_upload", "bill", "photo uploaded after bill date"],
  ["stamp_paper_purchase", "agreement", "stamp paper purchased after agreement date"],
  ["security_release", "dlp_end", "security released before defect-liability end"],
];

const KEY_DATES = ["technical_sanction", "tender_notice", "work_order", "agreement", "commencement", "measurement", "bill", "payment"];

const SAFE = "The sequence of dates appears inconsistent and requires production of the original file-movement note and approval records.";

export function buildTimeline(dates: JobTimelineDates): { event: string; date: Date | null }[] {
  return Object.entries(dates)
    .map(([event, raw]) => ({ event, date: parseIndianDate(raw) }))
    .sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
}

export function checkChronology(dates: JobTimelineDates): BillFinding[] {
  const out: BillFinding[] = [];
  const d = (k: string) => parseIndianDate(dates[k] ?? null);

  ORDER.forEach(([before, after, msg], i) => {
    const a = d(before), b = d(after);
    if (a && b && a.getTime() > b.getTime()) {
      out.push({
        code: `CH-${String(i + 1).padStart(2, "0")}`,
        title: `Chronology: ${msg}`,
        severity: "High",
        category: "CHRONOLOGY",
        findingClass: "confirmed_mismatch",
        evidenceGrade: "A",
        detail: `${before} (${dates[before]}) is after ${after} (${dates[after]}). ${SAFE}`,
        expected: `${before} on/before ${after}`,
        actual: `${before} after ${after}`,
        safeText: SAFE,
        ruleRef: "Public works file-movement / approval sequence",
        recordToDemand: "Original file-movement note and dated approval records",
      });
    }
  });

  SPECIAL.forEach(([late, anchor, msg], i) => {
    const l = d(late), an = d(anchor);
    if (l && an && l.getTime() > an.getTime()) {
      out.push({
        code: `CH-${String(14 + i).padStart(2, "0")}`,
        title: `Chronology red flag: ${msg}`,
        severity: "Medium",
        category: "CHRONOLOGY",
        findingClass: "confirmed_mismatch",
        evidenceGrade: "A",
        detail: `${late} (${dates[late]}) is after ${anchor} (${dates[anchor]}). ${SAFE}`,
        safeText: SAFE,
        recordToDemand: "Original dated record explaining the sequence",
      });
    }
  });

  const missing = KEY_DATES.filter((k) => !d(k));
  if (missing.length) {
    out.push({
      code: "CH-19",
      title: "Key lifecycle dates not in supplied records",
      severity: "Low",
      category: "CHRONOLOGY",
      findingClass: "missing_proof",
      evidenceGrade: "C",
      detail: `Dates not found in supplied records: ${missing.join(", ")}. Full chronology cannot be verified.`,
      recordToDemand: "Certified copies showing these dates",
    });
  }

  return out;
}
