/**
 * Indian-rupee formatting — figures (lakh/crore grouping) AND words ("Rupees … only").
 *
 * The 180-question audit spec requires every loss figure to be shown in numerals
 * and in words. Pure, framework-free, dependency-free — safe to import anywhere
 * (web, MCP, scripts).
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** Words for 0–999. */
function underThousand(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return (TENS[t] ?? "") + (r ? ` ${ONES[r] ?? ""}` : "");
  }
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${ONES[h] ?? ""} Hundred${r ? ` ${underThousand(r)}` : ""}`;
}

/** Whole-number → words using the Indian system (crore / lakh / thousand). */
export function numberToWordsIndian(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";

  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  const hundred = n;

  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (hundred) parts.push(underThousand(hundred));

  return parts.join(" ").trim();
}

/** Format a number with Indian digit grouping (e.g. 12345678 → "1,23,45,678"). */
export function groupIndian(value: number): string {
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(0);
  let out: string;
  if (fixed.length <= 3) {
    out = fixed;
  } else {
    const last3 = fixed.slice(-3);
    const rest = fixed.slice(0, -3);
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  return neg ? `-${out}` : out;
}

export interface InrAmount {
  /** e.g. "₹1,23,45,678" (or with paise "₹1,23,45,678.50"). */
  figures: string;
  /** e.g. "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight only". */
  words: string;
}

/**
 * Render an amount as both figures and words. Paise (two decimals) are carried
 * through when present.
 */
export function inrFiguresAndWords(amount: number): InrAmount {
  if (!Number.isFinite(amount)) return { figures: "₹0", words: "Rupees Zero only" };
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  const figures = `${negative ? "-" : ""}₹${groupIndian(rupees)}${paise ? `.${String(paise).padStart(2, "0")}` : ""}`;

  let words = `Rupees ${numberToWordsIndian(rupees)}`;
  if (paise) words += ` and ${underThousand(paise)} Paise`;
  words += " only";
  if (negative) words = `Minus ${words}`;

  return { figures, words };
}
