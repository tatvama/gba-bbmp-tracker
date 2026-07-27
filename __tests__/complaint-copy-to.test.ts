import { describe, it, expect } from "vitest";
import {
  buildCopyToBlock,
  buildOfficeDistributionBlock,
  applyCopyTo,
  officeCopyBody,
} from "../lib/distribution/copy-to";
import {
  COMPLAINT_RECIPIENT_ROLES,
  officeCopyRoleKeys,
  corporationAddressedRoleKeys,
  roleByKey,
  isRecipientRoleKey,
  corporationOfficeName,
} from "../lib/complaints/recipient-roles";
import { DOCUMENT_VARIANTS, isKnownVariant, activeVariants } from "../lib/distribution/document-variants";

describe("recipient-roles registry", () => {
  it("has unique keys and a unique canonical order", () => {
    const keys = COMPLAINT_RECIPIENT_ROLES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    const orders = COMPLAINT_RECIPIENT_ROLES.map((r) => r.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
  it("office-copy distribution is exactly the 5 internal BBMP officer roles", () => {
    expect(officeCopyRoleKeys()).toEqual([
      "zonal_commissioner",
      "zonal_chief_engineer",
      "deputy_controller_finance",
      "executive_engineer",
      "assistant_executive_engineer",
    ]);
  });
  it("the escalation / GBA / statutory authority roles are selectable but NOT in the office-copy distribution", () => {
    const authorityKeys = [
      "chief_commissioner_gba",
      "additional_chief_secretary_udd",
      "secretary_udd",
      "chief_secretary",
      "minister_incharge_gba",
      "chief_minister",
      "lokayukta",
      "lokayukta_police_adgp",
    ] as const;
    const officeCopy = officeCopyRoleKeys();
    for (const k of authorityKeys) {
      expect(roleByKey(k)).toBeDefined();
      expect(officeCopy).not.toContain(k);
    }
  });
  it("corporation-addressed roles are the 5 BBMP zone & division officers (incl. Deputy Controller (Finance))", () => {
    expect(corporationAddressedRoleKeys()).toEqual([
      "zonal_commissioner",
      "zonal_chief_engineer",
      "deputy_controller_finance",
      "executive_engineer",
      "assistant_executive_engineer",
    ]);
  });
  it("every role declares a group that is one of the known groups", () => {
    const groups = new Set(["BBMP Zone & Division Officers", "GBA & State Government", "Statutory / Oversight Bodies"]);
    for (const r of COMPLAINT_RECIPIENT_ROLES) expect(groups.has(r.group)).toBe(true);
  });
  it("roleByKey / isRecipientRoleKey work", () => {
    expect(roleByKey("executive_engineer")?.title).toBe("Executive Engineer");
    expect(roleByKey("additional_chief_secretary_udd")?.title).toBe("The Additional Chief Secretary");
    expect(roleByKey("secretary_udd")?.title).toBe("The Secretary");
    expect(roleByKey("chief_secretary")?.level).toBe("Government of Karnataka");
    expect(roleByKey("nope")).toBeUndefined();
    expect(isRecipientRoleKey("deputy_controller_finance")).toBe(true);
    expect(isRecipientRoleKey("chief_secretary")).toBe(true);
    expect(isRecipientRoleKey("mayor")).toBe(false);
  });
});

describe("corporationOfficeName", () => {
  it("appends 'City Corporation' to a bare corporation name", () => {
    expect(corporationOfficeName("Bengaluru South")).toBe("Bengaluru South City Corporation");
    expect(corporationOfficeName("Bengaluru North")).toBe("Bengaluru North City Corporation");
  });
  it("is idempotent when already suffixed", () => {
    expect(corporationOfficeName("Bengaluru South City Corporation")).toBe("Bengaluru South City Corporation");
  });
  it("trims whitespace", () => {
    expect(corporationOfficeName("  Bengaluru East  ")).toBe("Bengaluru East City Corporation");
  });
});

describe("document-variants registry", () => {
  it("knows recipient + office and reserves future variants", () => {
    expect(isKnownVariant("recipient")).toBe(true);
    expect(isKnownVariant("office")).toBe(true);
    expect(isKnownVariant("carrier_pigeon")).toBe(false);
    expect(DOCUMENT_VARIANTS.office.includesFullDistribution).toBe(true);
    expect(DOCUMENT_VARIANTS.recipient.includesFullDistribution).toBe(false);
    expect(DOCUMENT_VARIANTS.signed.reserved).toBe(true);
  });
  it("active variants exclude reserved ones", () => {
    const keys = activeVariants().map((v) => v.key);
    expect(keys).toContain("recipient");
    expect(keys).toContain("office");
    expect(keys).not.toContain("signed");
  });
});

describe("buildCopyToBlock", () => {
  it("returns empty string for no selection", () => {
    expect(buildCopyToBlock([])).toBe("");
  });
  it("renders selected roles in canonical order with title + level", () => {
    const out = buildCopyToBlock(["executive_engineer", "deputy_controller_finance"]);
    // deputy_controller_finance (order 3) precedes executive_engineer (order 4)
    expect(out).toBe(
      "## Copy To\n\n1. Deputy Controller (Finance) - Zone Level\n2. Executive Engineer - Division Level",
    );
  });
  it("enriches with officer name and office when supplied", () => {
    const out = buildCopyToBlock(["executive_engineer"], {
      executive_engineer: { name: "Sri A. Kumar", office: "South Division, BBMP" },
    });
    expect(out).toContain("Executive Engineer - Division Level, Sri A. Kumar (South Division, BBMP)");
  });
  it("stamps a chosen corporation office address onto a zonal officer (the zonalDivision overlay path)", () => {
    const out = buildCopyToBlock(["zonal_commissioner"], {
      zonal_commissioner: { office: "Bengaluru North City Corporation, Amruthahalli Main Road, Bengaluru - 560092." },
    });
    expect(out).toBe(
      "## Copy To\n\n1. Zonal Commissioner - Zone Level (Bengaluru North City Corporation, Amruthahalli Main Road, Bengaluru - 560092.)",
    );
  });
});

describe("buildOfficeDistributionBlock", () => {
  it("lists the 5 internal roles regardless of selection, and excludes the escalation authorities", () => {
    const out = buildOfficeDistributionBlock();
    for (const r of COMPLAINT_RECIPIENT_ROLES.filter((x) => x.officeCopy)) expect(out).toContain(r.title);
    expect(out).not.toContain("The Additional Chief Secretary");
    expect(out).not.toContain("The Secretary");
    expect(out).not.toContain("The Chief Secretary");
    expect(out.startsWith("## Copy To")).toBe(true);
  });
  it("shows the Commissioner's dynamic zone/corporation office when enriched", () => {
    const out = buildOfficeDistributionBlock({ zonal_commissioner: { office: corporationOfficeName("Bengaluru South") } });
    expect(out).toContain("Zonal Commissioner - Zone Level (Bengaluru South City Corporation)");
  });
});

describe("dynamic Commissioner office in Copy To", () => {
  it("renders the complaint's zone/corporation alongside the level when supplied (same enrichment pattern as every other role)", () => {
    const out = buildCopyToBlock(["zonal_commissioner"], { zonal_commissioner: { office: corporationOfficeName("Bengaluru North") } });
    expect(out).toBe("## Copy To\n\n1. Zonal Commissioner - Zone Level (Bengaluru North City Corporation)");
  });
  it("falls back to the generic level when no zone is known", () => {
    const out = buildCopyToBlock(["zonal_commissioner"]);
    expect(out).toBe("## Copy To\n\n1. Zonal Commissioner - Zone Level");
  });
  it("the UDD escalation-authority roles render with no enrichment expected", () => {
    const out = buildCopyToBlock(["chief_secretary", "additional_chief_secretary_udd", "secretary_udd"]);
    expect(out).toContain("The Additional Chief Secretary - Urban Development Department, Room No. 436, 4th Floor, Vikasa Soudha, Bengaluru - 560001");
    expect(out).toContain("The Secretary - Urban Development Department, Room No. 434, 4th Floor, Vikasa Soudha, Bengaluru - 560001");
    expect(out).toContain("The Chief Secretary - Government of Karnataka");
  });
  it("the GBA / statutory authority roles render title-only, in canonical order", () => {
    const out = buildCopyToBlock(["lokayukta_police_adgp", "lokayukta", "chief_commissioner_gba", "chief_minister"]);
    expect(out).toBe(
      [
        "## Copy To",
        "",
        "1. The Chief Commissioner - Greater Bengaluru Authority (GBA)",
        "2. The Chief Minister - Government of Karnataka (Chairman, GBA), Room No. 323A, 3rd Floor, Vidhana Soudha, Dr. Ambedkar Veedhi, Bengaluru, Karnataka - 560001",
        "3. The Honorable Lokayukta - Karnataka Lokayukta, M.S. Building, Dr. B.R. Ambedkar Road (Ambedkar Veedhi), Bengaluru - 560001 (Near Vidhana Soudha)",
        "4. The Additional Director General of Police - Karnataka Lokayukta, M.S. Building, Dr. B.R. Ambedkar Road (Ambedkar Veedhi), Bengaluru - 560001",
      ].join("\n"),
    );
  });
  it("enriches a statutory authority with the incumbent's name when resolved", () => {
    const out = buildCopyToBlock(["lokayukta"], { lokayukta: { name: "Justice B.S. Patil", designation: "Lokayukta", office: null, address: "Bengaluru" } });
    expect(out).toBe("## Copy To\n\n1. The Honorable Lokayukta - Karnataka Lokayukta, M.S. Building, Dr. B.R. Ambedkar Road (Ambedkar Veedhi), Bengaluru - 560001 (Near Vidhana Soudha), Justice B.S. Patil");
  });
  it("renders the Honorable Lokayukta and Deputy Lokayukta together at the Karnataka Lokayukta office", () => {
    const out = buildCopyToBlock(["deputy_lokayukta", "lokayukta"]);
    // lokayukta (order 11) precedes deputy_lokayukta (order 12)
    expect(out).toBe(
      [
        "## Copy To",
        "",
        "1. The Honorable Lokayukta - Karnataka Lokayukta, M.S. Building, Dr. B.R. Ambedkar Road (Ambedkar Veedhi), Bengaluru - 560001 (Near Vidhana Soudha)",
        "2. The Deputy Lokayukta - Karnataka Lokayukta, M.S. Building, Dr. B.R. Ambedkar Road (Ambedkar Veedhi), Bengaluru - 560001 (Near Vidhana Soudha)",
      ].join("\n"),
    );
  });
});

describe("applyCopyTo", () => {
  const body = "## Subject\n\nBody paragraph.\n\n## Copy To\n\n1. Somebody the AI invented\n";
  it("strips an AI-produced Copy To section and appends the deterministic one", () => {
    const out = applyCopyTo(body, buildCopyToBlock(["executive_engineer"]));
    expect(out).not.toContain("Somebody the AI invented");
    expect(out).toContain("Executive Engineer - Division Level");
    expect(out.match(/Copy To/g)?.length).toBe(1); // exactly one Copy-To
  });
  it("strips bold and numbered Copy To variants too", () => {
    expect(applyCopyTo("Body.\n\n**Copy To**\n- X\n", "")).not.toContain("Copy To");
    expect(applyCopyTo("Body.\n\n21. Copy To\n- X\n", "")).not.toContain("Copy To");
  });
  it("with an empty block just returns the body (no Copy To section)", () => {
    const out = applyCopyTo(body, "");
    expect(out).not.toContain("Copy To");
    expect(out).toContain("Body paragraph.");
  });
});

describe("officeCopyBody", () => {
  it("prepends the marker and carries the full distribution", () => {
    const out = officeCopyBody("## Subject\n\nBody.\n\n## Copy To\n\n1. Only EE\n");
    expect(out).toMatch(/^\*\*OFFICE COPY - NOT FOR DISPATCH\*\*/);
    for (const r of COMPLAINT_RECIPIENT_ROLES.filter((x) => x.officeCopy)) expect(out).toContain(r.title);
    expect(out).not.toContain("The Principal Secretary");
    expect(out).not.toContain("The Chief Secretary");
    expect(out).not.toContain("Only EE");
  });
  it("emits no en/em dashes in the rendered lines", () => {
    const out = officeCopyBody("Body.", { executive_engineer: { name: "X—Y", office: "Z–W" } });
    // enrichment dashes are normalized to ASCII
    const copyToLines = out.split("\n").filter((l) => /Division Level|Zone Level|Sub-Division Level/.test(l));
    for (const l of copyToLines) expect(l).not.toMatch(/[–—―]/);
  });
});
