/**
 * Letter skeleton assembler. Deterministically composes the full letter structure
 * (16 logical parts) from a LetterContext. Pure — no I/O, no AI.
 *
 * SAFETY: resolveSignatory() refuses to sign as Guruji / the Trust / Samsthana.
 */
import { LETTER_SIGNATORIES, type SignatoryKey, type LetterVariant } from "@/lib/constants";
import type { LetterContext, LetterSkeleton, LetterRecipient } from "./types";
import { buildGrounds, buildSummaryBox } from "./evidence-block";
import { buildEvidenceIndex, buildOfficerResponsibility } from "./evidence-index";
import { CAUTIOUS_SENTENCE_BANK } from "./letter-knowledge";

const FORBIDDEN_SIGNATORY = /guruji|samsthana|trust|sri\s+sai\s+samsthana/i;

/** Render a recipient/cc party into address lines. */
function partyLines(r: LetterRecipient): string[] {
  return [r.name, r.designation, r.office, r.address]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
}

/** Resolve a signatory; never permit signing on behalf of Guruji / the Trust. */
export function resolveSignatory(key: SignatoryKey) {
  const s = LETTER_SIGNATORIES[key];
  if (!s) throw new Error(`Unknown signatory: ${key}`);
  if (FORBIDDEN_SIGNATORY.test(s.name) || (s.address && FORBIDDEN_SIGNATORY.test(s.address.replace(/Sai Residency|Sri Sai Raghav/gi, "")))) {
    throw new Error("Letters must not be signed on behalf of Guruji or the Trust.");
  }
  return s;
}

const TITLES: Record<LetterVariant, string> = {
  bill_stop: "ಬಿಲ್ ತಡೆಹಿಡಿಯುವ ಮನವಿ / ದೂರು (Bill-stop notice)",
  lokayukta: "ಲೋಕಾಯುಕ್ತ ದೂರು (Lokayukta complaint)",
  rti: "ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ (RTI application)",
  bilingual_summary: "ಪರಿಶೀಲನಾ ಸಾರಾಂಶ (Forensic summary)",
};

function recipientBlock(variant: LetterVariant, ctx: LetterContext): string[] {
  // Explicit "To Whom" from the Audit & Draft wizard overrides the variant default.
  if (ctx.recipient) {
    const lines = partyLines(ctx.recipient);
    if (lines.length) return lines;
  }
  switch (variant) {
    case "lokayukta":
      return ["ಮಾನ್ಯ ಲೋಕಾಯುಕ್ತರು / ಉಪ ಲೋಕಾಯುಕ್ತರು", "ಕರ್ನಾಟಕ ಲೋಕಾಯುಕ್ತ", "ಬೆಂಗಳೂರು"];
    case "rti":
      return ["ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿ ಅಧಿಕಾರಿ (PIO)", ctx.division ? `${ctx.division}, ` : "", "ಬೃಹತ್ ಬೆಂಗಳೂರು / GBA"].filter(Boolean);
    default:
      return ["ಮುಖ್ಯ ಎಂಜಿನಿಯರ್ / ಕಾರ್ಯನಿರ್ವಾಹಕ ಎಂಜಿನಿಯರ್", ctx.division ? `${ctx.division}` : "ಸಂಬಂಧಿತ ವಿಭಾಗ", "ಬೃಹತ್ ಬೆಂಗಳೂರು / GBA"];
  }
}

function demandsFor(variant: LetterVariant): string[] {
  if (variant === "rti") {
    return [
      "ಮೇಲಿನ ಪ್ರತಿ ಅಂಶಕ್ಕೆ ಸಂಬಂಧಿಸಿದ ಪ್ರಮಾಣೀಕೃತ ದಾಖಲೆಗಳ ನಕಲುಗಳನ್ನು ಒದಗಿಸಬೇಕು.",
      "ಸಂಬಂಧಿತ ಫೈಲ್ ನೋಟಿಂಗ್ ಮತ್ತು ಅನುಮೋದನೆ ಆದೇಶಗಳ ನಕಲುಗಳನ್ನು ಒದಗಿಸಬೇಕು.",
    ];
  }
  const base = [
    "ಮೇಲಿನ ಪ್ರತಿ ಅಂಶಕ್ಕೆ ಮೂಲ ದಾಖಲೆಗಳನ್ನು ಹಾಜರುಪಡಿಸಿ ಲಿಖಿತ ಸ್ಪಷ್ಟೀಕರಣ ನೀಡಬೇಕು.",
    "ಸ್ಪಷ್ಟೀಕರಣ ದೊರೆಯುವವರೆಗೆ ಸಂಬಂಧಿತ ಬಿಲ್ ಪಾವತಿಯನ್ನು ತಡೆಹಿಡಿಯಬೇಕು.",
  ];
  if (variant === "lokayukta") {
    base.push("ಸ್ವತಂತ್ರ ತಾಂತ್ರಿಕ ಪರಿಶೀಲನೆ ಮತ್ತು ಅಗತ್ಯವಿದ್ದಲ್ಲಿ ಸ್ಥಳ ತಪಾಸಣೆ ನಡೆಸಬೇಕು.");
  }
  return base;
}

/** Assemble the full letter skeleton from context. */
export function assembleSkeleton(ctx: LetterContext): LetterSkeleton {
  // "From Whom": a custom applicant, or a registered signatory. Either way the
  // forbidden-signatory guard applies — never sign for Guruji / the Trust.
  let fromBlock: string[];
  let signerName: string;
  if (ctx.customSender && ctx.customSender.name.trim()) {
    const cs = ctx.customSender;
    if (FORBIDDEN_SIGNATORY.test(`${cs.name} ${cs.address ?? ""}`)) {
      throw new Error("Letters must not be signed on behalf of Guruji or the Trust.");
    }
    fromBlock = [cs.name, cs.address ?? "", cs.mobile ? `ದೂರವಾಣಿ: ${cs.mobile}` : ""].filter(Boolean) as string[];
    signerName = cs.name;
  } else {
    const s = resolveSignatory(ctx.signatoryKey);
    fromBlock = [s.name, s.address, s.mobile ? `ದೂರವಾಣಿ: ${s.mobile}` : ""].filter(Boolean) as string[];
    signerName = s.name;
  }

  const ccBlock = (ctx.ccChain ?? [])
    .map((r) => partyLines(r).join(", "))
    .filter(Boolean);

  const refs: string[] = [];
  if (ctx.jobCode) refs.push(`ಕೆಲಸ ಸಂಕೇತ (Job code): ${ctx.jobCode}`);
  if (ctx.workName) refs.push(`ಕಾಮಗಾರಿ: ${ctx.workName}`);
  if (ctx.ward) refs.push(`ವಾರ್ಡ್: ${ctx.ward}`);
  if (ctx.contractor) refs.push(`ಗುತ್ತಿಗೆದಾರ: ${ctx.contractor}`);
  if (ctx.lokayuktaRef) refs.push(`ಉಲ್ಲೇಖ: ${ctx.lokayuktaRef}`);
  for (const r of ctx.references ?? []) refs.push(r);

  const subject =
    ctx.variant === "rti"
      ? `ವಿಷಯ: ${ctx.jobCode || "ಕಾಮಗಾರಿ"} ಕಾಮಗಾರಿಯ ಬಿಲ್, ಎಂ.ಬಿ ಮತ್ತು ಸಂಬಂಧಿತ ದಾಖಲೆಗಳ ಮಾಹಿತಿ ಕೋರಿ`
      : `ವಿಷಯ: ${ctx.jobCode || "ಕಾಮಗಾರಿ"} ಕಾಮಗಾರಿಯ ಬಿಲ್ ಪಾವತಿಯಲ್ಲಿ ಕಂಡುಬಂದ ಸಂದೇಹಗಳ ಬಗ್ಗೆ ಪರಿಶೀಲನೆ ಕೋರಿ`;

  return {
    title: TITLES[ctx.variant],
    fromBlock,
    toBlock: recipientBlock(ctx.variant, ctx),
    ccBlock,
    subject,
    references: refs,
    introduction: CAUTIOUS_SENTENCE_BANK.introduction,
    summaryBox: buildSummaryBox(ctx.findings),
    grounds: buildGrounds(ctx.findings),
    demands: demandsFor(ctx.variant),
    escalation: CAUTIOUS_SENTENCE_BANK.escalation,
    closing: ["ತಮ್ಮ ವಿಶ್ವಾಸಿ,", signerName],
    evidenceIndex: buildEvidenceIndex(ctx.findings),
    officerResponsibility: buildOfficerResponsibility(ctx.findings),
    caveat: CAUTIOUS_SENTENCE_BANK.caveat,
    flagSummary: ctx.flagSummary ?? null,
    lossBox: ctx.lossBox ?? null,
  };
}

/** Render the skeleton to plain text (for preview, .txt export and the linter). */
export function skeletonToPlainText(sk: LetterSkeleton): string {
  const L: string[] = [];
  L.push(sk.title, "");
  L.push("ರವರಿಂದ (From):", ...sk.fromBlock, "");
  L.push("ಗೆ (To):", ...sk.toBlock, "");
  L.push(sk.subject, "");
  if (sk.flagSummary) {
    L.push(`ಧ್ವಜ ಸಾರಾಂಶ (Flags): RED ${sk.flagSummary.red}, ORANGE ${sk.flagSummary.orange}, AMBER ${sk.flagSummary.amber}`, "");
  }
  if (sk.references.length) L.push("ಉಲ್ಲೇಖಗಳು:", ...sk.references, "");
  L.push(sk.introduction, "");
  if (sk.summaryBox.length) {
    L.push("ಸಾರಾಂಶ (Summary):");
    for (const r of sk.summaryBox) L.push(`${r.slNo}. ${r.ground} — ${r.documentReference} — ${r.whySuspicious} [${r.risk}] → ${r.recordDemanded}`);
    L.push("");
  }
  if (sk.lossBox) {
    L.push("ನಷ್ಟ ಲೆಕ್ಕ (Loss estimate):");
    L.push(`ಖಚಿತ (Definite): ${sk.lossBox.definiteFigures} — ${sk.lossBox.definiteWords}`);
    L.push(`ಶಂಕಿತ (Suspected): ${sk.lossBox.suspectedFigures} — ${sk.lossBox.suspectedWords}`);
    for (const ln of sk.lossBox.lines) L.push(`   • ${ln.label}: ${ln.figures}${ln.note ? ` (${ln.note})` : ""}`);
    L.push("");
  }
  for (const g of sk.grounds) {
    L.push(`ಆಧಾರ ${g.number}: ${g.title}`);
    for (const lab of g.labels) L.push(`  ${lab.label}: ${lab.value}`);
    L.push("");
  }
  if (sk.demands.length) {
    L.push("ಬೇಡಿಕೆಗಳು (Demands):");
    sk.demands.forEach((d, i) => L.push(`${i + 1}. ${d}`));
    L.push("");
  }
  L.push(sk.escalation, "");
  if (sk.evidenceIndex.length) {
    L.push("ಸಾಕ್ಷ್ಯ ಸೂಚಿ (Evidence index):");
    for (const e of sk.evidenceIndex) L.push(`${e.annexure}: ${e.document} (${e.evidenceGrade}) — ${e.factProved} → ${e.recordDemanded}`);
    L.push("");
  }
  if (sk.officerResponsibility.length) {
    L.push("ಜವಾಬ್ದಾರಿ (Officer responsibility):");
    for (const o of sk.officerResponsibility) L.push(`${o.officer} — ${o.dutyArea} — ${o.findingLinked}`);
    L.push("");
  }
  L.push(sk.caveat, "");
  L.push(...sk.closing);
  if (sk.ccBlock.length) {
    L.push("", "ಪ್ರತಿ (Copy to):");
    sk.ccBlock.forEach((c, i) => L.push(`${i + 1}. ${c}`));
  }
  return L.join("\n");
}

const VARIANT_TAG: Record<LetterVariant, string> = {
  bill_stop: "BillStop",
  lokayukta: "Lokayukta",
  rti: "RTI",
  bilingual_summary: "Summary",
};

/** Build a safe download file name (without extension). */
export function letterFileName(ctx: LetterContext): string {
  const s = LETTER_SIGNATORIES[ctx.signatoryKey];
  const job = (ctx.jobCode || "job").replace(/[^\w-]+/g, "_");
  return `${VARIANT_TAG[ctx.variant]}_${job}_${s?.fileTag ?? "Signatory"}`;
}
