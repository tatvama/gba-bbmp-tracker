/**
 * DOCX builder for the forensic letters. Server-side (Node) — produces an A4
 * Word document from a deterministic LetterSkeleton.
 *
 * Kannada is rendered via the COMPLEX-SCRIPT font slot (`cs` + complexScript:true),
 * NOT the East-Asian slot, which is the correct slot for Indic scripts in OOXML.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType,
} from "docx";
import type { LetterSkeleton } from "@/lib/letters/types";
import type { TableModel } from "@/lib/letters/tables";

const KN_FONT = "Nirmala UI"; // Windows Kannada-capable; viewers substitute Noto Sans Kannada etc.
const A4 = { width: 11906, height: 16838 }; // twips (210 × 297 mm)
const ACCENT = "9A6E14";
const LABEL_FILL = "F1ECE0";
const WARN_FILL = "FBE3E3";

function run(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}): TextRun {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italics,
    size: opts.size ?? 21, // half-points → ~10.5pt
    color: opts.color,
    font: { ascii: KN_FONT, hAnsi: KN_FONT, cs: KN_FONT },
    // @ts-expect-error docx accepts complexScript on IRunOptions at runtime
    complexScript: true,
  });
}

function para(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; color?: string; spaceAfter?: number } = {}): Paragraph {
  return new Paragraph({
    children: [run(text, opts)],
    alignment: opts.align,
    spacing: { after: opts.spaceAfter ?? 120 },
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string; width?: number; size?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: [run(text, { bold: opts.bold, size: opts.size })] })],
  });
}

/** A two-column label→value table for one ground (label cells shaded). */
function groundTable(labels: { label: string; value: string }[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: labels.map((l) =>
      new TableRow({
        children: [cell(l.label, { bold: true, fill: LABEL_FILL, width: 28 }), cell(l.value, { width: 72 })],
      }),
    ),
  });
}

/** A generic data table from a TableModel (header row shaded with the accent). */
function dataTable(model: TableModel): Table {
  const header = new TableRow({
    tableHeader: true,
    children: model.columns.map((c) => cell(c, { bold: true, fill: ACCENT, size: 19 })),
  });
  const body = model.rows.map((r) => new TableRow({ children: r.map((v) => cell(v, { size: 19 })) }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] });
}

/** Quantity-variation "chart": each row gets a shaded bar cell sized to % of tender. */
function quantityChart(model: TableModel): Table {
  // Expect columns: Item, Description, Tender qty, Revised qty, Cumulative, % of tender
  const pctIdx = model.columns.length - 1;
  const header = new TableRow({
    tableHeader: true,
    children: [cell("Item", { bold: true, fill: ACCENT, size: 19 }), cell("Description", { bold: true, fill: ACCENT, size: 19 }), cell("% of tender (bar)", { bold: true, fill: ACCENT, size: 19, width: 50 })],
  });
  const rows = model.rows.map((r) => {
    const pctRaw = r[pctIdx] ?? "";
    const pctNum = parseInt(pctRaw.replace(/[^\d]/g, ""), 10) || 0;
    const blocks = Math.min(20, Math.max(0, Math.round(pctNum / 25)));
    const over = pctNum > 125;
    const bar = "█".repeat(blocks) + (over ? "  ⚠ " : "  ") + pctRaw;
    return new TableRow({
      children: [cell(r[0] ?? "", { size: 19 }), cell(r[1] ?? "", { size: 19 }), cell(bar, { size: 19, fill: over ? WARN_FILL : undefined, width: 50 })],
    });
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

export interface DocxOptions {
  quantityTable?: TableModel | null;
  paymentTable?: TableModel | null;
  riskTable?: TableModel | null;
}

const ROW_CAP = 80; // bound table size so generation stays inside the serverless window

/** Build the Word document for a letter skeleton. Returns the .docx bytes. */
export async function buildLetterDocx(sk: LetterSkeleton, opts: DocxOptions = {}): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  const cap = <T,>(rows: T[]): { rows: T[]; omitted: number } => ({ rows: rows.slice(0, ROW_CAP), omitted: Math.max(0, rows.length - ROW_CAP) });

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(sk.title, { bold: true, size: 28, color: ACCENT })] }));

  // From / To
  for (const line of sk.fromBlock) children.push(para(line, { size: 20 }));
  children.push(para(""));
  children.push(para("ಗೆ,", { bold: true, size: 20 }));
  for (const line of sk.toBlock) children.push(para(line, { size: 20 }));
  children.push(para(""));

  children.push(para(sk.subject, { bold: true }));
  if (sk.flagSummary) {
    children.push(para(
      `ಧ್ವಜ ಸಾರಾಂಶ (Flags): RED ${sk.flagSummary.red} · ORANGE ${sk.flagSummary.orange} · AMBER ${sk.flagSummary.amber}`,
      { bold: true, color: ACCENT, size: 20 },
    ));
  }
  if (sk.references.length) {
    children.push(para("ಉಲ್ಲೇಖಗಳು:", { bold: true, size: 20 }));
    for (const r of sk.references) children.push(para(`• ${r}`, { size: 20 }));
  }
  children.push(para(""));
  children.push(para(sk.introduction));

  // Summary box
  if (sk.summaryBox.length) {
    const { rows, omitted } = cap(sk.summaryBox);
    children.push(para("ಸಾರಾಂಶ (Summary)", { bold: true, color: ACCENT }));
    children.push(dataTable({
      title: "",
      columns: ["#", "ಆಧಾರ", "ದಾಖಲೆ", "ಸಂದೇಹ", "ಅಪಾಯ", "ಬೇಕಾದ ದಾಖಲೆ"],
      rows: rows.map((r) => [String(r.slNo), r.ground, r.documentReference, r.whySuspicious, r.risk, r.recordDemanded]),
    }));
    if (omitted) children.push(para(`… and ${omitted} more (see the full audit report).`, { italics: true, size: 18 }));
    children.push(para(""));
  }

  // Loss estimate (figures + words)
  if (sk.lossBox) {
    children.push(para("ನಷ್ಟ ಲೆಕ್ಕ (Loss estimate)", { bold: true, color: ACCENT }));
    children.push(para(`ಖಚಿತ (Definite): ${sk.lossBox.definiteFigures} — ${sk.lossBox.definiteWords}`, { size: 20 }));
    children.push(para(`ಶಂಕಿತ (Suspected): ${sk.lossBox.suspectedFigures} — ${sk.lossBox.suspectedWords}`, { size: 20 }));
    if (sk.lossBox.lines.length) {
      children.push(dataTable({
        title: "",
        columns: ["ಅಂಶ (Item)", "ಮೊತ್ತ (Amount)"],
        rows: sk.lossBox.lines.map((l) => [l.note ? `${l.label} (${l.note})` : l.label, l.figures]),
      }));
    }
    children.push(para("ಮೇಲಿನ ಮೊತ್ತಗಳು ಶಂಕಿತ ಸಂಭಾವ್ಯ ನಷ್ಟ; ದಾಖಲೆ ಪರಿಶೀಲನೆಯ ನಂತರವೇ ಖಚಿತ.", { italics: true, size: 18 }));
    children.push(para(""));
  }

  // Grounds
  for (const g of sk.grounds) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 }, children: [run(`ಆಧಾರ ${g.number}: ${g.title}`, { bold: true, size: 23 })] }));
    children.push(groundTable(g.labels));
    children.push(para(""));
  }

  // Quantity chart
  if (opts.quantityTable && opts.quantityTable.rows.length) {
    children.push(para(opts.quantityTable.title, { bold: true, color: ACCENT }));
    children.push(quantityChart(opts.quantityTable));
    if (opts.quantityTable.note) children.push(para(opts.quantityTable.note, { italics: true, size: 18 }));
    children.push(para(""));
  }

  // Payment table
  if (opts.paymentTable && opts.paymentTable.rows.length) {
    children.push(para(opts.paymentTable.title, { bold: true, color: ACCENT }));
    children.push(dataTable(opts.paymentTable));
    children.push(para(""));
  }

  // Demands
  if (sk.demands.length) {
    children.push(para("ಬೇಡಿಕೆಗಳು (Demands)", { bold: true, color: ACCENT }));
    sk.demands.forEach((d, i) => children.push(para(`${i + 1}. ${d}`)));
    children.push(para(""));
  }

  children.push(para(sk.escalation));
  children.push(para(""));

  // Evidence index
  if (sk.evidenceIndex.length) {
    const { rows, omitted } = cap(sk.evidenceIndex);
    children.push(para("ಸಾಕ್ಷ್ಯ ಸೂಚಿ (Evidence index)", { bold: true, color: ACCENT }));
    children.push(dataTable({
      title: "",
      columns: ["Annexure", "ದಾಖಲೆ", "Grade", "ಸಾಬೀತಾಗುವ ಅಂಶ", "ಬೇಕಾದ ದಾಖಲೆ"],
      rows: rows.map((e) => [e.annexure, e.document, e.evidenceGrade, e.factProved, e.recordDemanded]),
    }));
    if (omitted) children.push(para(`… and ${omitted} more annexures (see the full audit report / CSV export).`, { italics: true, size: 18 }));
    children.push(para(""));
  }

  // Officer responsibility
  if (sk.officerResponsibility.length) {
    children.push(para("ಜವಾಬ್ದಾರಿ ಸ್ಪಷ್ಟನೆ (Officer responsibility)", { bold: true, color: ACCENT }));
    children.push(dataTable({
      title: "",
      columns: ["ಅಧಿಕಾರಿ", "ಕರ್ತವ್ಯ", "ಸಂಬಂಧಿತ ಅಂಶ", "ಬೇಕಾದ ಕ್ರಮ"],
      rows: sk.officerResponsibility.map((o) => [o.officer, o.dutyArea, o.findingLinked, o.actionRequested]),
    }));
    children.push(para(""));
  }

  // Risk table
  if (opts.riskTable && opts.riskTable.rows.length) {
    children.push(para(opts.riskTable.title, { bold: true, color: ACCENT }));
    children.push(dataTable(opts.riskTable));
    children.push(para(""));
  }

  // Caveat (boxed via shaded single-cell table)
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [cell(sk.caveat, { fill: LABEL_FILL, size: 19 })] })],
  }));
  children.push(para(""));

  for (const line of sk.closing) children.push(para(line, { bold: line === sk.closing.at(-1) }));

  // Copy-to (escalation chain)
  if (sk.ccBlock.length) {
    children.push(para(""));
    children.push(para("ಪ್ರತಿ (Copy to):", { bold: true, size: 20 }));
    sk.ccBlock.forEach((c, i) => children.push(para(`${i + 1}. ${c}`, { size: 20 })));
  }

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: A4.width, height: A4.height }, margin: { top: 1000, bottom: 1000, left: 1100, right: 1000 } } },
      children,
    }],
    styles: {
      default: {
        document: { run: { font: { ascii: KN_FONT, hAnsi: KN_FONT, cs: KN_FONT }, size: 21 } },
      },
    },
  });

  return Packer.toBuffer(doc);
}
