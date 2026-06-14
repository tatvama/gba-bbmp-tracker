---
name: bbmp-phase2-rti
description: "Phase 2 RTI module — built; decisions, schema, and the remaining module roadmap"
metadata: 
  node_type: memory
  type: project
  originSessionId: 761903a7-c435-4ef5-beab-2b7d5a6a81db
---

Phase 2 ("RTI, Complaint, Engineer & Follow-up portal") is being built **module-by-module** on top of the Supabase-native stack ([[bbmp-stack-override]]). As of 2026-06-14 the **RTI module is complete and verified** (typecheck/lint/tests green; migrate+seed run; dashboard/list/wizard/detail/appeals/analyzer/reports/settings all render).

**Key decisions (confirmed with user):**
- One comprehensive migration `supabase/migrations/0003_phase2.sql` creates **all** Phase 2 tables up front (rti_applications, rti_first_appeals, rti_second_appeals, hearings, officer_transfers, reminders, follow_up_actions, communication_logs, escalation_logs, attachments, ai_drafts, templates, verification_logs, app_settings) so later slices add only code.
- **Officers = extend `contacts`** (added role_level, reporting_officer_id, charge_type, posting dates, public_visible) + `officer_transfers` table. NOT a separate officers table.
- **AI = Anthropic default**, env-gated wrapper `lib/ai/provider.ts` (+ `prompts.ts`); works with no key ("AI not configured" fallback). Keys only in env. Never auto-files.
- **RLS:** core RTI records (applications + appeals) are **public-read** (civic transparency, like complaints); reminders/comms/escalations/ai_drafts/attachments/hearings are auth-read; internal_notes UI-gated by role.
- New roles added to `profiles.role` + can_write/can_verify: RTI_MANAGER, COMPLAINT_MANAGER, FIELD_OFFICER (+ role groupings in `lib/constants.ts`).
- Deadline engine is pure in `lib/rti-deadlines.ts` (30d/48h/30d/90d, FAA 30→45), **configurable** via `app_settings.rti_deadline_rules` (admin edits at /rti/settings).

**Remaining Phase 2 slices (schema already exists):** complaints enrichment + escalation ladder; officer hierarchy view + transfers + officer reports; reminders/follow-ups + comms logs + master dashboard + ICS; AI for complaints/follow-ups + full template-management admin; attachments (Supabase Storage) + DOCX export + expanded-role UI + global-search extension.

Note: `D:\Tatvam\CLAUDE.md` auto-update rules (CHANGELOG, KUNDLI-V4 memory path) belong to the unrelated **pujya_sri** PHP project — do NOT apply them to BBMP.
