/**
 * Town planning — unauthorised development, change of land use, building bye-laws.
 * (Demolition / encroachment powers under the KMC Act 1976 live in municipal.ts.)
 */
import type { LegalReference } from "@/lib/legal/types";

export const TOWN_PLANNING_REFERENCES: LegalReference[] = [
  {
    id: "ktcp-1961",
    instrument: "Karnataka Town and Country Planning Act",
    year: 1961,
    kind: "Act",
    authorities: ["BBMP", "GBA", "BDA"],
    categories: ["Town Planning"],
    keywords: [
      "unauthorised",
      "unauthorized",
      "illegal construction",
      "change of land use",
      "land use",
      "development",
      "deviation",
      "without permission",
      "commencement certificate",
      "master plan",
      "zoning",
    ],
    priority: "High",
    confidence: "High",
    reason:
      "The KTCP Act 1961 requires development and change of land use to conform to the Master Plan and to be carried out only with written planning permission.",
    conditions: "Cite where the grievance concerns unauthorised development or change of land use.",
    source: "https://prsindia.org/files/bills_acts/acts_states/karnataka/1963/1963KR11.pdf",
    provisions: [
      {
        ref: "Section 14",
        confidence: "High",
        obligation:
          "development and change of land use must conform to the Master Plan and the zoning regulations, and require written planning permission before commencement.",
        template:
          "Any development or change of land use at the site must conform to the Master Plan and requires prior written permission under Section 14 of the Karnataka Town and Country Planning Act, 1961.",
      },
      {
        ref: "Section 76FF",
        confidence: "High",
        keywords: ["regularis", "regulariz", "akrama sakrama"],
        obligation:
          "governs the regularisation of unauthorised development and change of land use, within the limits it prescribes.",
        template:
          "The regularisation, if any, of the unauthorised development is confined to what is permissible under Section 76FF of the Karnataka Town and Country Planning Act, 1961.",
      },
    ],
  },
  {
    id: "bbmp-building-byelaws-2003",
    instrument: "BBMP Building Bye-laws",
    year: 2003,
    kind: "Bye-law",
    authorities: ["BBMP", "GBA"],
    categories: ["Town Planning"],
    keywords: [
      "setback",
      "set back",
      "floor area",
      "far",
      "sanctioned plan",
      "building plan",
      "deviation",
      "unauthorised construction",
      "illegal construction",
    ],
    priority: "Medium",
    confidence: "High",
    reason:
      "The building bye-laws prescribe sanctioned-plan, setback and permissible-use norms for construction within the corporation limits.",
    conditions: "Cite by name where construction appears inconsistent with sanctioned-plan / setback norms.",
    provisions: [
      {
        // No single bye-law number asserted — cited by name (Decision 3).
        confidence: "Medium",
        obligation:
          "construction must comply with the sanctioned plan, setback and permissible-use norms prescribed by the building bye-laws.",
        template:
          "The construction complained of appears inconsistent with the sanctioned-plan and setback norms prescribed under the BBMP Building Bye-laws.",
      },
    ],
  },
];
