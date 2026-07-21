/**
 * Parks, playgrounds, open spaces and trees. Tree-felling is keyword-gated (not
 * pure category) so it surfaces for a felling complaint filed under any department,
 * and does NOT surface for a parks complaint that has nothing to do with trees.
 */
import type { LegalReference } from "@/lib/legal/types";

export const HORTICULTURE_REFERENCES: LegalReference[] = [
  {
    id: "parks-open-spaces-1985",
    instrument: "Karnataka Parks, Play-fields and Open Spaces (Preservation and Regulation) Act",
    year: 1985,
    kind: "Act",
    authorities: ["BBMP", "GBA", "BDA"],
    categories: ["Horticulture"],
    keywords: ["park", "playground", "play field", "open space", "garden", "civic amenity", "ca site"],
    priority: "High",
    confidence: "High",
    reason:
      "This Act preserves and regulates parks, play-fields and open spaces and protects them against diversion or misuse.",
    source: "https://www.indiacode.nic.in/handle/123456789/7900",
    provisions: [
      {
        confidence: "High",
        obligation:
          "parks, play-fields and open spaces are to be preserved and protected against diversion, conversion or encroachment.",
        template:
          "The park or open space in question is protected under the Karnataka Parks, Play-fields and Open Spaces (Preservation and Regulation) Act, 1985, against diversion or misuse.",
      },
    ],
  },
  {
    id: "karnataka-trees-1976",
    instrument: "Karnataka Preservation of Trees Act",
    year: 1976,
    kind: "Act",
    authorities: ["BBMP", "GBA", "Forest Department"],
    categories: [],
    keywords: ["tree", "trees", "fell", "felling", "cut", "cutting", "timber", "avenue tree", "sapling", "axe"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Karnataka Preservation of Trees Act 1976 prohibits the felling of any tree without the previous permission of the Tree Officer and penalises contravention.",
    conditions: "Cite whenever tree felling or damage is alleged.",
    source: "https://www.indiacode.nic.in/bitstream/123456789/7008/1/76_of_1976_(e).pdf",
    provisions: [
      {
        ref: "Section 8",
        confidence: "High",
        obligation:
          "no tree may be felled except with the previous permission of the Tree Officer.",
        template:
          "The felling of the tree in question, if carried out without the previous permission of the Tree Officer, contravenes Section 8 of the Karnataka Preservation of Trees Act, 1976.",
      },
      {
        ref: "Section 22",
        confidence: "High",
        obligation:
          "prescribes the penalty for contravention, including for felling a tree without permission.",
        template:
          "Such contravention attracts the penalty prescribed under Section 22 of the Karnataka Preservation of Trees Act, 1976.",
      },
    ],
  },
];
