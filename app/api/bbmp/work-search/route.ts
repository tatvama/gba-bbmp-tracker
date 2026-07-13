import { NextResponse, type NextRequest } from "next/server";
import { searchBBMPWork } from "@/lib/bbmp-works/search";
import type { WorkSearchRequest } from "@/lib/bbmp-works/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS: (keyof WorkSearchRequest)[] = [
  "jobNumber", "workNumber", "tenderNumber", "workOrderNumber",
  "wardNumber", "wardName", "zone", "division", "subDivision",
  "workName", "location", "layoutName", "roadName",
  "contractorName", "engineerName",
];

/**
 * Public work-registry search (civic transparency — same public-read posture
 * as job_cases/contacts/wards; no auth gate). The search UI (app/bbmp-works/
 * search) calls searchBBMPWork() directly server-side; this route exists for
 * external/programmatic callers.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, totalResults: 0, data: [], message: "Invalid JSON body.", errorCode: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, totalResults: 0, data: [], message: "Request body must be an object.", errorCode: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const request: WorkSearchRequest = {};
  for (const field of FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim()) request[field] = value;
  }

  try {
    const result = await searchBBMPWork(request);
    const status = result.success ? 200 : result.errorCode === "VALIDATION_ERROR" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (e) {
    console.error("[api/bbmp/work-search]", e);
    return NextResponse.json(
      { success: false, totalResults: 0, data: [], message: "Internal error while searching.", errorCode: "SYSTEM_ERROR" },
      { status: 500 },
    );
  }
}
