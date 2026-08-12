# Changelog

All notable changes to this project, newest first.

**This file is generated — do not edit it by hand.** It is rebuilt from the git
history by `scripts/update-changelog.ts`, which runs automatically after every
commit via `.githooks/post-commit`. Edits here are overwritten by the next
commit; change the commit message instead. See
[CHANGELOG_AUTOMATION.md](CHANGELOG_AUTOMATION.md).

Entries are grouped by date and derived from
[Conventional Commits](https://www.conventionalcommits.org/) subjects.

## 2026-08-12

### Features

- **db:** replace Supabase with our own PostgreSQL server

### Fixes

- **docker:** stop the `prepare` hook from failing `npm ci` in a container build

### Refactoring

- **db:** one source of truth for the database connection

## 2026-08-04

### Features

- **notifications:** Web Push to staff devices, and fix the cron digest running as anon
- **mobile:** installable PWA and Android TWA shell, distributed as a signed APK

### Fixes

- **changelog:** stop --check failing on every fresh checkout

### Scripts & tooling

- **changelog:** generate CHANGELOG.md from git history on every commit

### Documentation

- **memory:** record the Android TWA, Web Push and the canvas gotcha

## 2026-07-31

### Features

- **auth:** single email-or-phone login, plus existing-user management

### Fixes

- production stabilization sprint — memory leak, silent failures, audit gap, boot-migration guard
- **auth:** resolve phone login via profiles instead of Supabase's native phone auth

## 2026-07-27

### Features

- **mail:** add the letter View option to the Submit-step embedded panel too
- **mail:** show which stored letter a send will actually attach, with a view option
- **mail:** automatic overdue-alert digest to accountable officers
- **contacts:** import the GBA department/zone/oversight directory into contacts
- **mail:** recommend officers by the complaint's own division, ward, sub-division

### Fixes

- **mail:** trim manual letter-email kinds to ones with real document backing
- **contacts:** patch the ACS designation for real, widen an exact-match role, and make the import idempotent
- **jobs:** let a stuck email_send job actually be stopped
- **mail:** guard against sending the same letter email twice

### Other

- Clean up temporary testing overrides in case workflow components

## 2026-07-25

### Features

- **mail:** take the officer's designation dynamically too
- **mail:** choose recipients when the officer is not on record
- **mail:** email filed letters to the officer via Gmail SMTP

### Fixes

- **mail:** merge recipients by address — shared mailboxes crashed the picker
- **mail:** close the findings from the adversarial review
- **mail:** attach the letter being sent, not the newest one on the case
- **mail:** send over 587/STARTTLS — antivirus breaks Gmail's 465

### Data

- GBA/BBMP department officer directory (emails + addresses)

### Scripts & tooling

- render the department officer directory to an A4 PDF

## 2026-07-24

### Features

- add Assistant Revenue Officer, activate counter-reply and reminder letter for testing
- **complaints:** corporation-office address picker for zonal Copy-To recipients + Lokayukta updates

## 2026-07-23

### Features

- **complaints:** TVCC complaint copy — AI-drafted letter to a division's Technical Vigilance Cell

### Fixes

- **nav:** RTI case pages highlight All RTIs, not RTI Dashboard
- **rti:** correct status display in RTI Reports dashboard
- **security:** enable RLS on 10 public tables missing it (rls_disabled_in_public)

## 2026-07-21

### Features

- **complaints:** legal framework engine — cite applicable Acts/Rules/Sections in AI drafts

### Fixes

- **complaints:** resolve GBA ward complaints grouping in tree visualization

## 2026-07-20

### Features

- **complaints:** merge multi-page mobile uploads into one PDF + name files <job|case>_<type>
- **advisor:** English/Kannada language toggle for the AI Advisor (English base + cached translation)
- **complaints:** legal notice drafts as a PIL petition to the Chief Justice with a dynamic petitioner block

## 2026-07-18

### Features

- **contacts:** ward-matched drafting, directory filters, GBA authority recipients
- **contacts:** master directory — one-to-many ward jurisdictions + ARO import + AI officer-by-ward
- **complaints:** add Principal Secretary/Chief Secretary recipients + dynamic zone-based Commissioner
- **auth:** sign out sessions after 6 months of inactivity

## 2026-07-17

### Features

- **complaints:** add Select All toggle option to RecipientSelector checklist header
- **complaints:** remove manual Record escalation to dropdown and button from EscalatePanel
- **compliance:** Engineering Compliance Matrix + TVCC (Tier 2)
- **complaints:** recipient selection + automatic office copy (Tier 1)
- **intelligence:** deterministic Schedule-B quantity tables in letters
- **intelligence:** deterministic KW-4 Clause 13 insurance table in letters

### Fixes

- **letters:** remove the QR code from generated letter headers
- **jobs:** stop dispatchJob from breaking instrumentation.ts's bundle

## 2026-07-16

### Features

- **intelligence:** build Case Intelligence on upload so drafting reuses it
- **complaints:** add per-page EN/Kannada toggle to Case File + Evidence Dossier
- **dossier:** show Case Intelligence data on the Evidence Dossier page
- **intelligence:** comprehensive document-fact fields, per-doc caching, proactive rebuild
- **jobs:** make all background jobs cancellable with a styled 'Stop' button in Task Center
- **intelligence:** add Case Intelligence Engine for evidence-driven letter drafting
- **complaints:** replace complaint types with BBMP department taxonomy + AI classification

### Fixes

- **jobs:** dynamically import handlers inside dispatchJob to solve boot-time sweep registration race conditions
- **dossier:** auto-build Case Intelligence on view + single-flight the engine
- **forensics:** stop truncating cross-document audit output, use robust JSON parse
- **forensic:** persist combined OCR text on job_documents + backfill existing rows
- **migrate:** track applied migrations so npm run db:migrate never replays stale ones

### Tests

- **complaints:** force-activate Legal Notice letter button to support workflow testing

## 2026-07-14

### Features

- **i18n:** wire complaint detail page header (breadcrumb, actions, badges)
- **i18n:** wire Complaints & RTI modules for English <-> Kannada display

### Fixes

- **acknowledgments:** prevent text squishing and line wrapping of date string in batch row
- **build:** externalize sharp + puppeteer to reduce Docker build memory
- **acknowledgments:** optimize reviewed cards layout to hide forms and pickers in confirmed/skipped states
- **complaints:** source division/sub-division/ward filter options from the master hierarchy, not complaints
- **complaints,rti:** keep Ward Type as BBMP-225 only
- **complaints,rti:** switch Ward Type default to GBA for new records
- **complaints,rti:** restrict Ward Type to BBMP only, for now
- **complaints:** enforce strict division -> sub-division -> ward drill-down
- **complaints:** cascade sub-division & ward filters; show ward name with number

### UI & UX

- **nav:** remove Escalation Flow from complaints navigation menu items
- **complaints:** fix table header sticking behavior by allowing vertical overflow and sticking cells directly
- **nav:** pin sidebar collapse toggle button to a sticky bottom footer so it is always visible even with scrolling items
- **complaints:** include default soft shadow effects on workflow status and priority badges inside complaints table
- **complaints:** remove All Flags select dropdown from the complaints filter toolbar
- **complaints:** force all table headers to display with absolute bold font-black styling via explicit span wrappers
- **complaints:** set complaints page table headers and sort buttons to absolute maximum font-black weight for high contrast
- **complaints:** make complaints list table headers and sorting buttons bolder and more legible
- **complaints:** redesign table pagination controls to use premium chevron-equipped layouts and clean rounded-full page badges
- **acknowledgments:** brighten button hover transitions and increase opacity of secondary background colors for higher contrast
- **acknowledgments:** render Review & Match button as a filled primary action and colorize Delete/Stop button borders to look active
- **complaints:** include blinking status dot indicator inside complaints status badge component
- **acknowledgments:** standardize review cards default appearance and move selection highlights only to active states
- **acknowledgments:** expand upload workspace and history to take 100% full page width to prevent any card layout overlaps
- **acknowledgments:** widen details grid span and raise stacking breakpoint to 768px to prevent date metadata overlap
- **acknowledgments:** migrate history row card to a responsive CSS grid layout to prevent text and action button overflows on all viewports
- **acknowledgments:** premium UI/UX redesign with drag-and-drop animations, KPI metrics cards, and Vercel-like visual structures

### Other

- Revert "style(complaints): fix table header sticking behavior by allowing vertical overflow and sticking cells directly"

## 2026-07-13

### Features

- **i18n:** application-wide English <-> Kannada UI translation foundation
- **complaints:** match assigned officer, ack officer & contractor in table search
- **acknowledgments:** backfill complaint fields from the attached acknowledgment
- **bbmp-works:** multi-source work-registry search with verification + citations

### Fixes

- **complaints:** search placeholder now hints at officer/contractor search

## 2026-07-11

### Features

- **complaints:** allow correcting the acknowledgment date after the fact
- **acknowledgments:** skip fuzzy guessing on an untracked job code; attach on create
- **acknowledgments:** keep re-run matching available after a batch is attached
- **acknowledgments:** create complaint from an unmatched acknowledgment

## 2026-07-10

### Features

- **acknowledgments:** display dynamic matching count ratio in progress state
- **acknowledgments:** add "Clear Completed" button for batch history
- **ack:** skip already-acknowledged complaints (no duplicate re-processing)
- **acknowledgments:** add Stop and Delete action buttons to bulk upload batches
- **ack:** add "Re-run matching" for existing batches + match diagnostics

### Fixes

- acknowledgment pool always empty (selected a non-existent column)
- match acknowledgments whose AI-extracted job code uses a Unicode dash
- **pdf:** remove live cdnjs dependency from the Chromium PDF-render fallback

## 2026-07-09

### Features

- **import:** add individual pause and resume controls on active upload sessions

### Fixes

- acknowledgment job-code matching missing complaints at scale
- **import:** optimize upload queue cards layout for mobile viewports
- **dashboard:** resolve dark mode node styles and gba relation cache errors
- hold likely-duplicate ZIP uploads instead of uploading then rejecting
- stop mistyped job codes in scanned filenames from spawning phantom jobs
- early filename-based duplicate warning + import queue 50-session cap

## 2026-07-08

### Features

- implement centralized startup system, treemap visual hierarchy, layout fixes, and mobile bottom sheet
- treat Job Number as a primary identifier; add filename-matched acknowledgment attach

## 2026-07-07

### Features

- include submission date and channel in the case workflow submission step UI
- remove browser confirm popup alert for duplicate job uploads
- check for duplicate job numbers during forensic zip upload and show alert message
- application-wide frontend Task Registry for background jobs
- Anthropic prompt caching for Claude API calls

### Fixes

- stop OCR requesting OSD it has no data for (kills osd.traineddata log spam)
- rasterize PDFs in-process (pdfjs + @napi-rs/canvas) instead of launching Chromium
- collapse Chromium into a single process — memory-reduction flags alone didn't fix the deploy launch failure
- harden headless Chromium launch to reduce memory footprint + clearer errors
- surface duplicate job-number alert in the primary upload UI
- make Clear Completed survive navigating away mid-delete
- block re-upload of duplicate job numbers in ZIP import, show clear alert
- bound memory and isolate per-job failures in forensic ZIP analysis

### UI & UX

- fix dark mode styling for header buttons, date pickers, and mobile hierarchy explorer accordion

### Chores

- pre-production audit — remove dead IFMS/RTI/complaint code, fix silent failures, targeted perf fixes

## 2026-07-06

### Features

- use acknowledgmentDate to calculate fallback deadline and effective stage
- show remaining days countdown suffix directly inside button labels
- include specific remaining activation day count inside locked/waiting tooltips
- show specific activation days remaining in each button tooltip
- implement timeline-based communication action buttons with Radix tooltips
- use date input for acknowledgement date and remove AI drafts tab
- enterprise background-job framework + Global Task Center
- redirect new complaint button to upload zip/letter page
- redirect new complaint button and route directly to zip import
- no-reply escalation ladder (ack -> reminder -> legal notice -> escalation) + drag-drop config page
- redesign Complaint Timeline to modern three-column vertical layout
- move AI insights panel to render below the complaint title in desktop layout
- display AI insights panel as a row above the complaint title in desktop layout
- remove Mark ATR Received and Analyse buttons from complaint details page
- enable collapsed preview layout and modal popup for AI advisor in desktop mode
- AI single PDF multi-complaint extraction, settings page redesign, and layout polish

### Fixes

- delete completed/failed/cancelled import sessions permanently from the database when clear completed is clicked
- call onChange callback directly inside custom datepicker handlers to support React controlled inputs
- drop dead ?tab=ai links after the AI Drafts tab was removed
- escape JSX quote entities blocking production build

### UI & UX

- list reminder letters and legal notices under case workflow recent reply files
- remove Follow up after (days) field from submission form panel
- bind uploader and manual mark button to a single unified Acknowledgement Date field
- add back manual Mark acknowledged button inside the workflow step panel
- rename ScanCapture date to Acknowledgement date and remove redundant input/button fields
- remove overflow-hidden from CaseWorkflow card to fix calendar datepicker clipping
- align Counter Reply tooltip to start to prevent overflow
- remove extra absolute vertical line from history timeline page
- remove search field and decrease vertical spacing on timeline
- refine Complaint Timeline to 10/10 layout with badges and metadata
- tighten card spacing on settings and timeline pages
- fix status badge wrapping in complaints table
- refine Complaint Settings page with responsive layout width, 6 summary tiles, and aligned toggle rows
- redesign Complaint Settings page to premium enterprise UI
- unify mobile and desktop AI advisor layouts to display full inline view

### Refactoring

- simplify and format Counter Reply tooltips

### Other

- Revert "style: unify mobile and desktop AI advisor layouts to display full inline view"

## 2026-07-04

### Chores

- acknowledgment flow refinements + help panel; history/timeline, intake and queries tweaks

### Other

- Intake vision: raise token budget + salvage truncated Kannada JSON
- Intake vision: robust JSON parse, must-fill subject/summary, logging
- Ack flow: extract each section's fields via vision, not OCR text
- extract each detected letter's fields via vision, not OCR text
- Add bulk acknowledgment reconciliation + QR reference stamp on letters
- Scope duplicate-photo scan to division + 6-month window; thumbnails; auto-scan on photo upload
- Add per-document AI summaries + multi-complaint detection from one PDF
- Standardize document editing using enhanced LetterEditorModal globally
- Fix truncated AI letter drafts; add auto-save, dash-free output, full editor modal
- Stream live status into AI draft generation
- Inject dropdown selectors for Month and Year in the custom DatePicker header
- Replace native date input with custom styled calendar popover globally in Input component
- Auto-classify reply vs Action Taken Report uploads via AI, and add a rich case-history timeline
- Remove Document type select dropdown field from document scan capture form
- Highlight active step in timeline stepper as blue even if done
- Fix Kannada tofu boxes in server-side PDFs (counter-reply, escalation, RTI)
- Sleek and shortened card layout. Inspector drawer restricted to ward click triggers only.
- Redesign Complaint Dashboard into a premium enterprise analytics visualizer with curved trees, KPI summary cards, inspector panels, search filters, and legend controls
- Replace Complaints by Area visualizer with interactive vertical organizational tree visualizer

## 2026-07-03

### Features

- **ui:** redesign Upload ZIP / Letter page into premium enterprise document processing center
- **ui:** redesign Complaint Tracker page into premium enterprise operations workspace
- **ai:** Arabic numerals in all Kannada drafts, drop dead code, add Bilingual to one-click
- **ui/ux:** apply premium table shadow and gradient styling, adjust workflows
- **ui:** enterprise UI/UX modernization pass (Phase 1 + 1A)
- **advisor:** Kannada AI Advisor panel + ask-language-each-time drafting
- **ui:** add diagonal surface gradient and enhance hover contrast on data tables
- **ui:** premium enterprise UI/UX visual polish for buttons, inputs, cards, tables, loading loaders, and print layouts

### Fixes

- **ui:** remove duplicate old header block from Complaint Tracker page
- **advisor:** enforce Arabic numerals inside Kannada advisor text
- **ui:** split StatCardValue out of stat-card.tsx to fix RSC crash
- **advisor:** Kannada narrative was truncating to English fallback

### Other

- Fix ESLint unescaped entities errors in dashboard, rti table, and rti reports dashboard
- Enhance visual redesign, add progressive drill-down complaints explorer, fix table layouts, and update sidebar

## 2026-07-02

### Features

- **complaints:** Close step + complete the escalation-files wiring
- **complaints:** render uploaded/generated escalation documents directly inside EscalatePanel
- **complaints:** escalation filing + PDF-in-correspondence + stalled→RTI
- **complaints:** file a generated counter-reply as a PDF document
- **complaints:** render full-width AI summaries in Documents list and link source summaries inside Replies tab cards
- **advisor:** continuous full-correspondence decision engine
- **complaints:** render uploaded documents below the upload form inside CaseWorkflow step panels
- **complaints:** render existing uploaded documents inside Acknowledge and Reply step panels
- **complaints:** letter print queue starts the dispatch cycle
- **storage:** upload all complaint documents and evidence files to Cloudflare R2 instead of Supabase storage
- **complaints:** enforce sequential activation in CaseWorkflow headers
- **complaints:** auto-advance CaseWorkflow active step tab on status changes
- **complaints:** render live AI summary inside scan-capture upload card
- **import:** chunked resumable ZIP queue with live SSE progress, org treemap, simple dashboard, mobile scan capture
- **complaints:** AI Complaint Advisor — health scoring, recommendations, reminder/escalation workflow

### Fixes

- **deploy:** stop baking .env secrets into the Docker image
- **complaints:** advisor refresh, real PDF print, reply-step tick, recent-files refresh
- **advisor:** recover stuck 'Analysing…' — stale-lock reclaim + robust polling
- **complaints:** declare bucket in the upload-route response
- **complaints:** enable mark acknowledged button for filed complaints
- **wards:** escape apostrophe to unblock production build

### UI & UX

- **complaints:** allow AI summary cards to utilize the full available card width

### Chores

- **deploy:** harden Chromium resolution + document R2 env vars
- **complaints:** update R2 complaints deletion script to match job number and add complaints purge script
- **forensic-import:** add full complaint/job/R2 reset script
- **forensic-import:** add script to clear stale R2 document rows
- **forensic-import:** add R2 phantom-row diagnostic script

### Other

- 2nd july first commit

## 2026-07-01

### Features

- **dashboard:** action-oriented worklists + overdue list
- **complaints:** stage-by-stage lifecycle console + in-app document viewing
- **jobs:** background AI jobs, live running-indicator & alerts bell
- **letters:** no-placeholder, timeline-grounded AI + formatted print-ready preview

### Fixes

- **forensic-import:** surface per-file upload failures on the review screen
- **forensic-import:** R2-aware dedup+migrate, letter attach, dept auto-fill, alert
- **storage:** make R2 uploads & reads actually work
- **ui:** mobile-drawer width cap, header wrap on complaint/RTI detail, form grid

### Performance

- dedupe auth lookups, parallelize independent queries, lazy-load xlsx

### Refactoring

- **forensic-import:** R2-only storage; the ZIP is never persisted anywhere

### Chores

- deps, migrations & shared helpers for the complaint console
- RTI/complaints UI polish pass (header actions, tables, animation)

## 2026-06-30

### Features

- **complaints:** forensic ZIP import, RTI job-code link, dup-photo + systemic intelligence, ZIP-first menu
- **rti:** migrate all RTI document storage to Cloudflare R2

### Fixes

- **forensic-import:** drop 'Evidence index' from the review checklist
- **forensic-import:** match the real batch export layout + data/<code>.json shape
- **complaints:** remove 'New Complaint (manual)' from the sidebar menu
- **complaints:** replace 'Portal import' header button with unified Upload
- **r2:** store PDFs flat in letters/ using case reference name
- **docker:** increase Node.js heap to 4 GB for Next.js build

### Refactoring

- **complaints:** ZIP-first menu, unified ZIP/letter upload, remove portal import, auto division dup-scan

### Other

- 30th June 2nd commit
- 30th June 1st commit

## 2026-06-29

### Features

- **rti:** import multi-letter office-copy PDF as multiple RTI cases
- **complaints:** BBMP IFMS portal import + AI complaint lifecycle

### Fixes

- **deploy:** use correct PUPPETEER_SKIP_DOWNLOAD env var (puppeteer v25)
- **deploy:** add Dockerfile to fix npm ci failure on Coolify

### Other

- 29june final commit
- 29th june 5th commit
- 29june 4th commit
- 29 july commit 3
- 29June commit

## 2026-06-26

### Other

- 26th june 2026 commit

## 2026-06-25

### Other

- 25th june 2026 commit

## 2026-06-24

### Other

- worked on complaint related ward details and ocr functionality

## 2026-06-18

### Fixes

- **ui:** button asChild breaks Slot — pass children directly when asChild=true

## 2026-06-17

### Features

- **ui:** professional component redesign — shimmer, loading states, sidebar
- **wizard:** 180-question BBMP road audit & draft wizard
- per-finding triage + consolidated job-level PIL dossier
- **ux:** saved-draft reopen, audit-run history, deep-links, source-doc links
- **risk:** cross-job pattern detection + contractor forensic profile + digest
- **forensics:** wire dead engines into the audit + fix deduction/threshold bugs
- **mcp:** expose job-audit + Kannada letter drafting as Claude/MCP tools
- **letters:** job-audit dashboard + safety-gated letter drafter UI (Step 10)
- **letters:** DOCX export + download API route (Step 9)
- **letters:** AI letter-builder + action layer with safe-language gate (Step 8)
- **letters:** pure letter-drafting engine (Step 7 of forensic letter module)
- **job-audit:** orchestration action + paged SR loader (step 6)
- **job-audit:** AI extractors — transcription only, env-gated (step 5)
- **job-audit:** pure orchestrator runJobAudit (step 4)
- **job-audit:** pure deterministic forensic engines (step 3)
- **job-audit:** foundation — types, rule constants, date/GST helpers, migrations
- statistical fraud analytics + material balance + GIS overlap (bill engine 2/2)
- forensic bill-audit engine — structured extraction + deterministic rules + SR rate book (1/2)
- contractor risk score + red-flags dashboard + PIL evidence dossier (forensics 4/4)
- cross-document bill & rate forensics (forensics 3/4)
- vision-AI photo verification + GPS geofence + map (forensics 1/2)

### Fixes

- **job-audit:** surface extraction coverage, single-source risk band, itemize loss
- **security:** lock down forensic RLS, scope draft downloads, gate export on lint

### Documentation

- document Phase 4 hardening round (README + Claude memory)
- document Phase 4 forensic audit + letter module (README + Claude memory)
- add forensics suite note to checked-in Claude memory

### Other

- perf+test: kill jobs-page N+1, cache SR book, cap DOCX rows, cover the glue

## 2026-06-16

### Features

- duplicate-photo detection across job numbers (anti-fraud)

### Documentation

- add photo-dedupe note to checked-in Claude memory

## 2026-06-15

### Features

- scheduled notification digest + public case-tracking page
- bill / MB-book red-flag audit (anomaly detector)
- road-work reply analyzer + auto-escalation drafting
- officer accountability — hierarchy, transfers, scorecard
- AI road-work letter generator (RTI + complaint) with approve→create
- **mcp:** add write tools — create complaint, upload doc, update status, add reply

### Documentation

- surface Claude memory in README (top callout + Project Memory section)
- check in Claude memory notes (.claude/memory)

## 2026-06-14

### Features

- add MCP server for Claude tool integration

### Other

- Initial commit: GBA-BBMP Ward & Engineer Tracker (Phase 1 + 2 + 3)
