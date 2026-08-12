import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { resolveMailConfig, canSend, type MailConfig } from "./config";

/**
 * The Gmail SMTP transport (server-only).
 *
 * Credentials come from the environment ONLY — never from app_settings, which is
 * world-readable (`for select using (true)`, db/migrations/0003_phase2.sql)
 * and therefore fetchable by any anonymous visitor holding the public
 * publishable key. Same policy the AI keys follow (.env.example).
 *
 * Gmail specifics worth knowing before debugging a failure here:
 *  - A normal account password will NOT work. The account needs 2-Step
 *    Verification and a generated App Password.
 *  - Google shows that password as four space-separated groups; the spaces are
 *    stripped in resolveMailConfig, because SMTP AUTH rejects them and the
 *    resulting EAUTH is otherwise unexplainable.
 *  - Free Gmail allows roughly 500 recipients/day. This is fine for letters but
 *    is a real ceiling if bulk sending is ever added.
 */

/** Cached across HMR reloads so dev doesn't leak a connection pool per edit —
 *  same globalThis trick lib/jobs/concurrency.ts uses. */
const globalForMail = globalThis as unknown as {
  __mailTransport?: { transporter: Transporter; fingerprint: string };
};

/** Identifies the credential set a cached transport was built for, so an env
 *  change in dev rebuilds instead of silently reusing the old mailbox. The
 *  password is reduced to a length, never stored in full. */
const fingerprintOf = (c: MailConfig): string => `${c.user}:${c.password.length}:${c.mode}:${c.port}`;

export function getMailConfig(): MailConfig {
  return resolveMailConfig(process.env);
}

export class MailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailNotConfiguredError";
  }
}

/**
 * Build (or reuse) the transport. Throws MailNotConfiguredError when the current
 * environment must not send — callers are expected to check the mode first and
 * record a skipped outbox row rather than treating this as a failure.
 */
export function getMailTransport(config: MailConfig = getMailConfig()): Transporter {
  if (!canSend(config)) {
    throw new MailNotConfiguredError(
      `Mail transport unavailable: mode is "${config.mode}".`,
    );
  }

  const fingerprint = fingerprintOf(config);
  const cached = globalForMail.__mailTransport;
  if (cached && cached.fingerprint === fingerprint) return cached.transporter;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: config.port,
    secure: config.secure,
    // With secure:false (587) nodemailer would happily fall back to plaintext if
    // STARTTLS were unavailable — which would put the app password on the wire in
    // the clear. requireTLS makes a failed upgrade an error instead.
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    // One connection reused for a burst of letters, then released.
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  globalForMail.__mailTransport = { transporter, fingerprint };
  return transporter;
}

/** From header: "GBA / BBMP Complaint Tracker <rti.gba@gmail.com>". Gmail
 *  rewrites the envelope sender to the authenticated user regardless, so the
 *  address here must be that same mailbox. */
export function fromHeader(config: MailConfig): string {
  return config.fromName ? `${config.fromName} <${config.user}>` : config.user;
}

/**
 * Prove the credentials work without sending anything. Used by the health check
 * and the settings page's "Test connection". Never throws — returns the reason.
 */
export async function verifyMailTransport(): Promise<{ ok: boolean; error?: string }> {
  const config = getMailConfig();
  if (!canSend(config)) return { ok: false, error: `Mail is ${config.mode}.` };
  try {
    await getMailTransport(config).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
