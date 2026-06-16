/**
 * Shared Indian-date parser (PURE). Accepts the five formats seen in BBMP/PWD
 * records and always builds via Date.UTC (never `new Date(string)`, which is
 * timezone- and locale-dependent). Returns null on anything unparseable —
 * never an Invalid Date.
 */

function mk(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // reject overflow (e.g. 31 Feb → Mar)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function parseIndianDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;

  let m: RegExpMatchArray | null;
  // %Y-%m-%d  or  %Y/%m/%d
  if ((m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) {
    return mk(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // %d-%m-%Y , %d/%m/%Y , %d.%m.%Y
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    return mk(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  return null;
}

/** Convenience: compare two dates; returns true when a is strictly after b. */
export function isAfter(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getTime() > b.getTime();
}
