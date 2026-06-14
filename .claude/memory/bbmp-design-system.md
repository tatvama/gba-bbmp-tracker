---
name: bbmp-design-system
description: "Full design system rework (2026-06-14): CSS, button, card, badge, table, input, tabs, sidebar — all primitives updated"
metadata: 
  node_type: memory
  type: project
  originSessionId: 761903a7-c435-4ef5-beab-2b7d5a6a81db
---

Complete design system overhaul done on 2026-06-14, touching every shared UI primitive. The app uses Tailwind + shadcn/ui; all changes are in the component files + globals.css — do NOT reinvent these when editing UI.

**Why:** User requested "rework in detail CSS, Button, Card, Typography, Data table" for a more professional civic-editorial look.

**How to apply:** Read the components before editing any UI — the variant names, spacing, and conventions below are now the ground truth.

---

## `app/globals.css`
- Shadow system via CSS custom properties: `--shadow-xs` through `--shadow-xl` (HSL-based, not box-shadow literals)
- Typography base: `text-[15px]` body, `.heading-*` classes, `.label-*` for uppercase-tracking labels
- Data tables: `.data-table thead th { sticky top-0 z-10 bg-card; border-bottom: 2px solid }`, `tbody tr:hover { bg-primary/[0.04] }`
- Utility classes: `.sort-btn`, `.banner-*`, `.detail-section`, `.icon-btn`, `.divider-label`, `.timeline-dot`
- Animations: `fadeIn`, `slideInRight`, `pulse-subtle`

## `tailwind.config.ts`
- Custom spacing: `13: "3.25rem"` (for `h-13` topnav height)
- Custom shadows: `xs/sm/md/lg/xl` all map to `var(--shadow-*)` from globals.css

## `components/ui/button.tsx` (CVA)
- Default height: `h-9`; icon sizes auto-sized per size via `[&_svg]:size-*`
- New variants: `teal` (bg-accent), `amber`
- New sizes: `xl`, `icon-sm` (h-7 w-7)
- All buttons: `active:scale-[0.97]` micro-interaction
- Shadow progression: `shadow-sm` default → `hover:shadow-md`

## `components/ui/card.tsx`
- `rounded-xl` (was rounded-lg), padding `px-5 py-4`
- New `elevated` boolean prop → `shadow-md hover:shadow-lg transition-shadow`
- New `CardSection` sub-component: `border-t px-5 py-4`

## `components/ui/badge.tsx`
- Renders as `<span>` (not `<div>`)
- 10 variants: `default`, `secondary`, `destructive`, `outline`, `muted`, `success`, `warning`, `info`, `critical`, `primary-subtle`, `teal-solid`
- All use `rounded-full`, `text-[11px]`, `gap-1` for optional icon

## `components/ui/table.tsx`
- Outer wrapper `div` is now INSIDE the `Table` component itself: `rounded-xl border shadow-sm overflow-auto`
- **Do NOT wrap `<Table>` in another border div** — that creates double borders. This was fixed in complaint-table, rti-table, ward-table by removing their old `<div className="rounded-lg border">` wrappers.
- `TableHead`: `text-[11px] uppercase tracking-wider`, `h-10`, `bg-muted/50` on `TableHeader`
- `TableCell`: `px-3 py-2.5`

## `components/ui/input.tsx`
- `h-9`, `placeholder:text-muted-foreground/60`, `read-only:bg-muted/50`, `ring-offset-1`

## `components/ui/tabs.tsx`
- New `variant` prop: `"pill"` (default, bg-muted rounded) | `"line"` (border-bottom active indicator)
- Both `TabsList` and `TabsTrigger` accept the `variant` prop

## `components/ui/select.tsx`
- `ring-offset-1`, `zoom-in-95` animation on content, primary checkmark, `data-[highlighted]` styling

## `components/nav/sidebar.tsx`
- Active items: `bg-primary/10 font-semibold text-primary rounded-lg` + right-side dot indicator (`h-1.5 w-1.5 rounded-full bg-primary`)
- No more left border indicator (was `border-l-2`)
- Section dividers: `<div className="border-t" />` (no text)

## `components/nav/topnav.tsx`
- Height: `h-13` (3.25rem)
- Mobile button: `icon-sm` size, `h-7 w-7` brand logo

## `app/layout.tsx`
- Sidebar: `w-56`; main content: `top-13 h-[calc(100vh-3.25rem)]`; `xl:px-10` main

## `components/page-header.tsx`
- New `badge` prop (renders a Badge next to the title)
- `font-bold` on h1, `flex-wrap` on actions div

## `components/detail-row.tsx`
- New `compact` prop (reduces padding)
- New `DetailGrid` helper: `<DetailGrid cols={2|3}>` renders a responsive `<dl>` grid

## `components/empty-state.tsx`
- Icon wrapped in `bg-muted` box; new `compact` prop; `rounded-xl`

## `components/complaints/complaint-table.tsx` + `components/rti/rti-table.tsx`
- Native `<select>` elements use shared `selectCls` string matching new input styling
- No outer border div wrapper (Table owns its own border)
- Case number cell: `whitespace-nowrap` so `DM-CMP-2026-900001` doesn't wrap
