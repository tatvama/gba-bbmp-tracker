# Memory Index

- [BBMP stack override](bbmp-stack-override.md) — uses Supabase-native + Supabase Auth, NOT Prisma/local PG as the BUILD_PROMPT said
- [BBMP data model facts](bbmp-data-model-facts.md) — seed counts, AC→corp derivation, PDF verification (ward 222 fix), GBA 369-ward Kannada→English (gba_wards table), how to OCR the scanned PDFs
- [BBMP UI preferences](bbmp-ui-preferences.md) — minimal nav (5+2 links), professional/search-first/⌘K, no Kannada in UI; Tree Map (/explorer) interactive treemap
- [BBMP Phase 2 RTI](bbmp-phase2-rti.md) — RTI module built (migration 0003, deadline engine, AI wrapper, /rti/*); decisions + remaining slice roadmap
- [BBMP Phase 3 Complaints](bbmp-phase3-complaints.md) — complaint mgmt built (migration 0004, case numbers, OCR sharp+tesseract, AI extraction, Storage buckets, /complaints/*); soft-delete + service-role write pattern
- [BBMP Design System](bbmp-design-system.md) — full CSS/component rework (2026-06-14): button/card/badge/table/input/tabs/sidebar primitives; Table owns its border (no wrapper divs); shadow system via CSS vars
- [BBMP MCP + Road-Work generator](bbmp-mcp-and-road-work.md) — stdio MCP server (10 read + 6 write tools, 2 resources; zod→3.25; p_prefix/p_year RPC gotcha); AI road-work RTI/complaint letter generator; PLUS 4 accountability features (2026-06-15): officer hierarchy/scorecard/transfers (/officers), road-work reply analyzer + auto-escalation (/rti/road-work/analyze), bill/MB anomaly detector (/complaints/road-work/audit), notification cron (/api/cron/notifications) + public /track/[id]
- **GitHub repo:** [https://github.com/tatvama/gba-bbmp-tracker](https://github.com/tatvama/gba-bbmp-tracker) — private, all 3 phases + MCP + road-work generator, pushed 2026-06-15
