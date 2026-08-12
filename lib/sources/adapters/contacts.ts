import "server-only";
/**
 * Official Officer Directory adapter — a pure read over the existing
 * contacts table, scoped by division/sub-division name (contacts is a flat
 * directory, not linked to individual jobs). Supplies the engineer-chain
 * fields ("who is responsible for this area"), not financial facts — a
 * contact can vouch for who holds a role, never for what a job cost.
 */
import { createAdminClient } from "@/lib/db";
import { registerSourceAdapter } from "@/lib/sources/registry";
import type { SourceFact, WorkSourceAdapter, WorkSourceAdapterResult, WorkSourceQuery } from "@/lib/sources/types";

const DESIGNATION_TO_FIELD: Record<string, string> = {
  "Chief Engineer": "chiefEngineer",
  "Superintending Engineer": "superintendingEngineer",
  "Executive Engineer": "executiveEngineer",
  "Assistant Executive Engineer": "assistantExecutiveEngineer",
  "Assistant Engineer": "assistantEngineer",
};

async function search(query: WorkSourceQuery): Promise<WorkSourceAdapterResult> {
  if (!query.divisionName && !query.subDivisionName) return { ok: true, facts: [], citation: null };
  const db = createAdminClient();

  let contactsQuery = db
    .from("contacts")
    .select("full_name, designation, phone, email, division:divisions!division_id(name), eng_subdivision:eng_subdivisions!eng_subdivision_id(name)");

  if (query.subDivisionName) {
    const { data: subdiv } = await db
      .from("eng_subdivisions")
      .select("id")
      .ilike("name", `%${query.subDivisionName}%`)
      .limit(1)
      .maybeSingle();
    if (subdiv?.id) contactsQuery = contactsQuery.eq("eng_subdivision_id", subdiv.id);
  } else if (query.divisionName) {
    const { data: division } = await db
      .from("divisions")
      .select("id")
      .ilike("name", `%${query.divisionName}%`)
      .limit(1)
      .maybeSingle();
    if (division?.id) contactsQuery = contactsQuery.eq("division_id", division.id);
  }

  const { data, error } = await contactsQuery;
  if (error) return { ok: false, facts: [], citation: null, error: error.message };
  const rows = data ?? [];
  if (!rows.length) return { ok: true, facts: [], citation: null };

  const facts: SourceFact[] = [];
  for (const row of rows as unknown as { full_name: string; designation: string; phone: string | null; email: string | null }[]) {
    const field = DESIGNATION_TO_FIELD[row.designation];
    if (!field) continue;
    facts.push({ field, value: row.full_name });
    if (field === "assistantEngineer") {
      if (row.phone) facts.push({ field: "engineerPhone", value: row.phone });
      if (row.email) facts.push({ field: "engineerEmail", value: row.email });
      facts.push({ field: "engineerName", value: row.full_name });
    }
  }
  if (!facts.length) return { ok: true, facts: [], citation: null };

  return {
    ok: true,
    facts,
    citation: {
      sourceId: "official_officer_directory",
      url: null,
      documentName: null,
      referenceNumber: null,
      pageNumber: null,
      isOfficial: true,
    },
  };
}

const adapter: WorkSourceAdapter = {
  id: "official_officer_directory",
  displayName: "Official Officer Directory",
  kind: "app_table",
  requiresNetwork: false,
  search,
};

registerSourceAdapter(adapter);
export default adapter;
