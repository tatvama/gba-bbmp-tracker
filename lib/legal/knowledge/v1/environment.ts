/**
 * Environment, pollution, noise and water bodies. (The Environment (Protection)
 * Act 1986 itself lives in health-waste.ts as the parent statute.) Section numbers
 * are attached only at High confidence; the Water Act discharge prohibition is
 * cited by name (its section number was only Medium-confidence in verification).
 */
import type { LegalReference } from "@/lib/legal/types";

export const ENVIRONMENT_REFERENCES: LegalReference[] = [
  {
    id: "noise-rules-2000",
    instrument: "Noise Pollution (Regulation and Control) Rules",
    year: 2000,
    kind: "Rules",
    authorities: ["BBMP", "GBA", "KSPCB", "Police"],
    categories: [],
    keywords: ["noise", "loudspeaker", "loud speaker", "sound", "decibel", "honking", "dj", "amplifier", "public address"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Noise Pollution (Regulation and Control) Rules 2000 (under the Environment (Protection) Act 1986) set ambient noise limits by zone and restrict the use of loudspeakers and public-address systems.",
    source: "https://www.ecolex.org/details/legislation/noise-pollution-regulation-and-control-rules-2000-lex-faoc040567/",
    provisions: [
      {
        confidence: "High",
        obligation:
          "prescribe ambient noise standards by zone and restrict the use of loudspeakers and public-address systems, particularly at night.",
        template:
          "The noise complained of appears to exceed the limits and restrictions prescribed under the Noise Pollution (Regulation and Control) Rules, 2000.",
      },
    ],
  },
  {
    id: "air-act-1981",
    instrument: "Air (Prevention and Control of Pollution) Act",
    year: 1981,
    kind: "Act",
    authorities: ["KSPCB", "BBMP", "GBA"],
    categories: [],
    keywords: ["air pollution", "smoke", "dust", "emission", "burning", "open burning", "fumes"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Air (Prevention and Control of Pollution) Act 1981 provides for the prevention, control and abatement of air pollution through the Pollution Control Boards.",
    source: "https://www.indiacode.nic.in/bitstream/123456789/21429/1/the_air_(prevention_and_control_of_pollution)_act,_1981.pdf",
    provisions: [
      {
        confidence: "High",
        obligation:
          "provides for the prevention, control and abatement of air pollution, with the Pollution Control Board as the enforcing authority.",
        template:
          "The emission or open burning complained of engages the prevention and control obligations under the Air (Prevention and Control of Pollution) Act, 1981.",
      },
    ],
  },
  {
    id: "water-act-1974",
    instrument: "Water (Prevention and Control of Pollution) Act",
    year: 1974,
    kind: "Act",
    authorities: ["KSPCB", "BWSSB", "BBMP", "GBA"],
    categories: ["Storm Water Drain", "Lakes"],
    keywords: ["sewage", "effluent", "discharge", "contaminat", "water pollution", "sewer into drain", "polluted water"],
    priority: "Medium",
    confidence: "High",
    reason:
      "The Water (Prevention and Control of Pollution) Act 1974 prohibits the discharge of polluting matter, including sewage, into streams, wells, sewers and drains.",
    conditions: "Section number cited by name only (the exact section was Medium-confidence in verification).",
    source: "https://indiankanoon.org/doc/82542966/",
    provisions: [
      {
        confidence: "Medium",
        obligation:
          "prohibits the knowing discharge of sewage or other polluting matter into any stream, well, sewer or drain.",
        template:
          "The discharge of sewage into the drain, if established, is prohibited under the Water (Prevention and Control of Pollution) Act, 1974.",
      },
    ],
  },
  {
    id: "ktcda-2014",
    instrument: "Karnataka Tank Conservation and Development Authority Act",
    year: 2014,
    kind: "Act",
    authorities: ["BBMP", "GBA"],
    categories: ["Lakes"],
    keywords: ["lake", "tank", "kere", "water body", "bund", "rajakaluve", "lake encroachment", "wetland"],
    priority: "High",
    confidence: "High",
    reason:
      "The Karnataka Tank Conservation and Development Authority Act 2014 establishes the authority for the protection, conservation and development of tanks and water bodies.",
    conditions: "The 2014 Act was amended in 2025; cite as the 2014 Act as amended where precision is needed.",
    source: "https://www.indiacode.nic.in/bitstream/123456789/7904/1/32_of_2014_(e).pdf",
    provisions: [
      {
        confidence: "High",
        obligation:
          "provides for the protection, conservation and development of tanks and water bodies and against their encroachment or degradation.",
        template:
          "The condition of the water body engages the protection and conservation mandate under the Karnataka Tank Conservation and Development Authority Act, 2014.",
      },
    ],
  },
];
