/**
 * Letter-email composition and the redirect choke point (PURE, unit-tested).
 *
 * Two responsibilities, kept together because the second must be impossible to
 * bypass while doing the first:
 *
 *   buildLetterEmail()  — the covering note that carries a filed letter.
 *   applyRedirect()     — the ONLY function that produces a sendable envelope.
 *
 * applyRedirect is the single place where "who we meant to write to" becomes
 * "who the SMTP server is told to deliver to". In redirect mode it discards the
 * intended recipients from to/cc/bcc entirely and substitutes the test inbox, so
 * a real officer address cannot reach Gmail even if every other layer is wrong.
 * lib/mail/send.ts calls it unconditionally — nothing else may construct an
 * envelope. See __tests__/mail-redirect.test.ts, which asserts exactly that.
 */
import type { MailConfig } from "./config";

/** Who we intend to write to, before the safety layer runs. */
export interface IntendedEnvelope {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
}

/** What actually goes to the SMTP server. */
export interface SendableEnvelope {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  /** True when the intended recipients were replaced by the test inbox. */
  redirected: boolean;
  /** The addresses that WOULD have been written to, preserved for the audit row
   *  and the in-body banner. Same list in live mode. */
  intendedTo: string[];
  intendedCc: string[];
}

/**
 * Deliberately conservative. This is a filter for addresses coming out of a
 * hand-maintained officer directory, not an RFC 5322 validator: reject anything
 * with whitespace, a missing/duplicated @, a dotless domain, or a leading or
 * trailing dot in either part. A false negative costs one postal-only recipient;
 * a false positive costs a bounce against the sending reputation of the single
 * Gmail account the whole system depends on.
 */
export function isValidEmail(raw: unknown): boolean {
  const v = (raw == null ? "" : String(raw)).trim();
  if (!v || v.length > 254 || /\s/.test(v)) return false;
  const parts = v.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  if (!local || !domain || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  if (domain.startsWith("-") || domain.endsWith("-")) return false;
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) && /^[A-Za-z0-9.-]+$/.test(domain);
}

/** Lowercase, trim, drop invalid, de-duplicate — order preserved. */
export function normalizeAddressList(list: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (!isValidEmail(raw)) continue;
    const addr = String(raw).trim().toLowerCase();
    if (seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out;
}

const bannerLine = (label: string, list: string[]): string =>
  list.length ? `  ${label}: ${list.join(", ")}` : `  ${label}: (none)`;

/**
 * Turn an intended envelope into a sendable one, applying the redirect rule.
 *
 * In "redirect" mode the returned to/cc/bcc contain ONLY config.redirectTo. The
 * intended addresses survive as data (intendedTo/intendedCc) and as human-
 * readable text in the body, never as headers a mail server would act on.
 */
export function applyRedirect(intended: IntendedEnvelope, config: MailConfig): SendableEnvelope {
  const intendedTo = normalizeAddressList(intended.to);
  const intendedCc = normalizeAddressList(intended.cc).filter((a) => !intendedTo.includes(a));

  if (config.mode !== "redirect") {
    return {
      to: intendedTo,
      cc: intendedCc,
      bcc: [],
      subject: intended.subject,
      text: intended.text,
      redirected: false,
      intendedTo,
      intendedCc,
    };
  }

  const redirectTo = normalizeAddressList([config.redirectTo]);
  const banner = [
    "=".repeat(68),
    "TEST MODE — THIS MESSAGE WAS NOT SENT TO THE OFFICIAL RECIPIENT.",
    "",
    "Had test mode been off, it would have been addressed to:",
    bannerLine("To", intendedTo),
    bannerLine("Copy to", intendedCc),
    "",
    `Every message is diverted to ${redirectTo.join(", ") || "(no valid redirect address)"} while`,
    "MAIL_REDIRECT_TO is set. Remove that variable to write to officials.",
    "=".repeat(68),
    "",
    "",
  ].join("\n");

  return {
    to: redirectTo,
    cc: [],
    bcc: [],
    subject: `[TEST] ${intended.subject}`,
    text: banner + intended.text,
    redirected: true,
    intendedTo,
    intendedCc,
  };
}

// ── The covering note ───────────────────────────────────────────────────────

export interface LetterEmailInput {
  /** "Reminder letter", "Legal notice", "Complaint letter" … */
  letterKind: string;
  /** The officer being written to, for the salutation. */
  officerName?: string | null;
  officerDesignation?: string | null;
  /** Case identifiers the officer can quote back at us. */
  complaintNumber?: string | null;
  jobNumber?: string | null;
  /** Free-text subject of the underlying complaint. */
  complaintSubject?: string | null;
  ward?: string | null;
  /** Where and when the physical letter was submitted, when known. */
  submittedOn?: string | null;
  /** File name of the attached PDF, or null when nothing could be attached. */
  attachmentName?: string | null;
  /** Signature block — who is writing. */
  senderName: string;
  senderContact?: string | null;
}

export interface BuiltEmail {
  subject: string;
  text: string;
}

/**
 * Strip anything that could terminate a header line.
 *
 * A subject is assembled from a complaint title, an officer name and a job code —
 * all user- or import-supplied. A CR/LF in any of them would end the Subject
 * header and let the rest be read as additional headers (a Bcc, say). Nodemailer
 * does encode headers, but this is the kind of guarantee that belongs at the point
 * the string is built rather than trusted downstream.
 */
export function sanitizeHeaderText(value: string): string {
  const CONTROL = new RegExp("[\u0000-\u001F\u007F]+", "g");
  return value.replace(CONTROL, " ").replace(/\s{2,}/g, " ").trim();
}

const ref = (input: LetterEmailInput): string => {
  const parts = [
    input.complaintNumber ? `Complaint No. ${input.complaintNumber}` : null,
    input.jobNumber ? `Job Code ${input.jobNumber}` : null,
  ].filter(Boolean);
  return parts.join(" / ");
};

/**
 * A short, formal covering note. The letter itself is the attachment and carries
 * the substance — this exists so the email is not a bare attachment, and so the
 * case references are searchable in the officer's inbox.
 */
export function buildLetterEmail(input: LetterEmailInput): BuiltEmail {
  const reference = ref(input);
  const subjectBits = [input.letterKind, reference || null, input.ward ? `Ward ${input.ward}` : null].filter(Boolean);
  // Every part is user- or import-supplied, so sanitize once at the point the
  // header is assembled rather than trusting nodemailer to encode it.
  const subject = sanitizeHeaderText(subjectBits.join(" — "));

  const salutation = input.officerDesignation
    ? `To,\nThe ${input.officerDesignation}${input.officerName ? `\n${input.officerName}` : ""}`
    : input.officerName
      ? `To,\n${input.officerName}`
      : "To,\nThe concerned officer";

  const body: string[] = [
    salutation,
    "",
    "Respected Sir / Madam,",
    "",
  ];

  if (reference) body.push(`Reference: ${reference}`);
  if (input.complaintSubject) body.push(`Subject: ${input.complaintSubject}`);
  if (reference || input.complaintSubject) body.push("");

  body.push(
    input.attachmentName
      ? `Please find attached the ${input.letterKind.toLowerCase()} concerning the above matter, for your kind attention and necessary action.`
      : `This is with reference to the ${input.letterKind.toLowerCase()} concerning the above matter, submitted for your kind attention and necessary action.`,
  );

  if (input.submittedOn) {
    body.push("", `The letter was submitted on ${input.submittedOn}.`);
  }

  body.push(
    "",
    "A reply within the period prescribed under the applicable rules would be appreciated. This email is sent in addition to the physical submission and does not replace it.",
    "",
    "Yours faithfully,",
    input.senderName,
  );
  if (input.senderContact) body.push(input.senderContact);

  if (input.attachmentName) {
    body.push("", `Attachment: ${input.attachmentName}`);
  }

  return { subject, text: body.join("\n") };
}
