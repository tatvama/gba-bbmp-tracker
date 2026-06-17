import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLetterDocx } from "@/lib/docx/bill-stop-builder";
import { evidenceIndexToCsv } from "@/lib/letters/evidence-index";
import { buildQuantityTable, buildRiskTable } from "@/lib/letters/tables";
import type { LetterSkeleton, QuantityRow, LetterFinding } from "@/lib/letters/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Download a persisted forensic letter draft as a Word document (default) or its
 * evidence index as CSV (?format=csv). Requires a verifier role. The latest draft
 * for the job (optionally a specific ?draftId=) is used.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ jobNumber: string }> }) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const { jobNumber } = await ctx.params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const draftId = url.searchParams.get("draftId");

  const admin = createAdminClient();
  const cols = "id, skeleton, quantities, file_name, evidence_index, lint_ok";
  // Always scope by job_number — a draftId from another job must not be served (IDOR).
  let q = admin
    .from("letter_drafts")
    .select(cols)
    .eq("job_number", jobNumber)
    .order("created_at", { ascending: false })
    .limit(1);
  if (draftId) q = admin.from("letter_drafts").select(cols).eq("id", draftId).eq("job_number", jobNumber).limit(1);

  const { data, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.skeleton) {
    return NextResponse.json({ error: "No letter draft found for this job. Generate the letter first." }, { status: 404 });
  }
  // Never export a draft that failed the safe-language gate (would file accusatory wording).
  if (data.lint_ok === false) {
    return NextResponse.json(
      { error: "This draft did not pass the safe-language check and cannot be exported. Edit it to remove prohibited wording, re-check, then download." },
      { status: 422 },
    );
  }

  const skeleton = data.skeleton as LetterSkeleton;
  const fileBase = (data.file_name as string) || `Letter_${jobNumber}`;

  if (format === "csv") {
    const csv = evidenceIndexToCsv(skeleton.evidenceIndex ?? []);
    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}_evidence.csv"`,
      },
    });
  }

  // Rebuild the supporting tables from any persisted structured rows.
  const quantities = (data.quantities as QuantityRow[] | null) ?? [];
  const findingsForRisk: LetterFinding[] = (skeleton.summaryBox ?? []).map((s) => ({
    code: s.ground, title: s.ground, severity: "Medium", observation: s.whySuspicious, evidenceGrade: s.risk.split("/").pop()?.trim(),
  }));

  const bytes = await buildLetterDocx(skeleton, {
    quantityTable: quantities.length ? buildQuantityTable(quantities) : null,
    riskTable: findingsForRisk.length ? buildRiskTable(findingsForRisk) : null,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileBase}.docx"`,
    },
  });
}
