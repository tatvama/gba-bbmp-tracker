/**
 * Accountability & transparency — corruption, maladministration, service conduct,
 * and the right to information. All keyword-gated so they surface only when the
 * facts raise the issue; a routine civic complaint does not attract them.
 *
 * The Whistle Blowers Protection Act 2011 (Act 17 of 2014) is deliberately NOT
 * included: it was never operationalised, so it is not an enforceable remedy.
 */
import type { LegalReference } from "@/lib/legal/types";

export const ANTICORRUPTION_REFERENCES: LegalReference[] = [
  {
    id: "pc-act-1988",
    instrument: "Prevention of Corruption Act",
    year: 1988,
    kind: "Act",
    authorities: ["Any"],
    categories: [],
    keywords: [
      "bribe",
      "bribery",
      "corruption",
      "illegal gratification",
      "demanded money",
      "demanded bribe",
      "kickback",
      "extortion",
      "misuse of office",
      "misuse of power",
      "abuse of office",
      "favouritism",
    ],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Prevention of Corruption Act 1988 (as amended in 2018) penalises a public servant taking an undue advantage and criminal misconduct.",
    conditions: "Cite only where bribery or misuse of official position is alleged; frame as 'if substantiated'.",
    source: "https://www.indiacode.nic.in/bitstream/123456789/15302/1/pc_act,_1988.pdf",
    provisions: [
      {
        ref: "Section 7",
        confidence: "High",
        obligation:
          "makes it an offence for a public servant to obtain or accept an undue advantage in relation to the performance of a public duty.",
        template:
          "The allegation, if substantiated, may attract the provisions of Section 7 of the Prevention of Corruption Act, 1988, relating to a public servant accepting an undue advantage.",
      },
      {
        ref: "Section 13",
        confidence: "High",
        obligation: "defines and penalises criminal misconduct by a public servant.",
        template:
          "Conduct of this nature, if established, may also amount to criminal misconduct under Section 13 of the Prevention of Corruption Act, 1988.",
      },
    ],
  },
  {
    id: "karnataka-lokayukta-1984",
    instrument: "Karnataka Lokayukta Act",
    year: 1984,
    kind: "Act",
    authorities: ["Lokayukta", "BBMP", "GBA"],
    categories: [],
    keywords: ["corruption", "bribe", "bribery", "maladministration", "grievance against officer", "misuse", "inaction", "abuse of power", "lokayukta"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Karnataka Lokayukta Act 1984 empowers the Lokayukta and Upalokayukta to investigate grievances and allegations against public servants.",
    conditions: "Cite where the matter is being placed before, or is fit for, the Lokayukta.",
    source: "https://lokayukta.kar.nic.in/pages/kla_act.html",
    provisions: [
      {
        confidence: "High",
        obligation:
          "the Lokayukta and Upalokayukta are empowered to investigate grievances and allegations against public servants and to report thereon.",
        template:
          "The matter is a fit subject for investigation into the grievance and the conduct of the public servants concerned under the Karnataka Lokayukta Act, 1984.",
      },
    ],
  },
  {
    id: "karnataka-conduct-rules-1966",
    instrument: "Karnataka Civil Services (Conduct) Rules",
    year: 1966,
    kind: "Rules",
    authorities: ["Any"],
    categories: [],
    keywords: ["misconduct", "integrity", "dereliction", "negligence of duty", "misuse", "conduct of officer", "favouritism", "bribe", "bribery", "corruption"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Karnataka Civil Services (Conduct) Rules 1966 require every government servant to maintain absolute integrity and devotion to duty.",
    source: "https://dpar.karnataka.gov.in/new-page/Conduct-rules%201966/en",
    provisions: [
      {
        ref: "Rule 3",
        confidence: "High",
        obligation:
          "requires every government servant to maintain absolute integrity and devotion to duty and to do nothing unbecoming of a government servant.",
        template:
          "The conduct in question, if established, is inconsistent with the obligation of absolute integrity and devotion to duty under Rule 3 of the Karnataka Civil Services (Conduct) Rules, 1966.",
      },
    ],
  },
  {
    id: "rti-act-2005",
    instrument: "Right to Information Act",
    year: 2005,
    kind: "Act",
    authorities: ["Any"],
    categories: ["IT", "Legal"],
    keywords: [
      "rti",
      "right to information",
      "information",
      "records",
      "no reply",
      "not responded",
      "no response",
      "delay",
      "documents not provided",
      "certified copies",
      "disclosure",
    ],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Right to Information Act 2005 obliges public authorities to disclose information proactively and to furnish requested information within statutory time limits.",
    source: "https://www.indiacode.nic.in/handle/123456789/1362",
    provisions: [
      {
        ref: "Section 4(1)(b)",
        confidence: "High",
        obligation:
          "obliges every public authority to publish and proactively disclose specified categories of information about its functioning.",
        template:
          "The information sought is of a nature that ought to be proactively disclosed by the public authority under Section 4(1)(b) of the Right to Information Act, 2005.",
      },
      {
        ref: "Sections 6 and 7",
        confidence: "High",
        keywords: ["rti", "application", "furnish", "30 days", "no reply", "not furnished"],
        obligation:
          "entitle a citizen to request information and require its disposal within the statutory time limit.",
        template:
          "The requested information is required to be furnished within the statutory time prescribed under Sections 6 and 7 of the Right to Information Act, 2005.",
      },
      {
        ref: "Section 19",
        confidence: "High",
        keywords: ["appeal", "first appeal", "second appeal", "information commission"],
        obligation:
          "provides the appellate remedy where information is denied or not furnished within time.",
        template:
          "In the event of non-disclosure, the appellate remedy under Section 19 of the Right to Information Act, 2005 is available.",
      },
    ],
  },
];
