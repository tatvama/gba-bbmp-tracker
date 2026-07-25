import { describe, it, expect } from "vitest";
import { resolveMailConfig } from "@/lib/mail/config";
import { applyRedirect, isValidEmail, normalizeAddressList, type IntendedEnvelope } from "@/lib/mail/message";

/**
 * The safety net for the whole feature.
 *
 * While MAIL_REDIRECT_TO is set, no officer address may appear in to/cc/bcc — not
 * in any field a mail server would act on. applyRedirect is the single function
 * that turns intent into an envelope, so proving it here proves it everywhere.
 */

const OFFICER = "cemajroad@bbmp.gov.in";
const OFFICER_2 = "eic@bbmp.gov.in";
const TEST_INBOX = "mani96462@gmail.com";

const redirectConfig = () =>
  resolveMailConfig({
    MAIL_ENABLED: "true",
    GMAIL_USER: "rti.gba@gmail.com",
    GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    MAIL_REDIRECT_TO: TEST_INBOX,
  });

const liveConfig = () =>
  resolveMailConfig({
    MAIL_ENABLED: "true",
    GMAIL_USER: "rti.gba@gmail.com",
    GMAIL_APP_PASSWORD: "abcdefghijklmnop",
  });

const envelope = (over: Partial<IntendedEnvelope> = {}): IntendedEnvelope => ({
  to: [OFFICER],
  cc: [OFFICER_2],
  subject: "Reminder letter — Complaint No. DM-CMP-2026-000074",
  text: "Respected Sir,\n\nPlease find attached.",
  ...over,
});

describe("applyRedirect in test mode", () => {
  it("sends only to the test inbox", () => {
    const out = applyRedirect(envelope(), redirectConfig());
    expect(out.to).toEqual([TEST_INBOX]);
    expect(out.cc).toEqual([]);
    expect(out.bcc).toEqual([]);
    expect(out.redirected).toBe(true);
  });

  it("NEVER leaks an officer address into any deliverable header", () => {
    const out = applyRedirect(
      envelope({ to: [OFFICER, "jceast@bbmp.gov.in"], cc: [OFFICER_2, "cho@bbmp.gov.in"] }),
      redirectConfig(),
    );
    const deliverable = [...out.to, ...out.cc, ...out.bcc];
    for (const officer of [OFFICER, OFFICER_2, "jceast@bbmp.gov.in", "cho@bbmp.gov.in"]) {
      expect(deliverable, `${officer} must not be deliverable`).not.toContain(officer);
    }
    expect(deliverable).toEqual([TEST_INBOX]);
  });

  it("preserves the intended recipients as data for the audit row", () => {
    const out = applyRedirect(envelope(), redirectConfig());
    expect(out.intendedTo).toEqual([OFFICER]);
    expect(out.intendedCc).toEqual([OFFICER_2]);
  });

  it("marks the subject and explains itself in the body", () => {
    const out = applyRedirect(envelope(), redirectConfig());
    expect(out.subject.startsWith("[TEST] ")).toBe(true);
    expect(out.text).toContain("TEST MODE");
    expect(out.text).toContain(OFFICER);
    expect(out.text).toContain(TEST_INBOX);
    // The original letter text survives beneath the banner.
    expect(out.text).toContain("Please find attached.");
  });

  it("still redirects when there was no intended recipient at all", () => {
    const out = applyRedirect(envelope({ to: [], cc: [] }), redirectConfig());
    expect(out.to).toEqual([TEST_INBOX]);
    expect(out.text).toContain("To: (none)");
  });

  it("yields no recipient when the redirect address itself is invalid", () => {
    const config = { ...redirectConfig(), redirectTo: "not-an-email" };
    const out = applyRedirect(envelope(), config);
    // Fails closed: nothing deliverable, rather than falling back to the officer.
    expect(out.to).toEqual([]);
    expect(out.cc).toEqual([]);
    expect(out.bcc).toEqual([]);
  });
});

describe("applyRedirect in live mode", () => {
  it("addresses the real recipients", () => {
    const out = applyRedirect(envelope(), liveConfig());
    expect(out.to).toEqual([OFFICER]);
    expect(out.cc).toEqual([OFFICER_2]);
    expect(out.redirected).toBe(false);
    expect(out.subject).not.toContain("[TEST]");
    expect(out.text).not.toContain("TEST MODE");
  });

  it("drops a cc that duplicates the to", () => {
    const out = applyRedirect(envelope({ to: [OFFICER], cc: [OFFICER, OFFICER_2] }), liveConfig());
    expect(out.to).toEqual([OFFICER]);
    expect(out.cc).toEqual([OFFICER_2]);
  });

  it("normalizes case and removes duplicates", () => {
    const out = applyRedirect(envelope({ to: ["CEMajRoad@BBMP.gov.in", OFFICER], cc: [] }), liveConfig());
    expect(out.to).toEqual([OFFICER]);
  });

  it("a disabled config does not redirect (nothing is sent anyway)", () => {
    const out = applyRedirect(envelope(), resolveMailConfig({}));
    expect(out.redirected).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts real official addresses", () => {
    for (const a of ["cemajroad@bbmp.gov.in", "kla-reg@nic.in", "secy-ud@karnataka.gov.in", "comm.south.gba@gmail.com", "a+b@c.co"]) {
      expect(isValidEmail(a), a).toBe(true);
    }
  });

  it("tolerates surrounding whitespace, which directory data is full of", () => {
    expect(isValidEmail("  cemajroad@bbmp.gov.in  ")).toBe(true);
  });

  it("rejects the malformed ones this directory actually contains", () => {
    for (const a of [
      "two@at@signs.com",
      "no-at-sign.com",
      "dotless@domain",
      "@nolocal.com",
      "trailing.@dot.com",
      ".leading@dot.com",
      "spaces in@name.com",
      "double..dot@x.com",
      "x@-bad.com",
      "",
      "   ",
      null,
      undefined,
    ]) {
      expect(isValidEmail(a), JSON.stringify(a)).toBe(false);
    }
  });

  it("accepts the double-m typo as syntactically valid — it is a real address shape", () => {
    // Worth pinning: `@gmail.comm` is well-formed, so validation cannot catch
    // this class of error. Only the human note on the record can.
    expect(isValidEmail("comm.south.gba@gmail.comm")).toBe(true);
  });
});

describe("normalizeAddressList", () => {
  it("drops invalid entries instead of failing the whole send", () => {
    expect(normalizeAddressList([OFFICER, "broken", null, undefined, OFFICER_2])).toEqual([OFFICER, OFFICER_2]);
  });

  it("preserves order while de-duplicating", () => {
    expect(normalizeAddressList([OFFICER_2, OFFICER, OFFICER_2])).toEqual([OFFICER_2, OFFICER]);
  });
});
