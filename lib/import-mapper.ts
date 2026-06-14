/**
 * Intelligent column mapping for the contact importer.
 * Maps arbitrary spreadsheet headers to our canonical contact fields, then
 * validates each data row with Zod and reports per-row errors.
 * Pure module — shared by the import wizard and tests (§9).
 */
import { contactImportRowSchema, type ContactImportRow } from "./validators";

export type CanonicalField =
  | "fullName"
  | "designation"
  | "phone"
  | "email"
  | "engSubDivision"
  | "division"
  | "corporation"
  | "officeAddress"
  | "source";

/** Header synonyms → canonical field. Matching is case/space/punctuation-insensitive. */
const SYNONYMS: Record<CanonicalField, string[]> = {
  fullName: ["name", "full name", "officer name", "engineer name", "contact name"],
  designation: ["designation", "title", "role", "post", "position"],
  phone: ["phone", "mobile", "contact", "phone number", "mobile number", "cell", "contact no", "mobile no", "phone no", "contact number", "mob"],
  email: ["email", "e-mail", "mail", "email id", "email address"],
  engSubDivision: ["eng subdiv", "engineering sub division", "sub division", "subdivision", "eng_subdiv", "subdiv"],
  division: ["division", "div"],
  corporation: ["corporation", "corp", "city corporation", "gba corporation"],
  officeAddress: ["address", "office address", "office"],
  source: ["source", "reference", "src"],
};

function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Map a header row to { canonicalField: columnIndex }. Unmatched headers are ignored. */
export function mapColumns(headers: string[]): Partial<Record<CanonicalField, number>> {
  const mapping: Partial<Record<CanonicalField, number>> = {};
  const canonHeaders = headers.map((h) => canon(h ?? ""));
  for (const [field, syns] of Object.entries(SYNONYMS) as [CanonicalField, string[]][]) {
    const wanted = syns.map(canon);
    const idx = canonHeaders.findIndex((h) => h !== "" && wanted.includes(h));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

export interface RowResult {
  rowIndex: number;
  raw: string[];
  data?: ContactImportRow;
  errors: string[];
}

/** Build a candidate object from a data row using the column mapping. */
export function projectRow(
  row: string[],
  mapping: Partial<Record<CanonicalField, number>>,
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [field, idx] of Object.entries(mapping) as [CanonicalField, number][]) {
    obj[field] = (row[idx] ?? "").toString().trim();
  }
  return obj;
}

/** Validate every data row; returns a result per row with parsed data or errors. */
export function validateRows(
  rows: string[][],
  mapping: Partial<Record<CanonicalField, number>>,
): RowResult[] {
  return rows.map((row, i) => {
    const candidate = projectRow(row, mapping);
    const parsed = contactImportRowSchema.safeParse(candidate);
    if (parsed.success) {
      return { rowIndex: i, raw: row, data: parsed.data, errors: [] };
    }
    return {
      rowIndex: i,
      raw: row,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "row"}: ${issue.message}`,
      ),
    };
  });
}
