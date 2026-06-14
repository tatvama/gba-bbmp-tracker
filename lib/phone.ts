/**
 * Indian phone number helpers — normalisation, validation, and link builders.
 * Pure module (no framework deps) so it is shared by validators, UI, and tests.
 */

/** Strip everything except digits, dropping a leading +91 / 91 / 0 country/trunk prefix. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.replace(/[^\d+]/g, "");
  s = s.replace(/^\+/, "");
  // Drop +91 / 91 country code when it leaves a valid 10-digit number.
  if (/^91\d{10}$/.test(s)) s = s.slice(2);
  // Drop a single leading trunk 0.
  s = s.replace(/^0+/, "");
  return s;
}

/** 10-digit Indian mobile (starts 6–9). */
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
/** Loose Indian landline: STD + subscriber, 8–11 digits total after normalisation. */
export const INDIAN_LANDLINE_RE = /^\d{8,11}$/;

export function isValidIndianMobile(raw: string | null | undefined): boolean {
  return INDIAN_MOBILE_RE.test(normalizePhone(raw));
}

export function isValidIndianPhone(raw: string | null | undefined): boolean {
  const n = normalizePhone(raw);
  return INDIAN_MOBILE_RE.test(n) || INDIAN_LANDLINE_RE.test(n);
}

/** tel: link, or null if not a usable number. */
export function telLink(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return `tel:+91${n}`;
}

/** wa.me link (mobile only), or null. A leading trunk 0 signals a landline. */
export function waLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (/^91\d{10}$/.test(s)) s = s.slice(2);
  if (s.startsWith("0")) return null; // STD/trunk prefix → landline, not WhatsApp
  if (!INDIAN_MOBILE_RE.test(s)) return null;
  return `https://wa.me/91${s}`;
}

/** Pretty display: "98765 43210" for mobiles, raw-ish otherwise. */
export function formatPhone(raw: string | null | undefined): string {
  const n = normalizePhone(raw);
  if (INDIAN_MOBILE_RE.test(n)) return `${n.slice(0, 5)} ${n.slice(5)}`;
  return n || "";
}
