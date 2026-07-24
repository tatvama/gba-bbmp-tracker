/**
 * TVCC (Technical Vigilance & Control Cell) addressee directory — the 5 GBA city
 * corporations, each headed by a Kaaryapalaka Abhiyantaru (Executive Engineer).
 * Framework-free (no "server-only") so both the client picker and the server
 * renderer import it.
 *
 * These addresses are FIXED reference data transcribed from the official GBA TVCC
 * address sheet (Kannada). Unlike every other recipient in the distribution
 * system, a TVCC address is NOT looked up from the `contacts` table — the user
 * chooses one of these five divisions and the copy is addressed to it verbatim.
 *
 * Both an English rendering (default, matching the app's other letters) and the
 * Kannada verbatim source are kept; the `language` argument selects which.
 */
import type { CorporationCode } from "@/lib/constants";
import { CORP_NAME, CORPORATION_CODES, LETTER_SIGNATORIES } from "@/lib/constants";
import type { LetterRecipient } from "@/lib/letters/types";

export interface TvccOffice {
  /** Corporation display name, e.g. "Bengaluru South". */
  corporationName: string;
  /** Postal address lines in English (below the office/designation header). */
  addressLinesEn: string[];
  /** Verbatim Kannada address lines from the source sheet (authoritative). */
  addressLinesKn: string[];
}

const DESIGNATION_EN = ["The Executive Engineer", "Technical Vigilance & Control Cell (T.V.C.C.)"];
const DESIGNATION_KN = ["ಕಾರ್ಯಪಾಲಕ ಅಭಿಯಂತರರು", "ತಾಂತ್ರಿಕ ಮತ್ತು ಜಾಗೃತ ಕೋಶ (ಟಿ.ವಿ.ಸಿ.ಸಿ.)"];

/**
 * The five TVCC offices, keyed by GBA corporation code. English lines are a
 * best-effort transcription of the Kannada source; a few structural lines
 * (marked in the Kannada verbatim) were reconstructed from partly-garbled OCR —
 * the Kannada arrays are the authoritative source of truth.
 */
export const TVCC_OFFICES: Record<CorporationCode, TvccOffice> = {
  UTTARA: {
    corporationName: "Bengaluru North",
    addressLinesEn: [
      "Bengaluru North City Corporation,",
      "Amruthahalli Main Road, Bellary Road,",
      "Byatarayanapura,",
      "Bengaluru - 560092.",
    ],
    addressLinesKn: [
      "ಬೆಂಗಳೂರು ಉತ್ತರ ನಗರ ಪಾಲಿಕೆ,",
      "ಅಮೃತಹಳ್ಳಿ ಮುಖ್ಯ ರಸ್ತೆ, ಬಳ್ಳಾರಿ ರಸ್ತೆ,",
      "ಬ್ಯಾಟರಾಯನಪುರ,",
      "ಬೆಂಗಳೂರು – 560092.",
    ],
  },
  DAKSHINA: {
    corporationName: "Bengaluru South",
    addressLinesEn: [
      "Bengaluru South City Corporation,",
      "Office of the Chief Engineer,",
      "Bommanahalli Zone, Begur Main Road,",
      "Bommanahalli,",
      "Bengaluru - 560068.",
    ],
    addressLinesKn: [
      "ಬೆಂಗಳೂರು ದಕ್ಷಿಣ ನಗರ ಪಾಲಿಕೆ,",
      "ಮುಖ್ಯ ಅಭಿಯಂತರರ ಕಚೇರಿ,",
      "ಬೊಮ್ಮನಹಳ್ಳಿ ವಲಯ, ಬೇಗೂರು ಮುಖ್ಯ ರಸ್ತೆ,",
      "ಬೊಮ್ಮನಹಳ್ಳಿ,",
      "ಬೆಂಗಳೂರು – 560068.",
    ],
  },
  PASHCHIMA: {
    corporationName: "Bengaluru West",
    addressLinesEn: [
      "Bengaluru West City Corporation,",
      "Greater Bengaluru Authority,",
      "Commissioner's Office Building,",
      "16th Cross, Vyalikaval,",
      "Malleshwaram,",
      "Bengaluru - 560003.",
    ],
    addressLinesKn: [
      "ಬೆಂಗಳೂರು ಪಶ್ಚಿಮ ನಗರ ಪಾಲಿಕೆ,",
      "ಗ್ರೇಟರ್ ಬೆಂಗಳೂರು ಪ್ರಾಧಿಕಾರ,",
      "ಆಯುಕ್ತರ ಕಚೇರಿ ಕಟ್ಟಡ,",
      "16ನೇ ಅಡ್ಡರಸ್ತೆ, ವೈಯಾಲಿಕಾವಲ್,",
      "ಮಲ್ಲೇಶ್ವರಂ,",
      "ಬೆಂಗಳೂರು – 560003.",
    ],
  },
  PURVA: {
    corporationName: "Bengaluru East",
    addressLinesEn: [
      "Bengaluru East City Corporation,",
      "Greater Bengaluru Authority, Zone-1,",
      "Commissioner's Office Building,",
      "R.H.P. Colony, Opp. Phoenix Mall,",
      "Mahadevapura,",
      "Bengaluru - 560048.",
    ],
    addressLinesKn: [
      "ಬೆಂಗಳೂರು ಪೂರ್ವ ನಗರ ಪಾಲಿಕೆ,",
      "ಗ್ರೇಟರ್ ಬೆಂಗಳೂರು ಪ್ರಾಧಿಕಾರ, ವಲಯ–1,",
      "ಆಯುಕ್ತರ ಕಚೇರಿ ಕಟ್ಟಡ,",
      "ಆರ್.ಎಚ್.ಪಿ. ಕಾಲೊನಿ, ಫೀನಿಕ್ಸ್ ಮಾಲ್ ಎದುರು,",
      "ಮಹದೇವಪುರ,",
      "ಬೆಂಗಳೂರು – 560048.",
    ],
  },
  KENDRA: {
    corporationName: "Bengaluru Central",
    addressLinesEn: [
      "Bengaluru Central City Corporation,",
      "Greater Bengaluru Authority,",
      "Commissioner's Office Building, 10th Floor,",
      "Public Utility Building, M.G. Road,",
      "Bengaluru - 560001.",
    ],
    addressLinesKn: [
      "ಬೆಂಗಳೂರು ಕೇಂದ್ರ ನಗರ ಪಾಲಿಕೆ,",
      "ಗ್ರೇಟರ್ ಬೆಂಗಳೂರು ಪ್ರಾಧಿಕಾರ,",
      "ಆಯುಕ್ತರ ಕಚೇರಿ ಕಟ್ಟಡ, 10ನೇ ಮಹಡಿ,",
      "ಪಬ್ಲಿಕ್ ಯುಟಿಲಿಟಿ ಕಟ್ಟಡ, ಎಂ.ಜಿ. ರಸ್ತೆ,",
      "ಬೆಂಗಳೂರು – 560001.",
    ],
  },
};

/** en = English only, kn = Kannada only, both = English then Kannada (Bilingual). */
export type TvccLanguage = "en" | "kn" | "both";

/** Normalise a DraftLanguage ("English"/"Kannada"/"Bilingual") or short code to
 *  the addressee-block mode. Defaults to English. */
export function resolveTvccLanguage(language?: string | null): TvccLanguage {
  const l = (language ?? "").toLowerCase();
  if (l.startsWith("bi") || l === "both" || l.includes("+")) return "both";
  if (l === "kn" || l.startsWith("kannada")) return "kn";
  return "en";
}

/**
 * The addressee ("To,") block for a TVCC copy, as Markdown lines. Placed at the
 * very top of the re-addressed letter — see readdressLetterToTvcc. Bilingual
 * stacks the English block above the Kannada designation + address. Takes a
 * resolved `office` (which may be the seed default or the user's edited/saved
 * version) rather than a code, so the caller controls the source.
 */
export function tvccAddresseeBlock(office: TvccOffice, language?: string | null): string {
  const mode = resolveTvccLanguage(language);
  const en = ["To,", ...DESIGNATION_EN, ...office.addressLinesEn];
  const kn = ["ಗೆ,", ...DESIGNATION_KN, ...office.addressLinesKn];
  if (mode === "kn") return kn.join("\n");
  if (mode === "both") return [...en, "", ...DESIGNATION_KN, ...office.addressLinesKn].join("\n");
  return en.join("\n");
}

/**
 * The GBA city-corporation OFFICE address as a single line, for stamping onto a
 * zonal officer's Copy-To entry (Zonal Commissioner / Chief Engineer / Executive
 * Engineer / Assistant Executive Engineer). Same 5 corporation offices as the
 * TVCC sheet, minus the T.V.C.C. designation — just the postal address. Bilingual
 * joins the English and Kannada renderings with " / ".
 */
export function corporationOfficeAddress(office: TvccOffice, language?: string | null): string {
  const join = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean).join(" ");
  const en = join(office.addressLinesEn);
  const kn = join(office.addressLinesKn);
  const mode = resolveTvccLanguage(language);
  if (mode === "kn") return kn;
  if (mode === "both") return `${en} / ${kn}`;
  return en;
}

/**
 * The recipient (TO) lines for the AI draft's recipientOverride — the designation
 * + address WITHOUT the leading "To," (the draft pipeline adds its own TO label
 * and the letter renderer prints the block at the top).
 */
export function tvccRecipientLines(office: TvccOffice, language?: string | null): string[] {
  const kn = resolveTvccLanguage(language) === "kn";
  const designation = kn ? DESIGNATION_KN : DESIGNATION_EN;
  const address = kn ? office.addressLinesKn : office.addressLinesEn;
  return [...designation, ...address];
}

/**
 * Structured recipient snapshot for the `copy_to` jsonb column. `office` holds
 * the designation + corporation; `address` the postal lines (space-joined).
 */
export function tvccRecipientSnapshot(office: TvccOffice, language?: string | null): LetterRecipient {
  const kn = resolveTvccLanguage(language) === "kn";
  const designation = (kn ? DESIGNATION_KN : DESIGNATION_EN).join(", ");
  const address = (kn ? office.addressLinesKn : office.addressLinesEn).join(" ");
  return {
    name: null,
    designation,
    office: `Technical Vigilance & Control Cell — ${office.corporationName} City Corporation`,
    address,
  };
}

/** Keep only non-empty, trimmed lines; undefined when nothing usable remains. */
function cleanLines(lines?: unknown): string[] | undefined {
  if (!Array.isArray(lines)) return undefined;
  const kept = lines.map((l) => (typeof l === "string" ? l.trim() : "")).filter((l) => l.length > 0);
  return kept.length ? kept : undefined;
}

/**
 * Overlay saved per-division edits (from app_settings) on the hardcoded seed,
 * yielding a complete offices map. A division with no saved address (or an empty
 * one) falls back to the seed — so the seed always guarantees a usable address.
 */
export function mergeTvccOffices(
  saved?: Partial<Record<CorporationCode, Partial<TvccOffice>>> | null,
): Record<CorporationCode, TvccOffice> {
  const out = {} as Record<CorporationCode, TvccOffice>;
  for (const code of CORPORATION_CODES) {
    const seed = TVCC_OFFICES[code];
    const s = saved?.[code];
    out[code] = {
      corporationName: seed.corporationName,
      addressLinesEn: cleanLines(s?.addressLinesEn) ?? seed.addressLinesEn,
      addressLinesKn: cleanLines(s?.addressLinesKn) ?? seed.addressLinesKn,
    };
  }
  return out;
}

/** Options for the division picker (registry-ordered), label = corporation name. */
export const TVCC_DIVISION_OPTIONS: { code: CorporationCode; label: string }[] = CORPORATION_CODES.map((code) => ({
  code,
  label: TVCC_OFFICES[code].corporationName,
}));

/** Reverse-map a corporation display name ("Bengaluru South") to its code, for
 *  pre-selecting the picker from a complaint's known corporation. Null when the
 *  name doesn't match any of the five. */
export function corporationCodeFromName(name?: string | null): CorporationCode | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  for (const code of CORPORATION_CODES) {
    if (CORP_NAME[code]?.toLowerCase() === needle) return code;
  }
  return null;
}

/** Type guard for a corporation code coming from the client / form. */
export function isCorporationCode(v: unknown): v is CorporationCode {
  return typeof v === "string" && (CORPORATION_CODES as readonly string[]).includes(v);
}

/**
 * The complainant's FROM / signatory identity for a TVCC complaint copy — asked
 * (and pre-filled from a saved default) when preparing the copy, and used as the
 * signature block of the AI-drafted letter. Simpler than the PIL sender: the
 * TVCC letter is an ordinary formal complaint, not a court petition.
 */
export interface TvccSender {
  name: string;
  address: string;
  mobile: string;
}

/** Seed default FROM — the primary letter signatory on record. */
export const DEFAULT_TVCC_SENDER: TvccSender = {
  name: LETTER_SIGNATORIES.raghav_gowda.name,
  address: LETTER_SIGNATORIES.raghav_gowda.address,
  mobile: LETTER_SIGNATORIES.raghav_gowda.mobile ?? "",
};
