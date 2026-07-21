/**
 * Public health & solid waste. The Solid Waste Management Rules were re-notified
 * as the 2026 Rules (in force 1 April 2026), superseding the 2016 Rules. We cite
 * the 2026 Rules as current WITHOUT asserting a specific rule number for local-body
 * duties (that mapping is unverified for the 2026 text). The 2016 entry is retained
 * with `supersededBy` so the provider excludes it and the self-validator can prove
 * no repealed instrument is ever cited.
 */
import type { LegalReference } from "@/lib/legal/types";

export const HEALTH_WASTE_REFERENCES: LegalReference[] = [
  {
    id: "swm-rules-2026",
    instrument: "Solid Waste Management Rules",
    year: 2026,
    kind: "Rules",
    authorities: ["BBMP", "GBA"],
    categories: ["Health"],
    keywords: [
      "garbage",
      "waste",
      "solid waste",
      "dumping",
      "black spot",
      "segregation",
      "collection",
      "sanitation",
      "litter",
      "debris",
    ],
    priority: "High",
    confidence: "High",
    reason:
      "The Solid Waste Management Rules 2026 (under the Environment (Protection) Act 1986) place binding duties on local authorities for segregated collection, processing and safe disposal of solid waste.",
    conditions: "Cite by name; do not assert a specific rule number under the 2026 text (unverified).",
    source: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2219676",
    provisions: [
      {
        confidence: "High",
        obligation:
          "local authorities are bound to ensure the segregated collection, processing and safe disposal of solid waste and to prevent open dumping.",
        template:
          "The condition complained of appears inconsistent with the obligations imposed on the local authority under the Solid Waste Management Rules, 2026, which require segregated collection, processing and safe disposal of solid waste.",
      },
    ],
  },
  {
    // Retained ONLY to document the supersession — excluded from the active set.
    id: "swm-rules-2016",
    instrument: "Solid Waste Management Rules",
    year: 2016,
    kind: "Rules",
    authorities: ["BBMP", "GBA"],
    categories: ["Health"],
    keywords: ["garbage", "waste", "solid waste"],
    priority: "High",
    confidence: "High",
    supersededBy: "swm-rules-2026",
    reason: "Superseded by the Solid Waste Management Rules 2026 (in force 1 April 2026).",
    provisions: [
      {
        confidence: "High",
        obligation: "(superseded) duties of local authorities for solid waste management.",
        template: "(superseded — do not cite)",
      },
    ],
  },
  {
    id: "epa-1986",
    instrument: "Environment (Protection) Act",
    year: 1986,
    kind: "Act",
    authorities: ["BBMP", "GBA", "KSPCB"],
    // Keyword-gated (not category) so it surfaces for genuinely environmental
    // grievances rather than every public-health complaint.
    categories: [],
    keywords: [
      "pollution",
      "environment",
      "contamination",
      "hazardous",
      "burning",
      "effluent",
      "toxic",
      "waste",
      "dumping",
      "garbage",
    ],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Environment (Protection) Act 1986 is the umbrella statute empowering measures to protect and improve the environment and to prevent, control and abate pollution.",
    source: "https://www.indiacode.nic.in/bitstream/123456789/4316/1/ep_act_1986.pdf",
    provisions: [
      {
        ref: "Section 3",
        confidence: "High",
        obligation:
          "empowers the taking of all measures necessary to protect and improve the environment and to prevent, control and abate environmental pollution.",
        template:
          "The matter also engages the obligation to prevent and abate environmental harm under Section 3 of the Environment (Protection) Act, 1986.",
      },
    ],
  },
  {
    id: "plastic-waste-rules-2016",
    instrument: "Plastic Waste Management Rules",
    year: 2016,
    kind: "Rules",
    authorities: ["BBMP", "GBA", "KSPCB"],
    categories: [],
    keywords: ["plastic", "single use plastic", "carry bag", "polythene"],
    priority: "Medium",
    confidence: "High",
    reason: "The Plastic Waste Management Rules 2016 regulate the handling and disposal of plastic waste.",
    source: "https://www.pib.gov.in/newsite/printrelease.aspx?relid=138144",
    provisions: [
      {
        confidence: "High",
        obligation: "regulate the generation, collection and disposal of plastic waste.",
        template:
          "The handling of plastic waste in question is regulated by the Plastic Waste Management Rules, 2016.",
      },
    ],
  },
  {
    id: "cd-waste-rules-2016",
    instrument: "Construction and Demolition Waste Management Rules",
    year: 2016,
    kind: "Rules",
    authorities: ["BBMP", "GBA", "KSPCB"],
    categories: [],
    keywords: ["debris", "demolition waste", "construction waste", "malba", "rubble", "c&d waste"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The C&D Waste Management Rules 2016 require segregation and authorised disposal of construction and demolition waste.",
    source: "https://www.hspcb.org.in/uploads/laws/Cons_Rules.pdf",
    provisions: [
      {
        confidence: "High",
        obligation:
          "require the segregation and authorised collection and disposal of construction and demolition waste.",
        template:
          "The dumping of construction and demolition debris complained of is inconsistent with the Construction and Demolition Waste Management Rules, 2016.",
      },
    ],
  },
];
