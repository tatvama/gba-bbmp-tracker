---
name: bbmp-ui-preferences
description: "User's UI/UX preferences for the BBMP/GBA platform — minimal nav, professional, search-first, no non-English text"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ca27639e-1604-4b4f-bcbf-6fe772649db9
---

User's standing UI/UX direction for D:\Tatvam\BBMP (Next.js civic platform):

- **Keep the sidebar menu minimal.** User said "too much menu... make it simple". Nav is deliberately trimmed to 5 main links (Dashboard, Search, Wards, Corporations, Tree Map, Contacts) + 2 admin links pinned at the bottom (Import, Settings) — see `components/nav/nav-items.ts`. Pages Divisions, Sub-Divisions, Old BBMP Mapping, Complaints, Reports, Sources, Audit Logs still exist and are routable but are intentionally NOT in the nav. Don't re-add them to the sidebar without being asked.
- **Professional, fast, search-first.** Wants polished visuals, skeleton loaders for perceived speed, and easy searchability — global ⌘K command palette (`components/command-palette.tsx`) + `/search`.
- **No Kannada/Hindi/garbled text in the UI.** Hard rule. See [[bbmp-data-model-facts]] (name_kn cleared; Kannada originals only shown on hover/title tooltips, never as visible body text).

**Why:** these are repeated explicit asks, not one-offs. **How to apply:** when adding features, prefer one clean new nav entry over many; lead with search/visual clarity; keep all visible copy English.

The **Tree Map** page (`/explorer`) is the interactive treemap of the GBA hierarchy (Corporation → Division → Sub-division → Ward), drill-down by click, breadcrumb to zoom out — built dependency-free via `lib/treemap.ts` (squarified layout) + `components/explorer/treemap-explorer.tsx`, data from `getGbaTree()`.
