import { describe, it, expect } from "vitest";
import { translate } from "@/lib/i18n/translate";
import { translateEnum } from "@/lib/i18n/translate-enum";
import { registerNamespace, getNamespaceDictionary, allNamespaces } from "@/lib/i18n/registry";
import "@/lib/i18n/dictionaries"; // registers every real namespace

describe("translate", () => {
  it("returns the English string for the en locale", () => {
    expect(translate("common", "action.save", "en")).toBe("Save");
  });

  it("returns the Kannada string for the kn locale", () => {
    expect(translate("common", "action.save", "kn")).toBe("ಉಳಿಸಿ");
  });

  it("falls back to English when a kn translation is missing", () => {
    registerNamespace("test-fallback", {
      en: { onlyEnglish: "English text" },
      kn: {},
    });
    expect(translate("test-fallback", "onlyEnglish", "kn")).toBe("English text");
  });

  it("falls back to the bare key when no translation exists anywhere (never blank, never throws)", () => {
    expect(translate("common", "totally.made.up.key", "kn")).toBe("totally.made.up.key");
    expect(translate("nonexistent-namespace", "x", "en")).toBe("x");
  });

  it("interpolates {token} placeholders", () => {
    registerNamespace("test-interp", {
      en: { greeting: "Hello {name}, you have {count} items" },
      kn: {},
    });
    expect(translate("test-interp", "greeting", "en", { name: "Ravi", count: 3 })).toBe(
      "Hello Ravi, you have 3 items",
    );
  });

  it("leaves an unmatched placeholder untouched rather than dropping it", () => {
    registerNamespace("test-interp2", { en: { msg: "Value: {missing}" }, kn: {} });
    expect(translate("test-interp2", "msg", "en", {})).toBe("Value: {missing}");
  });
});

describe("translateEnum", () => {
  it("translates a real complaint status by its exact raw value", () => {
    expect(translateEnum("status", "Draft", "en")).toBe("Draft");
    expect(translateEnum("status", "Draft", "kn")).toBe("ಕರಡು");
  });

  it("translates a real RTI-only status", () => {
    expect(translateEnum("status", "Awaiting Reply", "kn")).toBe("ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ");
  });

  it("never modifies the value for logic — only returns a display string", () => {
    // The contract: callers must keep using the raw value for comparisons/
    // persistence. This test just documents that translateEnum is pure and
    // side-effect-free — it doesn't and can't mutate its input.
    const raw = "Reply Received";
    const displayed = translateEnum("status", raw, "kn");
    expect(raw).toBe("Reply Received");
    expect(displayed).not.toBe(raw);
  });

  it("falls back to the raw value itself for an untranslated enum value", () => {
    expect(translateEnum("status", "SomeFutureStatusNotYetTranslated", "kn")).toBe(
      "SomeFutureStatusNotYetTranslated",
    );
  });

  it("returns an empty string for null/undefined rather than a stray dash or 'undefined'", () => {
    expect(translateEnum("status", null, "en")).toBe("");
    expect(translateEnum("status", undefined, "kn")).toBe("");
  });
});

describe("registry", () => {
  it("registers every real dictionary namespace used by the app", () => {
    const names = allNamespaces();
    for (const ns of ["common", "navigation", "status", "workflow", "complaints", "rti"]) {
      expect(names).toContain(ns);
    }
  });

  it("every English key in a namespace has a Kannada counterpart (no silent gaps)", () => {
    for (const ns of ["common", "navigation", "status", "workflow", "complaints", "rti"]) {
      const en = getNamespaceDictionary(ns, "en")!;
      const kn = getNamespaceDictionary(ns, "kn")!;
      const missing = Object.keys(en).filter((k) => !(k in kn));
      expect(missing, `namespace "${ns}" missing kn keys: ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("no Kannada dictionary has a stray key absent from its English counterpart", () => {
    for (const ns of ["common", "navigation", "status", "workflow", "complaints", "rti"]) {
      const en = getNamespaceDictionary(ns, "en")!;
      const kn = getNamespaceDictionary(ns, "kn")!;
      const extra = Object.keys(kn).filter((k) => !(k in en));
      expect(extra, `namespace "${ns}" has kn-only keys: ${extra.join(", ")}`).toEqual([]);
    }
  });
});
