import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";

/**
 * Per-document, unconditional legal/administrative reference extraction — reads
 * ONE document's text and transcribes AA/TS/agreement/tender/MDP/insurance
 * reference numbers and dates if they are visible, regardless of whether the
 * document has anything wrong with it. This is deliberately separate from the
 * forensic finding extractors (bill-extractor.ts, forensic-extractors.ts): those
 * only run on financial/eligibility/insurance-tagged documents and only surface
 * a fact when it's part of a flagged issue; this runs on every document and
 * surfaces a fact whether or not anything is wrong with it, so a letter's
 * References/Compliance sections can cite it either way.
 */
export interface DocRefItem {
  number?: string | null;
  date?: string | null;
  amount?: string | null;
  extra?: string | null;
}
export interface DocumentFactsExtraction {
  administrativeApproval: DocRefItem[];
  technicalSanction: DocRefItem[];
  agreementKw4: DocRefItem[];
  workOrder: DocRefItem[];
  tenderNotification: DocRefItem[];
  mineralDispatchPermit: DocRefItem[];
  royaltyChallan: DocRefItem[];
  insurancePolicy: DocRefItem[];
}

const EMPTY: DocumentFactsExtraction = {
  administrativeApproval: [], technicalSanction: [], agreementKw4: [], workOrder: [],
  tenderNotification: [], mineralDispatchPermit: [], royaltyChallan: [], insurancePolicy: [],
};

const SHAPE = `{
  "administrativeApproval": [{"number": "AA number", "date": "YYYY-MM-DD or raw text"}],
  "technicalSanction": [{"number": "TS number (include 'original' or 'modified/revised' in number if the document says which)", "date": "", "amount": "sanctioned amount if stated"}],
  "agreementKw4": [{"number": "agreement / KW-4 number", "date": "", "amount": "agreement value if stated"}],
  "workOrder": [{"number": "work order number", "date": ""}],
  "tenderNotification": [{"number": "tender / NIT / e-procurement reference", "date": "", "extra": "RFQ or open tender, if stated"}],
  "mineralDispatchPermit": [{"number": "MDP / mineral dispatch permit number", "date": "", "extra": "quarry / source name if stated"}],
  "royaltyChallan": [{"number": "royalty challan / DMG receipt number", "date": "", "amount": "royalty amount if stated"}],
  "insurancePolicy": [{"number": "policy number", "date": "validity start date if stated", "extra": "policy type e.g. CAR / WC / third-party"}]
}`;

/** Transcribe every AA/TS/agreement/tender/MDP/royalty/insurance reference visible
 *  in one document's text. Extraction only (temp 0) — never invents a number;
 *  omits a category entirely when nothing is visible for it. */
export async function extractDocumentFactsFromText(ocrText: string, cache?: boolean): Promise<DocumentFactsExtraction> {
  const text = (ocrText || "").trim();
  if (!text) return EMPTY;

  const system = extractorSystem(
    "Read one BBMP/PWD civil-works document (work order, technical sanction, administrative approval, KW-4 agreement, tender notification, mineral dispatch permit / royalty challan, insurance policy, or any other record) and transcribe ONLY the administrative/legal reference numbers and dates that are clearly visible for the categories below.",
  );
  const prompt = `Output STRICT JSON of EXACTLY this shape (use an empty array for any category with nothing visible):\n${SHAPE}\n\nDOCUMENT:\n${text.slice(0, 12_000)}`;

  const r = await extractJson<Partial<DocumentFactsExtraction>>({
    system,
    prompt,
    fallback: {},
    maxTokens: 700,
    cache: cache ? { system: true } : undefined,
  });
  if (!r.ok) return EMPTY;

  const arr = (v: unknown): DocRefItem[] =>
    Array.isArray(v) ? v.filter((x): x is DocRefItem => Boolean(x) && typeof x === "object") : [];
  const d = r.data;
  return {
    administrativeApproval: arr(d.administrativeApproval),
    technicalSanction: arr(d.technicalSanction),
    agreementKw4: arr(d.agreementKw4),
    workOrder: arr(d.workOrder),
    tenderNotification: arr(d.tenderNotification),
    mineralDispatchPermit: arr(d.mineralDispatchPermit),
    royaltyChallan: arr(d.royaltyChallan),
    insurancePolicy: arr(d.insurancePolicy),
  };
}
