/**
 * Utilities governed by their own statutes and their own authorities: water &
 * sewerage (BWSSB) and electricity (BESCOM). These are AUTHORITY-gated so they only
 * surface when the letter concerns / is addressed to the utility in question — a
 * pothole letter to a BBMP road engineer never carries the BWSSB or Electricity Act.
 */
import type { LegalReference } from "@/lib/legal/types";

export const UTILITY_REFERENCES: LegalReference[] = [
  {
    id: "bwssb-1964",
    instrument: "Bangalore Water Supply and Sewerage Act",
    year: 1964,
    kind: "Act",
    // Water/sewerage may be raised via BBMP but is governed by the BWSSB Act; not
    // relevant to a BESCOM letter, so BESCOM is deliberately absent here.
    authorities: ["BWSSB", "BBMP", "GBA"],
    categories: [],
    keywords: [
      "water supply",
      "drinking water",
      "water connection",
      "no water",
      "water bill",
      "sewerage",
      "sewer line",
      "sewage line",
      "bwssb",
      "contaminated water",
      "manhole",
    ],
    priority: "High",
    confidence: "High",
    reason:
      "The Bangalore Water Supply and Sewerage Act 1964 constitutes the BWSSB and governs the supply of water and sewerage/sewage disposal in Bengaluru.",
    source: "https://www.indiacode.nic.in/handle/123456789/7908",
    provisions: [
      {
        confidence: "High",
        obligation:
          "the Board is responsible for the supply of water and for sewerage and sewage disposal within its area.",
        template:
          "The supply of water and the management of sewerage at the location fall within the statutory responsibility of the Board under the Bangalore Water Supply and Sewerage Act, 1964.",
      },
    ],
  },
  {
    id: "electricity-act-2003",
    instrument: "Electricity Act",
    year: 2003,
    kind: "Act",
    authorities: ["BESCOM"],
    categories: ["Electrical"],
    keywords: ["power", "electricity", "transformer", "power cut", "voltage", "bescom", "current", "electrocution", "power supply", "billing"],
    priority: "High",
    confidence: "High",
    reason:
      "The Electricity Act 2003 governs the distribution licensee's obligations to consumers, including grievance redressal and standards of performance.",
    conditions: "Cite for BESCOM electricity-supply grievances (not BBMP street lighting).",
    source: "https://www.appindia.org.in/electricity-act-2003",
    provisions: [
      {
        ref: "Section 42",
        confidence: "High",
        obligation:
          "requires the distribution licensee to establish a Consumer Grievance Redressal Forum, with recourse to the Electricity Ombudsman.",
        template:
          "The grievance is required to be addressed through the Consumer Grievance Redressal Forum established under Section 42 of the Electricity Act, 2003, with further recourse to the Electricity Ombudsman.",
      },
      {
        ref: "Section 57",
        confidence: "High",
        obligation:
          "obliges the licensee to meet the standards of performance, failing which compensation is payable.",
        template:
          "The licensee is bound to meet the standards of performance prescribed under Section 57 of the Electricity Act, 2003.",
      },
    ],
  },
];
