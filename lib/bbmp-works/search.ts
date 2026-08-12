import "server-only";
import type { DbClient } from "@/lib/db";
import { createClient } from "@/lib/db";
import type { BBMPWorkDetails, WorkSearchRequest, WorkSearchResponse } from "./types";
import { validateWorkSearchRequest } from "./types";
import { normalizeJobNumber } from "./normalize";
import { rowToWorkDetails, type BbmpWorkRow, type WorkSourceRow } from "./map";
import { getSessionUser } from "@/lib/auth";
import { logSearchHistory } from "@/lib/search-history";

function logErr(where: string, error: unknown) {
  if (error) console.warn(`[bbmp-works:${where}]`, error);
}

const FUZZY_THRESHOLD = 0.3;
const SUGGESTION_THRESHOLD = 0.15;

async function fuzzyMatch(
  db: DbClient,
  column: "ward_name" | "work_name" | "contractor_name" | "engineer_name" | "location_description",
  query: string,
  threshold = FUZZY_THRESHOLD,
): Promise<BbmpWorkRow[]> {
  const { data, error } = await db.rpc("bbmp_works_fuzzy_search", {
    p_column: column,
    p_query: query,
    p_threshold: threshold,
    p_limit: 25,
  });
  logErr(`fuzzy:${column}`, error);
  return (data as BbmpWorkRow[]) ?? [];
}

async function exactOrIlike(db: DbClient, build: (q: any) => any): Promise<BbmpWorkRow[]> {
  const { data, error } = await build(db.from("bbmp_works").select("*"));
  logErr("exactOrIlike", error);
  return (data as BbmpWorkRow[]) ?? [];
}

// ── Priority-ordered search tiers (spec section 3) ──────────────────────────

async function searchByJobNumber(db: DbClient, value?: string) {
  const v = normalizeJobNumber(value);
  if (!v) return [];
  return exactOrIlike(db, (q) => q.eq("job_number", v).limit(25));
}

async function searchByWorkNumber(db: DbClient, value?: string) {
  const v = normalizeJobNumber(value);
  if (!v) return [];
  return exactOrIlike(db, (q) => q.eq("work_number", v).limit(25));
}

async function searchByTenderNumber(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  return exactOrIlike(db, (q) => q.ilike("tender_number", v).limit(25));
}

async function searchByWorkOrderNumber(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  return exactOrIlike(db, (q) => q.ilike("work_order_number", v).limit(25));
}

async function searchByWardNumber(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  return exactOrIlike(db, (q) => q.eq("ward_number", v).limit(25));
}

// Kannada Unicode block. gba_wards.ward_name_kn is the only *_kn column that
// actually exists and is populated in this app (from scanned Annexure data);
// bbmp_works has no Kannada columns of its own (IFMS/manual-entry sources are
// English-only), so a Kannada ward-name search resolves via gba_wards first,
// then searches bbmp_works using the resolved English name. No other free-
// text field (work name, contractor, etc.) has a Kannada source to resolve
// against, so this deliberately covers ward names only.
const KANNADA_RE = /[ಀ-೿]/;

async function resolveKannadaWardName(db: DbClient, value: string): Promise<string | null> {
  const { data, error } = await db
    .from("gba_wards")
    .select("ward_name_en")
    .ilike("ward_name_kn", `%${value}%`)
    .limit(1)
    .maybeSingle();
  logErr("resolveKannadaWardName", error);
  return (data as { ward_name_en: string } | null)?.ward_name_en ?? null;
}

async function searchByWardName(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  if (KANNADA_RE.test(v)) {
    const resolved = await resolveKannadaWardName(db, v);
    return resolved ? fuzzyMatch(db, "ward_name", resolved) : [];
  }
  return fuzzyMatch(db, "ward_name", v);
}

/** Resolve a possibly-legacy division name to its current canonical name via
 *  divisions.old_names (mirrors wards.old_wards), so a work-search division
 *  filter still matches works even when a legacy name was typed. Falls back
 *  to null (caller then searches only the literal typed value). */
async function resolveDivisionName(db: DbClient, division: string): Promise<string | null> {
  const needle = division.trim();
  if (!needle) return null;
  const { data: byName } = await db.from("divisions").select("name").ilike("name", `%${needle}%`).limit(1).maybeSingle();
  if (byName?.name) return byName.name;
  const { data: all } = await db.from("divisions").select("name, old_names");
  const match = (all as { name: string; old_names: string[] }[] | null)?.find((d) =>
    (d.old_names ?? []).some((o) => o.toLowerCase() === needle.toLowerCase()),
  );
  return match?.name ?? null;
}

async function searchByDivisionSubDivision(db: DbClient, division?: string, subDivision?: string) {
  const div = division?.trim();
  const sub = subDivision?.trim();
  if (!div && !sub) return [];
  const resolvedDivision = div ? await resolveDivisionName(db, div) : null;
  return exactOrIlike(db, (q) => {
    let query = q;
    if (div) {
      const or =
        resolvedDivision && resolvedDivision.toLowerCase() !== div.toLowerCase()
          ? `division_name.ilike.%${div}%,division_name.ilike.%${resolvedDivision}%`
          : `division_name.ilike.%${div}%`;
      query = query.or(or);
    }
    if (sub) query = query.ilike("sub_division_name", `%${sub}%`);
    return query.limit(25);
  });
}

async function searchByZone(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  return exactOrIlike(db, (q) => q.ilike("zone", `%${v}%`).limit(25));
}

async function searchByWorkName(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  return fuzzyMatch(db, "work_name", v);
}

async function searchByLocation(db: DbClient, location?: string, layoutName?: string, roadName?: string) {
  const loc = location?.trim();
  const layout = layoutName?.trim();
  const road = roadName?.trim();
  if (!loc && !layout && !road) return [];
  const term = loc || layout || road || "";
  const or = [
    `location_description.ilike.%${term}%`,
    `road_name.ilike.%${term}%`,
    `layout_name.ilike.%${term}%`,
  ].join(",");
  return exactOrIlike(db, (q) => q.or(or).limit(25));
}

async function searchByContractorName(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  return fuzzyMatch(db, "contractor_name", v);
}

async function searchByEngineerName(db: DbClient, value?: string) {
  const v = value?.trim();
  if (!v) return [];
  const or = [
    `engineer_name.ilike.%${v}%`,
    `assistant_engineer.ilike.%${v}%`,
    `assistant_executive_engineer.ilike.%${v}%`,
    `executive_engineer.ilike.%${v}%`,
    `superintending_engineer.ilike.%${v}%`,
    `chief_engineer.ilike.%${v}%`,
  ].join(",");
  return exactOrIlike(db, (q) => q.or(or).limit(25));
}

async function attachSources(db: DbClient, rows: BbmpWorkRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data, error } = await db.from("work_sources").select("*").in("work_id", ids);
  logErr("attachSources", error);
  const byWork = new Map<string, WorkSourceRow[]>();
  for (const s of (data as (WorkSourceRow & { work_id: string })[]) ?? []) {
    const list = byWork.get(s.work_id) ?? [];
    list.push(s);
    byWork.set(s.work_id, list);
  }
  return rows.map((row) => rowToWorkDetails(row, byWork.get(row.id) ?? []));
}

/** Loosened fuzzy match against the field the user actually supplied, used
 *  only when the full cascade misses (spec section 8's "not found" branch). */
async function buildSuggestions(db: DbClient, request: WorkSearchRequest): Promise<string[]> {
  const candidates: Array<{ column: "ward_name" | "work_name" | "contractor_name"; value?: string }> = [
    { column: "ward_name", value: request.wardName },
    { column: "work_name", value: request.workName },
    { column: "contractor_name", value: request.contractorName },
  ];
  for (const { column, value } of candidates) {
    const v = value?.trim();
    if (!v) continue;
    const rows = await fuzzyMatch(db, column, v, SUGGESTION_THRESHOLD);
    const key = column === "ward_name" ? "wardName" : column === "work_name" ? "workName" : "contractorName";
    const names = rows
      .map((r) => (r as unknown as Record<string, unknown>)[column] as string | null)
      .filter((n): n is string => !!n);
    const distinct = Array.from(new Set(names)).slice(0, 5);
    if (distinct.length) return distinct;
    void key;
  }
  return [
    "Check whether the job number is correct",
    "Enter the ward number",
    "Add the work location or road name",
    "Add division or sub-division details",
    "Enter the work order number or tender number if available",
  ];
}

/** Priority-ordered cascade search (spec section 3/14). Runs each tier in
 *  order, stopping at the first non-empty result set. */
export async function searchBBMPWork(request: WorkSearchRequest): Promise<WorkSearchResponse> {
  if (!validateWorkSearchRequest(request)) {
    return {
      success: false,
      totalResults: 0,
      data: [],
      message: "Please enter a job number, ward number, division, sub-division, work name, or location.",
      errorCode: "VALIDATION_ERROR",
    };
  }

  const db = await createClient();

  const tiers: Array<() => Promise<BbmpWorkRow[]>> = [
    () => searchByJobNumber(db, request.jobNumber),
    () => searchByWorkNumber(db, request.workNumber),
    () => searchByTenderNumber(db, request.tenderNumber),
    () => searchByWorkOrderNumber(db, request.workOrderNumber),
    () => searchByWardNumber(db, request.wardNumber),
    () => searchByWardName(db, request.wardName),
    () => searchByDivisionSubDivision(db, request.division, request.subDivision),
    () => searchByZone(db, request.zone),
    () => searchByWorkName(db, request.workName),
    () => searchByLocation(db, request.location, request.layoutName, request.roadName),
    () => searchByContractorName(db, request.contractorName),
    () => searchByEngineerName(db, request.engineerName),
  ];

  const user = await getSessionUser();

  try {
    for (const tier of tiers) {
      const rows = await tier();
      if (rows.length > 0) {
        const data = await attachSources(db, rows);
        void logSearchHistory(db, { userId: user?.id ?? null, queryParams: request as Record<string, unknown>, resultCount: data.length });
        return { success: true, totalResults: data.length, data, message: `Found ${data.length} result(s).` };
      }
    }
  } catch (e) {
    console.error("[searchBBMPWork]", e);
    return {
      success: false,
      totalResults: 0,
      data: [],
      message: "Something went wrong while searching. Please try again.",
      errorCode: "SYSTEM_ERROR",
    };
  }

  const suggestions = await buildSuggestions(db, request);
  void logSearchHistory(db, { userId: user?.id ?? null, queryParams: request as Record<string, unknown>, resultCount: 0 });
  return {
    success: false,
    totalResults: 0,
    data: [],
    message: "No official work records were found for the provided information.",
    errorCode: "NO_DATA",
    suggestions,
  };
}

/** Single-record lookup for permalink pages (app/bbmp-works/[id],
 *  app/bbmp-works/job/[jobNumber]). Returns null if not found. */
export async function getBBMPWorkById(id: string): Promise<BBMPWorkDetails | null> {
  const db = await createClient();
  const { data, error } = await db.from("bbmp_works").select("*").eq("id", id).maybeSingle();
  logErr("getBBMPWorkById", error);
  if (!data) return null;
  const [details] = await attachSources(db, [data as BbmpWorkRow]);
  return details ?? null;
}

export async function getBBMPWorkByJobNumber(jobNumber: string): Promise<BBMPWorkDetails | null> {
  const db = await createClient();
  const normalized = normalizeJobNumber(jobNumber) ?? jobNumber;
  const { data, error } = await db.from("bbmp_works").select("*").eq("job_number", normalized).maybeSingle();
  logErr("getBBMPWorkByJobNumber", error);
  if (!data) return null;
  const [details] = await attachSources(db, [data as BbmpWorkRow]);
  return details ?? null;
}
