/**
 * Municipal governance core — the substantive law behind most BBMP duties.
 *
 * The Karnataka Municipal Corporations Act, 1976 is the workhorse (streets,
 * unauthorised construction, encroachment, property tax, trade licence,
 * sanitation). The Greater Bengaluru Governance Act, 2024 is the CURRENT
 * governance framework (it superseded the BBMP Act, 2020 on 14 May 2025).
 *
 * A section number is attached ONLY where confidence is "High"; otherwise the
 * instrument is cited by name and the duty is described (plan Decision 3).
 */
import type { LegalReference } from "@/lib/legal/types";

export const MUNICIPAL_REFERENCES: LegalReference[] = [
  {
    id: "kmc-1976",
    instrument: "Karnataka Municipal Corporations Act",
    year: 1976,
    kind: "Act",
    authorities: ["BBMP", "GBA"],
    categories: [
      "Road Infrastructure",
      "Storm Water Drain",
      "Electrical",
      "Town Planning",
      "Revenue",
      "Health",
      "Other",
    ],
    // Ref-level keywords let the Act be a candidate for cross-cutting issues
    // (encroachment / unauthorised construction) even outside its home departments;
    // WHICH sections then show is decided per-provision below.
    keywords: ["encroachment", "encroach", "unauthorised construction", "illegal construction"],
    priority: "High",
    confidence: "High",
    reason:
      "The KMC Act 1976 is the operative substantive law defining the Corporation's duties and powers over streets, buildings, encroachment, taxation, licensing and sanitation.",
    source: "https://www.indiacode.nic.in/handle/123456789/8129",
    provisions: [
      {
        ref: "Section 266",
        confidence: "High",
        categories: ["Road Infrastructure"],
        keywords: ["road", "street", "pothole", "footpath", "asphalt", "tar", "whitetopping"],
        obligation:
          "the Corporation is under a statutory duty to construct, maintain and keep in repair the public streets vested in it.",
        template:
          "The maintenance and repair of the public street in question falls squarely within the statutory obligation of the Corporation under Section 266 of the Karnataka Municipal Corporations Act, 1976.",
      },
      {
        ref: "Section 321",
        confidence: "High",
        keywords: ["unauthorised", "unauthorized", "illegal construction", "deviation", "without plan", "violation of plan", "building violation"],
        obligation:
          "empowers the Corporation to require the alteration or demolition of any building or work commenced, carried on or completed unlawfully or in deviation of the sanctioned plan.",
        template:
          "The construction complained of, if carried out without or in deviation of a sanctioned plan, attracts the Corporation's power of demolition and corrective action under Section 321 of the Karnataka Municipal Corporations Act, 1976.",
      },
      {
        ref: "Section 287",
        confidence: "High",
        keywords: ["encroach", "encroachment", "obstruction", "occupied footpath", "occupied road"],
        obligation:
          "provides for the removal of encroachments and unauthorised occupation of public streets and places.",
        template:
          "The occupation complained of appears to be an encroachment on a public place, for the removal of which the Corporation is empowered under Section 287 of the Karnataka Municipal Corporations Act, 1976.",
      },
      {
        ref: "Section 288D",
        confidence: "High",
        keywords: ["encroach", "encroachment"],
        obligation:
          "empowers the Commissioner to remove an encroachment on a public street or place, in appropriate cases without notice.",
        template:
          "The Commissioner is further empowered to remove the encroachment under Section 288D of the Karnataka Municipal Corporations Act, 1976.",
      },
      {
        ref: "Sections 103 and 109",
        confidence: "High",
        categories: ["Revenue"],
        keywords: ["property tax", "khata", "tax assessment", "betterment", "self assessment", "sas"],
        obligation:
          "govern the levy and the method of assessment of property tax by the Corporation.",
        template:
          "The assessment and levy of property tax by the Corporation is governed by Sections 103 and 109 of the Karnataka Municipal Corporations Act, 1976, and is to be carried out strictly in accordance with those provisions.",
      },
      {
        // Single-source / Medium confidence on the exact section — cite by name.
        confidence: "Medium",
        categories: ["Revenue"],
        keywords: ["trade licence", "trade license", "licence", "license", "shop licence"],
        obligation:
          "the Corporation regulates the use of premises for specified trades and the grant of the requisite trade licence.",
        template:
          "The grant and regulation of the trade licence in question is governed by the licensing provisions of the Karnataka Municipal Corporations Act, 1976.",
      },
      {
        // §255/§258 attested from a single source (Medium) — name-only, no section.
        confidence: "Medium",
        categories: ["Health", "Storm Water Drain"],
        keywords: ["garbage", "filth", "rubbish", "sanitation", "waste", "dumping", "drain cleaning", "desilt", "silt"],
        obligation:
          "the Corporation is responsible for the daily cleansing of public streets and the removal of rubbish, filth and accumulated waste.",
        template:
          "The daily cleansing of the area and the removal of accumulated filth and waste is an obligatory function of the Corporation under the Karnataka Municipal Corporations Act, 1976.",
      },
      {
        confidence: "Medium",
        categories: ["Electrical"],
        keywords: ["street light", "streetlight", "street lamp", "lamp", "lighting", "pole", "dark"],
        obligation:
          "the Corporation is responsible for the lighting of public streets and the upkeep of street lighting.",
        template:
          "The provision and upkeep of public street lighting at the location is an obligatory function of the Corporation under the Karnataka Municipal Corporations Act, 1976.",
      },
    ],
  },
  {
    id: "gbga-2024",
    instrument: "Greater Bengaluru Governance Act",
    year: 2024,
    kind: "Act",
    authorities: ["BBMP", "GBA"],
    categories: [
      "Road Infrastructure",
      "Storm Water Drain",
      "Lakes",
      "Electrical",
      "Horticulture",
      "Town Planning",
      "Revenue",
      "Health",
      "IT",
      "Other",
    ],
    keywords: [],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Greater Bengaluru Governance Act 2024 (in force 14 May 2025) is the current governance framework for Greater Bengaluru; it charges the Greater Bengaluru Authority and the city corporations with administering civic services.",
    conditions: "Cite as the governing framework; the substantive duty usually rests in the KMC Act 1976.",
    source: "https://prsindia.org/files/bills_acts/acts_states/karnataka/2025/Act36of2025KA.pdf",
    provisions: [
      {
        confidence: "High",
        obligation:
          "the Greater Bengaluru Authority and the concerned city corporation are charged with the governance and effective delivery of civic services in Greater Bengaluru.",
        template:
          "The effective delivery of the civic service in question falls within the governance responsibility of the concerned authority under the framework of the Greater Bengaluru Governance Act, 2024.",
      },
    ],
  },
];
