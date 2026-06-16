/**
 * Royalty, disposal and salvage reconciliation (PURE). Builds on
 * material-balance. Emits a ₹ loss only when a rate is supplied; otherwise a
 * grade-C "source/value not in supplied records" verification prompt. Never
 * alleges illegal quarrying or dumping.
 */
import type { BillFinding } from "./types";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function reconcileRoyalty(input: { billedMaterialQty: number; royaltyPaidQty?: number; royaltyRate?: number; material?: string }): BillFinding[] {
  const out: BillFinding[] = [];
  const mat = input.material ?? "mineral material";
  if (input.royaltyPaidQty == null) {
    out.push({ code: "RY-01", title: `Royalty source not shown for ${mat}`, severity: "Medium", category: "ROYALTY", findingClass: "missing_proof", evidenceGrade: "C", detail: `Billed ${mat} quantity ${input.billedMaterialQty} but no DMG royalty challan / paid quantity is in the supplied records — lawful source cannot be verified.`, recordToDemand: "DMG royalty challans / mineral dispatch permits + supplier invoices" });
    return out;
  }
  if (input.royaltyPaidQty + 0.001 < input.billedMaterialQty) {
    const short = input.billedMaterialQty - input.royaltyPaidQty;
    const exposure = typeof input.royaltyRate === "number" ? short * input.royaltyRate : undefined;
    out.push({ code: "RY-02", title: `Royalty quantity short of billed ${mat}`, severity: "High", category: "ROYALTY", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `Billed ${input.billedMaterialQty} but royalty paid only on ${input.royaltyPaidQty} (short ${short.toFixed(2)}).${exposure != null ? ` Possible exposure ${money(exposure)} (rate supplied) — requires verification, not final loss.` : " Provide the royalty rate to quantify."}`, expected: `royalty on ≥ ${input.billedMaterialQty}`, actual: `royalty on ${input.royaltyPaidQty}`, lossExposure: exposure, recordToDemand: "Reconciled royalty statement + challans" });
  }
  return out;
}

export function reconcileSalvage(input: { dismantlingQty?: number; salvageRegistered?: boolean; salvageQty?: number; salvageRate?: number }): BillFinding[] {
  const out: BillFinding[] = [];
  if ((input.dismantlingQty ?? 0) > 0 && input.salvageRegistered === false) {
    const exposure = typeof input.salvageQty === "number" && typeof input.salvageRate === "number" ? input.salvageQty * input.salvageRate : undefined;
    out.push({ code: "RY-07", title: "Dismantled material has no salvage accounting", severity: "Medium", category: "ROYALTY", findingClass: "missing_proof", evidenceGrade: "C", detail: `Dismantling quantity ${input.dismantlingQty} but no salvage register/auction/deduction is shown — public-property value may be unprotected.${exposure != null ? ` Possible value ${money(exposure)} — requires verification.` : ""}`, lossExposure: exposure, recordToDemand: "Salvage register, store receipt, auction record or bill deduction" });
  }
  return out;
}

export function reconcileDisposal(input: { excavationQty?: number; disposalQty?: number; hasTripSheets: boolean; hasWeighbridge: boolean }): BillFinding[] {
  const out: BillFinding[] = [];
  if ((input.disposalQty ?? 0) > 0 && !input.hasTripSheets) {
    out.push({ code: "RY-04", title: "Disposal/lead billed without trip sheets", severity: "Medium", category: "ROYALTY", findingClass: "missing_proof", evidenceGrade: "C", detail: `Disposal quantity ${input.disposalQty} billed but no vehicle-wise trip sheets are shown — lawful transport/disposal cannot be verified (matching paper quantities do not prove it).`, recordToDemand: "Vehicle-wise trip sheets, lorry numbers, authorized dumping-yard receipts" });
  }
  if (typeof input.excavationQty === "number" && typeof input.disposalQty === "number" && input.disposalQty > input.excavationQty * 1.1) {
    out.push({ code: "RY-05", title: "Disposal quantity exceeds excavation", severity: "Medium", category: "ROYALTY", findingClass: "confirmed_mismatch", evidenceGrade: "B", detail: `Disposal ${input.disposalQty} exceeds excavation ${input.excavationQty} (+10%). Verify the earth-balance.`, recordToDemand: "Earth-balance statement + trip sheets" });
  }
  return out;
}
