/**
 * Is an SMTP failure permanent? (PURE, unit-tested.)
 *
 * Extracted from the email_send handler so the classification can be tested
 * against real Gmail response strings rather than guessed at, following this
 * codebase's habit of unit-testing every pure decision function.
 *
 * The stakes run both ways:
 *  - Retrying a PERMANENT failure is harmful. Repeated bad-credential attempts
 *    count against the sending account's standing, and the letter will never go
 *    out regardless of how many times it is tried.
 *  - Giving up on a TRANSIENT failure is also harmful. The letter is then silently
 *    never emailed, and nothing in the app currently surfaces that.
 *
 * Two lessons are baked in, both from real responses:
 *  1. SMTP replies may be dash-continued. Gmail sends "535-5.7.8 Username and
 *     Password not accepted." — a naive /55\d\s/ requires whitespace after the
 *     digits and so MISSES the dashed form, classifying a dead credential as
 *     retryable.
 *  2. A 5xx code is not automatically permanent. "550 5.4.5 Daily user sending
 *     limit exceeded" is a quota that clears; treating it as permanent silently
 *     drops the letter. Quota/rate wording therefore wins over the code.
 */

/** Wording that means "this will never succeed as-is", whatever the code says. */
const PERMANENT_PHRASES = [
  /EAUTH/i,
  /invalid login/i,
  /username and password not accepted/i,
  /application-specific password required/i,
  /missing credentials/i,
  /badcredentials/i,
  /no recipients defined/i,
  /can't be used as a sender/i,
  /address (?:not found|rejected)/i,
  /recipient address rejected/i,
  /user (?:unknown|not found)/i,
  /domain (?:not found|does not exist)/i,
];

/** Wording that means "try again later" and OVERRIDES a 5xx code. */
const TRANSIENT_PHRASES = [
  /rate.?limit/i,
  /sending limit exceeded/i,
  /quota/i,
  /too many/i,
  /try again/i,
  /temporar/i, // temporary / temporarily
  /service not available/i,
  /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|ESOCKET|ENOTFOUND|EDNS|ECONNABORTED/i,
  /timeout/i,
  /connection closed/i,
  /socket hang ?up/i,
];

/**
 * Leading SMTP reply codes, tolerating the dash continuation form:
 * "535-5.7.8 …", "550 5.1.1 …", "421-…". Matches at a boundary so a message id
 * or a year embedded in prose is not mistaken for a status code.
 */
const REPLY_CODE = /(?:^|[\s(:])([245]\d\d)[\s-]/;

export function smtpReplyCode(message: string): number | null {
  const m = REPLY_CODE.exec(message);
  return m?.[1] ? Number.parseInt(m[1], 10) : null;
}

/**
 * `responseCode`, when nodemailer supplies it, is authoritative over prose —
 * pass it in rather than relying on the message text alone.
 */
export function isPermanentSmtpError(message: string, responseCode?: number | null): boolean {
  const text = message || "";

  // Explicit "try later" wording beats everything, including a 5xx code.
  if (TRANSIENT_PHRASES.some((p) => p.test(text))) return false;

  // Explicit "never going to work" wording beats a 4xx code.
  if (PERMANENT_PHRASES.some((p) => p.test(text))) return true;

  const code = responseCode ?? smtpReplyCode(text);
  if (code == null) return false; // Unrecognised: prefer retrying over silently dropping.
  return code >= 500 && code < 600;
}
