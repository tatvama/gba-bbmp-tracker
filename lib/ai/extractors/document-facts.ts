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

/** One Schedule-B / BOQ / estimate / measurement-book line item, transcribed
 *  verbatim. Only earthwork-excavation, dismantling and milling items are pulled
 *  (the accountability-relevant, un-reverifiable earthwork/disposal items the
 *  reference complaint tabulates) — not every item in the schedule. */
export interface ScheduleBLineItem {
  item?: string | null; // item number / Sl. No. as printed
  description?: string | null;
  qty?: string | null; // sanctioned/Schedule-B quantity as printed
  unit?: string | null; // Cum / Sqm / Mtr etc.
  rate?: string | null; // rate per unit as printed
  amount?: string | null; // amount at schedule rate, if printed
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
  scheduleBItems: ScheduleBLineItem[];
}

const EMPTY: DocumentFactsExtraction = {
  administrativeApproval: [], technicalSanction: [], agreementKw4: [], workOrder: [],
  tenderNotification: [], mineralDispatchPermit: [], royaltyChallan: [], insurancePolicy: [],
  scheduleBItems: [],
};

const SHAPE = `{
  "administrativeApproval": [{"number": "AA / GO number", "date": "", "amount": "sanctioned estimate value if stated", "authority": "issuing authority/office if stated"}],
  "technicalSanction": [{"number": "TS number (note in the number field if the document calls it 'original' or 'modified/revised')", "date": "", "amount": "sanctioned amount", "authority": "sanctioning authority (e.g. Chief Engineer, Zonal Commissioner)"}],
  "agreementKw4": [{"number": "agreement / KW-4 number", "date": "", "amount": "agreement/contract value", "contractorName": "contractor named in the agreement", "completionPeriod": "contract period / stipulated completion period or date", "performanceSecurity": "performance security / bank guarantee amount if stated", "defectLiabilityPeriod": "defect liability period if stated"}],
  "workOrder": [{"number": "work order number", "date": "", "authority": "issuing office"}],
  "tenderNotification": [{"number": "tender / NIT / e-procurement reference", "date": "", "amount": "estimated tender amount if stated", "tenderType": "RFQ, limited, or open tender, if stated", "publicationPeriod": "publication/bid period if stated", "bidders": "number of bidders or names, if stated"}],
  "mineralDispatchPermit": [{"number": "MDP / mineral dispatch permit number", "date": "", "validFrom": "", "validTo": "", "quarrySource": "quarry / source name if stated", "material": "material type e.g. sand, jelly, M-sand", "quantity": "permitted quantity if stated", "authority": "issuing DMG/mines office if stated"}],
  "royaltyChallan": [{"number": "royalty challan / DMG receipt number", "date": "", "amount": "royalty amount paid", "material": "material type", "quantity": "quantity if stated", "rate": "royalty rate per unit if stated", "authority": "DMG office if stated"}],
  "insurancePolicy": [{"number": "policy number", "insurer": "insurance company name", "policyType": "policy type e.g. CAR / WC / third-party", "validFrom": "", "validTo": "", "amount": "sum insured if stated"}],
  "scheduleBItems": [{"item": "item number / Sl.No. as printed e.g. 'Item 2' or '2'", "description": "the item description exactly as printed", "qty": "sanctioned/Schedule-B quantity as printed e.g. 9,763.25", "unit": "unit e.g. Cum / Sqm / Mtr", "rate": "rate per unit as printed", "amount": "amount at schedule rate as printed, if shown"}]
}`;

/** Transcribe every AA/TS/agreement/tender/MDP/royalty/insurance reference and
 *  its surrounding detail visible in one document's text. Extraction only
 *  (temp 0) — never invents a value; omits a field/category entirely when
 *  nothing is visible for it. */
export async function extractDocumentFactsFromText(ocrText: string, cache?: boolean): Promise<DocumentFactsExtraction> {
  const text = (ocrText || "").trim();
  if (!text) return EMPTY;

  const system = extractorSystem(
    "Read one BBMP/PWD civil-works document (work order, technical sanction, administrative approval, KW-4 agreement, tender notification, mineral dispatch permit / royalty challan, insurance policy, Schedule-B / bill of quantities / estimate / measurement book, or any other record) and transcribe ONLY the administrative/legal reference numbers and their surrounding detail (dates, amounts, validity, authority, contractor, quarry source, etc.) that are clearly visible for the categories below. For scheduleBItems, transcribe line items ONLY from a Schedule-B / BOQ / estimate / measurement-book quantity table that has quantity and rate columns, and ONLY the earthwork-excavation, dismantling and milling items (descriptions containing 'earth work'/'excavation', 'dismantling', or 'milling'); skip all other items (asphalting, WMM, GSB, kerb laying, drains, etc.) and omit the whole array if the document has no such table. Never infer or calculate a value that is not printed.",
  );
  const prompt = `Output STRICT JSON of EXACTLY this shape (use an empty array for any category with nothing visible; omit any field within an item that isn't clearly stated):\n${SHAPE}\n\nDOCUMENT:\n${text.slice(0, 16_000)}`;

  const r = await extractJson<Partial<DocumentFactsExtraction>>({
    system,
    prompt,
    fallback: {},
    maxTokens: 3500,
    cache: cache ? { system: true } : undefined,
  });
  if (!r.ok) return EMPTY;

  const arr = <T,>(v: unknown): T[] =>
    Array.isArray(v) ? v.filter((x): x is T => Boolean(x) && typeof x === "object") : [];
  const d = r.data;
  return {
    administrativeApproval: arr<DocRefItem>(d.administrativeApproval),
    technicalSanction: arr<DocRefItem>(d.technicalSanction),
    agreementKw4: arr<DocRefItem>(d.agreementKw4),
    workOrder: arr<DocRefItem>(d.workOrder),
    tenderNotification: arr<DocRefItem>(d.tenderNotification),
    mineralDispatchPermit: arr<DocRefItem>(d.mineralDispatchPermit),
    royaltyChallan: arr<DocRefItem>(d.royaltyChallan),
    insurancePolicy: arr<DocRefItem>(d.insurancePolicy),
    scheduleBItems: arr<ScheduleBLineItem>(d.scheduleBItems),
  };
}
