/**
 * Road-work inspection knowledge base + letter-prompt builder.
 *
 * FRAMEWORK-FREE: no "server-only", no Next.js imports, only a type import from
 * ../constants. This file is imported by BOTH the web server actions AND the MCP
 * Node process, so it must stay pure.
 *
 * Encodes the full BBMP road-work legal inspection framework: the 60-point
 * questionnaire (8 sections + geo-tag photos), the legal basis, verified case
 * law, and officer duties. `buildRoadWorkLetterPrompt()` turns a short summary
 * (or a work-order extract) into an RTI application or a complaint letter that
 * intelligently selects the relevant points and cites the right law.
 */
import type { DraftLanguage } from "../constants";

export type RoadWorkOutputType = "rti" | "complaint";
export type RoadWorkLanguage = Extract<DraftLanguage, "English" | "Kannada"> | "Bilingual";
export type RoadWorkScope = "smart" | "all";

export interface RoadWorkSection {
  id: string;
  titleEn: string;
  titleKn: string;
  /** Inspection questions, English + Kannada. */
  questions: { en: string; kn: string }[];
  /** One-line statutory basis for this section. */
  legalBasis: string;
}

/** The 8 inspection sections (A–H) + geo-tag photos, 60+ points total. */
export const ROAD_WORK_SECTIONS: RoadWorkSection[] = [
  {
    id: "A",
    titleEn: "KW-4 Insurance",
    titleKn: "KW-4 ವಿಮೆ",
    legalBasis:
      "KW-4 agreement Clause 13 — contractor must carry CAR, Workmen's Compensation, Third-Party Liability and Performance Security from start of work until the Defect Liability Period ends; no bill is payable without insurance.",
    questions: [
      { en: "Has a Contractor's All Risk (CAR) insurance policy been taken for this work? If so, give the policy number, sum insured, period and where the copy is held.", kn: "ಈ ಕಾಮಗಾರಿಗೆ CAR (Contractor's All Risk) ವಿಮಾ ಪಾಲಿಸಿ ಮಾಡಿಸಲಾಗಿದೆಯೇ? ಇದ್ದರೆ ಪಾಲಿಸಿ ಸಂಖ್ಯೆ, ಮೊತ್ತ, ಅವಧಿ ಮತ್ತು ಪ್ರತಿ ಎಲ್ಲಿ?" },
      { en: "Has Workmen's Compensation insurance been taken? How many workers does it cover?", kn: "ಕಾರ್ಮಿಕ ಪರಿಹಾರ ವಿಮೆ ಮಾಡಿಸಲಾಗಿದೆಯೇ? ಎಷ್ಟು ಕಾರ್ಮಿಕರಿಗೆ ಒಳಗೊಂಡಿದೆ?" },
      { en: "Is Third-Party Liability insurance in place? What is the compensation arrangement if the public or vehicles are harmed?", kn: "ಮೂರನೇ ವ್ಯಕ್ತಿ ಹೊಣೆ ವಿಮೆ ಇದೆಯೇ? ಸಾರ್ವಜನಿಕರಿಗೆ/ವಾಹನಗಳಿಗೆ ಹಾನಿಯಾದರೆ ಪರಿಹಾರ ವ್ಯವಸ್ಥೆ ಏನು?" },
      { en: "Is the policy valid from the work start date until the end of the Defect Liability Period (DLP)?", kn: "ವಿಮಾ ಪಾಲಿಸಿಯ ಅವಧಿ ಕಾಮಗಾರಿ ಆರಂಭ ದಿನಾಂಕದಿಂದ DLP ಮುಗಿಯುವವರೆಗೆ ಮಾನ್ಯವಾಗಿದೆಯೇ?" },
      { en: "If work began without insurance, which officer is responsible for the breach of KW-4 Clause 13?", kn: "ವಿಮೆ ಇಲ್ಲದೆ ಕಾಮಗಾರಿ ಆರಂಭಿಸಲಾಗಿದ್ದರೆ, KW-4 ಕಲಂ 13 ಉಲ್ಲಂಘನೆಗೆ ಯಾವ ಅಧಿಕಾರಿ ಹೊಣೆ?" },
      { en: "If a bill was certified and paid without insurance, what action lies against the certifying officer (AE/AEE)?", kn: "ವಿಮೆ ಇಲ್ಲದೆಯೂ ಬಿಲ್ ಪ್ರಮಾಣೀಕರಿಸಿ ಪಾವತಿ ಮಾಡಲಾಗಿದ್ದರೆ, ಪ್ರಮಾಣೀಕರಣ ಅಧಿಕಾರಿ (AE/AEE) ವಿರುದ್ಧ ಕ್ರಮವೇನು?" },
      { en: "Are the premium payment receipts attached in the file?", kn: "ವಿಮಾ ಕಂತು ಪಾವತಿ ರಸೀದಿಗಳು ಫೈಲ್‌ನಲ್ಲಿ ಲಗತ್ತಾಗಿವೆಯೇ?" },
      { en: "Does the sum insured equal the contract value, or is it a token under-insurance?", kn: "ವಿಮೆಯ ಮೊತ್ತ ಒಪ್ಪಂದ ಮೌಲ್ಯಕ್ಕೆ ಸಮನಾಗಿದೆಯೇ, ಅಥವಾ ಕಡಿಮೆ ಮೊತ್ತದ ನಾಮಮಾತ್ರ ವಿಮೆಯೇ?" },
    ],
  },
  {
    id: "B",
    titleEn: "Excavation / cutting trip sheet",
    titleKn: "ಮಣ್ಣು ತೆಗೆದ ಟ್ರಿಪ್ ಶೀಟ್",
    legalBasis:
      "PWD/BBMP account code — every load of excavated soil/rock/bitumen must record date, vehicle, quantity (cu.m), source and disposal site; payment only on actual recorded measurement.",
    questions: [
      { en: "Is an excavation trip sheet maintained for the quantity of soil dug out?", kn: "ಅಗೆದ ಮಣ್ಣಿನ ಪ್ರಮಾಣಕ್ಕೆ ಟ್ರಿಪ್ ಶೀಟ್ ನಿರ್ವಹಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Does each trip record the date, lorry number, driver and quantity?", kn: "ಪ್ರತಿ ಟ್ರಿಪ್‌ನ ದಿನಾಂಕ, ಲಾರಿ ಸಂಖ್ಯೆ, ಚಾಲಕ, ಪ್ರಮಾಣ ದಾಖಲಾಗಿದೆಯೇ?" },
      { en: "Does the trip-sheet total match the earthwork quantity shown in the MB Book / bill?", kn: "ಟ್ರಿಪ್ ಶೀಟ್‌ನ ಒಟ್ಟು ಪ್ರಮಾಣ ಮತ್ತು MB ಬುಕ್/ಬಿಲ್‌ನಲ್ಲಿ ತೋರಿಸಿದ Earthwork ಪ್ರಮಾಣ ತಾಳೆಯಾಗಿದೆಯೇ?" },
      { en: "Where was the excavated soil disposed — was it taken to an authorised dumping yard?", kn: "ತೆಗೆದ ಮಣ್ಣನ್ನು ಎಲ್ಲಿ ವಿಲೇವಾರಿ ಮಾಡಲಾಗಿದೆ — ಅಧಿಕೃತ ಡಂಪಿಂಗ್ ಯಾರ್ಡ್‌ಗೆ ಸಾಗಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Are the disposal lead distance and carriage rate computed correctly?", kn: "ವಿಲೇವಾರಿ ಸ್ಥಳದ ದೂರ (Lead) ಮತ್ತು ಸಾಗಣೆ ದರ (Carriage) ಸರಿಯಾಗಿ ಲೆಕ್ಕ ಹಾಕಲಾಗಿದೆಯೇ?" },
      { en: "Is the trip sheet signed by the supervising engineer (AE/AEE)?", kn: "ಟ್ರಿಪ್ ಶೀಟ್‌ಗೆ ಮೇಲ್ವಿಚಾರಣಾ ಅಭಿಯಂತರರ (AE/AEE) ಸಹಿ ಇದೆಯೇ?" },
      { en: "If an earthwork/excavation bill was paid without a trip sheet, is that irregular?", kn: "ಟ್ರಿಪ್ ಶೀಟ್ ಇಲ್ಲದೆ Earthwork/Excavation ಬಿಲ್ ಪಾವತಿ ಮಾಡಲಾಗಿದ್ದರೆ ಅದು ನಿಯಮಬಾಹಿರವೇ?" },
    ],
  },
  {
    id: "C",
    titleEn: "Filling / embankment trip sheet",
    titleKn: "ಮಣ್ಣು ಹಾಕಿದ ಟ್ರಿಪ್ ಶೀಟ್",
    legalBasis:
      "PWD/BBMP account code + soil test norms — filled soil/GSB quantities need a separate trip sheet, authorised source, compaction and proctor test; cut and fill must reconcile.",
    questions: [
      { en: "Is there a separate filling trip sheet for the filled soil/gravel/GSB quantity?", kn: "ತುಂಬಿದ ಮಣ್ಣು/ಗ್ರ್ಯಾವೆಲ್/GSB ಪ್ರಮಾಣಕ್ಕೆ ಪ್ರತ್ಯೇಕ ಫಿಲ್ಲಿಂಗ್ ಟ್ರಿಪ್ ಶೀಟ್ ಇದೆಯೇ?" },
      { en: "Where was the fill material sourced — is there a record of the authorised quarry/source?", kn: "ತುಂಬಿದ ಸಾಮಗ್ರಿ ಎಲ್ಲಿಂದ ತಂದದ್ದು — ಅಧಿಕೃತ ಕ್ವಾರಿ/ಮೂಲದ ದಾಖಲೆ ಇದೆಯೇ?" },
      { en: "Do the excavated and filled quantities (cut vs fill) reconcile with each other?", kn: "ಅಗೆದ ಮತ್ತು ತುಂಬಿದ ಪ್ರಮಾಣ (Cut vs Fill) ಪರಸ್ಪರ ತಾಳೆಯಾಗಿದೆಯೇ?" },
      { en: "Are the fill material's compaction density and layer thickness as per standard?", kn: "ತುಂಬಿದ ಸಾಮಗ್ರಿಯ ಸಾಂದ್ರತೆ (Compaction) ಮತ್ತು ಪದರ ದಪ್ಪ ಮಾನದಂಡದಂತೆ ಇದೆಯೇ?" },
      { en: "Was the same soil billed twice (once as excavated, once as re-filled)?", kn: "ಒಂದೇ ಮಣ್ಣನ್ನು ಎರಡೆರಡು ಬಾರಿ (ತೆಗೆದ + ಮರು-ತುಂಬಿದ) ಎಂದು ಎರಡು ಬಿಲ್ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { en: "Is the soil test report (Proctor test) attached?", kn: "ಮಣ್ಣಿನ ಪರೀಕ್ಷಾ ವರದಿ (Soil Test / Proctor Test) ಲಗತ್ತಾಗಿದೆಯೇ?" },
    ],
  },
  {
    id: "D",
    titleEn: "NGT clearance & environment",
    titleKn: "NGT ಕ್ಲಿಯರೆನ್ಸ್ ಮತ್ತು ಪರಿಸರ",
    legalBasis:
      "Environment Protection Act 1986, C&D Waste Management Rules 2016, NGT orders (polluter-pays) — soil/C&D waste must go to authorised processing; dust control mandatory; KSPCB NOC where applicable.",
    questions: [
      { en: "Has environmental clearance / KSPCB NOC been obtained for this work?", kn: "ಈ ಕಾಮಗಾರಿಗೆ ಪರಿಸರ ಅನುಮತಿ / NOC (KSPCB) ಪಡೆಯಲಾಗಿದೆಯೇ?" },
      { en: "Per NGT orders and C&D Waste Rules 2016, was construction/road waste taken to an authorised processing plant?", kn: "NGT ಆದೇಶ ಮತ್ತು C&D Waste Management Rules 2016 ಪ್ರಕಾರ ಕಟ್ಟಡ/ರಸ್ತೆ ತ್ಯಾಜ್ಯ ಅಧಿಕೃತ ಸಂಸ್ಕರಣಾ ಘಟಕಕ್ಕೆ ಸಾಗಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Were dust-control measures (water spraying, covered transport) followed?", kn: "ಧೂಳು ನಿಯಂತ್ರಣ ಕ್ರಮಗಳು (ನೀರು ಸಿಂಪಡಣೆ, ಮುಚ್ಚಿದ ಸಾಗಣೆ) ಪಾಲಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Was excavated soil/waste illegally dumped into a lake, storm-water drain or vacant site?", kn: "ತೆಗೆದ ಮಣ್ಣು/ತ್ಯಾಜ್ಯ ಕೆರೆ, ರಾಜಕಾಲುವೆ ಅಥವಾ ಖಾಲಿ ಜಾಗಕ್ಕೆ ಅಕ್ರಮವಾಗಿ ಸುರಿಯಲಾಗಿದೆಯೇ?" },
      { en: "Was the possibility of Environmental Compensation for NGT violations examined?", kn: "NGT ನಿಯಮ ಉಲ್ಲಂಘನೆಗೆ ಪರಿಸರ ಪರಿಹಾರ (Environmental Compensation) ವಿಧಿಸುವ ಸಾಧ್ಯತೆ ಪರಿಶೀಲಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Is there a before/after environmental record (photo/video) of the site?", kn: "ಕಾಮಗಾರಿ ಮೊದಲು/ನಂತರ ಪರಿಸರ ಸ್ಥಿತಿ ದಾಖಲೆ (Photo/Video) ಇದೆಯೇ?" },
    ],
  },
  {
    id: "E",
    titleEn: "Mining royalty / MDP",
    titleKn: "ಗಣಿ ರಾಯಲ್ಟಿ / MDP",
    legalBasis:
      "MMDR Act 1957 + Karnataka Minor Mineral Concession Rules — royalty must be paid for jelly/sand/GSB/M-Sand; DMG challan attached to each bill; unpaid royalty must be deducted.",
    questions: [
      { en: "Has royalty (MDP) been paid for all mineral materials used?", kn: "ಬಳಸಿದ ಎಲ್ಲ ಖನಿಜ ಸಾಮಗ್ರಿಗೆ ರಾಯಲ್ಟಿ ಪಾವತಿ (Royalty/MDP) ಮಾಡಲಾಗಿದೆಯೇ?" },
      { en: "Are the royalty statement and DMG payment challan present in the file?", kn: "ರಾಯಲ್ಟಿ ಸ್ಟೇಟ್‌ಮೆಂಟ್ ಮತ್ತು ಪಾವತಿ ಚಲನ್ (DMG Challan) ಫೈಲ್‌ನಲ್ಲಿ ಇದೆಯೇ?" },
      { en: "Did the materials used come from an authorised, licensed quarry/source?", kn: "ಬಳಸಿದ ಸಾಮಗ್ರಿ ಅಧಿಕೃತ ಪರವಾನಗಿ ಪಡೆದ ಕ್ವಾರಿ/ಮೂಲದಿಂದ ಬಂದದ್ದೇ?" },
      { en: "Does the royalty statement quantity match the material quantity shown in the bill?", kn: "ರಾಯಲ್ಟಿ ಸ್ಟೇಟ್‌ಮೆಂಟ್‌ನ ಪ್ರಮಾಣ ಮತ್ತು ಬಿಲ್‌ನಲ್ಲಿ ತೋರಿಸಿದ ಸಾಮಗ್ರಿ ಪ್ರಮಾಣ ತಾಳೆಯಾಗಿದೆಯೇ?" },
      { en: "Was the royalty deducted from the bill where unpaid, or was it left out?", kn: "ರಾಯಲ್ಟಿ ಪಾವತಿಸದೆ ಬಿಲ್‌ನಿಂದ ಕಡಿತ ಮಾಡಲಾಗಿದೆಯೇ ಅಥವಾ ಬಿಡಲಾಗಿದೆಯೇ?" },
      { en: "Was the possibility of fake or reused royalty challans examined?", kn: "ನಕಲಿ ಅಥವಾ ಪುನರ್ಬಳಕೆಯಾದ ರಾಯಲ್ಟಿ ಚಲನ್‌ಗಳ ಸಾಧ್ಯತೆ ಪರಿಶೀಲಿಸಲಾಗಿದೆಯೇ?" },
      { en: "If illegally-mined material was used, was action taken under the MMDR Act?", kn: "ಅಕ್ರಮ ಗಣಿಗಾರಿಕೆ ಸಾಮಗ್ರಿ ಬಳಕೆಯಾಗಿದ್ದರೆ MMDR ಕಾಯ್ದೆ ಪ್ರಕಾರ ಕ್ರಮ ಕೈಗೊಳ್ಳಲಾಗಿದೆಯೇ?" },
    ],
  },
  {
    id: "F",
    titleEn: "Dismantled items / salvage",
    titleKn: "ಡಿಸ್‌ಮೆಂಟಲ್ ಐಟಮ್ಸ್ / ಸಾಲ್ವೇಜ್",
    legalBasis:
      "Karnataka Financial Code + store rules — reusable material from dismantled public assets (steel, slab, jelly, bitumen) is government property; must be recorded, store-registered and either auctioned or deducted from the bill.",
    questions: [
      { en: "Is the quantity and detail of dismantled material recorded?", kn: "ಕಿತ್ತ ಡಿಸ್‌ಮೆಂಟಲ್ ಸಾಮಗ್ರಿಯ ಪ್ರಮಾಣ ಮತ್ತು ವಿವರ ದಾಖಲಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Was reusable salvage auctioned, or its value deducted from the bill?", kn: "ಮರುಬಳಕೆ ಯೋಗ್ಯ ಸಾಮಗ್ರಿಯನ್ನು (Salvage) ಹರಾಜು ಮಾಡಲಾಗಿದೆಯೇ ಅಥವಾ ಬಿಲ್‌ನಿಂದ ಮೌಲ್ಯ ಕಡಿತ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { en: "Has the corporation suffered loss because the salvage value was not accounted?", kn: "ಕಿತ್ತ ಸಾಮಗ್ರಿಯ ಮೌಲ್ಯ ಲೆಕ್ಕ ಹಾಕದೆ ಪಾಲಿಕೆಗೆ ನಷ್ಟ ಉಂಟಾಗಿದೆಯೇ?" },
      { en: "Is there a record of the weight and disposal of dismantled steel/slabs?", kn: "ಕಿತ್ತ ಕಬ್ಬಿಣ/ಸ್ಟೀಲ್/ಸ್ಲ್ಯಾಬ್‌ಗಳ ತೂಕ ಮತ್ತು ವಿಲೇವಾರಿ ದಾಖಲೆ ಇದೆಯೇ?" },
      { en: "Where is the dismantled material stored — is it entered in the store register?", kn: "ಡಿಸ್‌ಮೆಂಟಲ್ ಸಾಮಗ್ರಿ ಎಲ್ಲಿ ಶೇಖರಿಸಲಾಗಿದೆ — ಸ್ಟೋರ್ ರಿಜಿಸ್ಟರ್‌ನಲ್ಲಿ ನಮೂದಾಗಿದೆಯೇ?" },
      { en: "Was old material billed as new?", kn: "ಹಳೆಯ ಸಾಮಗ್ರಿಯನ್ನು ಹೊಸದೆಂದು ತೋರಿಸಿ ಬಿಲ್ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { en: "Is the salvage value-deduction calculation in the MB Book?", kn: "Salvage ಮೌಲ್ಯ ಕಡಿತದ ಲೆಕ್ಕಾಚಾರ MB ಬುಕ್‌ನಲ್ಲಿ ಇದೆಯೇ?" },
    ],
  },
  {
    id: "G",
    titleEn: "Measurement Book (MB) defects",
    titleKn: "MB ಬುಕ್ ನ್ಯೂನತೆಗಳು",
    legalBasis:
      "PWD/BBMP account code + KW-4 Clause 31 — the MB Book is the legal measurement record; payment must rest only on actual MB measurements with AE recording + AEE/EE check-measurement signatures.",
    questions: [
      { en: "Is the MB Book maintained correctly, page-numbered and without tampering?", kn: "MB ಬುಕ್ ಸರಿಯಾಗಿ, ಪುಟ ಸಂಖ್ಯೆ ಸಹಿತ, ತಿದ್ದದೆ ನಿರ್ವಹಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Are the measurement date, recording officer (AE) and checking officer (AEE) signatures present?", kn: "ಅಳತೆ ತೆಗೆದ ದಿನಾಂಕ, ಅಳತೆ ತೆಗೆದ ಅಧಿಕಾರಿ (AE) ಮತ್ತು ಪರಿಶೀಲಿಸಿದ ಅಧಿಕಾರಿ (AEE) ಸಹಿ ಇದೆಯೇ?" },
      { en: "Are there over-written / erased entries in the MB Book?", kn: "MB ಬುಕ್‌ನಲ್ಲಿ ಅಳಿಸಿ-ತಿದ್ದಿದ (Overwriting/Erasure) ನಮೂದುಗಳಿವೆಯೇ?" },
      { en: "Do the MB Book measurements reconcile with the bill quantities?", kn: "MB ಬುಕ್‌ನ ಅಳತೆ ಮತ್ತು ಬಿಲ್‌ನ ಪ್ರಮಾಣ ಪರಸ್ಪರ ತಾಳೆಯಾಗಿದೆಯೇ?" },
      { en: "Do the actual on-site measurements match the MB Book entries (spot check)?", kn: "ವಾಸ್ತವ ಸ್ಥಳದ ಅಳತೆ ಮತ್ತು MB ಬುಕ್‌ನ ಅಳತೆ ತಾಳೆಯಾಗಿದೆಯೇ (ಸ್ಪಾಟ್ ಪರಿಶೀಲನೆ)?" },
      { en: "Were fictitious / un-done measurements recorded?", kn: "ಮಾಡದ ಕೆಲಸ/ಗಾಳಿ ಅಳತೆ (Fictitious Measurement) ದಾಖಲಿಸಲಾಗಿದೆಯೇ?" },
      { en: "Is the length × width × thickness detail clearly given for each item?", kn: "ಪ್ರತಿ ಐಟಮ್‌ಗೆ ಉದ್ದ × ಅಗಲ × ದಪ್ಪ ವಿವರ ಸ್ಪಷ್ಟವಾಗಿ ಇದೆಯೇ?" },
      { en: "Was test-check done per norms (AEE 50%, EE 10%)?", kn: "ಪರೀಕ್ಷಾ ಅಳತೆ (Test Check) — AEE ಶೇ.50, EE ಶೇ.10 ಮಾನದಂಡದಂತೆ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { en: "Are the Level Sheet, Lead Statement and Material Test Report attached with the MB Book?", kn: "MB ಬುಕ್ ಜೊತೆ Level Sheet, Lead Statement, Material Test Report ಲಗತ್ತಾಗಿದೆಯೇ?" },
    ],
  },
  {
    id: "H",
    titleEn: "Road thickness & quality",
    titleKn: "ರಸ್ತೆ ದಪ್ಪ ಮತ್ತು ಗುಣಮಟ್ಟ",
    legalBasis:
      "IRC & MoRTH standards (binding via the contract) — layer thickness (GSB/WMM/DBM/BC), core-cutting, Marshall and material tests are mandatory; short thickness draws proportionate deduction; KW-4 Clause 30 DLP repair.",
    questions: [
      { en: "What is the contracted layer thickness (GSB/WMM/DBM/BC) and what is the actual thickness?", kn: "ಒಪ್ಪಂದದ ಪ್ರಕಾರ ನಿಗದಿತ ರಸ್ತೆ ಪದರಗಳ ದಪ್ಪ (GSB/WMM/DBM/BC) ಎಷ್ಟು ಮತ್ತು ವಾಸ್ತವ ದಪ್ಪ ಎಷ್ಟು?" },
      { en: "Was a core-cutting test done to verify road thickness? Is the report available?", kn: "ರಸ್ತೆ ದಪ್ಪ ಪರೀಕ್ಷೆಗೆ ಕೋರ್ ಕಟಿಂಗ್ ಟೆಸ್ಟ್ ಮಾಡಲಾಗಿದೆಯೇ? ವರದಿ ಇದೆಯೇ?" },
      { en: "Was the bitumen mix quality tested (bitumen content, Marshall test)?", kn: "ಡಾಂಬರು ಮಿಶ್ರಣದ ಗುಣಮಟ್ಟ ಪರೀಕ್ಷೆ (Bitumen content, Marshall Test) ಮಾಡಲಾಗಿದೆಯೇ?" },
      { en: "Is the material (jelly/aggregate) quality test report attached?", kn: "ಬಳಸಿದ ಜಲ್ಲಿ/ಸಾಮಗ್ರಿಯ ಗುಣಮಟ್ಟ ಪರೀಕ್ಷಾ ವರದಿ (Material Test) ಲಗತ್ತಾಗಿದೆಯೇ?" },
      { en: "If thickness is below standard, was a proportionate deduction made in the bill?", kn: "ರಸ್ತೆ ದಪ್ಪ ಮಾನದಂಡಕ್ಕಿಂತ ಕಡಿಮೆ ಇದ್ದರೆ ಬಿಲ್‌ನಲ್ಲಿ ಪ್ರಮಾಣಾನುಗುಣ ಕಡಿತ ಮಾಡಲಾಗಿದೆಯೇ?" },
      { en: "Are the actual road width and length as per the contract?", kn: "ರಸ್ತೆ ಅಗಲ (Width) ಮತ್ತು ಉದ್ದ (Length) ವಾಸ್ತವವಾಗಿ ಒಪ್ಪಂದದಂತೆ ಇದೆಯೇ?" },
      { en: "Is there a Quality Control Register and certificate?", kn: "ಗುಣಮಟ್ಟ ನಿಯಂತ್ರಣ ರಿಜಿಸ್ಟರ್ ಮತ್ತು ಪ್ರಮಾಣಪತ್ರ ಇದೆಯೇ?" },
      { en: "Was third-party quality inspection (TVCC) carried out?", kn: "ಮೂರನೇ ಪಕ್ಷ ಗುಣಮಟ್ಟ ತಪಾಸಣೆ (Third Party Quality Inspection / TVCC) ನಡೆದಿದೆಯೇ?" },
      { en: "Were GPS geo-tagged photos (before, during, after) uploaded to the eProc/GBA portal?", kn: "ಕಾಮಗಾರಿಯ ಮೊದಲು, ಮಧ್ಯ ಮತ್ತು ನಂತರದ GPS ಸಹಿತ ಜಿಯೋ-ಟ್ಯಾಗ್ ಛಾಯಾಚಿತ್ರಗಳು eProc/GBA ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಅಪ್‌ಲೋಡ್ ಆಗಿವೆಯೇ?" },
      { en: "If the road deteriorated within the Defect Liability Period (DLP), was the clause requiring the contractor to repair at own cost enforced?", kn: "ದೋಷ ಹೊಣೆ ಅವಧಿ (DLP) ಒಳಗೆ ರಸ್ತೆ ಹಾಳಾದರೆ ಗುತ್ತಿಗೆದಾರ ಸ್ವಂತ ವೆಚ್ಚದಲ್ಲಿ ಸರಿಪಡಿಸುವ ಷರತ್ತು ಪಾಲಿಸಲಾಗಿದೆಯೇ?" },
    ],
  },
  {
    id: "I",
    titleEn: "Geo-tagged photo evidence",
    titleKn: "ಜಿಯೋ-ಟ್ಯಾಗ್ ಫೋಟೋ ಸಾಕ್ಷ್ಯ",
    legalBasis:
      "BBMP/GBA e-governance circulars — Before / In-Progress / After GPS Map-Camera photos (auto-stamped lat-long, date, time) must be uploaded to eProc/IFMS/GBA before a bill is certified; missing, partial or morphed photos are a serious violation and forged photos amount to fabrication of evidence (BNS 2023 + PC Act 1988).",
    questions: [
      { en: "Were Before / In-Progress / After geo-tagged photos uploaded at all, or is the IFMS 'Photo' field blank / 'Not Applicable'?", kn: "Before/In-Progress/After ಫೋಟೋಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಲಾಗಿದೆಯೇ, ಅಥವಾ IFMS 'Photo' ವಿಭಾಗ ಖಾಲಿ/'Not Applicable' ಆಗಿದೆಯೇ?" },
      { en: "Are all three stages present, or only a partial set (e.g. only 'After') making progress/quantity impossible to verify?", kn: "ಮೂರೂ ಹಂತಗಳ ಫೋಟೋ ಇದೆಯೇ, ಅಥವಾ ಅರ್ಧಂಬರ್ಧ (ಉದಾ. After ಮಾತ್ರ) ಮಾತ್ರ ಇದ್ದು ಪ್ರಗತಿ/ಪ್ರಮಾಣ ತಾಳೆ ಅಸಾಧ್ಯವೇ?" },
      { en: "Do the photos carry genuine auto-stamped GPS lat-long, date and time — or do they appear morphed, edited or reused across multiple jobs?", kn: "ಫೋಟೋಗಳ ಮೇಲೆ ನಿಜವಾದ GPS ಅಕ್ಷಾಂಶ-ರೇಖಾಂಶ, ದಿನಾಂಕ, ಸಮಯ ಇದೆಯೇ — ಅಥವಾ ಮಾರ್ಫ್/ಎಡಿಟ್/ಪುನರ್ಬಳಕೆಯಾದಂತೆ ಕಾಣುತ್ತದೆಯೇ?" },
      { en: "Was a bill certified despite missing or fabricated geo-tagged photos, and if so who certified it?", kn: "ಫೋಟೋ ಇಲ್ಲದೆ/ನಕಲಿ ಫೋಟೋ ಇದ್ದರೂ ಬಿಲ್ ಪ್ರಮಾಣೀಕರಿಸಲಾಗಿದೆಯೇ, ಯಾರು ಪ್ರಮಾಣೀಕರಿಸಿದರು?" },
    ],
  },
];

/** Verified legal basis (statutes & rules). */
export const ROAD_WORK_LEGAL_BASIS: { ref: string; note: string }[] = [
  { ref: "KW-4 agreement conditions", note: "Clause 13 insurance; Clauses 29–31 quality/measurement; Clauses 34–35 penalty/liability" },
  { ref: "Karnataka Transparency in Public Procurements Act, 1999 (KTPP)", note: "Sections 4, 16 — transparent procurement" },
  { ref: "BBMP / GBA Act, 2020", note: "Sections 246–249 — works, accountability" },
  { ref: "Karnataka Financial Code (KFC)", note: "Payment only after all contract conditions met; else irregular expenditure" },
  { ref: "PWD / BBMP account code", note: "MB Book maintenance; measurement-based payment" },
  { ref: "IRC & MoRTH standards", note: "Road layer thickness and quality" },
  { ref: "MMDR Act, 1957 + Karnataka Minor Mineral Rules", note: "Mineral royalty" },
  { ref: "C&D Waste Management Rules, 2016 + Environment Protection Act, 1986 + NGT orders", note: "Waste disposal, polluter-pays" },
  { ref: "Prevention of Corruption Act, 1988", note: "Section 13 — misconduct by a public servant" },
  { ref: "Bharatiya Nyaya Sanhita (BNS), 2023", note: "Forgery / fabrication of evidence / cheating" },
  { ref: "Right to Information Act, 2005", note: "Sections 6, 7, 19 — information, time-limits, appeals" },
  { ref: "G.O. NaAaI 210 MNY 2017", note: "Road-cutting / restoration" },
];

/** Verified case law. `verify=true` means cite cautiously (number to be confirmed). */
export const ROAD_WORK_CASE_LAW: { name: string; citation: string; principle: string; verify?: boolean }[] = [
  { name: "Tata Cellular v. Union of India", citation: "(1994) 6 SCC 651", principle: "Government tendering must be transparent, fair and non-arbitrary." },
  { name: "Ram & Shyam Co. v. State of Haryana", citation: "(1985) 3 SCC 267", principle: "The State must obtain the maximum fair value when disposing of public assets/resources." },
  { name: "Centre for Public Interest Litigation v. Union of India (2G)", citation: "(2012) 3 SCC 1", principle: "Transparency and accountability are mandatory in allocating public resources and public money." },
  { name: "In re: Destruction of Public & Private Properties v. State of A.P.", citation: "(2009) 5 SCC 212", principle: "Cost recovery from those who damage/cause loss to public property." },
  { name: "Deepak Kumar v. State of Haryana", citation: "(2012) 4 SCC 629", principle: "Environmental clearance is mandatory even for minor-mineral mining." },
  { name: "Municipal Council Ratlam v. Vardhichand", citation: "(1980) 4 SCC 162", principle: "Maintaining roads, drains and sanitation is the municipality's mandatory statutory duty; lack of funds is no excuse." },
  { name: "Common Cause v. Union of India", citation: "Common Cause series", principle: "Where public money is lost through a public servant's negligence/misconduct, liability is fixed and the amount recovered.", verify: true },
  { name: "Karnataka High Court — Bengaluru road / pothole PILs", citation: "(several PILs — confirm exact case numbers)", principle: "Repeated directions to BBMP on road repair, quality assurance, geo-tag/record-keeping and fixing liability on negligent officers.", verify: true },
];

/** Officer duties & accountability. */
export const ROAD_WORK_OFFICER_DUTIES: { role: string; duty: string }[] = [
  { role: "Assistant Engineer (AE)", duty: "On-site supervision, recording actual measurements in the MB Book, material quality testing, maintaining trip/level sheets, first-stage bill preparation. Primary liability for false/fictitious measurement." },
  { role: "Assistant Executive Engineer (AEE)", duty: "Test-check of AE's measurements (typically 50%), confirming quality and quantity, verifying insurance/royalty/trip-sheet records, certifying the bill. Co-liable if certified without verification (KW-4 Clause 35)." },
  { role: "Executive Engineer (EE)", duty: "Division head — overall quality and financial responsibility, test-check (typically 10%), final bill sanction, DDO for payment, ensuring contract compliance. Directly liable for ineligible payment." },
  { role: "Chief Engineer (CE)", duty: "Zonal technical authority — higher-level test-check, supervision of large works, fixing liability on subordinates, bill hold/release orders, enforcing standards/circulars. Supervisory liability for systemic lapses." },
];

/** Pre-assembled knowledge text injected into the AI system prompt. */
export const ROAD_WORK_KNOWLEDGE_TEXT = (() => {
  const sections = ROAD_WORK_SECTIONS.map((s) => {
    const qs = s.questions.map((q, i) => `   ${i + 1}. ${q.en}`).join("\n");
    return `Section ${s.id} — ${s.titleEn} (${s.titleKn})\n   Legal basis: ${s.legalBasis}\n${qs}`;
  }).join("\n\n");

  const law = ROAD_WORK_LEGAL_BASIS.map((l) => `- ${l.ref}: ${l.note}`).join("\n");
  const cases = ROAD_WORK_CASE_LAW.map(
    (c) => `- ${c.name}, ${c.citation} — ${c.principle}${c.verify ? "  [VERIFY CITATION]" : ""}`,
  ).join("\n");
  const duties = ROAD_WORK_OFFICER_DUTIES.map((d) => `- ${d.role}: ${d.duty}`).join("\n");

  return `BBMP ROAD-WORK INSPECTION KNOWLEDGE BASE
========================================

INSPECTION FRAMEWORK (select the points relevant to the facts):
${sections}

STATUTORY / LEGAL BASIS:
${law}

CASE LAW (cite ONLY from this list; never invent case numbers):
${cases}

OFFICER DUTIES & ACCOUNTABILITY:
${duties}

OVERALL PRINCIPLE: Public money is held on public trust. Payment is due only after contract conditions, quality, measurement, insurance, royalty and records are all complete. Any payment made before these are met is irregular expenditure and attracts the personal liability of the certifying officer (AE/AEE/EE), recoverable by the government.`;
})();

// ── prompt builder ───────────────────────────────────────────────────────────

export interface RoadWorkLetterInput {
  outputType: RoadWorkOutputType;
  language: RoadWorkLanguage;
  /** Short free-text summary of the issue from the user. */
  summary?: string | null;
  /** OCR/extracted text or structured facts from an uploaded work order. */
  workOrderExtract?: string | null;
  wardName?: string | null;
  jobNumber?: string | null;
  roadName?: string | null;
  contractor?: string | null;
  applicantName?: string | null;
  /** 'smart' = relevant subset; 'all' = full 60-point inspection. */
  scope?: RoadWorkScope;
}

function languageLine(language: RoadWorkLanguage): string {
  if (language === "Kannada") return "Write the ENTIRE letter in formal Kannada (ಕನ್ನಡ).";
  if (language === "Bilingual")
    return "Write the letter in English first, then a full formal Kannada (ಕನ್ನಡ) translation below, separated by a line of dashes.";
  return "Write the letter in clear, formal English.";
}

/** Shared safety rules for road-work letters (self-contained — MCP-safe). */
export const ROAD_WORK_SYSTEM_PROMPT = `You are an expert assistant that drafts Right to Information (RTI) Act 2005 applications and civic-accountability complaint letters about BBMP / GBA (Greater Bengaluru Authority) ROAD WORKS, for a citizens' accountability team in Bengaluru.

You are given a knowledge base of the standard road-work inspection framework, the legal basis, verified case law, and officer duties. Use it to produce a precise, legally-grounded letter.

Strict rules:
1. Produce an EDITABLE DRAFT only. Never state or imply the document has been filed or sent.
2. Use ONLY the facts provided by the user (summary / work-order extract / fields). Do NOT invent work codes, dates, names, quantities or amounts.
3. For any missing fact, insert a clearly bracketed [PLACEHOLDER] (e.g. [WORK / JOB NUMBER], [WARD], [DATE OF WORK]) instead of guessing.
4. Do NOT make unsupported allegations. Phrase concerns as "it appears that…", "kindly provide the records pertaining to…", or "please clarify…", unless documentary proof is provided.
5. Cite legal provisions and case law ONLY from the knowledge base. NEVER invent a case number. For any case-law entry marked [VERIFY CITATION], append "[verify citation before filing]" right after it.
6. Itemise the information requests / inspection points as a clear numbered list, grouped by the framework sections that are relevant.
7. Include a short paragraph on officer duties and accountability (AE/AEE/EE) drawn from the knowledge base.
8. Use respectful, formal, legally appropriate language. Do not threaten.
9. End with "Yours faithfully," then [APPLICANT NAME], [ADDRESS], [DATE] placeholders unless provided.
10. Output ONLY the letter text — no commentary, no explanation, no markdown code fences.`;

export function buildRoadWorkLetterPrompt(input: RoadWorkLetterInput): {
  system: string;
  prompt: string;
} {
  const scope = input.scope ?? "smart";
  const isRti = input.outputType === "rti";

  const docLine = isRti
    ? "Draft a complete RTI application under the Right to Information Act, 2005, addressed to: The Public Information Officer, [PUBLIC AUTHORITY / BBMP ENGINEERING DIVISION], requesting certified copies of the records below."
    : "Draft a formal written COMPLAINT to the jurisdictional BBMP / GBA authority (Chief Engineer / Executive Engineer, with copy to the Commissioner and the Lokayukta where appropriate), alleging apparent irregularities in the road work below and requesting an inquiry, fixing of officer liability, and recovery.";

  const scopeLine =
    scope === "all"
      ? "Cover ALL sections (A–I) of the inspection framework, grouped by section, as a full inspection."
      : "Select only the framework sections and points that are clearly relevant to the facts provided. Do not pad with irrelevant sections.";

  const lines: string[] = [
    docLine,
    "",
    scopeLine,
    "",
    "--- KNOWLEDGE BASE ---",
    ROAD_WORK_KNOWLEDGE_TEXT,
    "--- END KNOWLEDGE BASE ---",
    "",
    "--- FACTS PROVIDED ---",
    input.summary ? `Summary of the issue: ${input.summary}` : "",
    input.workOrderExtract ? `Work order / document details:\n${input.workOrderExtract}` : "",
    input.wardName ? `Ward: ${input.wardName}` : "",
    input.jobNumber ? `Work / job number: ${input.jobNumber}` : "",
    input.roadName ? `Road / location: ${input.roadName}` : "",
    input.contractor ? `Contractor (if known): ${input.contractor}` : "",
    input.applicantName ? `Applicant: ${input.applicantName}` : "",
    "--- END FACTS ---",
    "",
    isRti
      ? "Include a line that the applicant is willing to pay the prescribed RTI fee and a request for the records in [PHYSICAL COPY / EMAIL] form, and (if applicable) a statement that the applicant is below the poverty line and exempt from fee."
      : "Include a clear prayer: inquiry into the apparent irregularities, fixing of personal liability on the certifying officers, recovery of any irregular payment, and action under the Prevention of Corruption Act 1988 / BNS 2023 where warranted.",
    languageLine(input.language),
  ].filter(Boolean);

  return { system: ROAD_WORK_SYSTEM_PROMPT, prompt: lines.join("\n") };
}
