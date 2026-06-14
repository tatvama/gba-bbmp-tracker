/**
 * BBMP MCP Server — exposes ward, contact, complaint, and RTI data as Claude tools.
 *
 * Transport: stdio (works with Claude Desktop, Claude Code, any MCP client).
 * Auth: Supabase service-role key (bypasses RLS — trusted server-side process).
 * Write tools use the admin client directly (no user-session needed); created_by = null.
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

import fs from "node:fs";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Framework-free lib imports (no "server-only" guard — safe outside Next.js)
import { activeDeadline, computeRtiDeadlines } from "../lib/rti-deadlines";
import {
  COMPLAINT_OPEN_STATUSES,
  COMPLAINT_STATUSES,
  COMPLAINT_TYPES,
  CORPORATION_CODES,
  DEFAULT_DEADLINE_RULES,
  PRIORITIES,
  RTI_CATEGORIES,
} from "../lib/constants";
import { buildRoadWorkLetterPrompt } from "../lib/ai/road-work-knowledge";

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

    async function count(table: string, modifier?: (q: any) => any): Promise<number> {
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

// ════════════════════════════════════════════════════════════════════════════
// WRITE TOOLS (11–14)  — use admin client; created_by = null (system)
// ════════════════════════════════════════════════════════════════════════════

// ── slug helper for storage paths ───────────────────────────────────────────
function slugPath(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

// ── MIME detection from file extension ──────────────────────────────────────
const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MIME[ext] ?? "application/octet-stream";
}

// ────────────────────────────────────────────────────────────────────────────
// Tool 11: create_complaint
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "create_complaint",
  {
    description:
      "Create a new BBMP complaint case. Returns the auto-generated internal case number (e.g. DM-CMP-2026-000042).",
    inputSchema: {
      title: z.string().min(3).describe("Complaint title — brief description of the issue"),
      type: z.enum(COMPLAINT_TYPES).describe(
        "Complaint type. E.g. 'Road', 'Drain', 'Garbage', 'Streetlight', 'Building Violation'",
      ),
      description: z.string().optional().describe("Detailed description of the complaint"),
      priority: z.enum(PRIORITIES).optional().describe("Low | Medium | High | Urgent"),
      status: z
        .enum(COMPLAINT_STATUSES)
        .optional()
        .default("Draft")
        .describe("Initial status. Defaults to 'Draft'. Use 'Filed' if already submitted to BBMP."),
      ward_number: z.number().int().optional().describe("BBMP ward number (1–225) — auto-links corporation & division"),
      location: z.string().optional().describe("Street address or landmark description"),
      notes: z.string().optional().describe("Internal notes visible only to team"),
    },
  },
  async ({ title, type, description, priority, status = "Draft", ward_number, location, notes }) => {
    // 1. Ward lookup
    let wardId: string | null = null;
    let corpId: string | null = null;
    let divisionId: string | null = null;

    if (ward_number) {
      const { data: ward } = await supabase
        .from("wards")
        .select("id, derived_corporation_id, division_id")
        .eq("new_no", ward_number)
        .maybeSingle();
      if (ward) {
        wardId = (ward as Record<string, unknown>).id as string;
        corpId = (ward as Record<string, unknown>).derived_corporation_id as string | null;
        divisionId = (ward as Record<string, unknown>).division_id as string | null;
      }
    }

    // 2. Complaint settings (case number prefix)
    const { data: settingsRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "complaint_settings")
      .maybeSingle();
    const settings: any = settingsRow?.value ?? {};
    const prefix: string = settings.caseNumberPrefix ?? "DM-CMP";
    const year = new Date().getFullYear();

    // 3. Generate atomic case number (RPC param names are p_prefix / p_year)
    const { data: caseNum, error: rpcErr } = await supabase.rpc(
      "next_complaint_case_number",
      { p_prefix: prefix, p_year: year },
    );
    logErr("create_complaint:rpc", rpcErr);
    if (!caseNum) return err("Failed to generate case number — check DB migration");

    // 4. Insert complaint
    const { data: inserted, error: insertErr } = await supabase
      .from("complaints")
      .insert({
        title,
        type,
        description: description ?? null,
        priority: priority ?? null,
        status,
        ward_id: wardId,
        corporation_id: corpId,
        division_id: divisionId,
        location: location ?? null,
        notes: notes ?? null,
        internal_case_number: caseNum,
        created_by: null,
        updated_by: null,
      })
      .select("id, internal_case_number, title, type, status")
      .single();
    logErr("create_complaint:insert", insertErr);
    if (!inserted) return err("Failed to insert complaint");

    // 5. Timeline entry
    await supabase.from("complaint_timeline").insert({
      complaint_id: (inserted as Record<string, unknown>).id,
      event_type: "Created",
      description: "Case created via BBMP MCP server",
      created_by: null,
    });

    return ok({
      message: "Complaint created successfully",
      id: (inserted as Record<string, unknown>).id,
      internal_case_number: (inserted as Record<string, unknown>).internal_case_number,
      title: (inserted as Record<string, unknown>).title,
      type: (inserted as Record<string, unknown>).type,
      status: (inserted as Record<string, unknown>).status,
      ward_number: ward_number ?? null,
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 12: upload_document
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "upload_document",
  {
    description:
      "Upload a local file (photo, letter, PDF) to a BBMP complaint. Supports jpg/png/webp/pdf. Set run_ocr=true to queue OCR for text extraction.",
    inputSchema: {
      complaint_id: z.string().uuid().describe("Complaint UUID (from create_complaint or get_complaint)"),
      file_path: z
        .string()
        .describe(
          "Absolute local path to the file. E.g. C:/letters/bbmp-reply.jpg or /home/user/docs/letter.pdf",
        ),
      document_type: z
        .string()
        .optional()
        .describe(
          "Document category. E.g. 'Original complaint copy', 'Department reply', 'Action Taken Report', 'Site photos', 'WhatsApp screenshot'",
        ),
      title: z.string().optional().describe("Human-readable title for this document"),
      description: z.string().optional(),
      as_evidence: z
        .boolean()
        .optional()
        .describe("If true, stores in evidence bucket (for site photos, proof). Default: false."),
      run_ocr: z
        .boolean()
        .optional()
        .describe("Queue OCR on upload. Extracted text will be available in the Documents tab. Default: false."),
    },
  },
  async ({ complaint_id, file_path, document_type, title, description, as_evidence, run_ocr }) => {
    // 1. Read file
    if (!fs.existsSync(file_path)) {
      return err(`File not found: ${file_path}`);
    }
    const buffer = fs.readFileSync(file_path);
    const mime = mimeFromPath(file_path);
    const fileName = path.basename(file_path);

    // 2. Bucket selection
    const isSitePhoto = document_type?.toLowerCase().startsWith("site photo") ?? false;
    const bucket = as_evidence || isSitePhoto ? "complaint-evidence" : "complaint-documents";

    // 3. Storage path
    const storagePath = `${complaint_id}/${Date.now()}-${slugPath(fileName)}`;

    // 4. Upload to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType: mime, upsert: false });
    logErr("upload_document:storage", uploadErr);
    if (uploadErr) return err(`Storage upload failed: ${uploadErr.message}`);

    // 5. Determine OCR status
    const isPdf = mime === "application/pdf";
    const ocrStatus = run_ocr && !isPdf ? "Queued" : "Not Started";

    // 6. Insert document record
    const { data: doc, error: docErr } = await supabase
      .from("complaint_documents")
      .insert({
        complaint_id,
        document_type: document_type ?? null,
        title: title ?? fileName,
        description: description ?? null,
        original_file_name: fileName,
        storage_bucket: bucket,
        storage_path: storagePath,
        mime_type: mime,
        file_size: buffer.length,
        ocr_status: ocrStatus,
        uploaded_by: null,
      })
      .select("id")
      .single();
    logErr("upload_document:insert", docErr);
    if (!doc) return err("Document metadata save failed");

    const docId = (doc as Record<string, unknown>).id as string;

    // 7. Timeline entry
    await supabase.from("complaint_timeline").insert({
      complaint_id,
      event_type: isSitePhoto ? "Photo Evidence" : "Document Uploaded",
      description: `Uploaded: ${title ?? fileName}${document_type ? ` (${document_type})` : ""}`,
      created_by: null,
    });

    return ok({
      message: "Document uploaded successfully",
      document_id: docId,
      bucket,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mime,
      file_size_kb: Math.round(buffer.length / 1024),
      ocr_status: ocrStatus,
      ocr_note:
        ocrStatus === "Queued"
          ? "OCR queued — view results in the web app under Documents tab or /complaints/ocr-queue"
          : run_ocr && isPdf
            ? "OCR skipped for PDFs — trigger manually from the web UI"
            : undefined,
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 13: update_complaint_status
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "update_complaint_status",
  {
    description:
      "Update the status of a BBMP complaint and add an optional note to the timeline.",
    inputSchema: {
      complaint_id: z.string().uuid().describe("Complaint UUID"),
      status: z.enum(COMPLAINT_STATUSES).describe(
        "New status. E.g. 'Filed', 'Under Review', 'Resolved', 'Escalated', 'Closed'",
      ),
      notes: z
        .string()
        .optional()
        .describe("Optional note to record alongside the status change"),
      next_follow_up_date: z
        .string()
        .optional()
        .describe("YYYY-MM-DD — set or update the follow-up reminder date"),
    },
  },
  async ({ complaint_id, status, notes, next_follow_up_date }) => {
    // 1. Fetch existing to get current status
    const { data: existing, error: fetchErr } = await supabase
      .from("complaints")
      .select("id, status, title")
      .eq("id", complaint_id)
      .is("deleted_at", null)
      .maybeSingle();
    logErr("update_status:fetch", fetchErr);
    if (!existing) return err(`Complaint ${complaint_id} not found`);

    const oldStatus = (existing as Record<string, unknown>).status as string;

    // 2. Update
    const updatePayload: Record<string, unknown> = { status, updated_by: null };
    if (next_follow_up_date) updatePayload.next_follow_up_date = next_follow_up_date;

    const { error: updateErr } = await supabase
      .from("complaints")
      .update(updatePayload)
      .eq("id", complaint_id);
    logErr("update_status:update", updateErr);
    if (updateErr) return err(`Update failed: ${updateErr.message}`);

    // 3. Timeline entry
    const timelineDesc = [
      `Status changed: ${oldStatus} → ${status}`,
      notes ? `Note: ${notes}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    await supabase.from("complaint_timeline").insert({
      complaint_id,
      event_type: "Status Change",
      description: timelineDesc,
      created_by: null,
    });

    return ok({
      ok: true,
      id: complaint_id,
      title: (existing as Record<string, unknown>).title,
      old_status: oldStatus,
      new_status: status,
      next_follow_up_date: next_follow_up_date ?? null,
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 14: add_complaint_reply
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "add_complaint_reply",
  {
    description:
      "Record a reply received from BBMP/authority on a complaint. Updates the complaint's latest reply date and optionally sets the next follow-up.",
    inputSchema: {
      complaint_id: z.string().uuid().describe("Complaint UUID"),
      summary: z
        .string()
        .min(5)
        .describe("Summary of the reply — what did the authority say or confirm?"),
      reply_date: z
        .string()
        .optional()
        .describe("Date the reply was received (YYYY-MM-DD). Defaults to today."),
      satisfaction: z
        .enum([
          "Satisfied",
          "Partially Satisfied",
          "Unsatisfied",
          "False Information",
          "Incomplete Information",
          "No Information",
        ])
        .optional()
        .describe("Was the reply satisfactory?"),
      next_follow_up_date: z
        .string()
        .optional()
        .describe("YYYY-MM-DD — when to follow up if reply was incomplete"),
    },
  },
  async ({ complaint_id, summary, reply_date, satisfaction, next_follow_up_date }) => {
    const date = reply_date ?? new Date().toISOString().slice(0, 10);

    // 1. Insert reply record
    const { error: replyErr } = await supabase.from("complaint_replies").insert({
      complaint_id,
      reply_summary: summary,
      reply_date: date,
      satisfaction_status: satisfaction ?? null,
      created_by: null,
    });
    logErr("add_reply:insert", replyErr);
    if (replyErr) return err(`Failed to save reply: ${replyErr.message}`);

    // 2. Update complaint's latest reply fields
    const complaintUpdate: Record<string, unknown> = {
      latest_reply_summary: summary,
      latest_reply_date: date,
      updated_by: null,
    };
    if (next_follow_up_date) complaintUpdate.next_follow_up_date = next_follow_up_date;

    await supabase.from("complaints").update(complaintUpdate).eq("id", complaint_id);

    // 3. Timeline entry
    await supabase.from("complaint_timeline").insert({
      complaint_id,
      event_type: "Reply Received",
      description: `Reply on ${date}: ${summary.slice(0, 120)}${summary.length > 120 ? "…" : ""}`,
      created_by: null,
    });

    return ok({
      ok: true,
      complaint_id,
      reply_date: date,
      satisfaction: satisfaction ?? null,
      next_follow_up_date: next_follow_up_date ?? null,
      summary_preview: summary.slice(0, 100),
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 15: generate_road_work_letter
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "generate_road_work_letter",
  {
    description:
      "Draft a BBMP road-work RTI application or complaint letter from a short summary, using the standard 60-point inspection framework (KW-4 insurance, trip sheets, NGT, royalty, dismantling/salvage, MB book, road thickness, geo-tag photos) with legal basis, case law and officer accountability. Returns an editable draft — does NOT create a case (use create_complaint / create_rti to persist after review).",
    inputSchema: {
      summary: z.string().min(5).describe("Short description of the road-work issue"),
      output_type: z.enum(["rti", "complaint"]).describe("'rti' = request records; 'complaint' = allege irregularity"),
      language: z.enum(["English", "Kannada"]).default("English").optional(),
      ward_number: z.number().int().optional(),
      job_number: z.string().optional().describe("Work / job number, e.g. RR-2026-0456"),
      road_name: z.string().optional(),
      contractor: z.string().optional(),
      include_all: z.boolean().optional().describe("Include all 60 inspection points instead of the relevant subset"),
    },
  },
  async ({ summary, output_type, language = "English", ward_number, job_number, road_name, contractor, include_all }) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return ok({ error: "AI not configured — set ANTHROPIC_API_KEY to generate letters." });
    }
    let wardName: string | null = null;
    if (ward_number) {
      const { data: w } = await supabase.from("wards").select("new_no,new_name").eq("new_no", ward_number).maybeSingle();
      const wr = w as { new_no?: number; new_name?: string } | null;
      wardName = wr ? `${wr.new_no} — ${wr.new_name}` : `Ward ${ward_number}`;
    }

    const { system, prompt } = buildRoadWorkLetterPrompt({
      outputType: output_type,
      language,
      summary,
      wardName,
      jobNumber: job_number ?? null,
      roadName: road_name ?? null,
      contractor: contractor ?? null,
      scope: include_all ? "all" : "smart",
    });

    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: process.env.AI_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 4000,
        temperature: Number(process.env.AI_TEMPERATURE ?? "0.4"),
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const text = (msg.content as { type: string; text?: string }[])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      return ok({ output_type, language, draft: text });
    } catch (e) {
      return err(e instanceof Error ? e.message : "AI request failed");
    }
  },
);

// ────────────────────────────────────────────────────────────────────────────
// Tool 16: create_rti  (mirrors create_complaint — persists an RTI application)
// ────────────────────────────────────────────────────────────────────────────

server.registerTool(
  "create_rti",
  {
    description:
      "Create a new RTI application. Generates the internal reference and statutory deadlines. Pair with generate_road_work_letter to persist a reviewed road-work RTI.",
    inputSchema: {
      subject: z.string().min(3).describe("RTI subject line"),
      info_requested: z.string().describe("The full RTI letter / numbered information requests"),
      category: z.enum(RTI_CATEGORIES).optional().describe("e.g. 'Road work'"),
      status: z.enum(["Draft", "Ready to File", "Filed"]).optional().default("Draft"),
      priority: z.enum(PRIORITIES).optional(),
      ward_number: z.number().int().optional(),
      public_authority: z.string().optional(),
      pio_name: z.string().optional(),
      date_filed: z.string().optional().describe("YYYY-MM-DD if already filed"),
    },
  },
  async ({ subject, info_requested, category, status = "Draft", priority, ward_number, public_authority, pio_name, date_filed }) => {
    let wardId: string | null = null;
    if (ward_number) {
      const { data: w } = await supabase.from("wards").select("id").eq("new_no", ward_number).maybeSingle();
      wardId = (w as { id?: string } | null)?.id ?? null;
    }

    const deadlines = computeRtiDeadlines(
      { dateFiled: date_filed ?? null, isLifeLiberty: false },
      DEFAULT_DEADLINE_RULES,
    );
    const internalRef = `RTI-${Date.now().toString(36).slice(-5).toUpperCase()}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("rti_applications")
      .insert({
        internal_ref: internalRef,
        subject,
        info_requested,
        category: category ?? null,
        status,
        priority: priority ?? "Medium",
        ward_id: wardId,
        public_authority: public_authority ?? null,
        pio_name: pio_name ?? null,
        date_filed: date_filed ?? null,
        normal_due: deadlines.normalDue,
        life_liberty_due: deadlines.lifeLibertyDue,
        first_appeal_due: deadlines.firstAppealDue,
        second_appeal_due: deadlines.secondAppealDue,
        created_by: null,
        updated_by: null,
      })
      .select("id, internal_ref, subject, status")
      .single();
    logErr("create_rti:insert", insertErr);
    if (!inserted) return err(`Failed to create RTI${insertErr ? `: ${insertErr.message}` : ""}`);

    const row = inserted as Record<string, unknown>;
    return ok({
      message: "RTI created successfully",
      id: row.id,
      internal_ref: row.internal_ref,
      subject: row.subject,
      status: row.status,
      normal_due: deadlines.normalDue,
    });
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
