/**
 * Possible-financial-exposure calculator (PURE). The ONLY engine that emits ₹.
 * Every line carries the mandatory caveat: this is possible exposure requiring
 * verification, NOT a final/proven loss. Formulas verbatim from the skill.
 */

export interface LossLineInput {
  type:
    | "excess_quantity" | "excess_rate" | "short_thickness" | "missing_fsd"
    | "missing_royalty" | "wrong_deduction" | "duplicate_measurement"
    | "missing_salvage" | "wrong_gst";
  label?: string;
  // generic operands (only the relevant ones per type are read)
  rate?: number; quantity?: number;
  billedQuantity?: number; permittedQuantity?: number;
  billRate?: number; permittedRate?: number;
  gross?: number; fsdPercent?: number; actualFsd?: number;
  expectedDeduction?: number; actualDeduction?: number;
  salvageRate?: number;
  taxableExcess?: number; gstPercent?: number;
}

export interface LossLine {
  type: string;
  label: string;
  exposure: number;
  formula: string;
  caveat: string;
}

const CAVEAT = "possible exposure requiring verification, not final loss";
const n = (x: number | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

export function computeLossExposure(lines: LossLineInput[]): { lines: LossLine[]; totalPossibleExposure: number } {
  const out: LossLine[] = lines.map((it) => {
    let exposure = 0, formula = "";
    switch (it.type) {
      case "excess_quantity":
        exposure = Math.max(0, n(it.billedQuantity) - n(it.permittedQuantity)) * n(it.rate);
        formula = "(billed_qty − permitted_qty) × rate";
        break;
      case "excess_rate":
        exposure = n(it.quantity) * Math.max(0, n(it.billRate) - n(it.permittedRate));
        formula = "qty × (bill_rate − permitted_rate)";
        break;
      case "short_thickness":
        exposure = Math.max(0, n(it.billedQuantity) - n(it.permittedQuantity)) * n(it.rate);
        formula = "(paid_volume − core_verified_volume) × rate";
        break;
      case "missing_fsd":
        exposure = Math.max(0, (n(it.gross) * n(it.fsdPercent)) / 100 - n(it.actualFsd));
        formula = "gross × fsd_percent − actual_fsd";
        break;
      case "missing_royalty":
        exposure = n(it.quantity) * n(it.rate);
        formula = "material_qty × royalty_rate";
        break;
      case "wrong_deduction":
        exposure = Math.max(0, n(it.expectedDeduction) - n(it.actualDeduction));
        formula = "expected_deduction − actual_deduction";
        break;
      case "duplicate_measurement":
        exposure = n(it.quantity) * n(it.rate);
        formula = "duplicate_qty × rate";
        break;
      case "missing_salvage":
        exposure = n(it.quantity) * n(it.salvageRate);
        formula = "salvage_qty × salvage_rate";
        break;
      case "wrong_gst":
        exposure = (n(it.taxableExcess) * n(it.gstPercent)) / 100;
        formula = "taxable_excess × gst_percent";
        break;
    }
    return { type: it.type, label: it.label ?? it.type, exposure: Math.round(exposure * 100) / 100, formula, caveat: CAVEAT };
  });
  const totalPossibleExposure = Math.round(out.reduce((s, l) => s + l.exposure, 0) * 100) / 100;
  return { lines: out, totalPossibleExposure };
}
