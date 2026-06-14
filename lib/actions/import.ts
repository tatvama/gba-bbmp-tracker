"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthorizationError } from "@/lib/auth";
import { contactImportRowSchema } from "@/lib/validators";
import { WRITE_ROLES } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import { normalizeEmail, normalizeName } from "@/lib/dedupe";

export interface ImportResult {
  error?: string;
  dryRun: boolean;
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; messages: string[] }[];
}

export interface ImportInput {
  fileName: string;
  rows: Record<string, string>[];
  dryRun: boolean;
  duplicateStrategy: "skip" | "update";
}

const lc = (s: string) => s.trim().toLowerCase();

export async function commitImport(input: ImportInput): Promise<ImportResult> {
  let user;
  try {
    user = await requireRole(WRITE_ROLES);
  } catch (e) {
    return blank(input.dryRun, {
      error: e instanceof AuthorizationError ? e.message : "Not authorized",
    });
  }

  const supabase = await createClient();

  // Lookups for name → id resolution
  const [corpsRes, divsRes, subsRes, existingRes] = await Promise.all([
    supabase.from("corporations").select("id,code,name"),
    supabase.from("divisions").select("id,name"),
    supabase.from("eng_subdivisions").select("id,name"),
    supabase.from("contacts").select("id,full_name,phone,whatsapp,email"),
  ]);

  const corpByName = new Map<string, string>();
  for (const c of (corpsRes.data ?? []) as { id: string; code: string; name: string }[]) {
    corpByName.set(lc(c.name), c.id);
    corpByName.set(lc(c.code), c.id);
  }
  const divByName = new Map((divsRes.data ?? []).map((d: any) => [lc(d.name), d.id]));
  const subByName = new Map((subsRes.data ?? []).map((s: any) => [lc(s.name), s.id]));

  const existing = (existingRes.data ?? []) as {
    id: string;
    full_name: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
  }[];
  const findDup = (r: { fullName: string; phone?: string; email?: string }) => {
    const np = normalizePhone(r.phone);
    const ne = normalizeEmail(r.email);
    const nn = normalizeName(r.fullName);
    return existing.find((e) => {
      if (np && (normalizePhone(e.phone) === np || normalizePhone(e.whatsapp) === np)) return true;
      if (ne && normalizeEmail(e.email) === ne) return true;
      if (nn && normalizeName(e.full_name) === nn) return true;
      return false;
    });
  };

  const result: ImportResult = {
    dryRun: input.dryRun,
    total: input.rows.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; row: Record<string, unknown> }[] = [];

  input.rows.forEach((raw, i) => {
    const parsed = contactImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({
        row: i + 1,
        messages: parsed.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`),
      });
      return;
    }
    const d = parsed.data;
    const row = {
      full_name: d.fullName,
      designation: d.designation,
      phone: d.phone ?? null,
      whatsapp: d.phone ?? null,
      email: d.email ?? null,
      office_address: d.officeAddress ?? null,
      eng_subdivision_id: d.engSubDivision ? subByName.get(lc(d.engSubDivision)) ?? null : null,
      division_id: d.division ? divByName.get(lc(d.division)) ?? null : null,
      corporation_id: d.corporation ? corpByName.get(lc(d.corporation)) ?? null : null,
      source: d.source ?? input.fileName,
      verification_status: "PENDING",
      confidence_score: "LOW",
      created_by: user.id,
      updated_by: user.id,
    };

    const dup = findDup({ fullName: d.fullName, phone: d.phone, email: d.email });
    if (dup) {
      if (input.duplicateStrategy === "update") {
        result.updated++;
        toUpdate.push({ id: dup.id, row });
      } else {
        result.skipped++;
      }
    } else {
      result.imported++;
      toInsert.push(row);
    }
  });

  if (!input.dryRun) {
    if (toInsert.length) {
      const { error } = await supabase.from("contacts").insert(toInsert);
      if (error) return { ...result, error: error.message };
    }
    for (const u of toUpdate) {
      await supabase.from("contacts").update(u.row).eq("id", u.id);
    }
    await supabase.from("import_logs").insert({
      file_name: input.fileName,
      total_rows: result.total,
      imported_rows: result.imported,
      skipped_rows: result.skipped,
      error_rows: result.errors.length,
      dry_run: false,
      imported_by: user.id,
    });
    revalidatePath("/contacts");
  } else {
    await supabase.from("import_logs").insert({
      file_name: input.fileName,
      total_rows: result.total,
      imported_rows: result.imported,
      skipped_rows: result.skipped,
      error_rows: result.errors.length,
      dry_run: true,
      imported_by: user.id,
    });
  }

  return result;
}

function blank(dryRun: boolean, extra: Partial<ImportResult>): ImportResult {
  return { dryRun, total: 0, imported: 0, updated: 0, skipped: 0, errors: [], ...extra };
}
