import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_TYPES, type ComplaintType } from "@/lib/constants";

/**
 * Classify a BBMP complaint / public-works case into exactly ONE responsible
 * department (the complaints.type vocabulary). Used by the forensic ZIP importer
 * and convertJobCaseCore so imported complaints get a real department instead of
 * a hardcoded type. Best-effort: returns "Other" when AI is off, the input is
 * empty, or the model returns something outside the known set — never throws.
 */

const FALLBACK: ComplaintType = "Other";

const DEPARTMENT_GUIDE = `Pick the single BBMP department responsible for the case:
- "Road Infrastructure" — roads, asphalting/tarring, whitetopping, concreting, footpaths, potholes, road widening; tender/works/contractor issues on ROAD works.
- "Storm Water Drain" — storm-water drains, rajakaluves, nalas, drain construction/desilting, flooding & water-logging. (Sewer LINES are BWSSB, but the drain/rajakaluve itself is SWD.)
- "Lakes" — lakes, tanks, kere, lake rejuvenation/encroachment, bunds.
- "Electrical" — street lighting, poles, high-mast lights, electrical works.
- "Horticulture" — parks, gardens, avenue/roadside trees, tree-cutting/planting, playgrounds.
- "Town Planning" — building plan sanction, building bye-law violations, unauthorised construction, land/road encroachment, layout/OC/khata planning matters.
- "Revenue" — property tax, khata, estate, advertisement/hoarding fees, trade licence, revenue recovery.
- "Health" — solid-waste/garbage, sanitation, public health, hospitals, mosquito/fogging, food safety.
- "Legal" — legal notices, court cases, litigation.
- "IT" — software, portal, website, e-governance, data/IT systems.
- "Other" — only when nothing above clearly fits.`;

export async function classifyComplaintType(text: string): Promise<ComplaintType> {
  // work + summary lead, so the 6k slice keeps the strongest signal even when a
  // long letter/OCR blob follows.
  const source = (text || "").replace(/\s+/g, " ").trim().slice(0, 6000);
  if (!source || !isAiConfigured()) return FALLBACK;

  const system = extractorSystem(
    "Classify a BBMP (Bengaluru municipal) complaint / public-works case into exactly ONE responsible department.",
  );
  const prompt = `${DEPARTMENT_GUIDE}

Return STRICT JSON: {"type": "<exactly one label from the list above>"}.

CASE:
${source}`;

  const r = await extractJson<{ type?: string }>({ system, prompt, fallback: {}, maxTokens: 40 });
  if (!r.ok) return FALLBACK;
  const raw = String(r.data?.type ?? "").trim().toLowerCase();
  return COMPLAINT_TYPES.find((t) => t.toLowerCase() === raw) ?? FALLBACK;
}
