/**
 * Public nuisance under the new criminal codes (in force 1 July 2024): the
 * Bharatiya Nyaya Sanhita 2023 (offence) and the Bharatiya Nagarik Suraksha Sanhita
 * 2023 (the magistrate's removal power, formerly CrPC Section 133). Keyword-gated.
 */
import type { LegalReference } from "@/lib/legal/types";

export const NUISANCE_REFERENCES: LegalReference[] = [
  {
    id: "bns-2023",
    instrument: "Bharatiya Nyaya Sanhita",
    year: 2023,
    kind: "Sanhita",
    authorities: ["Any"],
    categories: [],
    keywords: ["nuisance", "public nuisance", "obstruction", "stench", "stink", "foul smell", "hazard", "danger to public", "injury to public"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Bharatiya Nyaya Sanhita 2023 defines and penalises public nuisance (replacing the corresponding Indian Penal Code provisions).",
    conditions: "Cite where the grievance amounts to a public nuisance endangering health, safety or convenience.",
    source: "https://www.indiacode.nic.in/bitstream/123456789/20062/1/a2023-45.pdf",
    provisions: [
      {
        ref: "Section 270",
        confidence: "High",
        obligation:
          "defines a public nuisance as an act or omission causing common injury, danger or annoyance to the public.",
        template:
          "The condition complained of appears to constitute a public nuisance within the meaning of Section 270 of the Bharatiya Nyaya Sanhita, 2023.",
      },
      {
        ref: "Section 292",
        confidence: "High",
        obligation: "prescribes the punishment for a public nuisance not otherwise specifically provided for.",
        template:
          "Such a public nuisance is punishable under Section 292 of the Bharatiya Nyaya Sanhita, 2023.",
      },
    ],
  },
  {
    id: "bnss-2023",
    instrument: "Bharatiya Nagarik Suraksha Sanhita",
    year: 2023,
    kind: "Sanhita",
    authorities: ["Any", "Police"],
    categories: [],
    keywords: ["nuisance", "public nuisance", "obstruction", "removal of nuisance", "conditional order", "hazard"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Bharatiya Nagarik Suraksha Sanhita 2023 empowers a Magistrate to pass a conditional order for the removal of a public nuisance (the successor to CrPC Section 133).",
    source: "https://indiankanoon.org/doc/13685345/",
    provisions: [
      {
        ref: "Section 152",
        confidence: "High",
        obligation:
          "empowers an Executive Magistrate to pass a conditional order requiring the removal of a public nuisance.",
        template:
          "The public nuisance is amenable to a conditional order for its removal under Section 152 of the Bharatiya Nagarik Suraksha Sanhita, 2023.",
      },
    ],
  },
];
