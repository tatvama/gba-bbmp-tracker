import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CORP_NAME, CORPORATION_CODES, COMPLAINT_OPEN_STATUSES } from "@/lib/constants";
import { getDeadlineRules } from "@/lib/settings";
import { activeDeadline } from "@/lib/rti-deadlines";
import { benford, thresholdClusters, iqrOutliers, type BenfordResult } from "@/lib/forensics/analytics";
import { haversineMeters } from "@/lib/geo";
import type {
  Contact,
  ContactWithRelations,
  Corporation,
  Division,
  EngSubDivision,
  Ward,
  WardWithRelations,
  Complaint,
  AuditLog,
  SourceDocument,
  RtiApplication,
  RtiWithRelations,
  RtiFirstAppeal,
  RtiSecondAppeal,
  RtiDocument,
  Template,
  AiDraft,
  Reminder,
  CommunicationLog,
  ComplaintWithRelations,
  ComplaintDocument,
  ComplaintTimelineEntry,
  ComplaintReply,
  ComplaintActionTaken,
  OcrJob,
  OfficerTransfer,
} from "@/lib/types";

/**
 * All read queries hit RLS-public tables (anon key is fine). Each is wrapped so
 * a missing table / pre-migration DB yields an empty result + a server log,
 * never a crashed page.
 */
async function sb() {
  return createClient();
}

function logErr(where: string, error: unknown) {
  if (error) console.warn(`[queries:${where}]`, error);
}

const WARD_SELECT =
  "*, division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name,sl_no), derived_corporation:corporations!derived_corporation_id(id,code,name)";

const CONTACT_SELECT =
  "*, corporation:corporations!corporation_id(id,code,name), division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name)";

// --------------------------------------------------------------------------
// Dashboard
// --------------------------------------------------------------------------
export interface DashboardStats {
  corporations: number;
  gbaWards: number;
  bbmp225Wards: number;
  old198Represented: number;
  divisions: number;
  subdivisions: number;
  contacts: number;
  verified: number;
  pending: number;
  missingContactInfo: number;
  wardsWithoutContact: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await sb();
  const count = async (table: string, mod?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (mod) q = mod(q);
    const { count: c, error } = await q;
    logErr(`count:${table}`, error);
    return c ?? 0;
  };

  const [corporations, bbmp225Wards, divisions, subdivisions, contacts, verified, pending] =
    await Promise.all([
      count("corporations"),
      count("wards"),
      count("divisions"),
      count("eng_subdivisions"),
      count("contacts"),
      count("contacts", (q) => q.eq("verification_status", "VERIFIED")),
      count("contacts", (q) => q.eq("verification_status", "PENDING")),
    ]);

  // GBA wards = sum of corporation ward_count (369)
  const { data: corps } = await supabase.from("corporations").select("ward_count");
  const gbaWards = (corps ?? []).reduce(
    (s: number, c: { ward_count: number }) => s + (c.ward_count ?? 0),
    0,
  );

  // Old-198 represented = distinct old_wards entries across all wards
  const { data: oldRows } = await supabase.from("wards").select("old_wards");
  const oldSet = new Set<string>();
  for (const r of (oldRows ?? []) as { old_wards: string[] }[])
    for (const o of r.old_wards ?? []) oldSet.add(o);

  const missingContactInfo = await count("contacts", (q) =>
    q.or("phone.is.null,email.is.null,office_address.is.null"),
  );

  // wards whose eng sub-division has no contact
  const { data: subWithContact } = await supabase
    .from("contacts")
    .select("eng_subdivision_id")
    .not("eng_subdivision_id", "is", null);
  const subsCovered = new Set(
    (subWithContact ?? []).map((r: { eng_subdivision_id: string }) => r.eng_subdivision_id),
  );
  const { data: wardSubs } = await supabase.from("wards").select("eng_subdivision_id");
  const wardsWithoutContact = (wardSubs ?? []).filter(
    (w: { eng_subdivision_id: string | null }) =>
      !w.eng_subdivision_id || !subsCovered.has(w.eng_subdivision_id),
  ).length;

  return {
    corporations,
    gbaWards,
    bbmp225Wards,
    old198Represented: oldSet.size,
    divisions,
    subdivisions,
    contacts,
    verified,
    pending,
    missingContactInfo,
    wardsWithoutContact,
  };
}

export async function getRecentlyUpdated(limit = 8): Promise<Contact[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  logErr("recentlyUpdated", error);
  return (data as Contact[]) ?? [];
}

export async function getNeedsVerification(limit = 8): Promise<Contact[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .in("verification_status", ["PENDING", "NEEDS_CORRECTION", "UNKNOWN"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  logErr("needsVerification", error);
  return (data as Contact[]) ?? [];
}

// --------------------------------------------------------------------------
// Wards
// --------------------------------------------------------------------------
export async function listWards(): Promise<WardWithRelations[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("wards")
    .select(WARD_SELECT)
    .order("new_no", { ascending: true });
  logErr("listWards", error);
  return (data as unknown as WardWithRelations[]) ?? [];
}

export async function getWard(newNo: number): Promise<WardWithRelations | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("wards")
    .select(WARD_SELECT)
    .eq("new_no", newNo)
    .maybeSingle();
  logErr("getWard", error);
  return (data as unknown as WardWithRelations) ?? null;
}

// --------------------------------------------------------------------------
// Corporations / Divisions / Sub-divisions
// --------------------------------------------------------------------------
export async function listCorporations(): Promise<Corporation[]> {
  const supabase = await sb();
  const { data, error } = await supabase.from("corporations").select("*").order("name");
  logErr("listCorporations", error);
  return (data as Corporation[]) ?? [];
}

export async function getCorporation(code: string): Promise<Corporation | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("corporations")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  logErr("getCorporation", error);
  return (data as Corporation) ?? null;
}

export interface GbaWardRow {
  ward_no: number;
  ward_name_en: string;
  ward_name_kn: string | null;
  legible: boolean;
  division: string;
  subdivision: string;
  assembly_constituency: string | null;
}

export interface GbaSubDivision {
  name: string;
  wards: GbaWardRow[];
}
export interface GbaDivision {
  name: string;
  assembly_constituency: string | null;
  subdivisions: GbaSubDivision[];
  wardCount: number;
}

/** GBA per-corporation breakdown (division → sub-division → wards), from public.gba_wards. */
export async function getGbaStructure(code: string): Promise<GbaDivision[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("gba_wards")
    .select("ward_no, ward_name_en, ward_name_kn, legible, division, subdivision, assembly_constituency")
    .eq("corporation_code", code.toUpperCase())
    .order("ward_no");
  logErr("getGbaStructure", error);
  const rows = (data as GbaWardRow[]) ?? [];

  const divMap = new Map<string, GbaDivision>();
  for (const r of rows) {
    let d = divMap.get(r.division);
    if (!d) {
      d = { name: r.division, assembly_constituency: r.assembly_constituency, subdivisions: [], wardCount: 0 };
      divMap.set(r.division, d);
    }
    let s = d.subdivisions.find((x) => x.name === r.subdivision);
    if (!s) {
      s = { name: r.subdivision, wards: [] };
      d.subdivisions.push(s);
    }
    s.wards.push(r);
    d.wardCount++;
  }
  return Array.from(divMap.values());
}

// --------------------------------------------------------------------------
// GBA hierarchy tree (for the interactive Tree Map) — all 5 corporations,
// nested Corporation → Division → Sub-division → Ward, from public.gba_wards.
// --------------------------------------------------------------------------
export interface GbaTreeWard {
  no: number;
  name: string;
  kn: string | null;
  legible: boolean;
  extra?: string; // BBMP mode: old 198-ward names that merged into this ward
}
export interface GbaTreeSub {
  name: string;
  wardCount: number;
  wards: GbaTreeWard[];
}
export interface GbaTreeDiv {
  name: string;
  ac: string | null;
  wardCount: number;
  subdivisions: GbaTreeSub[];
}
export interface GbaTreeCorp {
  code: string;
  name: string;
  wardCount: number;
  divisionCount: number;
  subdivisionCount: number;
  divisions: GbaTreeDiv[];
}

export async function getGbaTree(): Promise<GbaTreeCorp[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("gba_wards")
    .select(
      "corporation_code, ward_no, ward_name_en, ward_name_kn, legible, division, subdivision, assembly_constituency",
    )
    .order("ward_no");
  logErr("getGbaTree", error);
  const rows = (data as (GbaWardRow & { corporation_code: string })[]) ?? [];

  const corpMap = new Map<string, GbaTreeCorp>();
  for (const r of rows) {
    let corp = corpMap.get(r.corporation_code);
    if (!corp) {
      corp = {
        code: r.corporation_code,
        name: CORP_NAME[r.corporation_code] ?? r.corporation_code,
        wardCount: 0,
        divisionCount: 0,
        subdivisionCount: 0,
        divisions: [],
      };
      corpMap.set(r.corporation_code, corp);
    }
    let div = corp.divisions.find((d) => d.name === r.division);
    if (!div) {
      div = { name: r.division, ac: r.assembly_constituency, wardCount: 0, subdivisions: [] };
      corp.divisions.push(div);
    }
    let sub = div.subdivisions.find((s) => s.name === r.subdivision);
    if (!sub) {
      sub = { name: r.subdivision, wardCount: 0, wards: [] };
      div.subdivisions.push(sub);
    }
    sub.wards.push({ no: r.ward_no, name: r.ward_name_en, kn: r.ward_name_kn, legible: r.legible });
    sub.wardCount++;
    div.wardCount++;
    corp.wardCount++;
  }

  for (const corp of corpMap.values()) {
    corp.divisionCount = corp.divisions.length;
    corp.subdivisionCount = corp.divisions.reduce((s, d) => s + d.subdivisions.length, 0);
  }

  // Canonical corporation order.
  return CORPORATION_CODES.map((code) => corpMap.get(code)).filter(
    (c): c is GbaTreeCorp => Boolean(c),
  );
}

export async function getBbmpTree(): Promise<GbaTreeCorp[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("wards")
    .select(
      "new_no, new_name, old_wards, division:divisions!division_id(name), eng_subdivision:eng_subdivisions!eng_subdivision_id(name), derived_corporation:corporations!derived_corporation_id(code)",
    )
    .order("new_no");
  logErr("getBbmpTree", error);

  const rows = (
    (data as unknown) as {
      new_no: number;
      new_name: string;
      old_wards: string[] | null;
      division: { name: string } | null;
      eng_subdivision: { name: string } | null;
      derived_corporation: { code: string } | null;
    }[]
  ) ?? [];

  const corpMap = new Map<string, GbaTreeCorp>();
  for (const r of rows) {
    const corpCode = r.derived_corporation?.code;
    const divName = r.division?.name;
    const subName = r.eng_subdivision?.name;
    if (!corpCode || !divName || !subName) continue;

    let corp = corpMap.get(corpCode);
    if (!corp) {
      corp = {
        code: corpCode,
        name: CORP_NAME[corpCode] ?? corpCode,
        wardCount: 0,
        divisionCount: 0,
        subdivisionCount: 0,
        divisions: [],
      };
      corpMap.set(corpCode, corp);
    }
    let div = corp.divisions.find((d) => d.name === divName);
    if (!div) {
      div = { name: divName, ac: null, wardCount: 0, subdivisions: [] };
      corp.divisions.push(div);
    }
    let sub = div.subdivisions.find((s) => s.name === subName);
    if (!sub) {
      sub = { name: subName, wardCount: 0, wards: [] };
      div.subdivisions.push(sub);
    }
    const oldInfo = r.old_wards?.length ? r.old_wards.join(" · ") : undefined;
    sub.wards.push({ no: r.new_no, name: r.new_name, kn: null, legible: true, extra: oldInfo });
    sub.wardCount++;
    div.wardCount++;
    corp.wardCount++;
  }

  for (const corp of corpMap.values()) {
    corp.divisionCount = corp.divisions.length;
    corp.subdivisionCount = corp.divisions.reduce((s, d) => s + d.subdivisions.length, 0);
  }

  return CORPORATION_CODES.map((code) => corpMap.get(code)).filter(
    (c): c is GbaTreeCorp => Boolean(c),
  );
}

export async function listDivisions(): Promise<
  (Division & { corporation?: Pick<Corporation, "code" | "name"> | null })[]
> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("divisions")
    .select("*, corporation:corporations!corporation_id(code,name)")
    .order("name");
  logErr("listDivisions", error);
  return (data as any) ?? [];
}

export async function getDivision(id: string) {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("divisions")
    .select("*, corporation:corporations!corporation_id(id,code,name)")
    .eq("id", id)
    .maybeSingle();
  logErr("getDivision", error);
  return (data as any) ?? null;
}

export async function listSubDivisions(): Promise<
  (EngSubDivision & { division?: Pick<Division, "id" | "name"> | null })[]
> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("eng_subdivisions")
    .select("*, division:divisions!division_id(id,name)")
    .order("sl_no", { ascending: true, nullsFirst: false });
  logErr("listSubDivisions", error);
  return (data as any) ?? [];
}

export async function getSubDivision(id: string) {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("eng_subdivisions")
    .select("*, division:divisions!division_id(id,name,corporation_id)")
    .eq("id", id)
    .maybeSingle();
  logErr("getSubDivision", error);
  return (data as any) ?? null;
}

export async function listWardsForSubDivision(subId: string): Promise<Ward[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("wards")
    .select("*")
    .eq("eng_subdivision_id", subId)
    .order("new_no");
  logErr("wardsForSub", error);
  return (data as Ward[]) ?? [];
}

export async function listWardsForDivision(divisionId: string): Promise<Ward[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("wards")
    .select("*")
    .eq("division_id", divisionId)
    .order("new_no");
  logErr("wardsForDivision", error);
  return (data as Ward[]) ?? [];
}

export async function listSubDivisionsForDivision(divisionId: string): Promise<EngSubDivision[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("eng_subdivisions")
    .select("*")
    .eq("division_id", divisionId)
    .order("sl_no", { nullsFirst: false });
  logErr("subsForDivision", error);
  return (data as EngSubDivision[]) ?? [];
}

// --------------------------------------------------------------------------
// Contacts
// --------------------------------------------------------------------------
export async function listContacts(): Promise<ContactWithRelations[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .order("full_name");
  logErr("listContacts", error);
  return (data as unknown as ContactWithRelations[]) ?? [];
}

export async function getContact(id: string): Promise<ContactWithRelations | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("id", id)
    .maybeSingle();
  logErr("getContact", error);
  return (data as unknown as ContactWithRelations) ?? null;
}

export async function listContactsForSubDivision(subId: string): Promise<Contact[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("eng_subdivision_id", subId);
  logErr("contactsForSub", error);
  return (data as Contact[]) ?? [];
}

export async function listContactsForCorporation(corpId: string): Promise<Contact[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("corporation_id", corpId)
    .order("full_name");
  logErr("contactsForCorp", error);
  return (data as Contact[]) ?? [];
}

// --------------------------------------------------------------------------
// Complaints / Sources / Audit
// --------------------------------------------------------------------------
const COMPLAINT_SELECT =
  "*, ward:wards!ward_id(id,new_no,new_name), gba_ward:gba_wards!gba_ward_id(id,ward_no,ward_name_en,ward_name_kn), division:divisions!division_id(id,name), corporation:corporations!corporation_id(id,code,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name), assigned_engineer:contacts!assigned_engineer_id(id,full_name,designation,phone,whatsapp,email), assigned_officer:contacts!assigned_officer_id(id,full_name,designation)";

function mapGbaComplaint(c: any) {
  if (!c) return c;
  if (c.ward_type === "GBA" || c.gba_ward_id) {
    if (c.gba_ward) {
      c.ward = {
        id: c.gba_ward.id,
        new_no: c.gba_ward.ward_no,
        new_name: c.gba_ward.ward_name_en,
        name_kn: c.gba_ward.ward_name_kn,
      };
    }
    if (c.gba_division) {
      c.division = {
        id: c.gba_division,
        name: c.gba_division,
      };
    }
    if (c.gba_subdivision) {
      c.eng_subdivision = {
        id: c.gba_subdivision,
        name: c.gba_subdivision,
      };
    }
  }
  return c;
}

export async function listComplaints(): Promise<ComplaintWithRelations[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaints")
    .select(COMPLAINT_SELECT)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  logErr("listComplaints", error);
  const rows = (data as unknown as ComplaintWithRelations[]) ?? [];
  return rows.map(mapGbaComplaint);
}

export async function listComplaintsForWard(wardId: string): Promise<Complaint[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq("ward_id", wardId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  logErr("complaintsForWard", error);
  return (data as Complaint[]) ?? [];
}

export async function listSources(): Promise<SourceDocument[]> {
  const supabase = await sb();
  const { data, error } = await supabase.from("source_documents").select("*").order("title");
  logErr("listSources", error);
  return (data as SourceDocument[]) ?? [];
}

export async function listAuditLogs(
  filter?: { entityType?: string; entityId?: string },
  limit = 200,
): Promise<AuditLog[]> {
  const supabase = await sb();
  let q = supabase.from("audit_logs").select("*").order("changed_at", { ascending: false }).limit(limit);
  if (filter?.entityType) q = q.eq("entity_type", filter.entityType);
  if (filter?.entityId) q = q.eq("entity_id", filter.entityId);
  const { data, error } = await q;
  logErr("listAuditLogs", error);
  return (data as AuditLog[]) ?? [];
}

// --------------------------------------------------------------------------
// Global search (grouped)
// --------------------------------------------------------------------------
export interface SearchResults {
  wards: WardWithRelations[];
  contacts: ContactWithRelations[];
  divisions: Division[];
  subdivisions: (EngSubDivision & { division?: Pick<Division, "id" | "name"> | null })[];
  complaints: Complaint[];
  gbaWards: GbaWardSearchRow[];
}

export interface GbaWardSearchRow {
  corporation_code: string;
  ward_no: number;
  ward_name_en: string;
  division: string;
  subdivision: string;
}

export async function globalSearch(q: string): Promise<SearchResults> {
  const supabase = await sb();
  const term = q.trim();
  if (!term) return { wards: [], contacts: [], divisions: [], subdivisions: [], complaints: [], gbaWards: [] };
  const like = `%${term}%`;
  const numeric = /^\d+$/.test(term) ? Number(term) : null;

  const wardOr = [
    `new_name.ilike.${like}`,
    `assembly_constituency.ilike.${like}`,
    `zone.ilike.${like}`,
    `old_subdiv.ilike.${like}`,
    ...(numeric !== null ? [`new_no.eq.${numeric}`] : []),
  ].join(",");

  const gbaOr = [
    `ward_name_en.ilike.${like}`,
    `subdivision.ilike.${like}`,
    `division.ilike.${like}`,
  ].join(",");

  const [wards, contacts, divisions, subdivisions, complaints, gbaWards] = await Promise.all([
    supabase.from("wards").select(WARD_SELECT).or(wardOr).order("new_no").limit(25),
    supabase
      .from("contacts")
      .select(CONTACT_SELECT)
      .or(`full_name.ilike.${like},designation.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
      .limit(25),
    supabase.from("divisions").select("*").ilike("name", like).limit(25),
    supabase
      .from("eng_subdivisions")
      .select("*, division:divisions!division_id(id,name)")
      .ilike("name", like)
      .limit(25),
    supabase
      .from("complaints")
      .select("*")
      .or(`title.ilike.${like},complaint_number.ilike.${like},internal_case_number.ilike.${like},rti_number.ilike.${like},latest_reply_summary.ilike.${like}`)
      .is("deleted_at", null)
      .limit(25),
    supabase
      .from("gba_wards")
      .select("corporation_code, ward_no, ward_name_en, division, subdivision")
      .or(gbaOr)
      .limit(25),
  ]);

  logErr("search:wards", wards.error);
  logErr("search:contacts", contacts.error);
  return {
    wards: (wards.data as unknown as WardWithRelations[]) ?? [],
    contacts: (contacts.data as unknown as ContactWithRelations[]) ?? [],
    divisions: (divisions.data as Division[]) ?? [],
    subdivisions: (subdivisions.data as any) ?? [],
    complaints: (complaints.data as Complaint[]) ?? [],
    gbaWards: (gbaWards.data as GbaWardSearchRow[]) ?? [],
  };
}

export async function listDivisionsForCorporation(corpId: string): Promise<Division[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("divisions")
    .select("*")
    .eq("corporation_id", corpId)
    .order("name");
  logErr("divisionsForCorp", error);
  return (data as Division[]) ?? [];
}

export async function countDerivedWards(corpId: string): Promise<number> {
  const supabase = await sb();
  const { count, error } = await supabase
    .from("wards")
    .select("*", { count: "exact", head: true })
    .eq("derived_corporation_id", corpId);
  logErr("countDerivedWards", error);
  return count ?? 0;
}

export async function getComplaintFormOptions() {
  return {
    corporations: [],
    divisions: [],
    wards: [],
    subdivisions: [],
    contacts: [],
  };
}

/** Lightweight options for select inputs (forms / filters). */
export async function getFormOptions() {
  return {
    corporations: [],
    divisions: [],
    subdivisions: [],
  };
}

// ==========================================================================
// Phase 2 — RTI lifecycle
// ==========================================================================

const RTI_SELECT =
  "*, corporation:corporations!corporation_id(id,code,name), division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name), ward:wards!ward_id(id,new_no,new_name), contact:contacts!contact_id(id,full_name,designation), gba_ward:gba_wards!gba_ward_id(id,ward_no,ward_name_en,ward_name_kn)";

function mapGbaRti(r: any) {
  if (!r) return r;
  if (r.ward_type === "GBA" || r.gba_ward_id) {
    if (r.gba_ward) {
      r.ward = {
        id: r.gba_ward.id,
        new_no: r.gba_ward.ward_no,
        new_name: r.gba_ward.ward_name_en,
        name_kn: r.gba_ward.ward_name_kn,
      };
    }
    if (r.gba_division) {
      r.division = {
        id: r.gba_division,
        name: r.gba_division,
      };
    }
    if (r.gba_subdivision) {
      r.eng_subdivision = {
        id: r.gba_subdivision,
        name: r.gba_subdivision,
      };
    }
  }
  return r;
}

export async function listRtis(): Promise<RtiWithRelations[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_applications")
    .select(RTI_SELECT)
    .order("updated_at", { ascending: false });
  logErr("listRtis", error);
  const rows = (data as unknown as RtiWithRelations[]) ?? [];
  return rows.map(mapGbaRti);
}

export async function getRti(id: string): Promise<RtiWithRelations | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_applications")
    .select(RTI_SELECT)
    .eq("id", id)
    .maybeSingle();
  logErr("getRti", error);
  return mapGbaRti(data as unknown as RtiWithRelations);
}

/** Options for the RTI wizard / form selects. */
export async function getRtiFormOptions() {
  return {
    corporations: [],
    divisions: [],
    subdivisions: [],
    wards: [],
    contacts: [],
  };
}

export async function listFirstAppeals(rtiId: string): Promise<RtiFirstAppeal[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_first_appeals")
    .select("*")
    .eq("rti_id", rtiId)
    .order("created_at", { ascending: false });
  logErr("listFirstAppeals", error);
  return (data as RtiFirstAppeal[]) ?? [];
}

export async function listSecondAppeals(rtiId: string): Promise<RtiSecondAppeal[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_second_appeals")
    .select("*")
    .eq("rti_id", rtiId)
    .order("created_at", { ascending: false });
  logErr("listSecondAppeals", error);
  return (data as RtiSecondAppeal[]) ?? [];
}

export async function listRtiDocuments(rtiId: string): Promise<RtiDocument[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_documents")
    .select("*")
    .eq("rti_id", rtiId)
    .order("created_at", { ascending: true });
  logErr("listRtiDocuments", error);
  return (data as RtiDocument[]) ?? [];
}

export async function listAllFirstAppeals(): Promise<RtiFirstAppeal[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_first_appeals")
    .select("*")
    .order("created_at", { ascending: false });
  logErr("listAllFirstAppeals", error);
  return (data as RtiFirstAppeal[]) ?? [];
}

export async function listAllSecondAppeals(): Promise<RtiSecondAppeal[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_second_appeals")
    .select("*")
    .order("created_at", { ascending: false });
  logErr("listAllSecondAppeals", error);
  return (data as RtiSecondAppeal[]) ?? [];
}

export async function getFirstAppeal(id: string): Promise<RtiFirstAppeal | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_first_appeals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  logErr("getFirstAppeal", error);
  return data as RtiFirstAppeal | null;
}

export async function getSecondAppeal(id: string): Promise<RtiSecondAppeal | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_second_appeals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  logErr("getSecondAppeal", error);
  return data as RtiSecondAppeal | null;
}


export async function listRtiTemplates(kind?: string): Promise<Template[]> {
  const supabase = await sb();
  let q = supabase.from("templates").select("*").eq("active", true).order("title");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  logErr("listRtiTemplates", error);
  return (data as Template[]) ?? [];
}

export async function listAiDrafts(
  entityType: string,
  entityId: string,
): Promise<AiDraft[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("ai_drafts")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  logErr("listAiDrafts", error);
  return (data as AiDraft[]) ?? [];
}

export async function listCommunications(
  entityType: string,
  entityId: string,
): Promise<CommunicationLog[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("communication_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: false });
  logErr("listCommunications", error);
  return (data as CommunicationLog[]) ?? [];
}

export async function listRemindersForEntity(
  entityType: string,
  entityId: string,
): Promise<Reminder[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("due_date", { ascending: true, nullsFirst: false });
  logErr("listRemindersForEntity", error);
  return (data as Reminder[]) ?? [];
}

/** Pending RTI reminders soonest-first (RTI dashboard "urgent follow-ups"). */
export async function listUpcomingRtiReminders(limit = 8): Promise<Reminder[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("entity_type", "rti")
    .eq("status", "Pending")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);
  logErr("listUpcomingRtiReminders", error);
  return (data as Reminder[]) ?? [];
}

export interface RtiDashboardStats {
  total: number;
  draft: number;
  filed: number;
  awaitingReply: number;
  replyReceived: number;
  firstAppealsDue: number;
  secondAppealsDue: number;
  overdue: number;
  urgentLifeLiberty: number;
  needsReview: number;
  incompleteReply: number;
  closed: number;
}

// ==========================================================================
// Phase 3 — Advanced Complaint Management
// ==========================================================================

export async function getComplaint(id: string): Promise<ComplaintWithRelations | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaints")
    .select(COMPLAINT_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  logErr("getComplaint", error);
  return mapGbaComplaint(data as unknown as ComplaintWithRelations);
}

export async function listComplaintDocuments(complaintId: string): Promise<ComplaintDocument[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaint_documents")
    .select("*")
    .eq("complaint_id", complaintId)
    .order("uploaded_at", { ascending: false });
  logErr("listComplaintDocuments", error);
  return (data as ComplaintDocument[]) ?? [];
}

export async function getComplaintDocument(id: string): Promise<ComplaintDocument | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaint_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  logErr("getComplaintDocument", error);
  return (data as ComplaintDocument) ?? null;
}

export async function listComplaintTimeline(complaintId: string): Promise<ComplaintTimelineEntry[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaint_timeline")
    .select("*")
    .eq("complaint_id", complaintId)
    .order("event_date", { ascending: false });
  logErr("listComplaintTimeline", error);
  return (data as ComplaintTimelineEntry[]) ?? [];
}

export async function listComplaintReplies(complaintId: string): Promise<ComplaintReply[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaint_replies")
    .select("*")
    .eq("complaint_id", complaintId)
    .order("created_at", { ascending: false });
  logErr("listComplaintReplies", error);
  return (data as ComplaintReply[]) ?? [];
}

export async function listComplaintActions(complaintId: string): Promise<ComplaintActionTaken[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaint_action_taken")
    .select("*")
    .eq("complaint_id", complaintId)
    .order("created_at", { ascending: false });
  logErr("listComplaintActions", error);
  return (data as ComplaintActionTaken[]) ?? [];
}

export async function listComplaintCommunications(complaintId: string): Promise<CommunicationLog[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("communication_logs")
    .select("*")
    .eq("entity_type", "complaint")
    .eq("entity_id", complaintId)
    .order("occurred_at", { ascending: false });
  logErr("listComplaintCommunications", error);
  return (data as CommunicationLog[]) ?? [];
}

export async function listComplaintReminders(complaintId: string): Promise<Reminder[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("entity_type", "complaint")
    .eq("entity_id", complaintId)
    .order("due_date", { ascending: true, nullsFirst: false });
  logErr("listComplaintReminders", error);
  return (data as Reminder[]) ?? [];
}

export async function listComplaintEscalations(complaintId: string) {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("escalation_logs")
    .select("*")
    .eq("entity_type", "complaint")
    .eq("entity_id", complaintId)
    .order("created_at", { ascending: false });
  logErr("listComplaintEscalations", error);
  return (data as Record<string, unknown>[]) ?? [];
}

export async function listComplaintAiDrafts(complaintId: string): Promise<AiDraft[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("ai_drafts")
    .select("*")
    .eq("entity_type", "complaint")
    .eq("entity_id", complaintId)
    .order("created_at", { ascending: false });
  logErr("listComplaintAiDrafts", error);
  return (data as AiDraft[]) ?? [];
}

/** OCR jobs joined with their document's title/complaint for the admin queue. */
export async function listOcrJobs(): Promise<(OcrJob & { document?: { id: string; title: string | null; complaint_id: string; ocr_status: string } | null })[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("ocr_jobs")
    .select("*, document:complaint_documents!document_id(id,title,complaint_id,ocr_status)")
    .order("created_at", { ascending: false })
    .limit(200);
  logErr("listOcrJobs", error);
  return (data as unknown as (OcrJob & { document?: { id: string; title: string | null; complaint_id: string; ocr_status: string } | null })[]) ?? [];
}

/** Documents joined with their complaint, for OCR/review reports. */
export async function listComplaintDocsForReports(): Promise<
  (ComplaintDocument & { complaint?: { id: string; title: string; internal_case_number: string | null } | null })[]
> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaint_documents")
    .select("*, complaint:complaints!complaint_id(id,title,internal_case_number)")
    .order("uploaded_at", { ascending: false })
    .limit(1000);
  logErr("listComplaintDocsForReports", error);
  return (data as unknown as (ComplaintDocument & { complaint?: { id: string; title: string; internal_case_number: string | null } | null })[]) ?? [];
}

export interface ComplaintDashboardStats {
  total: number;
  filedThisMonth: number;
  pending: number;
  overdue: number;
  repliesReceived: number;
  actionTaken: number;
  noReply: number;
  followUpsDueToday: number;
  escalationsPending: number;
  ocrPending: number;
  lowConfidenceOcr: number;
  needsManualReview: number;
}

export async function complaintDashboardStats(): Promise<ComplaintDashboardStats> {
  const supabase = await sb();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const OPEN = [
    "Draft", "Filed", "Acknowledged", "Under Review", "Assigned To Engineer",
    "Site Visit Pending", "Site Visit Done", "Work In Progress", "Reply Received",
    "Action Taken Report Received", "Partially Resolved", "Reopened", "Escalated",
    "No Response", "Overdue",
  ];
  const count = async (table: string, mod?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (mod) q = mod(q);
    const { count: c, error } = await q;
    logErr(`count:${table}`, error);
    return c ?? 0;
  };
  const notDeleted = (q: any) => q.is("deleted_at", null);

  const [
    total, filedThisMonth, pending, overdue, repliesReceived, actionTaken,
    followUpsDueToday, escalationsPending, ocrPending, lowConfidenceOcr, needsManualReview, noReply,
  ] = await Promise.all([
    count("complaints", notDeleted),
    count("complaints", (q) => notDeleted(q).gte("date_submitted", monthStart)),
    count("complaints", (q) => notDeleted(q).in("status", OPEN)),
    count("complaints", (q) => notDeleted(q).in("status", OPEN).lt("next_follow_up_date", today)),
    count("complaints", (q) => notDeleted(q).not("latest_reply_date", "is", null)),
    count("complaints", (q) => notDeleted(q).not("latest_action_taken_date", "is", null)),
    count("complaints", (q) => notDeleted(q).eq("next_follow_up_date", today)),
    count("complaints", (q) => notDeleted(q).eq("status", "Escalated")),
    count("complaint_documents", (q) => q.in("ocr_status", ["Not Started", "Queued", "Processing"])),
    count("complaint_documents", (q) => q.eq("ocr_status", "Needs Manual Review")),
    count("complaint_documents", (q) => q.in("verification_status", ["Pending Review", "Low Confidence", "Needs Correction"])),
    count("complaints", (q) => notDeleted(q).is("latest_reply_date", null).in("status", ["Filed", "Acknowledged", "Under Review", "Assigned To Engineer"])),
  ]);

  return {
    total, filedThisMonth, pending, overdue, repliesReceived, actionTaken, noReply,
    followUpsDueToday, escalationsPending, ocrPending, lowConfidenceOcr, needsManualReview,
  };
}

export async function rtiDashboardStats(): Promise<RtiDashboardStats> {
  const supabase = await sb();
  const rules = await getDeadlineRules();
  const { data, error } = await supabase
    .from("rti_applications")
    .select(
      "status, priority, is_life_liberty, satisfaction_status, normal_due, life_liberty_due, first_appeal_due, second_appeal_due",
    );
  logErr("rtiDashboardStats", error);
  const rows = (data as RtiApplication[]) ?? [];
  const now = new Date();

  const stats: RtiDashboardStats = {
    total: rows.length,
    draft: 0,
    filed: 0,
    awaitingReply: 0,
    replyReceived: 0,
    firstAppealsDue: 0,
    secondAppealsDue: 0,
    overdue: 0,
    urgentLifeLiberty: 0,
    needsReview: 0,
    incompleteReply: 0,
    closed: 0,
  };

  const overdueBuckets = new Set(["overdue", "critical-overdue"]);
  const dueBuckets = new Set(["overdue", "critical-overdue", "due-today", "due-soon"]);

  for (const r of rows) {
    switch (r.status) {
      case "Draft":
      case "Ready to File":
        stats.draft++;
        break;
      case "Filed":
        stats.filed++;
        break;
      case "Awaiting Reply":
        stats.awaitingReply++;
        break;
      case "Reply Received":
      case "Partial Reply":
        stats.replyReceived++;
        break;
      case "Closed":
        stats.closed++;
        break;
    }
    if (
      r.satisfaction_status === "Partially Satisfied" ||
      r.satisfaction_status === "Incomplete Information" ||
      r.status === "Partial Reply"
    ) {
      stats.incompleteReply++;
    }
    if (["Rejected", "No Reply", "Partial Reply", "Reply Received"].includes(r.status))
      stats.needsReview++;
    if (r.is_life_liberty && r.status !== "Closed") stats.urgentLifeLiberty++;

    const active = activeDeadline(r, now, rules);
    if (active && overdueBuckets.has(active.bucket)) stats.overdue++;
    if (active?.label === "First appeal" && dueBuckets.has(active.bucket))
      stats.firstAppealsDue++;
    if (active?.label === "Second appeal" && dueBuckets.has(active.bucket))
      stats.secondAppealsDue++;
  }
  return stats;
}

// ==========================================================================
// Officer accountability (hierarchy, transfers, scorecard)
// ==========================================================================

const OFFICER_SELECT =
  "*, corporation:corporations!corporation_id(id,code,name), division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name), reporting_officer:contacts!reporting_officer_id(id,full_name,designation)";

export type OfficerRow = ContactWithRelations & {
  reporting_officer?: { id: string; full_name: string; designation: string } | null;
};

/** All officers (contacts), with relations + reporting line, for the hierarchy. */
export async function listOfficers(): Promise<OfficerRow[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select(OFFICER_SELECT)
    .order("full_name");
  logErr("listOfficers", error);
  return (data as unknown as OfficerRow[]) ?? [];
}

export async function getOfficer(id: string): Promise<OfficerRow | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select(OFFICER_SELECT)
    .eq("id", id)
    .maybeSingle();
  logErr("getOfficer", error);
  return (data as unknown as OfficerRow) ?? null;
}

/** Trimmed officer record for the Audit & Draft "To Whom" recipient picker. */
export interface RecipientOfficer {
  id: string;
  full_name: string;
  designation: string | null;
  role_level: string | null;
  office_address: string | null;
  phone: string | null;
  email: string | null;
  division: string | null;
  corporation: string | null;
  eng_subdivision: string | null;
}

interface RecipientOfficerRaw {
  id: string;
  full_name: string;
  designation: string | null;
  role_level: string | null;
  office_address: string | null;
  phone: string | null;
  email: string | null;
  division: { name: string } | null;
  corporation: { name: string } | null;
  eng_subdivision: { name: string } | null;
}

/** Officers/contacts for the recipient picker — id, posting, contact + jurisdiction. */
export async function listRecipientOfficers(): Promise<RecipientOfficer[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, full_name, designation, role_level, office_address, phone, email, division:divisions!division_id(name), corporation:corporations!corporation_id(name), eng_subdivision:eng_subdivisions!eng_subdivision_id(name)",
    )
    .order("full_name");
  logErr("listRecipientOfficers", error);
  const rows = (data as unknown as RecipientOfficerRaw[]) ?? [];
  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    designation: r.designation ?? null,
    role_level: r.role_level ?? null,
    office_address: r.office_address ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    division: r.division?.name ?? null,
    corporation: r.corporation?.name ?? null,
    eng_subdivision: r.eng_subdivision?.name ?? null,
  }));
}

/** Officers who report to this officer. */
export async function listDirectReports(officerId: string): Promise<OfficerRow[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("contacts")
    .select(OFFICER_SELECT)
    .eq("reporting_officer_id", officerId)
    .order("full_name");
  logErr("listDirectReports", error);
  return (data as unknown as OfficerRow[]) ?? [];
}

export async function listOfficerTransfers(officerId: string): Promise<OfficerTransfer[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("officer_transfers")
    .select("*")
    .eq("officer_id", officerId)
    .order("effective_date", { ascending: false, nullsFirst: false });
  logErr("listOfficerTransfers", error);
  return (data as OfficerTransfer[]) ?? [];
}

export interface OfficerScorecard {
  complaintsTotal: number;
  complaintsOpen: number;
  complaintsOverdue: number;
  rtisLinked: number;
  transfers: number;
}

/** Accountability counts for one officer (assigned complaints + linked RTIs). */
export async function getOfficerScorecard(officerId: string): Promise<OfficerScorecard> {
  const supabase = await sb();
  const today = new Date().toISOString().slice(0, 10);
  const assignedOr = `assigned_engineer_id.eq.${officerId},assigned_officer_id.eq.${officerId}`;

  const num = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await q;
    logErr("officerScorecard", error);
    return count ?? 0;
  };

  const [complaintsTotal, complaintsOpen, complaintsOverdue, rtisLinked, transfers] =
    await Promise.all([
      num(supabase.from("complaints").select("*", { count: "exact", head: true }).is("deleted_at", null).or(assignedOr)),
      num(
        supabase
          .from("complaints")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .or(assignedOr)
          .in("status", COMPLAINT_OPEN_STATUSES as unknown as string[]),
      ),
      num(
        supabase
          .from("complaints")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .or(assignedOr)
          .in("status", COMPLAINT_OPEN_STATUSES as unknown as string[])
          .lt("next_follow_up_date", today),
      ),
      num(supabase.from("rti_applications").select("*", { count: "exact", head: true }).eq("contact_id", officerId)),
      num(supabase.from("officer_transfers").select("*", { count: "exact", head: true }).eq("officer_id", officerId)),
    ]);

  return { complaintsTotal, complaintsOpen, complaintsOverdue, rtisLinked, transfers };
}

// ==========================================================================
// Notifications digest + public case status
// ==========================================================================

export interface NotificationDigest {
  generatedAt: string;
  overdueRtis: { id: string; ref: string | null; subject: string; due: string; label: string }[];
  overdueComplaints: { id: string; caseNumber: string | null; title: string; followUp: string | null }[];
  dueReminders: { id: string; title: string; dueDate: string | null; entityType: string; entityId: string | null }[];
  highRiskAudits: { jobNumber: string; band: string; score: number; exposure: number; auditedAt: string }[];
  counts: { overdueRtis: number; overdueComplaints: number; dueReminders: number; highRiskAudits: number };
}

/** Everything currently due/overdue — for the scheduled notification job. */
export async function getNotificationDigest(): Promise<NotificationDigest> {
  const supabase = await sb();
  const rules = await getDeadlineRules();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const [rtiRes, cmpRes, remRes, auditRes] = await Promise.all([
    supabase
      .from("rti_applications")
      .select("id, internal_ref, subject, status, is_life_liberty, normal_due, life_liberty_due, first_appeal_due, second_appeal_due")
      .neq("status", "Closed"),
    supabase
      .from("complaints")
      .select("id, internal_case_number, title, next_follow_up_date, status")
      .is("deleted_at", null)
      .in("status", COMPLAINT_OPEN_STATUSES as unknown as string[])
      .lt("next_follow_up_date", today)
      .order("next_follow_up_date"),
    supabase
      .from("reminders")
      .select("id, title, due_date, entity_type, entity_id, status")
      .eq("status", "Pending")
      .lte("due_date", today)
      .order("due_date"),
    supabase
      .from("job_audits")
      .select("job_number, risk_band, risk_score, total_exposure, created_at")
      .in("risk_band", ["bill_stop", "serious"])
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  logErr("digest:rti", rtiRes.error);
  logErr("digest:complaints", cmpRes.error);
  logErr("digest:reminders", remRes.error);
  logErr("digest:audits", auditRes.error);

  const overdueRtis = (rtiRes.data ?? [])
    .map((r: Record<string, unknown>) => {
      const active = activeDeadline(r as Parameters<typeof activeDeadline>[0], now, rules);
      return active && (active.bucket === "overdue" || active.bucket === "critical-overdue")
        ? { id: r.id as string, ref: (r.internal_ref as string) ?? null, subject: r.subject as string, due: active.due, label: active.label }
        : null;
    })
    .filter(Boolean) as NotificationDigest["overdueRtis"];

  const overdueComplaints = (cmpRes.data ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    caseNumber: (c.internal_case_number as string) ?? null,
    title: c.title as string,
    followUp: (c.next_follow_up_date as string) ?? null,
  }));

  const dueReminders = (remRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    title: r.title as string,
    dueDate: (r.due_date as string) ?? null,
    entityType: r.entity_type as string,
    entityId: (r.entity_id as string) ?? null,
  }));

  // Latest high-risk forensic audit per job (so the daily digest surfaces
  // bill-stop / serious jobs instead of them dying in a DB row).
  const seenAuditJob = new Set<string>();
  const highRiskAudits: NotificationDigest["highRiskAudits"] = [];
  for (const a of auditRes.data ?? []) {
    const r = a as Record<string, unknown>;
    const jn = r.job_number as string;
    if (!jn || seenAuditJob.has(jn)) continue;
    seenAuditJob.add(jn);
    highRiskAudits.push({
      jobNumber: jn,
      band: (r.risk_band as string) ?? "",
      score: (r.risk_score as number) ?? 0,
      exposure: (r.total_exposure as number) ?? 0,
      auditedAt: (r.created_at as string) ?? "",
    });
  }

  return {
    generatedAt: now.toISOString(),
    overdueRtis,
    overdueComplaints,
    dueReminders,
    highRiskAudits,
    counts: {
      overdueRtis: overdueRtis.length,
      overdueComplaints: overdueComplaints.length,
      dueReminders: dueReminders.length,
      highRiskAudits: highRiskAudits.length,
    },
  };
}

export interface PublicCaseStatus {
  kind: "complaint" | "rti";
  ref: string | null;
  title: string;
  status: string;
  ward: string | null;
  dates: { label: string; value: string }[];
}

/** Sanitised, no-login status of a complaint or RTI by UUID (for share links). */
export async function getPublicCaseStatus(id: string): Promise<PublicCaseStatus | null> {
  const supabase = await sb();

  const { data: c } = await supabase
    .from("complaints")
    .select("internal_case_number, title, status, date_submitted, latest_reply_date, latest_action_taken_date, next_follow_up_date, ward:wards!ward_id(new_no,new_name)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (c) {
    const row = c as Record<string, unknown>;
    const ward = row.ward as { new_no?: number; new_name?: string } | null;
    return {
      kind: "complaint",
      ref: (row.internal_case_number as string) ?? null,
      title: row.title as string,
      status: row.status as string,
      ward: ward ? `${ward.new_no} — ${ward.new_name}` : null,
      dates: [
        { label: "Submitted", value: (row.date_submitted as string) ?? "—" },
        { label: "Latest reply", value: (row.latest_reply_date as string) ?? "—" },
        { label: "Action taken", value: (row.latest_action_taken_date as string) ?? "—" },
        { label: "Next follow-up", value: (row.next_follow_up_date as string) ?? "—" },
      ],
    };
  }

  const { data: r } = await supabase
    .from("rti_applications")
    .select("internal_ref, subject, status, date_filed, normal_due, first_appeal_due, ward:wards!ward_id(new_no,new_name)")
    .eq("id", id)
    .maybeSingle();
  if (r) {
    const row = r as Record<string, unknown>;
    const ward = row.ward as { new_no?: number; new_name?: string } | null;
    return {
      kind: "rti",
      ref: (row.internal_ref as string) ?? null,
      title: row.subject as string,
      status: row.status as string,
      ward: ward ? `${ward.new_no} — ${ward.new_name}` : null,
      dates: [
        { label: "Filed", value: (row.date_filed as string) ?? "—" },
        { label: "Reply due", value: (row.normal_due as string) ?? "—" },
        { label: "First appeal due", value: (row.first_appeal_due as string) ?? "—" },
      ],
    };
  }

  return null;
}

const APPROVAL_THRESHOLDS = [100_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];

export interface FraudAnalytics {
  amountCount: number;
  benford: BenfordResult;
  thresholds: { threshold: number; count: number }[];
  outliers: { high: number | null; values: number[] };
  monthly: { month: string; bills: number; flagged: number }[];
  collusion: { contractor: string; engineer: string; flaggedBills: number }[];
}

/** Portfolio-wide statistical fraud signals from the bill_audits table. */
export async function getFraudAnalytics(): Promise<FraudAnalytics> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("bill_audits")
    .select("grand_total, red_flag_count, created_at, complaint:complaints!complaint_id(contractor, assigned_engineer:contacts!assigned_engineer_id(full_name))")
    .limit(8000);
  logErr("fraudAnalytics", error);
  const rows = (data ?? []) as Record<string, unknown>[];

  const amounts = rows.map((r) => Number(r.grand_total)).filter((n) => Number.isFinite(n) && n > 0);

  const monthMap = new Map<string, { bills: number; flagged: number }>();
  const collMap = new Map<string, { contractor: string; engineer: string; flaggedBills: number }>();
  for (const r of rows) {
    const month = String(r.created_at ?? "").slice(0, 7);
    if (month) {
      const m = monthMap.get(month) ?? { bills: 0, flagged: 0 };
      m.bills++;
      if ((r.red_flag_count as number) > 0) m.flagged++;
      monthMap.set(month, m);
    }
    if ((r.red_flag_count as number) > 0) {
      const c = r.complaint as { contractor?: string | null; assigned_engineer?: { full_name?: string } | null } | null;
      const contractor = c?.contractor ?? null;
      const engineer = c?.assigned_engineer?.full_name ?? null;
      if (contractor && engineer) {
        const key = `${contractor}|${engineer}`;
        const e = collMap.get(key) ?? { contractor, engineer, flaggedBills: 0 };
        e.flaggedBills++;
        collMap.set(key, e);
      }
    }
  }

  const out = iqrOutliers(amounts);
  return {
    amountCount: amounts.length,
    benford: benford(amounts),
    thresholds: thresholdClusters(amounts, APPROVAL_THRESHOLDS),
    outliers: { high: out.high, values: out.outliers },
    monthly: [...monthMap.entries()].sort().map(([month, v]) => ({ month, ...v })),
    collusion: [...collMap.values()].filter((c) => c.flaggedBills >= 2).sort((a, b) => b.flaggedBills - a.flaggedBills),
  };
}

export interface LocationOverlap {
  meters: number;
  a: { complaintId: string; caseNumber: string | null; jobNumber: string | null; contractor: string | null; road: string | null };
  b: { complaintId: string; caseNumber: string | null; jobNumber: string | null; contractor: string | null; road: string | null };
}

/** Different works whose reported locations are < `maxMeters` apart (possible double-work / overlap). */
export async function getLocationOverlaps(maxMeters = 60): Promise<LocationOverlap[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaints")
    .select("id, internal_case_number, job_number, contractor, location, latitude, longitude")
    .not("latitude", "is", null)
    .is("deleted_at", null)
    .limit(3000);
  logErr("locationOverlaps", error);
  const rows = (data ?? []) as Record<string, unknown>[];

  const out: LocationOverlap[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!, b = rows[j]!;
      const sameJob = a.job_number && b.job_number && a.job_number === b.job_number;
      if (sameJob) continue; // same job legitimately shares a location
      const d = haversineMeters(a.latitude as number, a.longitude as number, b.latitude as number, b.longitude as number);
      if (d <= maxMeters) {
        out.push({
          meters: Math.round(d),
          a: { complaintId: a.id as string, caseNumber: (a.internal_case_number as string) ?? null, jobNumber: (a.job_number as string) ?? null, contractor: (a.contractor as string) ?? null, road: (a.location as string) ?? null },
          b: { complaintId: b.id as string, caseNumber: (b.internal_case_number as string) ?? null, jobNumber: (b.job_number as string) ?? null, contractor: (b.contractor as string) ?? null, road: (b.location as string) ?? null },
        });
      }
    }
  }
  return out.sort((x, y) => x.meters - y.meters).slice(0, 200);
}

export interface MapPoint {
  kind: "complaint" | "photo";
  lat: number;
  lon: number;
  label: string;
  complaintId: string;
  flag?: string | null;
}

export interface ContractorRisk {
  contractor: string;
  complaints: number;
  overdue: number;
  duplicatePhotos: number;
  visionFlags: number;
  offSitePhotos: number;
  // Aggregated from job_audits (the forensic audit outcome).
  jobsAudited: number;
  billStopJobs: number;
  seriousJobs: number;
  auditFindings: number;
  totalExposure: number;
  score: number;
}

export interface RedFlagSummary {
  duplicateDocs: number;
  offSitePhotos: number;
  visionFlags: number;
  overdueComplaints: number;
  contractorsAtRisk: number;
}

/** Aggregate fraud signals per contractor + a global red-flag summary. */
export async function getContractorRisk(): Promise<{ summary: RedFlagSummary; contractors: ContractorRisk[] }> {
  const supabase = await sb();
  const today = new Date().toISOString().slice(0, 10);

  const [compRes, docRes, auditRes] = await Promise.all([
    supabase
      .from("complaints")
      .select("id, contractor, job_number, status, next_follow_up_date")
      .is("deleted_at", null)
      .limit(5000),
    supabase
      .from("complaint_documents")
      .select("complaint_id, is_duplicate, vision_verdict, geo_flag")
      .or("is_duplicate.eq.true,vision_verdict.not.is.null,geo_flag.eq.far")
      .limit(8000),
    supabase
      .from("job_audits")
      .select("job_number, risk_band, total_exposure, red_flag_count, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);
  logErr("risk:complaints", compRes.error);
  logErr("risk:docs", docRes.error);
  logErr("risk:audits", auditRes.error);

  const comps = compRes.data ?? [];
  const openSet = new Set(COMPLAINT_OPEN_STATUSES as readonly string[]);
  const byComplaint = new Map<string, { contractor: string | null; overdue: boolean }>();
  for (const c of comps) {
    const r = c as Record<string, unknown>;
    const overdue =
      openSet.has(r.status as string) && !!r.next_follow_up_date && (r.next_follow_up_date as string) < today;
    byComplaint.set(r.id as string, { contractor: (r.contractor as string) ?? null, overdue });
  }

  const summary: RedFlagSummary = { duplicateDocs: 0, offSitePhotos: 0, visionFlags: 0, overdueComplaints: 0, contractorsAtRisk: 0 };
  for (const c of byComplaint.values()) if (c.overdue) summary.overdueComplaints++;

  const map = new Map<string, ContractorRisk>();
  const ensure = (name: string) =>
    map.get(name) ?? map.set(name, { contractor: name, complaints: 0, overdue: 0, duplicatePhotos: 0, visionFlags: 0, offSitePhotos: 0, jobsAudited: 0, billStopJobs: 0, seriousJobs: 0, auditFindings: 0, totalExposure: 0, score: 0 }).get(name)!;

  // complaints + overdue per contractor
  for (const c of byComplaint.values()) {
    if (!c.contractor) continue;
    const e = ensure(c.contractor);
    e.complaints++;
    if (c.overdue) e.overdue++;
  }

  // document flags
  for (const d of docRes.data ?? []) {
    const r = d as Record<string, unknown>;
    const isDup = r.is_duplicate === true;
    const vision = r.vision_verdict as string | null;
    const visionFlag = vision === "suspect" || vision === "mismatch" || vision === "not_site_photo";
    const offSite = r.geo_flag === "far";
    if (isDup) summary.duplicateDocs++;
    if (offSite) summary.offSitePhotos++;
    if (visionFlag) summary.visionFlags++;

    const owner = byComplaint.get(r.complaint_id as string);
    if (!owner?.contractor) continue;
    const e = ensure(owner.contractor);
    if (isDup) e.duplicatePhotos++;
    if (visionFlag) e.visionFlags++;
    if (offSite) e.offSitePhotos++;
  }

  // Job-audit outcomes per contractor (the forensic signal — strongest weight).
  const jobToContractor = new Map<string, string>();
  for (const c of comps) {
    const r = c as Record<string, unknown>;
    const jn = r.job_number as string | null;
    const ct = r.contractor as string | null;
    if (jn && ct && !jobToContractor.has(jn)) jobToContractor.set(jn, ct);
  }
  const seenJob = new Set<string>();
  for (const a of auditRes.data ?? []) {
    const r = a as Record<string, unknown>;
    const jn = r.job_number as string;
    if (!jn || seenJob.has(jn)) continue; // ordered desc → first row is the latest audit
    seenJob.add(jn);
    const ct = jobToContractor.get(jn);
    if (!ct) continue;
    const e = ensure(ct);
    e.jobsAudited++;
    if (r.risk_band === "bill_stop") e.billStopJobs++;
    if (r.risk_band === "serious") e.seriousJobs++;
    e.auditFindings += (r.red_flag_count as number) ?? 0;
    e.totalExposure += (r.total_exposure as number) ?? 0;
  }

  const contractors = [...map.values()].map((e) => {
    e.score =
      e.billStopJobs * 15 + e.seriousJobs * 8 + e.auditFindings * 1 +
      e.duplicatePhotos * 5 + e.visionFlags * 4 + e.offSitePhotos * 4 + e.overdue * 1;
    return e;
  });
  summary.contractorsAtRisk = contractors.filter((c) => c.score > 0).length;
  contractors.sort((a, b) => b.score - a.score);

  return { summary, contractors };
}

export interface CrossJobPattern {
  code: string;
  title: string;
  severity: "High" | "Medium" | "Low";
  detail: string;
  jobNumbers: string[];
}

/**
 * Cross-job repeat-pattern detection — the strongest corruption signal: the same
 * contractor / finding-type / recycled photo recurring across ≥2 job codes. Runs
 * the pure detectRepeatPatterns engine over every persisted job audit.
 */
export async function getCrossJobPatterns(): Promise<CrossJobPattern[]> {
  const supabase = await sb();
  const [auditRes, compRes] = await Promise.all([
    supabase.from("job_audits").select("job_number, report, created_at").order("created_at", { ascending: false }).limit(2000),
    supabase.from("complaints").select("job_number, contractor").not("job_number", "is", null).is("deleted_at", null).limit(5000),
  ]);
  logErr("patterns:audits", auditRes.error);
  logErr("patterns:complaints", compRes.error);

  const jobToContractor = new Map<string, string>();
  for (const c of compRes.data ?? []) {
    const r = c as Record<string, unknown>;
    const jn = r.job_number as string | null;
    const ct = r.contractor as string | null;
    if (jn && ct && !jobToContractor.has(jn)) jobToContractor.set(jn, ct);
  }

  const seen = new Set<string>();
  const rows: import("@/lib/forensics/pattern-detector").JobPatternRow[] = [];
  for (const a of auditRes.data ?? []) {
    const r = a as Record<string, unknown>;
    const jn = r.job_number as string;
    if (!jn || seen.has(jn)) continue; // latest audit per job only
    seen.add(jn);
    const report = r.report as JobAuditReport | null;
    const findings = report?.findings ?? [];
    rows.push({
      jobNumber: jn,
      contractor: jobToContractor.get(jn) ?? null,
      findingTypes: findings.map((f) => f.code.replace(/-\d+$/, "")),
      photoHashes: [], // photo recycling is covered by the dedupe audit
    });
  }

  const { detectRepeatPatterns } = await import("@/lib/forensics/pattern-detector");
  return detectRepeatPatterns(rows).map((f) => ({
    code: f.code,
    title: f.title,
    severity: f.severity,
    detail: f.detail,
    jobNumbers: /codes?:\s*(.+?)\.?$/i.exec(f.detail)?.[1]?.split(",").map((s) => s.trim()) ?? [],
  }));
}

/** Points for the forensic map: complaint reported locations + photo EXIF GPS. */
export async function getForensicMapPoints(): Promise<MapPoint[]> {
  const supabase = await sb();
  const [comps, photos] = await Promise.all([
    supabase
      .from("complaints")
      .select("id, internal_case_number, title, latitude, longitude")
      .not("latitude", "is", null)
      .is("deleted_at", null)
      .limit(2000),
    supabase
      .from("complaint_documents")
      .select("complaint_id, document_type, exif_gps_lat, exif_gps_lon, geo_flag")
      .not("exif_gps_lat", "is", null)
      .limit(4000),
  ]);
  logErr("mapPoints:complaints", comps.error);
  logErr("mapPoints:photos", photos.error);

  const points: MapPoint[] = [];
  for (const c of comps.data ?? []) {
    const r = c as Record<string, unknown>;
    points.push({
      kind: "complaint",
      lat: r.latitude as number,
      lon: r.longitude as number,
      label: `${(r.internal_case_number as string) ?? "Case"}: ${r.title as string}`,
      complaintId: r.id as string,
    });
  }
  for (const p of photos.data ?? []) {
    const r = p as Record<string, unknown>;
    points.push({
      kind: "photo",
      lat: r.exif_gps_lat as number,
      lon: r.exif_gps_lon as number,
      label: `Photo: ${(r.document_type as string) ?? "image"}`,
      complaintId: r.complaint_id as string,
      flag: (r.geo_flag as string) ?? null,
    });
  }
  return points;
}

// ==========================================================================
// Job-number forensic audit
// ==========================================================================

import type { JobAuditReport } from "@/lib/forensics/job-audit";

export interface JobAuditRow {
  id: string;
  jobNumber: string;
  report: JobAuditReport | null;
  riskScore: number;
  riskBand: string | null;
  totalExposure: number | null;
  findingCount: number;
  redFlagCount: number;
  docCount: number;
  createdAt: string;
}

/** Latest persisted forensic report for a job (no re-run). */
export async function getJobAudit(jobNumber: string): Promise<JobAuditRow | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("job_audits")
    .select("*")
    .eq("job_number", jobNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  logErr("getJobAudit", error);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    jobNumber: r.job_number as string,
    report: (r.report as JobAuditReport) ?? null,
    riskScore: (r.risk_score as number) ?? 0,
    riskBand: (r.risk_band as string) ?? null,
    totalExposure: (r.total_exposure as number) ?? null,
    findingCount: (r.finding_count as number) ?? 0,
    redFlagCount: (r.red_flag_count as number) ?? 0,
    docCount: (r.doc_count as number) ?? 0,
    createdAt: r.created_at as string,
  };
}

/** Distinct job numbers across complaints, with complaint + document counts. */
export async function listJobNumbers(): Promise<{ jobNumber: string; complaints: number }[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("complaints")
    .select("job_number")
    .not("job_number", "is", null)
    .is("deleted_at", null)
    .limit(5000);
  logErr("listJobNumbers", error);
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const j = (r as { job_number: string }).job_number;
    if (j) counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  return [...counts.entries()].map(([jobNumber, complaints]) => ({ jobNumber, complaints })).sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
}

/** Known job codes (union of job_cases + complaints) — typeahead for linking an RTI. */
export async function listKnownJobCodes(): Promise<string[]> {
  const supabase = await sb();
  const [casesRes, compRes] = await Promise.all([
    supabase.from("job_cases").select("job_number").limit(5000),
    supabase.from("complaints").select("job_number").not("job_number", "is", null).is("deleted_at", null).limit(5000),
  ]);
  logErr("listKnownJobCodes:cases", casesRes.error);
  logErr("listKnownJobCodes:complaints", compRes.error);
  const set = new Set<string>();
  for (const r of casesRes.data ?? []) {
    const j = (r as { job_number: string | null }).job_number;
    if (j) set.add(j);
  }
  for (const r of compRes.data ?? []) {
    const j = (r as { job_number: string | null }).job_number;
    if (j) set.add(j);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export interface JobLinkedRti {
  id: string;
  internalRef: string | null;
  subject: string;
  status: string;
  dateFiled: string | null;
  replyDate: string | null;
  normalDue: string | null;
}

/** RTI applications linked to a job number (for the unified by-job-code dossier). */
export async function getJobLinkedRtis(jobNumber: string): Promise<JobLinkedRti[]> {
  if (!jobNumber) return [];
  const supabase = await sb();
  const { data, error } = await supabase
    .from("rti_applications")
    .select("id, internal_ref, subject, status, date_filed, reply_date, normal_due")
    .eq("job_number", jobNumber)
    .order("updated_at", { ascending: false });
  logErr("getJobLinkedRtis", error);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: x.id as string,
      internalRef: (x.internal_ref as string) ?? null,
      subject: (x.subject as string) ?? "",
      status: (x.status as string) ?? "",
      dateFiled: (x.date_filed as string) ?? null,
      replyDate: (x.reply_date as string) ?? null,
      normalDue: (x.normal_due as string) ?? null,
    };
  });
}

// ── Contractor & division systemic intelligence (Advanced F) ─────────────────

interface LatestAudit {
  band: string | null;
  exposure: number;
  redFlags: number;
}

async function loadJobCasesWithAudit(): Promise<{
  cases: Record<string, unknown>[];
  latestAudit: Map<string, LatestAudit>;
}> {
  const supabase = await sb();
  const [casesRes, auditRes] = await Promise.all([
    supabase
      .from("job_cases")
      .select("job_number, contractor, division, net_amount, gross_amount, year, status, complaint_id")
      .limit(5000),
    supabase
      .from("job_audits")
      .select("job_number, risk_band, total_exposure, red_flag_count, created_at")
      .order("created_at", { ascending: false })
      .limit(8000),
  ]);
  logErr("loadJobCasesWithAudit:cases", casesRes.error);
  logErr("loadJobCasesWithAudit:audits", auditRes.error);
  const latestAudit = new Map<string, LatestAudit>();
  for (const a of auditRes.data ?? []) {
    const jn = (a as { job_number: string }).job_number;
    if (!latestAudit.has(jn)) {
      latestAudit.set(jn, {
        band: (a as { risk_band: string | null }).risk_band ?? null,
        exposure: Number((a as { total_exposure: number | null }).total_exposure ?? 0) || 0,
        redFlags: Number((a as { red_flag_count: number | null }).red_flag_count ?? 0) || 0,
      });
    }
  }
  return { cases: (casesRes.data ?? []) as Record<string, unknown>[], latestAudit };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ContractorSummary {
  contractor: string;
  jobCount: number;
  divisions: string[];
  totalNet: number;
  totalExposure: number;
  redFlags: number;
  highRiskJobs: number;
  blacklistCandidate: boolean;
  jobNumbers: string[];
}

export async function getContractorIntelligence(): Promise<ContractorSummary[]> {
  const { cases, latestAudit } = await loadJobCasesWithAudit();
  const map = new Map<string, ContractorSummary>();
  for (const c of cases) {
    const name = ((c.contractor as string) ?? "").trim();
    if (!name) continue;
    const jn = c.job_number as string;
    const s =
      map.get(name) ??
      { contractor: name, jobCount: 0, divisions: [], totalNet: 0, totalExposure: 0, redFlags: 0, highRiskJobs: 0, blacklistCandidate: false, jobNumbers: [] };
    s.jobCount += 1;
    s.jobNumbers.push(jn);
    const div = (c.division as string) ?? "";
    if (div && !s.divisions.includes(div)) s.divisions.push(div);
    if (typeof c.net_amount === "number") s.totalNet += c.net_amount as number;
    const a = latestAudit.get(jn);
    if (a) {
      s.totalExposure += a.exposure;
      s.redFlags += a.redFlags;
      if (a.band === "bill_stop" || a.band === "serious") s.highRiskJobs += 1;
    }
    map.set(name, s);
  }
  const list = [...map.values()];
  for (const s of list) {
    s.totalNet = round2(s.totalNet);
    s.totalExposure = round2(s.totalExposure);
    s.blacklistCandidate = s.jobCount >= 3 && s.highRiskJobs >= 2;
  }
  return list.sort((a, b) => b.totalExposure - a.totalExposure || b.jobCount - a.jobCount);
}

export interface DivisionSummary {
  division: string;
  jobCount: number;
  contractors: number;
  totalExposure: number;
  redFlags: number;
  highRiskJobs: number;
}

export async function getDivisionIntelligence(): Promise<DivisionSummary[]> {
  const { cases, latestAudit } = await loadJobCasesWithAudit();
  const map = new Map<string, { jobs: number; contractors: Set<string>; exposure: number; redFlags: number; high: number }>();
  for (const c of cases) {
    const div = ((c.division as string) ?? "").trim();
    if (!div) continue;
    const jn = c.job_number as string;
    const m = map.get(div) ?? { jobs: 0, contractors: new Set<string>(), exposure: 0, redFlags: 0, high: 0 };
    m.jobs += 1;
    if (c.contractor) m.contractors.add((c.contractor as string).trim());
    const a = latestAudit.get(jn);
    if (a) {
      m.exposure += a.exposure;
      m.redFlags += a.redFlags;
      if (a.band === "bill_stop" || a.band === "serious") m.high += 1;
    }
    map.set(div, m);
  }
  return [...map.entries()]
    .map(([division, m]) => ({ division, jobCount: m.jobs, contractors: m.contractors.size, totalExposure: round2(m.exposure), redFlags: m.redFlags, highRiskJobs: m.high }))
    .sort((a, b) => b.totalExposure - a.totalExposure || b.jobCount - a.jobCount);
}

/** Jobs shaped for the KTPP work-split detector (lib/forensic/work-split). */
export async function getWorkSplitJobs(): Promise<
  { jobNumber: string; contractor: string | null; division: string | null; year: string | null; amount: number | null }[]
> {
  const { cases } = await loadJobCasesWithAudit();
  return cases.map((c) => ({
    jobNumber: c.job_number as string,
    contractor: (c.contractor as string) ?? null,
    division: (c.division as string) ?? null,
    year: (c.year as string) ?? null,
    amount: typeof c.net_amount === "number" ? (c.net_amount as number) : typeof c.gross_amount === "number" ? (c.gross_amount as number) : null,
  }));
}

export interface ContractorJobRow {
  jobNumber: string;
  division: string | null;
  net: number | null;
  band: string | null;
  exposure: number;
  complaintId: string | null;
}

export async function getContractorDossier(name: string): Promise<{ summary: ContractorSummary | null; jobs: ContractorJobRow[] }> {
  const { cases, latestAudit } = await loadJobCasesWithAudit();
  const mine = cases.filter((c) => ((c.contractor as string) ?? "").trim() === name.trim());
  const jobs: ContractorJobRow[] = mine.map((c) => {
    const a = latestAudit.get(c.job_number as string);
    return {
      jobNumber: c.job_number as string,
      division: (c.division as string) ?? null,
      net: typeof c.net_amount === "number" ? (c.net_amount as number) : null,
      band: a?.band ?? null,
      exposure: a?.exposure ?? 0,
      complaintId: (c.complaint_id as string) ?? null,
    };
  });
  const all = await getContractorIntelligence();
  const summary = all.find((s) => s.contractor === name.trim()) ?? null;
  return { summary, jobs };
}

export interface OversightStats {
  totalExposure: number;
  jobsAudited: number;
  redFlags: number;
  bands: Record<string, number>;
}

/** Platform-wide forensic oversight totals (latest audit per job). */
export async function getOversightStats(): Promise<OversightStats> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("job_audits")
    .select("job_number, risk_band, total_exposure, red_flag_count, created_at")
    .order("created_at", { ascending: false })
    .limit(8000);
  logErr("getOversightStats", error);
  const seen = new Set<string>();
  const bands: Record<string, number> = {};
  let totalExposure = 0;
  let redFlags = 0;
  for (const a of data ?? []) {
    const jn = (a as { job_number: string }).job_number;
    if (seen.has(jn)) continue;
    seen.add(jn);
    const band = ((a as { risk_band: string | null }).risk_band ?? "unbanded") as string;
    bands[band] = (bands[band] ?? 0) + 1;
    totalExposure += Number((a as { total_exposure: number | null }).total_exposure ?? 0) || 0;
    redFlags += Number((a as { red_flag_count: number | null }).red_flag_count ?? 0) || 0;
  }
  return { totalExposure: round2(totalExposure), jobsAudited: seen.size, redFlags, bands };
}

/** Open complaints past their follow-up date + RTIs past their normal due date. */
export async function getOverdueCounts(): Promise<{ complaintsOverdue: number; rtiDue: number }> {
  const supabase = await sb();
  const today = new Date().toISOString().slice(0, 10);
  const [compRes, rtiRes] = await Promise.all([
    supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("status", "in", '("Resolved","Closed")')
      .not("next_follow_up_date", "is", null)
      .lt("next_follow_up_date", today),
    supabase
      .from("rti_applications")
      .select("id", { count: "exact", head: true })
      .not("normal_due", "is", null)
      .lt("normal_due", today)
      .not("status", "in", '("Reply Received","Closed","Disposed")'),
  ]);
  logErr("getOverdueCounts:complaints", compRes.error);
  logErr("getOverdueCounts:rti", rtiRes.error);
  return { complaintsOverdue: compRes.count ?? 0, rtiDue: rtiRes.count ?? 0 };
}

export interface JobNumberWithAudit {
  jobNumber: string;
  complaints: number;
  audit: { riskBand: string | null; riskScore: number; findingCount: number; redFlagCount: number } | null;
}

/**
 * Job numbers with their latest audit summary — in TWO queries total (not N+1).
 * Replaces a per-job getJobAudit() loop on the jobs index page.
 */
export async function listJobNumbersWithAudits(): Promise<JobNumberWithAudit[]> {
  const supabase = await sb();
  const [compRes, auditRes] = await Promise.all([
    supabase.from("complaints").select("job_number").not("job_number", "is", null).is("deleted_at", null).limit(5000),
    supabase.from("job_audits").select("job_number, risk_band, risk_score, finding_count, red_flag_count, created_at").order("created_at", { ascending: false }).limit(5000),
  ]);
  logErr("listJobNumbersWithAudits:complaints", compRes.error);
  logErr("listJobNumbersWithAudits:audits", auditRes.error);

  const counts = new Map<string, number>();
  for (const r of compRes.data ?? []) {
    const j = (r as { job_number: string }).job_number;
    if (j) counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  const latest = new Map<string, JobNumberWithAudit["audit"]>();
  for (const a of auditRes.data ?? []) {
    const r = a as Record<string, unknown>;
    const jn = r.job_number as string;
    if (!jn || latest.has(jn)) continue; // ordered desc → first is latest
    latest.set(jn, {
      riskBand: (r.risk_band as string) ?? null,
      riskScore: (r.risk_score as number) ?? 0,
      findingCount: (r.finding_count as number) ?? 0,
      redFlagCount: (r.red_flag_count as number) ?? 0,
    });
  }
  return [...counts.entries()]
    .map(([jobNumber, complaints]) => ({ jobNumber, complaints, audit: latest.get(jobNumber) ?? null }))
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
}

/** Finding codes the verifier has dismissed for a job (false positives). */
export async function listDismissedFindings(jobNumber: string): Promise<string[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("finding_review")
    .select("finding_code, status")
    .eq("job_number", jobNumber)
    .eq("status", "dismissed");
  logErr("listDismissedFindings", error);
  return (data ?? []).map((r) => (r as { finding_code: string }).finding_code);
}

export interface JobAuditHistoryRow {
  id: string;
  riskScore: number;
  riskBand: string | null;
  findingCount: number;
  redFlagCount: number;
  totalExposure: number | null;
  createdAt: string;
}

/** Prior audit runs for a job (newest first) — for the run-over-run history/diff. */
export async function listJobAudits(jobNumber: string): Promise<JobAuditHistoryRow[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("job_audits")
    .select("id, risk_score, risk_band, finding_count, red_flag_count, total_exposure, created_at")
    .eq("job_number", jobNumber)
    .order("created_at", { ascending: false })
    .limit(50);
  logErr("listJobAudits", error);
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: x.id as string,
      riskScore: (x.risk_score as number) ?? 0,
      riskBand: (x.risk_band as string) ?? null,
      findingCount: (x.finding_count as number) ?? 0,
      redFlagCount: (x.red_flag_count as number) ?? 0,
      totalExposure: (x.total_exposure as number) ?? null,
      createdAt: x.created_at as string,
    };
  });
}

export interface LetterDraftRow {
  id: string;
  jobNumber: string;
  variant: string;
  language: string;
  signatoryKey: string;
  content: string | null;
  lintOk: boolean;
  aiUsed: boolean;
  fileName: string | null;
  createdAt: string;
}

function toLetterDraftRow(r: Record<string, unknown>): LetterDraftRow {
  return {
    id: r.id as string,
    jobNumber: r.job_number as string,
    variant: (r.variant as string) ?? "bill_stop",
    language: (r.language as string) ?? "Kannada",
    signatoryKey: (r.signatory_key as string) ?? "raghav_gowda",
    content: (r.content as string) ?? null,
    lintOk: (r.lint_ok as boolean) ?? false,
    aiUsed: (r.ai_used as boolean) ?? false,
    fileName: (r.file_name as string) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Saved letter drafts for a job (newest first) — so drafts can be reopened. */
export async function listLetterDrafts(jobNumber: string): Promise<LetterDraftRow[]> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("letter_drafts")
    .select("id, job_number, variant, language, signatory_key, content, lint_ok, ai_used, file_name, created_at")
    .eq("job_number", jobNumber)
    .order("created_at", { ascending: false })
    .limit(50);
  logErr("listLetterDrafts", error);
  return (data ?? []).map((r) => toLetterDraftRow(r as Record<string, unknown>));
}

export interface JobDossierComplaint {
  id: string;
  caseNumber: string | null;
  title: string;
  location: string | null;
  contractor: string | null;
  division: string | null;
  documents: { id: string; title: string | null; documentType: string | null; sha256: string | null; isDuplicate: boolean; visionVerdict: string | null; geoFlag: string | null; uploadedAt: string | null }[];
}

/** All complaints + documents under a job number — for the consolidated PIL dossier. */
export async function getJobDossier(jobNumber: string): Promise<JobDossierComplaint[]> {
  const supabase = await sb();
  const { data: comps, error } = await supabase
    .from("complaints")
    .select("id, internal_case_number, title, location, contractor, division:divisions!division_id(name)")
    .eq("job_number", jobNumber)
    .is("deleted_at", null);
  logErr("getJobDossier:complaints", error);
  const ids = (comps ?? []).map((c) => (c as Record<string, unknown>).id as string);
  if (ids.length === 0) return [];

  const { data: docs, error: dErr } = await supabase
    .from("complaint_documents")
    .select("id, complaint_id, title, document_type, file_sha256, is_duplicate, vision_verdict, geo_flag, uploaded_at")
    .in("complaint_id", ids)
    .limit(2000);
  logErr("getJobDossier:docs", dErr);

  const byComplaint = new Map<string, JobDossierComplaint["documents"]>();
  for (const d of docs ?? []) {
    const r = d as Record<string, unknown>;
    const cid = r.complaint_id as string;
    const list = byComplaint.get(cid) ?? byComplaint.set(cid, []).get(cid)!;
    list.push({
      id: r.id as string,
      title: (r.title as string) ?? null,
      documentType: (r.document_type as string) ?? null,
      sha256: (r.file_sha256 as string) ?? null,
      isDuplicate: (r.is_duplicate as boolean) ?? false,
      visionVerdict: (r.vision_verdict as string) ?? null,
      geoFlag: (r.geo_flag as string) ?? null,
      uploadedAt: (r.uploaded_at as string) ?? null,
    });
  }

  return (comps ?? []).map((c) => {
    const r = c as Record<string, unknown>;
    const div = r.division as { name?: string } | { name?: string }[] | null;
    return {
      id: r.id as string,
      caseNumber: (r.internal_case_number as string) ?? null,
      title: r.title as string,
      location: (r.location as string) ?? null,
      contractor: (r.contractor as string) ?? null,
      division: (Array.isArray(div) ? div[0]?.name : div?.name) ?? null,
      documents: byComplaint.get(r.id as string) ?? [],
    };
  });
}

/** A single letter draft (for reopening into the drafter). */
export async function getLetterDraft(id: string): Promise<LetterDraftRow | null> {
  const supabase = await sb();
  const { data, error } = await supabase
    .from("letter_drafts")
    .select("id, job_number, variant, language, signatory_key, content, lint_ok, ai_used, file_name, created_at")
    .eq("id", id)
    .maybeSingle();
  logErr("getLetterDraft", error);
  return data ? toLetterDraftRow(data as Record<string, unknown>) : null;
}
