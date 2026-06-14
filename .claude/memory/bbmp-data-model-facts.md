---
name: bbmp-data-model-facts
description: "Verified facts about BBMP ward seed data — counts, AC→corporation derivation rule, relationships"
metadata: 
  node_type: memory
  type: project
  originSessionId: ca27639e-1604-4b4f-bcbf-6fe772649db9
---

Verified facts from `data/*.json` (D:\Tatvam\BBMP), checked 2026-06-14:

- **bbmp225_wards.json**: 225 wards, fields: new_no, new_name, property_count, zone, ac, division, old_subdiv, eng_subdiv, eng_subdiv_sl, old_wards[]. 12 wards have empty `old_wards` (scan-ambiguous — flag, don't fill).
- **30 divisions**, **75 engineering sub-divisions** (sl_no 1–75 unique). Each eng_subdiv is in exactly ONE division; each division's wards derive exactly ONE corporation (clean, no conflicts).
- **gba_structure.json**: 5 corporations (KENDRA/PURVA/PASHCHIMA/UTTARA/DAKSHINA), wards sum 369, divisions 50, subdivisions 150. `ward_list` empty. `name_kn` had mojibake — NOW CLEARED from DB + display (user dislikes any Kannada/garbled text in UI).
- **engineers_seed.json**: 4 unverified contacts keyed by eng_subdiv (Hegganahalli, Shanthi Nagar, Domlur, Banasavadi). All seed with verificationStatus=PENDING, confidence=LOW.

**PDF verification (2026-06-14, against official scanned PDFs in user's Downloads):**
- Tooling: PDFs are scanned (no text layer). Use `pip install pymupdf` → render pages to PNG (300 DPI), rotate −90° with PIL (tables are landscape), crop columns, then read visually. `pdftotext` returns empty.
- **BBMP 225 Ward List.pdf** = Annexure-1, already ENGLISH. Verified all 225 via per-sub-division subtotal checksums (PDF prints 75 subtotals; compare to JSON group sums). One real fix: **ward 222 Ibluru property_count 9556 → 9566** (fixed in JSON + DB). A few PDF printed subtotals are ±1 off their own components (source typos) — JSON keeps component sums, left as-is.
- **GBA 5-Corp PDF** = Annexures 1-5, scanned KANNADA. Translated all 369 ward + 50 division + 150 sub-division names to English → `data/gba_369_wards.json` (built by `scripts/build_gba_369.ts`, which validates counts per corp). Page→annexure order is scrambled: Kendra pp.3-4, Uttara pp.5-7, Pashchima pp.8-11, Dakshina pp.12-14, Purva pp.15-16. Note: AC 161 (Kendra) splits into TWO divisions (Indiranagar + Jeevan Bhimanagar); AC 173 (Dakshina) splits into Jayanagar + J.P.Nagar. 44 ward names were only partly legible → `legible=false` flag (UI shows ⓘ + Kannada on hover). GBA wards are the same localities as BBMP-225, renumbered 1..N per corporation.

**New table `public.gba_wards`** (migration `0002_gba_wards.sql`): corporation_code, annexure, division, assembly_constituency, subdivision, ward_no, ward_name_en, ward_name_kn, legible. Public read + role-gated writes (same RLS model). Seeded by `scripts/seed-gba.ts` (`npm run db:seed-gba`; also in `db:reset`). Query `getGbaStructure(code)` in lib/queries groups → division→subdivision→wards. Rendered on `/corporations/[code]` via `components/corporations/gba-structure.tsx`; also searchable (globalSearch `gbaWards`).

**AC→corporation derivation rule (critical):** match by AC NUMERIC PREFIX, not full string. 5 wards carry combined AC `"176-Bengaluru South & 177-Anekal"` — match 176→DAKSHINA (177-Anekal is outside the 5 GBA corps). This makes all 225 map to exactly one corp, 0 unmapped (satisfies §9 test). Store a provenance note on those 5 wards so the normalization is transparent. derivedCorporationId is ALWAYS UI-labelled "derived from constituency".

Derived corp ward counts: PASHCHIMA 83, KENDRA 44, DAKSHINA 41, UTTARA 35, PURVA 22.

Never fabricate ward mappings, GBA ward names, or contacts — missing stays missing and flagged. See [[bbmp-stack-override]].
