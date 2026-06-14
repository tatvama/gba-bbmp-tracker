/**
 * BBMP MCP Server — exposes ward, contact, complaint, and RTI data as Claude tools.
 *
 * Transport: stdio (works with Claude Desktop, Claude Code, any MCP client).
 * Auth: Supabase service-role key (bypasses RLS — trusted server-side process).
 * Read-only: no mutation tools (no user session auth in MCP context).
 *
 * Usage:
 *   npm run mcp:start          # from project root (loads .env automatically)
 *   npx tsx mcp/bbmp-server.ts # direct invocation
 *
 * For Claude Desktop add to ~/AppData/Roaming/Claude/claude_desktop_config.json:
 *   { "mcpServers": { "bbmp": { "command": "npx", "args": ["tsx", "D:/Tatvam/BBMP/mcp/bbmp-server.ts"],
 *     "env": { "NEXT_PUBLIC_SUPABASE_URL": "...", "SUPABASE_SERVICE_ROLE_KEY": "..." } } } }
 *
 * IMPORTANT: never use console.log() here — stdout belongs to the MCP wire protocol.
 * Use console.error() for all diagnostics.
 */

// dotenv/config MUST be first — loads .env before any other import reads process.env
import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Framework-free lib imports (no "server-only" guard — safe outside Next.js)
import { activeDeadline } from "../lib/rti-deadlines";
import {
  COMPLAINT_OPEN_STATUSES,
  CORPORATION_CODES,
  DEFAULT_DEADLINE_RULES,
} from "../lib/constants";

// ── Environment validation ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "[bbmp-mcp] Missing required environment variables.\n" +
      "  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "  When running from the project root, dotenv reads .env automatically.\n" +
      "  For Claude Desktop, pass them in the mcpServers.env config block.",
  );
  process.exit(1);
}

// ── Supabase admin client (bypasses RLS — service role only) ────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Shared SELECT strings (mirrored from lib/queries.ts) ────────────────────

const WARD_SELECT =
  "*, division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name,sl_no), derived_corporation:corporations!derived_corporation_id(id,code,name)";

const CONTACT_SELECT =
  "*, corporation:corporations!corporation_id(id,code,name), division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name)";

const COMPLAINT_SELECT =
  "*, ward:wards!ward_id(id,new_no,new_name), division:divisions!division_id(id,name), corporation:corporations!corporation_id(id,code,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name), assigned_engineer:contacts!assigned_engineer_id(id,full_name,designation,phone,whatsapp,email), assigned_officer:contacts!assigned_officer_id(id,full_name,designation)";

const RTI_SELECT =
  "*, corporation:corporations!corporation_id(id,code,name), division:divisions!division_id(id,name), eng_subdivision:eng_subdivisions!eng_subdivision_id(id,name), ward:wards!ward_id(id,new_no,new_name), contact:contacts!contact_id(id,full_name,designation)";

// ── Helpers ─────────────────────────────────────────────────────────────────

function logErr(tool: string, error: unknown) {
  if (error) console.error(`[bbmp-mcp:${tool}]`, error);
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "bbmp",
  version: "1.0.0",
  description:
    "GBA-BBMP Ward & Engineer Tracker — query wards, contacts, RTI applications, and citizen complaints",
});

// ────────────────────────────────────────────────────────────────────────────
// Tool 1: search_bbmp
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "search_bbmp",
  {
    description:
      "Search across BBMP wards, engineer contacts, complaints, and RTI applications by keyword. Returns up to 15 results per category.",
    inputSchema: {
      query: z.string().min(1).describe("Search keyword — ward name/number, case number, person name, subject, etc."),
      types: z
        .array(z.enum(["ward", "contact", "complaint", "rti"]))
        .optional()
        .describe("Entity types to include. Omit to search all four."),
    },
  },
  async ({ query, types }) => {
    const term = query.trim();
    const like = `%${term}%`;
    const numeric = /^\d+$/.test(term) ? Number(term) : null;
    const all = !types || types.length === 0;
    const results: Record<string, unknown[]> = {};
    const promises: Promise<void>[] = [];

    if (all || types!.includes("ward")) {
      const orParts = [
        `new_name.ilike.${like}`,
        `zone.ilike.${like}`,
        `assembly_constituency.ilike.${like}`,
        ...(numeric !== null ? [`new_no.eq.${numeric}`] : []),
      ];
      promises.push(
        (async () => {
          const { data, error } = await supabase
            .from("wards")
            .select(
              "new_no, new_name, zone, assembly_constituency, verification_status, derived_corporation:corporations!derived_corporation_id(code,name)",
            )
            .or(orParts.join(","))
            .order("new_no")
            .limit(15);
          logErr("search:wards", error);
          results.wards = (data ?? []).map((w: Record<string, unknown>) => ({
            type: "ward",
            ward_number: w.new_no,
            name: w.new_name,
            zone: w.zone,
            assembly_constituency: w.assembly_constituency,
            corporation: (w.derived_corporation as Record<string, unknown> | null)?.name ?? null,
            verification_status: w.verification_status,
          }));
        })(),
      );
    }

    if (all || types!.includes("contact")) {
      promises.push(
        (async () => {
          const { data, error } = await supabase
            .from("contacts")
            .select(
              "id, full_name, designation, phone, whatsapp, email, verification_status, eng_subdivision:eng_subdivisions!eng_subdivision_id(name)",
            )
            .or(`full_name.ilike.${like},designation.ilike.${like},phone.ilike.${like}`)
            .order("full_name")
            .limit(15);
          logErr("search:contacts", error);
          results.contacts = (data ?? []).map((c: Record<string, unknown>) => ({
            type: "contact",
            id: c.id,
            name: c.full_name,
            designation: c.designation,
            phone: c.phone,
            whatsapp: c.whatsapp,
            subdivision: (c.eng_subdivision as Record<string, unknown> | null)?.name ?? null,
            verification_status: c.verification_status,
          }));
        })(),
      );
    }

    if (all || types!.includes("complaint")) {
      promises.push(
        (async () => {
          const today = new Date().toISOString().slice(0, 10);
          const { data, error } = await supabase
            .from("complaints")
            .select(
              "id, internal_case_number, title, status, priority, next_follow_up_date, ward:wards!ward_id(new_no,new_name)",
            )
            .or(`title.ilike.${like},internal_case_number.ilike.${like},complaint_number.ilike.${like}`)
            .is("deleted_at", null)
            .order("updated_at", { ascending: false })
            .limit(15);
          logErr("search:complaints", error);
          results.complaints = (data ?? []).map((c: Record<string, unknown>) => {
            const ward = c.ward as Record<string, unknown> | null;
            return {
              type: "complaint",
              id: c.id,
              case_number: c.internal_case_number,
              title: c.title,
              status: c.status,
              priority: c.priority,
              ward: ward ? `${ward.new_no} – ${ward.new_name}` : null,
              overdue: c.next_follow_up_date ? String(c.next_follow_up_date) < today : false,
            };
          });
        })(),
      );
    }

    if (all || types!.includes("rti")) {
      promises.push(
        (async () => {
          const { data, error } = await supabase
            .from("rti_applications")
            .select("id, internal_ref, subject, status, priority, normal_due")
            .or(`internal_ref.ilike.${like},subject.ilike.${like},public_authority.ilike.${like}`)
            .order("updated_at", { ascending: false })
            .limit(15);
          logErr("search:rti", error);
          results.rtis = (data ?? []).map((r: Record<string, unknown>) => ({
            type: "rti",
            id: r.id,
            ref: r.internal_ref,
            subject: r.subject,
            status: r.status,
            priority: r.priority,
            normal_due: r.normal_due,
          }));
        })(),
      );
    }

    await Promise.all(promises);
    const total = Object.values(results).reduce((s, a) => s + a.length, 0);
    return ok({ query: term, total, results });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 2: get_ward
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "get_ward",
  {
    description:
      "Get full details for a BBMP ward including corporation, division, sub-division, and assigned engineers.",
    inputSchema: {
      ward_number: z.number().int().min(1).max(400).describe("BBMP ward number (new_no), e.g. 42"),
    },
  },
  async ({ ward_number }) => {
    const { data: ward, error } = await supabase
      .from("wards")
      .select(WARD_SELECT)
      .eq("new_no", ward_number)
      .maybeSingle();
    logErr("get_ward", error);

    if (!ward) return err(`Ward ${ward_number} not found`);

    // Find engineers for this ward's sub-division
    let engineers: unknown[] = [];
    const subId = (ward as Record<string, unknown> & { eng_subdivision?: { id?: string } })
      .eng_subdivision?.id;
    if (subId) {
      const { data } = await supabase
        .from("contacts")
        .select("id, full_name, designation, phone, whatsapp, email, verification_status")
        .eq("eng_subdivision_id", subId)
        .order("designation")
        .limit(10);
      engineers = data ?? [];
    }

    return ok({ ward, engineers });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 3: list_wards
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "list_wards",
  {
    description:
      "List BBMP wards, optionally filtered by zone or corporation. Returns ward number, name, zone, and corporation.",
    inputSchema: {
      zone: z.string().optional().describe("Zone name filter (partial match), e.g. 'East', 'Bommanahalli'"),
      corporation_code: z
        .enum(CORPORATION_CODES)
        .optional()
        .describe("Corporation code: KENDRA | PURVA | PASHCHIMA | UTTARA | DAKSHINA"),
      limit: z.number().int().min(1).max(225).default(25).optional(),
    },
  },
  async ({ zone, corporation_code, limit = 25 }) => {
    let corpId: string | null = null;
    if (corporation_code) {
      const { data: corp } = await supabase
        .from("corporations")
        .select("id")
        .eq("code", corporation_code)
        .maybeSingle();
      corpId = (corp as { id?: string } | null)?.id ?? null;
    }

    let q = supabase
      .from("wards")
      .select(
        "new_no, new_name, zone, assembly_constituency, verification_status, derived_corporation:corporations!derived_corporation_id(code,name)",
      )
      .order("new_no")
      .limit(limit);

    if (zone) q = q.ilike("zone", `%${zone}%`);
    if (corpId) q = q.eq("derived_corporation_id", corpId);

    const { data, error } = await q;
    logErr("list_wards", error);

    return ok({
      total: data?.length ?? 0,
      filters: { zone, corporation_code },
      wards: (data ?? []).map((w: Record<string, unknown>) => ({
        ward_number: w.new_no,
        name: w.new_name,
        zone: w.zone,
        assembly_constituency: w.assembly_constituency,
        corporation: (w.derived_corporation as Record<string, unknown> | null)?.name ?? null,
        corporation_code: (w.derived_corporation as Record<string, unknown> | null)?.code ?? null,
        verification_status: w.verification_status,
      })),
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 4: get_complaint
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "get_complaint",
  {
    description:
      "Get full details for a complaint by its internal case number (e.g. DM-CMP-2026-000001) or UUID.",
    inputSchema: {
      case_id: z
        .string()
        .describe("Internal case number like DM-CMP-2026-000001, or the complaint UUID"),
    },
  },
  async ({ case_id }) => {
    const q = supabase.from("complaints").select(COMPLAINT_SELECT).is("deleted_at", null);
    const { data, error } = isUuid(case_id)
      ? await q.eq("id", case_id).maybeSingle()
      : await q.eq("internal_case_number", case_id).maybeSingle();

    logErr("get_complaint", error);
    if (!data) return err(`Complaint "${case_id}" not found`);
    return ok(data);
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 5: list_complaints
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "list_complaints",
  {
    description:
      "List citizen complaints with optional filters. Use overdue_only=true to find complaints with past follow-up dates.",
    inputSchema: {
      status: z
        .string()
        .optional()
        .describe(
          "Status filter (exact). E.g. 'Filed', 'Escalated', 'Action Taken Report Received', 'Resolved'",
        ),
      priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
      ward_number: z.number().int().optional().describe("Filter by BBMP ward number"),
      overdue_only: z
        .boolean()
        .optional()
        .describe("If true, only return open complaints whose next_follow_up_date is in the past"),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    },
  },
  async ({ status, priority, ward_number, overdue_only, limit = 20 }) => {
    const today = new Date().toISOString().slice(0, 10);

    let wardId: string | null = null;
    if (ward_number) {
      const { data: ward } = await supabase
        .from("wards")
        .select("id")
        .eq("new_no", ward_number)
        .maybeSingle();
      wardId = (ward as { id?: string } | null)?.id ?? null;
    }

    let q = supabase
      .from("complaints")
      .select(
        "id, internal_case_number, title, status, priority, next_follow_up_date, date_submitted, latest_reply_date, latest_action_taken_date, ward:wards!ward_id(new_no,new_name), assigned_engineer:contacts!assigned_engineer_id(full_name,designation,phone)",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (status) q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);
    if (wardId) q = q.eq("ward_id", wardId);
    if (overdue_only) {
      q = q.in("status", COMPLAINT_OPEN_STATUSES as unknown as string[]).lt("next_follow_up_date", today);
    }

    const { data, error } = await q;
    logErr("list_complaints", error);

    return ok({
      total: data?.length ?? 0,
      filters: { status, priority, ward_number, overdue_only },
      complaints: (data ?? []).map((c: Record<string, unknown>) => {
        const ward = c.ward as Record<string, unknown> | null;
        const eng = c.assigned_engineer as Record<string, unknown> | null;
        return {
          id: c.id,
          case_number: c.internal_case_number,
          title: c.title,
          status: c.status,
          priority: c.priority,
          date_submitted: c.date_submitted,
          latest_reply: c.latest_reply_date,
          latest_action: c.latest_action_taken_date,
          next_follow_up: c.next_follow_up_date,
          overdue: c.next_follow_up_date ? String(c.next_follow_up_date) < today : false,
          ward: ward ? `${ward.new_no} – ${ward.new_name}` : null,
          engineer: eng?.full_name ?? null,
          engineer_phone: eng?.phone ?? null,
        };
      }),
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 6: get_rti
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "get_rti",
  {
    description:
      "Get full details for an RTI application by its internal reference (e.g. RTI-2026-001) or UUID. Includes computed active deadline.",
    inputSchema: {
      ref: z.string().describe("Internal reference like RTI-2026-001, or the RTI UUID"),
    },
  },
  async ({ ref }) => {
    const q = supabase.from("rti_applications").select(RTI_SELECT);
    const { data, error } = isUuid(ref)
      ? await q.eq("id", ref).maybeSingle()
      : await q.eq("internal_ref", ref).maybeSingle();

    logErr("get_rti", error);
    if (!data) return err(`RTI "${ref}" not found`);

    const active = activeDeadline(data as Parameters<typeof activeDeadline>[0], new Date(), DEFAULT_DEADLINE_RULES);
    return ok({ rti: data, active_deadline: active });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 7: list_rtis
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "list_rtis",
  {
    description:
      "List RTI applications with optional filters. Use deadline_bucket='overdue' to find overdue RTIs.",
    inputSchema: {
      status: z
        .string()
        .optional()
        .describe("RTI status filter (exact). E.g. 'Awaiting Reply', 'Filed', 'First Appeal Filed', 'Closed'"),
      deadline_bucket: z
        .enum(["overdue", "due-today", "due-soon", "on-track"])
        .optional()
        .describe("Filter by deadline urgency. 'overdue' catches both overdue and critical-overdue."),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    },
  },
  async ({ status, deadline_bucket, limit = 20 }) => {
    // If filtering by deadline bucket, fetch more (bucket is computed in-process)
    const fetchLimit = deadline_bucket ? Math.min(limit * 10, 500) : limit;

    let q = supabase
      .from("rti_applications")
      .select(
        "id, internal_ref, subject, status, priority, is_life_liberty, normal_due, life_liberty_due, first_appeal_due, second_appeal_due, corporation:corporations!corporation_id(name)",
      )
      .order("updated_at", { ascending: false })
      .limit(fetchLimit);

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    logErr("list_rtis", error);

    const now = new Date();
    const bucketMap: Record<string, string[]> = {
      overdue: ["overdue", "critical-overdue"],
      "due-today": ["due-today"],
      "due-soon": ["due-soon"],
      "on-track": ["due-10plus"],
    };

    let rows = data ?? [];
    if (deadline_bucket) {
      const targets = bucketMap[deadline_bucket] ?? [];
      rows = rows.filter((r: Record<string, unknown>) => {
        const active = activeDeadline(r as Parameters<typeof activeDeadline>[0], now, DEFAULT_DEADLINE_RULES);
        return active && targets.includes(active.bucket);
      });
      rows = rows.slice(0, limit);
    }

    return ok({
      total: rows.length,
      filters: { status, deadline_bucket },
      rtis: rows.map((r: Record<string, unknown>) => {
        const active = activeDeadline(r as Parameters<typeof activeDeadline>[0], now, DEFAULT_DEADLINE_RULES);
        return {
          id: r.id,
          ref: r.internal_ref,
          subject: r.subject,
          status: r.status,
          priority: r.priority,
          is_life_liberty: r.is_life_liberty,
          corporation: (r.corporation as Record<string, unknown> | null)?.name ?? null,
          active_deadline: active,
        };
      }),
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 8: get_dashboard_stats
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "get_dashboard_stats",
  {
    description:
      "Get a combined dashboard overview: ward/engineer counts, complaint totals by status, RTI totals and overdue counts.",
  },
  async () => {
    const today = new Date().toISOString().slice(0, 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function count(table: string, modifier?: (q: any) => any): Promise<number> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from(table).select("*", { count: "exact", head: true });
      if (modifier) q = modifier(q);
      const { count: c, error } = await q;
      logErr(`stats:${table}`, error);
      return (c as number) ?? 0;
    }

    const [
      corporations,
      wards,
      divisions,
      subdivisions,
      contacts,
      verified,
      pending,
      complaintTotal,
      complaintOpen,
      complaintOverdue,
      rtiTotal,
      rtiAwaiting,
      rtiClosed,
    ] = await Promise.all([
      count("corporations"),
      count("wards"),
      count("divisions"),
      count("eng_subdivisions"),
      count("contacts"),
      count("contacts", (q) => q.eq("verification_status", "VERIFIED")),
      count("contacts", (q) => q.eq("verification_status", "PENDING")),
      count("complaints", (q) => q.is("deleted_at", null)),
      count("complaints", (q) => q.is("deleted_at", null).in("status", COMPLAINT_OPEN_STATUSES)),
      count("complaints", (q) =>
        q.is("deleted_at", null).in("status", COMPLAINT_OPEN_STATUSES).lt("next_follow_up_date", today),
      ),
      count("rti_applications"),
      count("rti_applications", (q) => q.eq("status", "Awaiting Reply")),
      count("rti_applications", (q) => q.eq("status", "Closed")),
    ]);

    // RTI overdue: in-process deadline computation
    const { data: rtiRows } = await supabase
      .from("rti_applications")
      .select("status, is_life_liberty, normal_due, life_liberty_due, first_appeal_due, second_appeal_due");
    const now = new Date();
    const rtiOverdue = (rtiRows ?? []).filter((r: Record<string, unknown>) => {
      const active = activeDeadline(r as Parameters<typeof activeDeadline>[0], now, DEFAULT_DEADLINE_RULES);
      return active && (active.bucket === "overdue" || active.bucket === "critical-overdue");
    }).length;

    return ok({
      wards: { total: wards, corporations, divisions, subdivisions },
      contacts: { total: contacts, verified, pending },
      complaints: { total: complaintTotal, open: complaintOpen, overdue: complaintOverdue },
      rtis: {
        total: rtiTotal,
        awaiting_reply: rtiAwaiting,
        overdue: rtiOverdue,
        closed: rtiClosed,
      },
      generated_at: new Date().toISOString(),
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 9: list_contacts
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "list_contacts",
  {
    description:
      "List engineers and officers, optionally filtered by corporation, designation, or sub-division ID.",
    inputSchema: {
      corporation_code: z.enum(CORPORATION_CODES).optional(),
      designation: z
        .string()
        .optional()
        .describe("Designation filter (partial match). E.g. 'Executive Engineer', 'Junior Engineer'"),
      subdivision_id: z.string().uuid().optional().describe("Engineering sub-division UUID"),
      limit: z.number().int().min(1).max(100).default(20).optional(),
    },
  },
  async ({ corporation_code, designation, subdivision_id, limit = 20 }) => {
    let corpId: string | null = null;
    if (corporation_code) {
      const { data: corp } = await supabase
        .from("corporations")
        .select("id")
        .eq("code", corporation_code)
        .maybeSingle();
      corpId = (corp as { id?: string } | null)?.id ?? null;
    }

    let q = supabase.from("contacts").select(CONTACT_SELECT).order("full_name").limit(limit);
    if (designation) q = q.ilike("designation", `%${designation}%`);
    if (subdivision_id) q = q.eq("eng_subdivision_id", subdivision_id);
    if (corpId) q = q.eq("corporation_id", corpId);

    const { data, error } = await q;
    logErr("list_contacts", error);

    return ok({
      total: data?.length ?? 0,
      contacts: (data ?? []).map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.full_name,
        designation: c.designation,
        phone: c.phone,
        whatsapp: c.whatsapp,
        email: c.email,
        corporation: (c.corporation as Record<string, unknown> | null)?.name ?? null,
        division: (c.division as Record<string, unknown> | null)?.name ?? null,
        subdivision: (c.eng_subdivision as Record<string, unknown> | null)?.name ?? null,
        verification_status: c.verification_status,
      })),
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 10: get_contact
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "get_contact",
  {
    description:
      "Get full details for a specific engineer or officer by UUID, including their ward coverage.",
    inputSchema: {
      id: z.string().uuid().describe("Contact UUID"),
    },
  },
  async ({ id }) => {
    const { data, error } = await supabase
      .from("contacts")
      .select(CONTACT_SELECT)
      .eq("id", id)
      .maybeSingle();
    logErr("get_contact", error);

    if (!data) return err(`Contact ${id} not found`);

    // Wards covered by this contact's sub-division
    let wards: unknown[] = [];
    const subId = (data as Record<string, unknown> & { eng_subdivision?: { id?: string } })
      .eng_subdivision?.id;
    if (subId) {
      const { data: wardData } = await supabase
        .from("wards")
        .select("new_no, new_name, verification_status")
        .eq("eng_subdivision_id", subId)
        .order("new_no");
      wards = wardData ?? [];
    }

    return ok({ contact: data, wards_covered: wards });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Resource 1: bbmp://corporations
// ────────────────────────────────────────────────────────────────────────────

server.registerResource(
  "corporations",
  "bbmp://corporations",
  {
    description: "Live list of the 5 GBA/BBMP corporations with codes, names, and structural counts.",
    mimeType: "application/json",
  },
  async () => {
    const { data, error } = await supabase
      .from("corporations")
      .select("code, name, name_kn, ward_count, division_count, subdivision_count")
      .order("name");
    logErr("resource:corporations", error);

    return {
      contents: [
        {
          uri: "bbmp://corporations",
          text: JSON.stringify(data ?? [], null, 2),
          mimeType: "application/json",
        },
      ],
    };
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Resource 2: bbmp://rti-deadlines
// ────────────────────────────────────────────────────────────────────────────

server.registerResource(
  "rti-deadlines",
  "bbmp://rti-deadlines",
  {
    description:
      "Current RTI deadline rules from app_settings (statutory basis: RTI Act 2005). Shows configurable thresholds.",
    mimeType: "application/json",
  },
  async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "rti_deadline_rules")
      .maybeSingle();

    const stored = (data as { value?: Record<string, unknown> } | null)?.value ?? {};
    const rules = { ...DEFAULT_DEADLINE_RULES, ...stored };

    return {
      contents: [
        {
          uri: "bbmp://rti-deadlines",
          text: JSON.stringify(
            {
              rules,
              explanation: {
                normalDays: "Days for PIO to reply to a normal RTI (RTI Act §7: 30 days)",
                lifeLibertyHours: "Hours for reply when life/liberty at stake (RTI Act §7: 48 hours)",
                firstAppealDays: "Days to file first appeal after reply expiry or unsatisfactory reply",
                secondAppealDays: "Days to file second appeal after FAA decision",
                dueSoonDays: "Days remaining before a deadline is shown as 'Due soon'",
                criticalOverdueDays: "Days past due before badge becomes 'Critical overdue'",
              },
              last_updated: (data as { updated_at?: string } | null)?.updated_at ?? null,
            },
            null,
            2,
          ),
          mimeType: "application/json",
        },
      ],
    };
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Connect and start
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[bbmp-mcp] Server connected on stdio. Ready to handle tool calls.");
}

main().catch((err) => {
  console.error("[bbmp-mcp] Fatal startup error:", err);
  process.exit(1);
});
