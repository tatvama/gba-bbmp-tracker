import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPLAINT_RECIPIENT_ROLES, corporationOfficeName } from "@/lib/complaints/recipient-roles";
import type { RecipientEnrichment } from "./copy-to";

/**
 * Best-effort resolution of a complaint's recipient roles to real officers,
 * driven entirely by the recipient-role registry (no per-role branches). For
 * each role it looks in the role's jurisdiction (corporation = "zone" tier,
 * division, or sub-division) for a contact whose role_level or designation
 * matches the descriptor. Degrades silently to {} — the Copy-To then shows role
 * titles only, which is the accepted design (role_level is sparsely populated,
 * "Accounts Officer" / zone officers frequently absent). Never throws.
 */
const SELECT =
  "full_name, designation, office_address, role_level, corporation_id, division_id, eng_subdivision_id, division:divisions!division_id(name), corporation:corporations!corporation_id(name), eng_subdivision:eng_subdivisions!eng_subdivision_id(name)";

type ContactRow = {
  full_name: string | null;
  designation: string | null;
  office_address: string | null;
  role_level: string | null;
  division?: { name?: string | null } | null;
  corporation?: { name?: string | null } | null;
  eng_subdivision?: { name?: string | null } | null;
};

export async function resolveComplaintRecipients(
  admin: SupabaseClient,
  complaintId: string,
): Promise<RecipientEnrichment> {
  const enrich: RecipientEnrichment = {};
  try {
    const { data: c } = await admin
      .from("complaints")
      .select("corporation_id, division_id, eng_subdivision_id")
      .eq("id", complaintId)
      .maybeSingle();
    if (!c) return enrich;
    const corporationId = (c as Record<string, string | null>).corporation_id;

    const buckets: Record<"zone" | "division" | "subdivision", ContactRow[]> = {
      zone: await contactsFor(admin, "corporation_id", corporationId),
      division: await contactsFor(admin, "division_id", (c as Record<string, string | null>).division_id),
      subdivision: await contactsFor(admin, "eng_subdivision_id", (c as Record<string, string | null>).eng_subdivision_id),
    };

    for (const role of COMPLAINT_RECIPIENT_ROLES) {
      // "state" roles (Principal Secretary, Chief Secretary) are fixed
      // Government-of-Karnataka offices — no per-complaint contact to resolve.
      if (role.jurisdiction === "state") continue;
      const pool = buckets[role.jurisdiction];
      const levels = new Set(role.matchRoleLevels.map((l) => l.toLowerCase()));
      const desigs = new Set(role.matchDesignations.map((d) => d.toLowerCase()));
      const match = pool.find(
        (o) =>
          (o.role_level && levels.has(o.role_level.toLowerCase())) ||
          (o.designation && desigs.has(o.designation.toLowerCase())),
      );
      if (match) {
        const office =
          [match.eng_subdivision?.name, match.division?.name, match.corporation?.name].filter(Boolean).join(", ") || null;
        enrich[role.key] = {
          name: match.full_name,
          designation: match.designation,
          office,
          address: match.office_address,
        };
      }
    }

    // The Commissioner's OFFICE is the complaint's own zone/corporation — e.g.
    // "Bengaluru South City Corporation" — set this dynamically regardless of
    // whether a named Commissioner contact was found above (officer coverage
    // at this level is sparse; the office itself is always determinable from
    // the complaint's corporation_id). A resolved contact's own office (if any)
    // takes precedence; this only fills the gap.
    if (corporationId) {
      const corpName = await corporationNameById(admin, corporationId);
      if (corpName) {
        const existing = enrich.zonal_commissioner;
        enrich.zonal_commissioner = {
          name: existing?.name ?? null,
          designation: existing?.designation ?? "Commissioner",
          office: existing?.office ?? corporationOfficeName(corpName),
          address: existing?.address ?? null,
        };
      }
    }
  } catch (e) {
    console.warn("[resolve-recipients] enrichment failed; falling back to title-only", e);
  }
  return enrich;
}

async function corporationNameById(admin: SupabaseClient, corporationId: string): Promise<string | null> {
  const { data } = await admin.from("corporations").select("name").eq("id", corporationId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

async function contactsFor(admin: SupabaseClient, col: string, val: string | null | undefined): Promise<ContactRow[]> {
  if (!val) return [];
  const { data } = await admin.from("contacts").select(SELECT).eq(col, val).limit(200);
  return (data as ContactRow[] | null) ?? [];
}
