---
name: bbmp-forensics
description: "Advanced forensics suite — vision-AI photo check, GPS geofence + map, bill cross-doc forensics, contractor risk + PIL dossier"
metadata: 
  node_type: memory
  type: project
  originSessionId: 761903a7-c435-4ef5-beab-2b7d5a6a81db
---

Built 2026-06-17 (commits 08bc69b, 2a47b6c, 8b503cc). Four advanced forensics features on top of [[bbmp-photo-dedupe]] + [[bbmp-mcp-and-road-work]]. All cautious/evidence-based ("indicators for human verification, not proof"). **Migration 0006 must be run by the user** (`npm run db:migrate`) — the agent is blocked from migrating the live DB.

## Migration 0006 (`supabase/migrations/0006_forensics.sql`)
`complaints.contractor` (+index); `complaint_documents`: vision_verdict, vision_json jsonb, vision_checked_at, geo_flag, geo_distance_m; `app_settings.forensics_rules` (geofenceMaxMeters 300). Types added to ComplaintDocument + Complaint.contractor in lib/types.ts.

## 1. Vision-AI photo verification
- `lib/ai/provider.ts` **`generateVision({system,prompt,images:[{mediaType,dataBase64}]})`** — Anthropic multimodal (image blocks + text). Vision wired only for anthropic.
- `lib/ai/photo-vision.ts` `analyzePhotoVision(buffer,mime,context)` → {imageKind, showsClaimedWork, tamperSigns, verdict(ok|suspect|mismatch|not_site_photo), ...}. Env-gated; only image/jpeg|png|webp|gif.
- Route `app/api/complaints/documents/[documentId]/vision/route.ts` (admin download + analyze + store vision_verdict/json). "Verify image" button + verdict badge in `document-list.tsx`.

## 2. GPS geofence + map
- `lib/geo.ts` `haversineMeters` + `geofencePhoto(photoLat,lon,refLat,lon,maxM)` → flag ok|far|no_gps|no_reference. Framework-free.
- Upload route now fetches the complaint's lat/lon, geofences the photo's EXIF GPS, stores geo_flag/geo_distance_m. "GPS off-site" badge in doc list. (No ward GeoJSON needed — uses the complaint's own reported lat/lon.)
- Map: `components/map/forensic-map.tsx` (client, **leaflet** dep, dynamic `import("leaflet")` inside useEffect to avoid SSR window error, CircleMarkers so no marker-icon assets, `import "leaflet/dist/leaflet.css"`). `getForensicMapPoints()` query. Page `/complaints/map`. Off-site photos red. Settings `getForensicsRules()`.

## 3. Bill & cross-document forensics
- `lib/ai/bill-forensics.ts` `analyzeBillForensics({documents:[{type,ocrText}],context})` → {crossChecks[], findings[], redFlagCount}. Recomputes arithmetic, reconciles MB↔bill↔WO↔trip-sheet, flags missing royalty/insurance/tests vs the road-work framework. JSON, temp 0.
- `lib/actions/forensics.ts` `runBillForensics(complaintId)` gathers the case's OCR'd docs (ocr_clean_text). `components/complaints/bill-forensics.tsx` + page `/complaints/[id]/forensics`. "Forensic audit" button on the case detail (COMPLAINT_VERIFY_ROLES).

## 4. Contractor risk + red-flags + PIL dossier
- `getContractorRisk()` (queries.ts) — aggregates per-contractor: complaints, overdue, duplicatePhotos, visionFlags, offSitePhotos → weighted `score` (dup×5 + vision×4 + offSite×4 + overdue×1); + global RedFlagSummary. Defensive `.or(...)` (returns [] pre-migration). Page `/complaints/risk`.
- Evidence dossier `/complaints/[id]/dossier` — printable forensic packet: case identity, accountable division officers (`getDivisionResponsibleOfficers`), evidence manifest with each doc's **SHA-256 (chain-of-custody)** + dup/vision/geo flags. "Dossier" button on case detail. Reuses PrintButton (print-to-PDF = the bundle; ZIP is a future enhancement).
- `contractor` field captured in complaint-form + road-work generator approve path; validators `complaintSchema.contractor` + complaints `toRow`.

## Gotchas reused
- `eslint-disable @typescript-eslint/no-explicit-any` is an ERROR in `lib/`+`components/` (rule not loaded under next/core-web-vitals) → don't use it; type leaflet map as `import("leaflet").Map | null`. `noUncheckedIndexedAccess` ON. Internal links = `next/link`. exifr/leaflet are real deps.

Nav added under complaints: Complaint Map, Risk & Red Flags (Duplicate Photos already there). Verified: typecheck 0, lint 0, 60 tests, all new routes serve 200 (defensive pre-migration). Pushed to GitHub main (8b503cc).
