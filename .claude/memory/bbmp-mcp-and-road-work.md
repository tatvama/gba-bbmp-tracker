---
name: bbmp-mcp-and-road-work
description: MCP server (14 read + 4 write tools) and the AI road-work letter generator (RTI + complaint)
metadata: 
  node_type: memory
  type: project
  originSessionId: 761903a7-c435-4ef5-beab-2b7d5a6a81db
---

Two features added on top of the 3-phase BBMP portal (2026-06-15), both pushed to the GitHub repo.

## MCP server — `mcp/bbmp-server.ts`
Standalone stdio MCP server so Claude Desktop / Claude Code can query + write BBMP data. Run: `npm run mcp:start` (script in package.json). Deps added: `@modelcontextprotocol/sdk ^1.29.0`, `dotenv`; **zod upgraded 3.24.1 → ^3.25.0** (MCP SDK peer-dep needs the `zod/v3` subpath). Uses `createClient` with `SUPABASE_SERVICE_ROLE_KEY` directly (bypasses RLS — `lib/queries.ts` can't be imported because it's `server-only`). Diagnostics go to **stderr only** (stdout is the MCP wire protocol). Use `server.registerTool()` / `registerResource()` (the `.tool()`/`.resource()` overloads are deprecated). `inputSchema` is a **plain Zod shape object** `{ key: z.string() }`, not `z.object(...)`.

- **Read tools (10):** search_bbmp, get_ward, list_wards, get_complaint, list_complaints, get_rti, list_rtis, get_dashboard_stats, list_contacts, get_contact. **Resources (2):** `bbmp://corporations`, `bbmp://rti-deadlines`.
- **Write tools (6):** create_complaint, upload_document (fs.readFileSync → Supabase Storage), update_complaint_status, add_complaint_reply, **create_rti**, **generate_road_work_letter**. created_by = null (system).
- **GOTCHA fixed:** the `next_complaint_case_number` RPC param names are **`p_prefix` / `p_year`** (not `prefix`/`year`) — see `createComplaint` in `lib/actions/complaints.ts`.
- Registration for Claude Code lives in `.claude/settings.json` (`mcpServers.bbmp`) — the auto-mode classifier blocks the agent from writing that file, so the **user must create it manually** (content documented in `.env.example`). Claude Desktop config also in `.env.example`.

## AI road-work letter generator — RTI + complaint
Turns a short summary OR an uploaded work order into a legally-grounded BBMP road-work RTI application or complaint, then **review → edit → approve → creates the case**. Two separate web pages (`/rti/road-work`, `/complaints/road-work`) sharing one engine, plus the MCP `generate_road_work_letter` tool. Language toggle **English / Kannada** (Bilingual available via the draft panel's transform). User-confirmed decisions captured here.

- **`lib/ai/road-work-knowledge.ts`** (framework-free, no server-only — imported by BOTH web actions AND the MCP node process): encodes the user's full 60-point inspection framework as `ROAD_WORK_SECTIONS` A–I (KW-4 insurance, excavation/filling trip sheets, NGT/environment, mining royalty/MDP, dismantling/salvage, MB book, road thickness, geo-tag photos), bilingual En+Kn questions, `ROAD_WORK_LEGAL_BASIS`, `ROAD_WORK_CASE_LAW`, `ROAD_WORK_OFFICER_DUTIES`, a pre-assembled `ROAD_WORK_KNOWLEDGE_TEXT`, and `buildRoadWorkLetterPrompt({outputType,language,summary,workOrderExtract,wardName,jobNumber,roadName,contractor,scope})`.
- **Case-law safety rule (important):** the prompt instructs the model to cite ONLY from the verified `ROAD_WORK_CASE_LAW` list, never invent case numbers, and append "[verify citation before filing]" for entries flagged `verify:true` (Karnataka-HC PILs + Common Cause — the user was unsure of exact numbers).
- **`lib/ai/road-work-extractor.ts`** — `extractWorkOrder(ocrText)` structured extraction (job number/ward/road/contractor/dates/amount), mirrors `complaint-document-analyzer.ts`, env-gated.
- **`app/api/ocr/extract/route.ts`** — standalone in-memory OCR (`runOcr` from `lib/ocr/ocr-service`) + `extractWorkOrder`; **does NOT persist** (work order is attached to the complaint AFTER it's created). PDFs are OCR-skipped (v1 limitation).
- **`lib/actions/ai.ts`** — `generateRoadWorkLetter(input)` (maxTokens 4000); `gate(roles)` now parameterised (RTI vs complaint roles); `saveAiDraft` widened to RTI ∪ complaint writers.
- **`components/rti/ai-draft-panel.tsx`** — added optional `onApprove(finalText)` prop + "Approve & Create Case" button (reused, not forked).
- **`components/road-work/road-work-generator.tsx`** — shared client component; `onApprove` builds FormData and calls the **existing** `createRti` / `createComplaint` server actions (RTI: category "Road work", infoRequested=letter; complaint: type "Road", description=letter), then `saveAiDraft` linked to the new case; for complaints it also uploads the held work-order file to `/api/complaints/[id]/documents/upload`. RTI file-attach deferred (OCR text stored in internal_notes).
- "Road work" RTI category and "Road" complaint type already existed in `lib/constants.ts` — no schema change needed.

Verification: `npx tsc --noEmit` clean, `next lint` clean, 51 tests pass, MCP lists all 16 tools via a driven tools/list, both pages serve 200 + role-gate + nav links wired (browser preview, unauthenticated VIEWER sees "Not permitted" — correct).

## Four accountability features (2026-06-15, user said "build everything in one go")
Built sequentially, one commit each, all on the existing schema (no migration). Each: typecheck+lint+tests clean, browser-smoke-tested.

1. **Officer accountability** (`/officers`, `/officers/[id]`) — uses the existing `officer_transfers` table + contacts officer columns (role_level, reporting_officer_id, charge_type, current_posting_*, transfer_status) from migration 0003. Queries in `lib/queries.ts`: `listOfficers/getOfficer/listDirectReports` (return `OfficerRow = ContactWithRelations & { reporting_officer }` via self-join embed `contacts!reporting_officer_id`), `getOfficerScorecard` (complaints assigned via `.or(assigned_engineer_id.eq/assigned_officer_id.eq)`, open, overdue, RTIs by contact_id, transfers count), `listOfficerTransfers`. Action `lib/actions/officers.ts: addOfficerTransfer` (audit entityType "officer", updates current posting). Components in `components/officers/`. Hierarchy grouped by `ROLE_LEVELS`.
2. **Road-work reply analyzer + auto-escalation** (`/rti/road-work/analyze`) — `buildRoadWorkReplyAnalysisPrompt` (STRICT JSON: per-point Answered/Partial/Dodged/Denied/Not addressed + section + appeal ground; overall complete/missingSections/escalate) and `buildRoadWorkEscalationPrompt` (first appeal §19(1) for RTI, escalation complaint otherwise) in road-work-knowledge.ts. Actions `analyzeRoadWorkReply`, `generateRoadWorkEscalation` in lib/actions/ai.ts. Escalation drafted via reused AiDraftPanel from the deficient points.
3. **Bill / MB-book anomaly detector** (`/complaints/road-work/audit`) — `lib/ai/road-work-analyzer.ts: analyzeRoadWorkBill` (red flags vs framework, severity+section+evidence, framed as suspicions, never asserts fraud). Route `app/api/road-work/analyze-bill` (in-memory OCR via `runOcr` + audit, no persist). `document-auditor.tsx` → findings table → one-click draft+create complaint with file attached.
4. **Notifications + public tracking** — `getNotificationDigest()` (overdue RTIs via activeDeadline, overdue complaint follow-ups, due reminders) + `getPublicCaseStatus(id)` (sanitised) in queries.ts. Route `app/api/cron/notifications` (auth via `CRON_SECRET` header/`?secret=`; if `NOTIFY_WEBHOOK_URL` set, POSTs digest to Make.com for WhatsApp/SMS/email — pujya_sri pattern; else returns digest JSON). Public no-login `/track/[id]` status page (renders within app shell — dedicated minimal layout is a future polish; middleware only refreshes session, does NOT force redirect, so pages self-gate). New env: CRON_SECRET, NOTIFY_WEBHOOK_URL, SITE_URL.

**Gotchas learned:** `EmptyState` `icon` prop wants a component (`icon={Users}`), NOT JSX. `card.tsx` exports CardHeader/CardTitle/CardContent/CardDescription/CardFooter + CardSection. `next lint` (build-gating) only scans default dirs (app/components/lib/pages) — NOT `mcp/`; and `react/no-unescaped-entities` fires on apostrophes in JSX **text** (not in string props). RTI list/complaint tables navigate via row onClick (no anchor hrefs) so case UUIDs aren't scrapable from their HTML.
