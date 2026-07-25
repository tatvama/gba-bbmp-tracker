import { describe, it, expect } from "vitest";
import { resolveMailConfig, canSend, skipReason, normalizeAppPassword } from "@/lib/mail/config";

const CREDS = { GMAIL_USER: "rti.gba@gmail.com", GMAIL_APP_PASSWORD: "abcdefghijklmnop" };

describe("normalizeAppPassword", () => {
  it("strips the spaces Google puts in a displayed app password", () => {
    expect(normalizeAppPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
  });

  it("handles tabs, newlines and surrounding whitespace", () => {
    expect(normalizeAppPassword("  abcd\tefgh\nijkl mnop  ")).toBe("abcdefghijklmnop");
  });

  it("returns empty for undefined", () => {
    expect(normalizeAppPassword(undefined)).toBe("");
  });
});

describe("resolveMailConfig", () => {
  it("is disabled when MAIL_ENABLED is unset", () => {
    expect(resolveMailConfig({ ...CREDS }).mode).toBe("disabled");
  });

  it("requires MAIL_ENABLED to be exactly \"true\"", () => {
    for (const v of ["1", "yes", "on", "TRUE", "True", "true ", " true", ""]) {
      expect(resolveMailConfig({ ...CREDS, MAIL_ENABLED: v }).mode, `MAIL_ENABLED=${JSON.stringify(v)}`).toBe(
        v.trim() === "true" ? "live" : "disabled",
      );
    }
  });

  it("is unconfigured when enabled without a user", () => {
    expect(resolveMailConfig({ MAIL_ENABLED: "true", GMAIL_APP_PASSWORD: "x" }).mode).toBe("unconfigured");
  });

  it("is unconfigured when enabled without a password", () => {
    expect(resolveMailConfig({ MAIL_ENABLED: "true", GMAIL_USER: "a@b.com" }).mode).toBe("unconfigured");
  });

  it("is unconfigured when the password is only whitespace", () => {
    expect(resolveMailConfig({ MAIL_ENABLED: "true", ...CREDS, GMAIL_APP_PASSWORD: "   " }).mode).toBe("unconfigured");
  });

  it("is redirect when a redirect address is present", () => {
    const c = resolveMailConfig({ MAIL_ENABLED: "true", ...CREDS, MAIL_REDIRECT_TO: "test@example.com" });
    expect(c.mode).toBe("redirect");
    expect(c.redirectTo).toBe("test@example.com");
  });

  it("is live only when enabled, configured, and the redirect is absent or blank", () => {
    expect(resolveMailConfig({ MAIL_ENABLED: "true", ...CREDS }).mode).toBe("live");
    expect(resolveMailConfig({ MAIL_ENABLED: "true", ...CREDS, MAIL_REDIRECT_TO: "   " }).mode).toBe("live");
  });

  it("defaults the from-name but leaves reply-to empty", () => {
    const c = resolveMailConfig({ MAIL_ENABLED: "true", ...CREDS });
    expect(c.fromName).toBe("GBA / BBMP Complaint Tracker");
    expect(c.replyTo).toBe("");
  });
});

describe("SMTP port selection", () => {
  it("defaults to 587 with STARTTLS, not 465", () => {
    // Not cosmetic: Norton Web/Mail Shield re-signs port 465 with an untrusted
    // root and the handshake cannot be made to verify. 587 validates.
    const c = resolveMailConfig({ MAIL_ENABLED: "true", ...CREDS });
    expect(c.port).toBe(587);
    expect(c.secure).toBe(false);
  });

  it("treats 465 — and only 465 — as implicit TLS", () => {
    expect(resolveMailConfig({ MAIL_SMTP_PORT: "465" }).secure).toBe(true);
    for (const p of ["587", "25", "2525"]) {
      expect(resolveMailConfig({ MAIL_SMTP_PORT: p }).secure, `port ${p}`).toBe(false);
    }
  });

  it("honours a valid override", () => {
    expect(resolveMailConfig({ MAIL_SMTP_PORT: "2525" }).port).toBe(2525);
  });

  it("falls back to 587 for anything unusable rather than crashing the send", () => {
    for (const bad of ["", "  ", "abc", "0", "-1", "70000", undefined]) {
      expect(resolveMailConfig({ MAIL_SMTP_PORT: bad }).port, `port=${JSON.stringify(bad)}`).toBe(587);
    }
  });
});

describe("canSend / skipReason", () => {
  it("permits sending only in redirect and live modes", () => {
    const modes = {
      disabled: { ...CREDS },
      unconfigured: { MAIL_ENABLED: "true" },
      redirect: { MAIL_ENABLED: "true", ...CREDS, MAIL_REDIRECT_TO: "t@e.com" },
      live: { MAIL_ENABLED: "true", ...CREDS },
    };
    expect(canSend(resolveMailConfig(modes.disabled))).toBe(false);
    expect(canSend(resolveMailConfig(modes.unconfigured))).toBe(false);
    expect(canSend(resolveMailConfig(modes.redirect))).toBe(true);
    expect(canSend(resolveMailConfig(modes.live))).toBe(true);
  });

  it("explains a skip only when there is one", () => {
    expect(skipReason(resolveMailConfig({ ...CREDS }))).toMatch(/MAIL_ENABLED/);
    expect(skipReason(resolveMailConfig({ MAIL_ENABLED: "true" }))).toMatch(/GMAIL_USER/);
    expect(skipReason(resolveMailConfig({ MAIL_ENABLED: "true", ...CREDS }))).toBeNull();
  });
});
