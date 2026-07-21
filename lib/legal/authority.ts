/**
 * Receiving-authority resolution. The same complaint can invoke different statutes
 * depending on who the letter is addressed to (a letter to BWSSB engages the BWSSB
 * Act; to BESCOM, the Electricity Act; to the Lokayukta, the Lokayukta Act). This
 * derives the authority from the draft kind and the free-text recipient signals —
 * no new DB column is assumed. Defaults to BBMP (the common case).
 */
import type { ComplaintDraftKind } from "@/lib/constants";
import type { LegalAuthority } from "@/lib/legal/types";

export interface AuthoritySignals {
  draftKind: ComplaintDraftKind;
  responsibleDepartment?: string | null;
  engineerDesignation?: string | null;
  officeName?: string | null;
}

/** Draft kinds that are addressed to a specific escalation authority. */
const KIND_AUTHORITY: Partial<Record<ComplaintDraftKind, LegalAuthority>> = {
  lokayukta_complaint: "Lokayukta",
  chief_secretary_letter: "Chief Secretary",
  cm_office_letter: "CM Office",
};

export function resolveReceivingAuthority(signals: AuthoritySignals): LegalAuthority {
  const byKind = KIND_AUTHORITY[signals.draftKind];
  if (byKind) return byKind;

  const hay = [signals.responsibleDepartment, signals.officeName, signals.engineerDesignation]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bbwssb\b|water supply|sewerage board|water board/.test(hay)) return "BWSSB";
  if (/\bbescom\b|\bescom\b|electricity board|electricity supply/.test(hay)) return "BESCOM";
  if (/\bbda\b|development authority/.test(hay)) return "BDA";
  if (/pollution control|\bkspcb\b/.test(hay)) return "KSPCB";
  if (/forest/.test(hay)) return "Forest Department";
  if (/traffic police|traffic/.test(hay)) return "Traffic Police";
  if (/\bpolice\b/.test(hay)) return "Police";
  if (/lokayukta/.test(hay)) return "Lokayukta";

  // Default: the complaint is against BBMP / the Greater Bengaluru Authority.
  return "BBMP";
}
