import { describe, it, expect } from "vitest";
import { isPermanentSmtpError, smtpReplyCode } from "@/lib/mail/smtp-errors";

/**
 * Both directions of misclassification cause real harm, so both are pinned:
 * retrying a dead credential damages the sending account's standing, and giving
 * up on a transient failure means the letter is silently never emailed.
 */

describe("smtpReplyCode", () => {
  it("reads the space-separated form", () => {
    expect(smtpReplyCode("550 5.1.1 unknown recipient")).toBe(550);
  });

  it("reads the DASH-continued form — the one a naive regex misses", () => {
    // Gmail's real reply. /55\d\s/ requires whitespace after the digits and so
    // fails to match this, which is what made a dead password look retryable.
    expect(smtpReplyCode("Invalid login: 535-5.7.8 Username and Password not accepted")).toBe(535);
    expect(smtpReplyCode("550-5.7.1 Message rejected")).toBe(550);
  });

  it("does not mistake an unrelated number for a status code", () => {
    expect(smtpReplyCode("message id <2026abc@gmail.com> queued")).toBeNull();
    expect(smtpReplyCode("failed after 2026 ms")).toBeNull();
  });

  it("returns null when there is no code", () => {
    expect(smtpReplyCode("read ECONNRESET")).toBeNull();
    expect(smtpReplyCode("")).toBeNull();
  });
});

describe("isPermanentSmtpError — permanent, must NOT retry", () => {
  it.each([
    "Invalid login: 535-5.7.8 Username and Password not accepted. BadCredentials",
    "EAUTH: authentication failed",
    "Missing credentials for PLAIN",
    "534-5.7.9 Application-specific password required",
    "550 5.1.1 The email account that you tried to reach does not exist",
    "553 5.1.3 The recipient address rejected your message",
    "No recipients defined",
  ])("classifies %s as permanent", (msg) => {
    expect(isPermanentSmtpError(msg)).toBe(true);
  });
});

describe("isPermanentSmtpError — transient, MUST retry", () => {
  it.each([
    "read ECONNRESET",
    "Connection timeout",
    "ETIMEDOUT",
    "socket hang up",
    "421-4.7.0 Try again later, closing connection",
    "451 4.3.0 Mail server temporarily rejected message",
    "Client network socket disconnected before secure TLS connection was established",
  ])("classifies %s as retryable", (msg) => {
    expect(isPermanentSmtpError(msg)).toBe(false);
  });

  it("treats a 5xx QUOTA failure as retryable, despite the 5xx", () => {
    // "550 5.4.5 Daily user sending limit exceeded" clears on its own. Reading
    // the code alone would classify it permanent and silently drop the letter.
    expect(isPermanentSmtpError("550 5.4.5 Daily user sending limit exceeded")).toBe(false);
    expect(isPermanentSmtpError("452 4.5.3 Too many recipients")).toBe(false);
    expect(isPermanentSmtpError("550 rate limit exceeded for this sender")).toBe(false);
  });
});

describe("isPermanentSmtpError — code handling", () => {
  it("prefers an explicit responseCode over the prose", () => {
    expect(isPermanentSmtpError("something went wrong", 550)).toBe(true);
    expect(isPermanentSmtpError("something went wrong", 421)).toBe(false);
  });

  it("lets transient WORDING override even an explicit 5xx code", () => {
    expect(isPermanentSmtpError("550 try again later", 550)).toBe(false);
  });

  it("prefers retrying when the failure is unrecognisable", () => {
    // Better an extra attempt than a letter that is never sent and never noticed.
    expect(isPermanentSmtpError("something inscrutable happened")).toBe(false);
    expect(isPermanentSmtpError("")).toBe(false);
  });

  it("treats 2xx/4xx codes as retryable", () => {
    expect(isPermanentSmtpError("421 service not available")).toBe(false);
    expect(isPermanentSmtpError("250 ok but weird")).toBe(false);
  });
});
