/**
 * Engineering Compliance Matrix — the declarative registry of compliance
 * dimensions for a BBMP works file. Each entry is a ComplianceRule descriptor;
 * the engine (engine.ts) evaluates them by PROJECTING over the existing
 * CaseIntelligence artifact (ComplianceItem areas, finding categories,
 * references, and the structured insurance / Schedule-B / TVCC sub-artifacts).
 *
 * It does NOT re-parse documents or call the AI — the artifact is the single
 * source of truth. Adding a future engineering rule is ONE entry here (Open/
 * Closed); no engine change. Most dimensions use the generic projector; a few
 * (insurance, BOQ, TVCC) read their structured sub-artifact directly.
 */
import type {
  ComplianceRule,
  ComplianceInput,
  ComplianceFinding,
  ComplianceSeverity,
  ComplianceStatus,
  RuleContext,
} from "./types";
import type { Observation } from "@/lib/intelligence/types";

export const RULE_VERSION = "ecm-1";

interface DimensionSpec {
  key: string;
  label: string;
  category: string;
  ruleRef: string;
  areas?: string[]; // ComplianceItem.area exact matches (from analyze + document-facts)
  findingCats?: string[]; // Observation.category matches
  refLabels?: string[]; // Reference.label matches
  keywords?: RegExp; // fallback scan over compliance / findings / references / demanded docs
  requiredDocs: string[];
  evidenceSources: string[];
  crossChecks: string[];
  riskIndicators: string[];
  recommendedActions: string[];
  special?: "insurance" | "boq" | "tvcc";
}

const SEV_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
function maxSeverity(obs: Observation[]): ComplianceSeverity {
  let best: ComplianceSeverity = "Low";
  for (const o of obs) if ((SEV_RANK[o.severity] ?? 0) > (SEV_RANK[best] ?? 0)) best = o.severity as ComplianceSeverity;
  return obs.length ? best : "Info";
}
function dedupe(xs: (string | null | undefined)[]): string[] {
  return [...new Set(xs.filter((x): x is string => Boolean(x && x.trim())))];
}

/** Generic projector used by every dimension that maps onto artifact areas /
 *  finding categories / references / keywords. */
function genericEvaluate(spec: DimensionSpec) {
  const areas = new Set(spec.areas ?? []);
  const cats = new Set(spec.findingCats ?? []);
  const refLabels = new Set(spec.refLabels ?? []);
  const kw = spec.keywords;

  return (input: ComplianceInput, _ctx?: RuleContext): ComplianceFinding => {
    const matchedCompliance = input.compliance.filter(
      (c) => areas.has(c.area) || (kw ? kw.test(`${c.area} ${c.requirement} ${c.detail ?? ""}`) : false),
    );
    const obs = [...input.findings, ...input.correlations];
    // Findings match ONLY by their authoritative category — NOT by scanning
    // free-text statements, so a word like "disposal" or "material" in a
    // QUANTITY finding does not mislight the Environmental / Material dimensions.
    const matchedFindings = obs.filter((o) => cats.has(o.category));
    const matchedRefs = input.references.filter(
      (r) => refLabels.has(r.label) || (kw ? kw.test(`${r.label} ${r.value}`) : false),
    );
    const matchedDemands = input.documentsToDemand.filter((d) => (kw ? kw.test(d) : false));

    const compStatuses = matchedCompliance.map((c) => c.status);
    let status: ComplianceStatus;
    let severity: ComplianceSeverity;
    let confidence: ComplianceFinding["confidence"];
    let reason: string;

    // Precedence (worst-first, so a sibling record being "met" NEVER masks a
    // missing or flagged one within the same dimension): discrepancy → not_shown
    // → met → (works) not_shown → not_applicable.
    if (matchedFindings.length || compStatuses.includes("discrepancy")) {
      status = "discrepancy";
      severity = matchedFindings.length ? maxSeverity(matchedFindings) : "Medium";
      confidence = "High";
      reason = matchedFindings.length
        ? `${matchedFindings.length} audit finding(s) bear on this requirement: ${matchedFindings
            .slice(0, 3)
            .map((f) => f.code ?? f.statement.slice(0, 60))
            .join("; ")}.`
        : `A compliance concern is recorded: ${matchedCompliance.find((c) => c.status === "discrepancy")?.detail ?? "requires verification"}.`;
    } else if (compStatuses.includes("not_shown") || matchedDemands.length) {
      status = "not_shown";
      severity = input.isWorksCase ? "Medium" : "Info";
      confidence = "Medium";
      reason = "A required record for this requirement is not on the case.";
    } else if (compStatuses.includes("met") || matchedRefs.length) {
      status = "met";
      severity = "Info";
      confidence = matchedRefs.length ? "High" : "Medium";
      reason = matchedRefs.length
        ? `On record: ${matchedRefs.slice(0, 2).map((r) => r.value).join("; ")}.`
        : "A corresponding record is on file.";
    } else if (input.isWorksCase) {
      status = "not_shown";
      severity = "Medium";
      confidence = "Low";
      reason = "No document evidencing this requirement is on record for this works file.";
    } else {
      status = "not_applicable";
      severity = "Info";
      confidence = "Low";
      reason = "Not applicable to a non-works complaint.";
    }

    const evidenceUsed = dedupe([
      ...matchedFindings.flatMap((f) => f.evidenceIds),
      ...matchedCompliance.flatMap((c) => c.evidenceIds),
    ]).slice(0, 8);
    if (!evidenceUsed.length && matchedRefs.length) evidenceUsed.push(...matchedRefs.slice(0, 3).map((r) => r.value));

    const documentsRequired =
      status === "met"
        ? []
        : dedupe([
            ...matchedCompliance.map((c) => c.recordToDemand),
            ...matchedFindings.map((f) => f.recordToDemand),
            ...matchedDemands,
            ...spec.requiredDocs,
          ]).slice(0, 8);

    return {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      status,
      severity,
      reason,
      evidenceUsed,
      applicableRule: spec.ruleRef || matchedCompliance[0]?.ruleRef || matchedFindings[0]?.ruleRefs[0] || "",
      confidence,
      recommendedAction: status === "met" ? null : spec.recommendedActions[0] ?? "Produce the records named and reconcile before certification.",
      documentsRequired,
      ruleVersion: RULE_VERSION,
    };
  };
}

function insuranceEvaluate(spec: DimensionSpec) {
  const fallback = genericEvaluate(spec);
  return (input: ComplianceInput, ctx: RuleContext): ComplianceFinding => {
    const ic = input.insuranceCoverage;
    if (!ic || !ic.rows.length) return fallback(input, ctx);
    const total = ic.rows.length;
    const onRecord = ic.rows.filter((r) => r.status !== "Not on record").length;
    const status: ComplianceStatus = onRecord === 0 ? "not_shown" : onRecord < total ? "discrepancy" : "met";
    return {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      status,
      severity: status === "met" ? "Info" : status === "not_shown" ? "High" : "Medium",
      reason: `${onRecord} of ${total} mandatory KW-4 Clause 13 covers evidenced (see the insurance coverage table).`,
      evidenceUsed: [],
      applicableRule: ic.ruleRef,
      confidence: "High",
      recommendedAction: status === "met" ? null : "Call for the missing policies, premium receipts and certificates of insurance before commencement / certification.",
      documentsRequired: status === "met" ? [] : ["Certified copies of the missing KW-4 Clause 13 insurance policies, premium receipts and certificates of insurance"],
      ruleVersion: RULE_VERSION,
    };
  };
}

function boqEvaluate(spec: DimensionSpec) {
  const fallback = genericEvaluate(spec);
  return (input: ComplianceInput, ctx: RuleContext): ComplianceFinding => {
    const sb = input.scheduleBTables;
    if (!sb || !sb.groups.length) return fallback(input, ctx);
    const rows = sb.groups.reduce((n, g) => n + g.rows.length, 0);
    const obs = [...input.findings, ...input.correlations].filter((o) => o.category === "QUANTITY" || o.category === "RATE");
    const status: ComplianceStatus = obs.length ? "discrepancy" : "met";
    return {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      status,
      severity: obs.length ? maxSeverity(obs) : "Info",
      reason: obs.length
        ? `Schedule-B quantities are on record (${rows} earthwork/dismantling item(s)) and ${obs.length} quantity/rate finding(s) require reconciliation.`
        : `Schedule-B quantities transcribed (${rows} earthwork/dismantling item(s)); verify against the Measurement Book before the items are billed.`,
      evidenceUsed: dedupe(obs.flatMap((o) => o.evidenceIds)).slice(0, 8),
      applicableRule: spec.ruleRef,
      confidence: "Medium",
      recommendedAction: "Reconcile the Schedule-B quantities against the Measurement Book and running bills before certification.",
      documentsRequired: dedupe([...obs.map((o) => o.recordToDemand), ...spec.requiredDocs]).slice(0, 8),
      ruleVersion: RULE_VERSION,
    };
  };
}

function tvccEvaluate(spec: DimensionSpec) {
  const fallback = genericEvaluate(spec);
  return (input: ComplianceInput, ctx: RuleContext): ComplianceFinding => {
    const tv = input.tvcc;
    if (!tv) return fallback(input, ctx);
    const status = tv.status as ComplianceStatus;
    const missing = tv.coverage.filter((c) => !c.present).map((c) => c.type);
    const severity: ComplianceSeverity =
      status === "met" ? "Info" : status === "discrepancy" ? "High" : status === "not_shown" ? "Medium" : "Low";
    // Short reason for the matrix cell; the full note + cross-checks live in the
    // dedicated [TVCC] block (avoids repeating the long note in the letter).
    const reason =
      status === "not_shown"
        ? "No TVCC (Technical Vigilance) report is on record for this works file."
        : status === "discrepancy"
          ? `TVCC report(s) on record but a cross-check conflict / gap requires reconciliation (${tv.reportsFound.length} report(s); see TVCC detail).`
          : status === "met"
            ? `All expected TVCC reports are on record (${tv.reportsFound.length}).`
            : `TVCC report(s) partially on record (${tv.reportsFound.length}); some report types not produced.`;
    return {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      status,
      severity,
      reason,
      evidenceUsed: dedupe(tv.reportsFound.map((r) => r.reference)).slice(0, 8),
      applicableRule: spec.ruleRef,
      confidence: tv.reportsFound.length ? "Medium" : "Low",
      recommendedAction:
        status === "met"
          ? null
          : "Produce the TVCC inspection / quality / site / rectification / compliance reports and reconcile them against the BOQ, Measurement Book and bills.",
      documentsRequired: status === "met" ? [] : (missing.length ? missing : spec.requiredDocs),
      ruleVersion: RULE_VERSION,
    };
  };
}

const SPECS: DimensionSpec[] = [
  { key: "administrative_approval", label: "Administrative Approval", category: "Sanction", ruleRef: "KTPP Act 1999 & Karnataka Financial Code — Administrative Approval", areas: ["Administrative Approval (AA)"], refLabels: ["Administrative Approval (AA)"], findingCats: ["CHRONOLOGY"], requiredDocs: ["Certified copy of the Administrative Approval"], evidenceSources: ["Administrative Approval order"], crossChecks: ["Date precedes Technical Sanction and tender"], riskIndicators: ["AA dated after TS / tender", "AA amount below sanctioned value"], recommendedActions: ["Produce the Administrative Approval and the file movement note showing its date."] },
  { key: "technical_sanction", label: "Technical Sanction", category: "Sanction", ruleRef: "KPWD Code & KTPP Act 1999 — Technical Sanction", areas: ["Technical Sanction (TS)"], refLabels: ["Technical Sanction (TS)"], findingCats: ["CHRONOLOGY"], requiredDocs: ["Certified copy of the original Technical Sanction letter"], evidenceSources: ["Technical Sanction letter"], crossChecks: ["TS precedes tender", "TS amount vs DTS"], riskIndicators: ["TS same date as tender", "TS not by competent authority"], recommendedActions: ["Produce the original Technical Sanction letter with all conditions."] },
  { key: "tender", label: "Tender / KTPP", category: "Procurement", ruleRef: "KTPP Act 1999 & Rules 2000", areas: ["Tender Notification", "Tender eligibility (KTPP)"], refLabels: ["Tender Notification"], findingCats: ["ELIGIBILITY", "PATTERN", "RATE"], requiredDocs: ["Original e-procurement tender notification, corrigenda and certified publication dates"], evidenceSources: ["e-Procurement portal notification"], crossChecks: ["Publication period ≥ statutory minimum", "Negotiation proceedings documented"], riskIndicators: ["Short publication period", "Single/limited bidders", "Undocumented rate negotiation"], recommendedActions: ["Produce the tender notification, bid record and rate-negotiation file."] },
  { key: "agreement", label: "Agreement (KW-4)", category: "Contract", ruleRef: "KW-4 Standard Tender Document (contract form)", areas: ["Agreement (KW-4)"], refLabels: ["Agreement (KW-4)"], requiredDocs: ["Certified copy of the KW-4 agreement"], evidenceSources: ["Executed KW-4 agreement"], crossChecks: ["Agreement value vs sanctioned amount", "Performance security taken"], riskIndicators: ["Agreement value above sanction", "Missing performance security"], recommendedActions: ["Produce the executed KW-4 agreement with the schedule of quantities."] },
  { key: "work_order", label: "Work Order", category: "Contract", ruleRef: "KTPP Act 1999 & Rules 2000 — work order issuance", areas: ["Work Order"], refLabels: ["Work Order"], requiredDocs: ["Certified copy of the Work Order"], evidenceSources: ["Work order"], crossChecks: ["Work order after agreement", "Stipulated period consistent"], riskIndicators: ["Blank/repeated work-order positions"], recommendedActions: ["Produce the Work Order and the source document for each work-order position."] },
  { key: "boq_schedule_b", label: "BOQ / Schedule-B", category: "Quantities", ruleRef: "KPWD Code & KTPP Act 1999 — Schedule-B / quantity variation (≤125% per item)", findingCats: ["QUANTITY", "RATE"], requiredDocs: ["Certified Schedule-B and the sanctioned modified Schedule-B, if any"], evidenceSources: ["Schedule-B / BOQ"], crossChecks: ["Executed qty vs sanctioned qty ≤125%", "Schedule-B vs MB vs bills"], riskIndicators: ["Item over 125% of tendered qty", "Excavation/disposal symmetry inflation"], recommendedActions: ["Reconcile the Schedule-B quantities against the Measurement Book and running bills before certification."], special: "boq" },
  { key: "measurement_book", label: "Measurement Book (MB/EMB)", category: "Measurement", ruleRef: "KPWD Code — Measurement Book maintenance & test-check", areas: ["Measurement Book integrity"], findingCats: ["MB_INTEGRITY"], keywords: /measurement book|\bMB\b|\bEMB\b/i, requiredDocs: ["Measurement Book / EMB extracts for all work locations"], evidenceSources: ["Measurement Book"], crossChecks: ["MB entries precede bill preparation", "MB vs bill quantities"], riskIndicators: ["Bills without MB backing", "Over-measurement"], recommendedActions: ["Produce the Measurement Book entries and reconcile them against every bill."] },
  { key: "running_bills", label: "Running Bills", category: "Payment", ruleRef: "PWD Code & KW-4 payment clauses", findingCats: ["ARITHMETIC", "DEDUCTION"], keywords: /running (account )?bill|\bRA bill\b|part bill/i, requiredDocs: ["All part bills with the corresponding Measurement Book extracts"], evidenceSources: ["Running account bills"], crossChecks: ["Bill arithmetic", "Statutory deductions (IT-TDS, GST-TDS, BOCW, FSD)"], riskIndicators: ["Arithmetic error", "Missing statutory deduction"], recommendedActions: ["Produce every running bill and verify the arithmetic and statutory deductions."] },
  { key: "final_bill", label: "Final Bill", category: "Payment", ruleRef: "PWD Code — final bill & payment authorisation", keywords: /final bill|payment order|completion bill/i, requiredDocs: ["Final bill and payment orders"], evidenceSources: ["Final bill", "Payment orders"], crossChecks: ["Final bill vs sanctioned value", "Payment authorisation trail"], riskIndicators: ["Payment beyond sanctioned value", "No completion certificate before final payment"], recommendedActions: ["Produce the final bill and the payment orders with the authorising sanction."] },
  { key: "document_integrity", label: "Document / Form Integrity", category: "Integrity", ruleRef: "KTPP Act 1999 & Rules 2000; BBMP works rules — document integrity", findingCats: ["FORM_INTEGRITY", "PATTERN"], requiredDocs: ["The original source document for each blank / repeated work-order position"], evidenceSources: ["Work-order document set"], crossChecks: ["Each work-order position backed by a distinct source document"], riskIndicators: ["Blank / repeated work-order positions", "Cross-document inconsistency"], recommendedActions: ["Produce the original document for each work-order position and explain any repeated / blank page."] },
  { key: "site_geotag", label: "Site & Geo-tag Evidence", category: "Evidence", ruleRef: "IT Act 2000 s.65B (electronic records) & BBMP geo-tag portal-log norms", findingCats: ["PHOTO"], keywords: /geo[- ]?tag|photograph|site photo|GPS/i, requiredDocs: ["Dated, geo-tagged site photographs (pre / during / post work) for each location"], evidenceSources: ["Geo-tagged photographs"], crossChecks: ["Photo GPS on-site", "Photos dated within execution"], riskIndicators: ["No dated site photographs", "GPS off-site"], recommendedActions: ["Produce the dated, geo-tagged site photographs for each work location."] },
  { key: "tvcc", label: "TVCC (Technical Vigilance)", category: "Vigilance", ruleRef: "BBMP administrative instructions / Government Orders / tender conditions — third-party technical vigilance & quality inspection (TVCC)", keywords: /TVCC|technical vigilance|third[- ]party (quality )?inspection|vigilance cell/i, requiredDocs: ["TVCC inspection, quality, site, rectification and compliance reports"], evidenceSources: ["TVCC reports"], crossChecks: ["TVCC vs BOQ / MB / bills / quality tests / geo-tagged photos / royalty / MDP"], riskIndicators: ["No TVCC inspection on a bill-stop-risk work", "TVCC observations not rectified"], recommendedActions: ["Produce the TVCC reports and reconcile them against the BOQ, Measurement Book, bills and quality tests."], special: "tvcc" },
  { key: "quality_reports", label: "Quality Test Reports", category: "Quality", ruleRef: "KPWD Code & IRC standards — material & workmanship quality tests", keywords: /quality (control|test|report)|cube test|core test|bitumen|compaction|IRC/i, requiredDocs: ["Quality Test Reports for all materials used"], evidenceSources: ["Quality control register & test reports"], crossChecks: ["Test results vs specification", "Tests dated within execution"], riskIndicators: ["No quality tests", "Failing results paid without rectification"], recommendedActions: ["Produce the Quality Test Reports and the quality-control register."] },
  { key: "material_procurement", label: "Material Procurement", category: "Materials", ruleRef: "KPWD Code — approved-source material procurement", areas: ["Mineral Dispatch Permit (MDP)", "Royalty Challan"], keywords: /material (procurement|source)|quarry|approved source|manufacturer/i, findingCats: ["ROYALTY"], requiredDocs: ["Approved-source / manufacturer records for principal materials"], evidenceSources: ["Material source records", "MDP / royalty"], crossChecks: ["Source approved", "Quantities vs consumption"], riskIndicators: ["Unapproved source", "Material qty vs royalty mismatch"], recommendedActions: ["Produce the approved-source material records and reconcile against consumption."] },
  { key: "royalty", label: "Royalty", category: "Materials", ruleRef: "Karnataka Minor Mineral Concession Rules — royalty", areas: ["Royalty Challan", "Royalty / mineral dispatch (Mineral Concession Rules)"], refLabels: ["Royalty Challan"], findingCats: ["ROYALTY"], requiredDocs: ["Royalty challans / DMG receipts for minor minerals used"], evidenceSources: ["Royalty challans"], crossChecks: ["Royalty paid vs quantity consumed"], riskIndicators: ["Royalty not paid / under-paid for consumed minerals"], recommendedActions: ["Produce the royalty challans and reconcile against the quantities consumed."] },
  { key: "mdp", label: "Minor Mineral Dispatch Permit (MDP)", category: "Materials", ruleRef: "Karnataka Minor Mineral Concession Rules — mineral dispatch permit", areas: ["Mineral Dispatch Permit (MDP)"], refLabels: ["Mineral Dispatch Permit (MDP)"], findingCats: ["ROYALTY"], requiredDocs: ["Mineral Dispatch Permits for minor minerals used"], evidenceSources: ["Mineral Dispatch Permits"], crossChecks: ["MDP source & quantity vs consumption"], riskIndicators: ["No MDP for consumed minerals", "Quarry source not identified"], recommendedActions: ["Produce the Mineral Dispatch Permits with the quarry source."] },
  { key: "insurance", label: "Insurance (KW-4 Clause 13)", category: "Insurance", ruleRef: "KW-4 Section 4 (GCC) Clause 13 — Insurance", areas: ["Insurance Policy", "Insurance / security (KW-4)"], findingCats: ["INSURANCE"], requiredDocs: ["KW-4 Clause 13 insurance policies, premium receipts and certificates of insurance"], evidenceSources: ["Insurance policies"], crossChecks: ["Cover types & sums vs KW-4 Clause 13.1"], riskIndicators: ["Cover absent / below required", "Policy period gap"], recommendedActions: ["Call for the KW-4 Clause 13 insurance policies, premium receipts and certificates of insurance."], special: "insurance" },
  { key: "completion_certificate", label: "Completion Certificate", category: "Closure", ruleRef: "KPWD Code — completion certificate", keywords: /completion certificate|work completion|virtual completion/i, requiredDocs: ["Completion Certificate issued by the competent authority"], evidenceSources: ["Completion certificate"], crossChecks: ["Completion certified before final payment"], riskIndicators: ["Final payment without completion certificate"], recommendedActions: ["Produce the Completion Certificate issued by the competent authority."] },
  { key: "defect_liability", label: "Defect Liability Period", category: "Closure", ruleRef: "KW-4 agreement — Defect Liability Period & retention", keywords: /defect liability|DLP|guarantee period|retention|security deposit release/i, requiredDocs: ["DLP terms and the retention / security-deposit release record"], evidenceSources: ["KW-4 agreement DLP clause"], crossChecks: ["Security released only after DLP", "DLP inspection done"], riskIndicators: ["Security released before DLP end", "No DLP inspection"], recommendedActions: ["Produce the DLP clause and the retention / security-deposit release record."] },
  { key: "environmental", label: "Environmental Compliance", category: "Statutory", ruleRef: "Environment (Protection) Act 1986; C&D Waste Rules 2016; KSPCB / NGT", keywords: /environment|KSPCB|pollution control|NGT|C&D waste|construction and demolition|dumping ground|lead chart|disposal/i, requiredDocs: ["KSPCB consent/authorisation, C&D-waste authorisation, approved dumping ground & lead chart"], evidenceSources: ["KSPCB / environmental clearances"], crossChecks: ["Disposal quantities vs approved dumping ground / lead chart"], riskIndicators: ["No KSPCB consent for large disposal", "No approved dumping ground / lead chart"], recommendedActions: ["Produce the KSPCB consent, C&D-waste authorisation, approved dumping ground and lead chart."] },
  { key: "labour", label: "Labour Compliance", category: "Statutory", ruleRef: "Workmen's Compensation Act 1923; BOCW Act & cess; labour laws", keywords: /labour|labor|workmen|BOCW|minimum wage|EPF|ESI|cess/i, findingCats: ["DEDUCTION"], requiredDocs: ["Labour licence, BOCW cess payment and workmen records"], evidenceSources: ["Labour / BOCW records"], crossChecks: ["BOCW cess deducted", "Workmen insured"], riskIndicators: ["No BOCW cess deduction", "No workmen's compensation cover"], recommendedActions: ["Produce the labour licence, BOCW cess payment and workmen's-compensation cover."] },
];

/** The Engineering Compliance Matrix — one ComplianceRule per dimension. */
export const ENGINEERING_COMPLIANCE_MATRIX: ComplianceRule[] = SPECS.map((spec) => {
  const evaluate =
    spec.special === "insurance"
      ? insuranceEvaluate(spec)
      : spec.special === "boq"
        ? boqEvaluate(spec)
        : spec.special === "tvcc"
          ? tvccEvaluate(spec)
          : genericEvaluate(spec);
  return {
    key: spec.key,
    label: spec.label,
    category: spec.category,
    ruleRef: spec.ruleRef,
    ruleVersion: RULE_VERSION,
    appliesTo: () => true,
    requiredDocs: spec.requiredDocs,
    evidenceSources: spec.evidenceSources,
    crossChecks: spec.crossChecks,
    riskIndicators: spec.riskIndicators,
    recommendedActions: spec.recommendedActions,
    evaluate,
  } satisfies ComplianceRule;
});
