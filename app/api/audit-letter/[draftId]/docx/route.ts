import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES, COMPLAINT_WRITE_ROLES, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { buildLetterDocx } from "@/lib/docx/bill-stop-builder";
import type { LetterSkeleton } from "@/lib/letters/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Download an Audit & Draft intake's letter as a Word document. The persisted
 * LetterSkeleton (recipient / copy chain / flag summary / loss box / grounds) is
 * rebuilt into a .docx. Requires an RTI or complaint writer role.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ draftId: string }> }) {
  const user = await getSessionUser();
  const roles = Array.from(new Set([...RTI_WRITE_ROLES, ...COMPLAINT_WRITE_ROLES])) as UserRole[];
  if (!user || !hasRole(user, roles)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { draftId } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_intakes")
    .select("skeleton, job_number")
    .eq("id", draftId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.skeleton) {
    return NextResponse.json({ error: "No letter found for this draft. Generate and approve it first." }, { status: 404 });
  }

  const bytes = await buildLetterDocx(data.skeleton as LetterSkeleton);
  const fileBase = `Audit_${String(data.job_number ?? "draft").replace(/[^\w-]+/g, "_")}`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileBase}.docx"`,
    },
  });
}
