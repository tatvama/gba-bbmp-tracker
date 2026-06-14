import { describe, it, expect } from "vitest";
import {
  isDuplicatePair,
  findDuplicates,
  normalizeName,
  normalizeEmail,
} from "@/lib/dedupe";

describe("normalizeName", () => {
  it("strips honorifics and collapses whitespace", () => {
    expect(normalizeName("Sri  Ramesh  Kumar")).toBe("ramesh kumar");
    expect(normalizeName("Dr. A. B. Gowda")).toBe("a b gowda");
  });
});

describe("isDuplicatePair", () => {
  it("matches on normalised phone", () => {
    expect(
      isDuplicatePair({ phone: "+91 98765 43210" }, { whatsapp: "9876543210" }),
    ).toBe("phone");
  });
  it("matches on normalised email", () => {
    expect(isDuplicatePair({ email: "A@B.com" }, { email: "a@b.com" })).toBe("email");
  });
  it("matches on normalised name", () => {
    expect(
      isDuplicatePair({ fullName: "Sri Ramesh" }, { fullName: "ramesh" }),
    ).toBe("name");
  });
  it("returns null when nothing matches", () => {
    expect(
      isDuplicatePair({ fullName: "Ramesh", phone: "9000000001" }, { fullName: "Suresh", phone: "9000000002" }),
    ).toBeNull();
  });
});

describe("findDuplicates", () => {
  it("finds all colliding pairs", () => {
    const items = [
      { id: "1", fullName: "Ramesh", phone: "9876543210" },
      { id: "2", fullName: "Ramesh K", phone: "9876543210" }, // dup by phone
      { id: "3", fullName: "Suresh", email: "s@x.com" },
      { id: "4", fullName: "Different", email: "S@X.com" }, // dup by email
    ];
    const pairs = findDuplicates(items);
    expect(pairs.length).toBe(2);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});
