/**
 * Outbound-mail configuration (PURE, framework-free, unit-tested).
 *
 * Reading the environment is separated from *deciding what it means* so the
 * decision — above all "may this message reach a real officer?" — is a pure
 * function with exhaustive tests rather than a runtime surprise.
 *
 * THE SAFETY MODEL, in order of authority:
 *
 *   1. MAIL_ENABLED must be exactly "true". Anything else (unset, "1", "yes",
 *      "TRUE ") disables sending. Nothing is ever sent by accident because a
 *      variable was half-configured.
 *   2. Credentials must both be present, or the mode is "unconfigured".
 *   3. MAIL_REDIRECT_TO, when set, makes the mode "redirect": EVERY message goes
 *      only to that address and the real recipients are demoted to a banner in
 *      the body. See applyRedirect() in ./message.ts — that is the single choke
 *      point, and the only place allowed to build a real envelope.
 *
 * Going live is therefore a deliberate act: you must REMOVE MAIL_REDIRECT_TO.
 * There is no way to reach an officer by adding something.
 */

/** What the current environment permits. */
export type MailMode =
  /** MAIL_ENABLED is not exactly "true" — record intent, send nothing. */
  | "disabled"
  /** Enabled, but GMAIL_USER / GMAIL_APP_PASSWORD are incomplete. */
  | "unconfigured"
  /** Enabled and configured, but every message is diverted to one test inbox. */
  | "redirect"
  /** Enabled, configured, no redirect — real recipients WILL be emailed. */
  | "live";

export interface MailConfig {
  mode: MailMode;
  /** The authenticated Gmail mailbox, also the envelope From. */
  user: string;
  /** Present only so the transport can build credentials. Never logged, never
   *  returned to a client, never written to the database. */
  password: string;
  /** Non-empty only when mode === "redirect". */
  redirectTo: string;
  /** Display name on the From header. */
  fromName: string;
  /** Optional Reply-To, so officer replies can land somewhere staffed. */
  replyTo: string;
  /** SMTP port. 587 (STARTTLS) by default — see PORT_DEFAULT below. */
  port: number;
  /** true = implicit TLS from the first byte (465); false = STARTTLS upgrade (587).
   *  Either way TLS is mandatory; the transport sets requireTLS so a failed
   *  upgrade aborts rather than sending credentials in the clear. */
  secure: boolean;
}

/** Only the variables this module cares about — pass process.env in production
 *  and a literal in tests. The index signature is what makes NodeJS.ProcessEnv
 *  assignable here; without it TS's weak-type check rejects an all-optional
 *  interface. */
export interface MailEnv {
  MAIL_ENABLED?: string | undefined;
  GMAIL_USER?: string | undefined;
  GMAIL_APP_PASSWORD?: string | undefined;
  MAIL_REDIRECT_TO?: string | undefined;
  MAIL_FROM_NAME?: string | undefined;
  MAIL_REPLY_TO?: string | undefined;
  MAIL_SMTP_PORT?: string | undefined;
  [key: string]: string | undefined;
}

const DEFAULT_FROM_NAME = "GBA / BBMP Complaint Tracker";

/**
 * 587 + STARTTLS, not 465 + implicit TLS.
 *
 * Both are valid Gmail endpoints, but 465 is the one that consumer security
 * software breaks. Measured on the deployment machine: Norton Web/Mail Shield
 * intercepts SMTP, and on 465 it re-signs with a root literally called "Norton
 * Web/Mail Shield UNTRUSTED Root" — which is deliberately absent from the Windows
 * trust store, so the handshake cannot be made to verify (UNABLE_TO_VERIFY_LEAF_
 * SIGNATURE) by any client-side configuration. On 587 the same product signs with
 * its trusted "Norton Web/Mail Shield Root" and the chain validates.
 *
 * 587 is also the port every firewall and cloud host expects to be open. Override
 * with MAIL_SMTP_PORT=465 if a deployment prefers implicit TLS.
 */
const PORT_DEFAULT = 587;

const clean = (v: string | undefined): string => (v == null ? "" : String(v)).trim();

/**
 * A Gmail app password is generated as 16 characters that Google displays in
 * four space-separated groups ("abcd efgh ijkl mnop"). Users paste it verbatim,
 * and SMTP AUTH rejects the spaces — so strip whitespace rather than fail with
 * an opaque EAUTH the user cannot diagnose.
 */
export function normalizeAppPassword(raw: string | undefined): string {
  return clean(raw).replace(/\s+/g, "");
}

export function resolveMailConfig(env: MailEnv): MailConfig {
  const user = clean(env.GMAIL_USER);
  const password = normalizeAppPassword(env.GMAIL_APP_PASSWORD);
  const redirectTo = clean(env.MAIL_REDIRECT_TO);
  const fromName = clean(env.MAIL_FROM_NAME) || DEFAULT_FROM_NAME;
  const replyTo = clean(env.MAIL_REPLY_TO);

  const parsedPort = Number.parseInt(clean(env.MAIL_SMTP_PORT), 10);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : PORT_DEFAULT;
  // Only 465 is implicit-TLS; everything else negotiates via STARTTLS.
  const secure = port === 465;

  // Deliberately exact: a truthy-ish value like "1" or "yes" must NOT enable
  // outbound mail. Opting in to sending real letters should require getting the
  // spelling right.
  const enabled = clean(env.MAIL_ENABLED) === "true";

  const base = { user, password, redirectTo, fromName, replyTo, port, secure };

  if (!enabled) return { ...base, mode: "disabled" };
  if (!user || !password) return { ...base, mode: "unconfigured" };
  return { ...base, mode: redirectTo ? "redirect" : "live" };
}

/** True when the transport should actually connect to Gmail. */
export function canSend(config: MailConfig): boolean {
  return config.mode === "redirect" || config.mode === "live";
}

/** Why a send was skipped, for the outbox row — null when it wasn't. */
export function skipReason(config: MailConfig): string | null {
  switch (config.mode) {
    case "disabled":
      return "MAIL_ENABLED is not \"true\" — email recorded but not sent.";
    case "unconfigured":
      return "GMAIL_USER / GMAIL_APP_PASSWORD are not both set — email recorded but not sent.";
    default:
      return null;
  }
}
