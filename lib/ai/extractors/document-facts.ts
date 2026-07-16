import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";

/**
 * Per-document, unconditional legal/administrative reference extraction — reads
 * ONE document's text and transcribes every AA/TS/agreement/tender/MDP/royalty/
 * insurance reference visible, with its full surrounding detail (validity,
 * amounts, authority, contractor, quarry source, etc.) — regardless of whether
 * the document has anything wrong with it. This is deliberately separate from
 * the forensic finding extractors (bill-extractor.ts, forensic-extractors.ts):
 * those only run on financial/eligibility/insurance-tagged documents and only
 * surface a fact when it's part of a flagged issue; this runs on every document
 * and surfaces a fact whether or not anything is wrong with it, so a letter's
 * References/Compliance sections can cite it either way.
 */
export interface DocRefItem {
  number?: string | null;
  date?: string | null;
  amount?: string | null;
  authority?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  material?: string | null;
  quantity?: string | null;
  rate?: string | null;
  contractorName?: string | null;
  completionPeriod?: string | null;
  performanceSecurity?: string | null;
  defectLiabilityPeriod?: string | null;
  quarrySource?: string | null;
  insurer?: string | null;
  policyType?: string | null;
  tenderType?: string | null;
  publicationPeriod?: string | null;
  bidders?: string | null;
  /** Anything else visibly tied to this reference that doesn't fit another field. */
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
  "administrativeApproval": [{"number": "AA / GO number", "date": "", "amount": "sanctioned estimate value if stated", "authority": "issuing authority/office if stated"}],
  "technicalSanction": [{"number": "TS number (note in the number field if the document calls it 'original' or 'modified/revised')", "date": "", "amount": "sanctioned amount", "authority": "sanctioning authority (e.g. Chief Engineer, Zonal Commissioner)"}],
  "agreementKw4": [{"number": "agreement / KW-4 number", "date": "", "amount": "agreement/contract value", "contractorName": "contractor named in the agreement", "completionPeriod": "contract period / stipulated completion period or date", "performanceSecurity": "performance security / bank guarantee amount if stated", "defectLiabilityPeriod": "defect liability period if stated"}],
  "workOrder": [{"number": "work order number", "date": "", "authority": "issuing office"}],
  "tenderNotification": [{"number": "tender / NIT / e-procurement reference", "date": "", "amount": "estimated tender amount if stated", "tenderType": "RFQ, limited, or open tender, if stated", "publicationPeriod": "publication/bid period if stated", "bidders": "number of bidders or names, if stated"}],
  "mineralDispatchPermit": [{"number": "MDP / mineral dispatch permit number", "date": "", "validFrom": "", "validTo": "", "quarrySource": "quarry / source name if stated", "material": "material type e.g. sand, jelly, M-sand", "quantity": "permitted quantity if stated", "authority": "issuing DMG/mines office if stated"}],
  "royaltyChallan": [{"number": "royalty challan / DMG receipt number", "date": "", "amount": "royalty amount paid", "material": "material type", "quantity": "quantity if stated", "rate": "royalty rate per unit if stated", "authority": "DMG office if stated"}],
  "insurancePolicy": [{"number": "policy number", "insurer": "insurance company name", "policyType": "policy type e.g. CAR / WC / third-party", "validFrom": "", "validTo": "", "amount": "sum insured if stated"}]
}`;

/** Transcribe every AA/TS/agreement/tender/MDP/royalty/insurance reference and
 *  its surrounding detail visible in one document's text. Extraction only
 *  (temp 0) — never invents a value; omits a field/category entirely when
 *  nothing is visible for it. */
export async function extractDocumentFactsFromText(ocrText: string, cache?: boolean): Promise<DocumentFactsExtraction> {
  const text = (ocrText || "").trim();
  if (!text) return EMPTY;

  const system = extractorSystem(
    "Read one BBMP/PWD civil-works document (work order, technical sanction, administrative approval, KW-4 agreement, tender notification, mineral dispatch permit / royalty challan, insurance policy, or any other record) and transcribe ONLY the administrative/legal reference numbers and their surrounding detail (dates, amounts, validity, authority, contractor, quarry source, etc.) that are clearly visible for the categories below.",
  );
  const prompt = `Output STRICT JSON of EXACTLY this shape (use an empty array for any category with nothing visible; omit any field within an item that isn't clearly stated):\n${SHAPE}\n\nDOCUMENT:\n${text.slice(0, 12_000)}`;

  const r = await extractJson<Partial<DocumentFactsExtraction>>({
    system,
    prompt,
    fallback: {},
    maxTokens: 1500,
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
