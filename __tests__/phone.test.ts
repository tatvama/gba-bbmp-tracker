import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  isValidIndianMobile,
  isValidIndianPhone,
  waLink,
  telLink,
} from "@/lib/phone";
import { emailSchema, phoneSchema } from "@/lib/validators";

describe("normalizePhone", () => {
  it("strips +91, spaces, dashes and trunk 0", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhone("098765 43210")).toBe("9876543210");
    expect(normalizePhone("91 9876543210")).toBe("9876543210");
  });
});

describe("isValidIndianMobile", () => {
  it("accepts 10-digit numbers starting 6-9", () => {
    expect(isValidIndianMobile("9876543210")).toBe(true);
    expect(isValidIndianMobile("+91 6000000000")).toBe(true);
  });
  it("rejects bad mobiles", () => {
    expect(isValidIndianMobile("1234567890")).toBe(false); // starts with 1
    expect(isValidIndianMobile("98765")).toBe(false); // too short
    expect(isValidIndianMobile("abcdefghij")).toBe(false);
  });
});

describe("isValidIndianPhone", () => {
  it("accepts mobiles and landlines", () => {
    expect(isValidIndianPhone("9876543210")).toBe(true);
    expect(isValidIndianPhone("08022334455")).toBe(true);
  });
  it("rejects short / non-numeric", () => {
    expect(isValidIndianPhone("123")).toBe(false);
    expect(isValidIndianPhone("not a phone")).toBe(false);
  });
});

describe("link builders", () => {
  it("builds wa.me links for mobiles only", () => {
    expect(waLink("9876543210")).toBe("https://wa.me/919876543210");
    expect(waLink("08022334455")).toBeNull(); // landline → no whatsapp
  });
  it("builds tel links", () => {
    expect(telLink("9876543210")).toBe("tel:+919876543210");
  });
});

describe("zod schemas", () => {
  it("phoneSchema validates", () => {
    expect(phoneSchema.safeParse("9876543210").success).toBe(true);
    expect(phoneSchema.safeParse("123").success).toBe(false);
  });
  it("emailSchema validates", () => {
    expect(emailSchema.safeParse("eng@bbmp.gov.in").success).toBe(true);
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
