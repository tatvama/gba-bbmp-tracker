"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Home, List } from "lucide-react";
import { squarify } from "@/lib/treemap";
import { COMPLAINT_OPEN_STATUSES } from "@/lib/constants";

/**
 * Complaints-by-organisation treemap: Division → Sub-division → Ward.
 * Tile area = number of complaints (All or Active). Click a tile to drill
 * down; click a ward (or "Open this list") to jump to the complaints list
 * pre-filtered to that slice. Pure HTML tiles laid out with the shared
 * squarify() — no chart dependency.
 */

export interface OrgTreemapRow {
  division: string | null;
  subDivision: string | null;
  wardNo: number | null;
  wardName: string | null;
  status: string;
}

type Mode = "all" | "active";
const OPEN = new Set<string>(COMPLAINT_OPEN_STATUSES);
const UNASSIGNED = "(unassigned)";

interface Group {
  key: string;
  label: string;
  count: number;
  isUnassigned: boolean;
  wardNo: number | null;
}

function groupRows(
  rows: OrgTreemapRow[],
  level: "division" | "subDivision" | "ward",
): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    let key: string;
    let label: string;
    let wardNo: number | null = null;
    if (level === "division") {
      key = r.division ?? UNASSIGNED;
      label = key;
    } else if (level === "subDivision") {
      key = r.subDivision ?? UNASSIGNED;
      label = key;
    } else {
      key = r.wardNo != null ? String(r.wardNo) : UNASSIGNED;
      label = r.wardNo != null ? `W${r.wardNo}${r.wardName ? ` · ${r.wardName}` : ""}` : UNASSIGNED;
      wardNo = r.wardNo;
    }
    const g = map.get(key) ?? { key, label, count: 0, isUnassigned: key === UNASSIGNED, wardNo };
    g.count += 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Indigo ramp — deeper = more complaints. Readable in light and dark. */
function tileColor(t: number): { bg: string; fg: string } {
  const light = 82 - Math.round(t * 40); // 82% → 42%
  return { bg: `hsl(238 62% ${light}%)`, fg: light < 60 ? "#fff" : "#1e293b" };
}

export function OrgTreemap({ rows, className }: { rows: OrgTreemapRow[]; className?: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("all");
  const [division, setDivision] = React.useState<string | null>(null);
  const [subDivision, setSubDivision] = React.useState<string | null>(null);

  const scoped = React.useMemo(() => {
    let r = rows;
    if (mode === "active") r = r.filter((x) => OPEN.has(x.status));
    if (division) r = r.filter((x) => (x.division ?? UNASSIGNED) === division);
    if (subDivision) r = r.filter((x) => (x.subDivision ?? UNASSIGNED) === subDivision);
    return r;
  }, [rows, mode, division, subDivision]);

  const level: "division" | "subDivision" | "ward" = !division ? "division" : !subDivision ? "subDivision" : "ward";
  const groups = React.useMemo(() => groupRows(scoped, level), [scoped, level]);
  const total = scoped.length;
  const max = groups[0]?.count ?? 1;

  const tiles = React.useMemo(
    () => squarify(groups.map((g) => ({ item: g, value: g.count })), { x: 0, y: 0, w: 100, h: 100 }),
    [groups],
  );

  const listHref = React.useCallback(
    (opts: { division?: string | null; subDivision?: string | null; ward?: number | null }) => {
      const p = new URLSearchParams();
      if (opts.division && opts.division !== UNASSIGNED) p.set("division", opts.division);
      if (opts.subDivision && opts.subDivision !== UNASSIGNED) p.set("subDivision", opts.subDivision);
      if (opts.ward != null) p.set("ward", String(opts.ward));
      if (mode === "active") p.set("flag", "open");
      const qs = p.toString();
      return qs ? `/complaints?${qs}` : "/complaints";
    },
    [mode],
  );

  const onTileClick = (g: Group) => {
    if (level === "division") {
      if (g.isUnassigned) router.push(listHref({}));
      else setDivision(g.key);
    } else if (level === "subDivision") {
      if (g.isUnassigned) router.push(listHref({ division }));
      else setSubDivision(g.key);
    } else {
      router.push(listHref({ division, subDivision, ward: g.wardNo }));
    }
  };

  return (
    <div className={className}>
      {/* breadcrumb + mode toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => {
              setDivision(null);
              setSubDivision(null);
            }}
            className={`flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${!division ? "text-slate-800 dark:text-slate-200" : ""}`}
          >
            <Home className="h-3.5 w-3.5" /> Divisions
          </button>
          {division && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
              <button
                type="button"
                onClick={() => setSubDivision(null)}
                className={`truncate rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${!subDivision ? "text-slate-800 dark:text-slate-200" : ""}`}
              >
                {division}
              </button>
            </>
          )}
          {subDivision && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
              <span className="truncate rounded-md px-1.5 py-1 text-slate-800 dark:text-slate-200">{subDivision}</span>
            </>
          )}
        </nav>

        <button
          type="button"
          onClick={() => router.push(listHref({ division, subDivision }))}
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-primary/40 hover:text-primary dark:border-slate-700 dark:text-slate-400"
        >
          <List className="h-3 w-3" /> Open this list ({total})
        </button>

        <div className="flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-bold dark:border-slate-700">
          {(["all", "active"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {m === "all" ? "All" : "Active"}
            </button>
          ))}
        </div>
      </div>

      {/* tiles */}
      <div className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40 sm:h-80">
        {tiles.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            {mode === "active" ? "No active complaints here." : "No complaints yet."}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {tiles.map(({ item: g, x, y, w, h }) => {
              const { bg, fg } = g.isUnassigned
                ? { bg: "hsl(215 15% 88%)", fg: "#475569" }
                : tileColor(g.count / max);
              const big = w > 14 && h > 12;
              return (
                <motion.button
                  key={`${level}:${g.key}:${mode}`}
                  type="button"
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.22 }}
                  onClick={() => onTileClick(g)}
                  title={`${g.label} — ${g.count} complaint${g.count === 1 ? "" : "s"}${level !== "ward" ? " · click to drill down" : " · click to open the list"}`}
                  className="group absolute overflow-hidden rounded-md text-left ring-inset transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${w}%`,
                    height: `${h}%`,
                    backgroundColor: bg,
                    color: fg,
                    boxShadow: "inset 0 0 0 2px rgba(255,255,255,.55)",
                  }}
                >
                  <span className={`block px-1.5 pt-1 font-bold leading-tight ${big ? "text-xs" : "text-[9px]"} line-clamp-2`}>
                    {g.label}
                  </span>
                  <span className={`block px-1.5 ${big ? "text-lg" : "text-[10px]"} font-extrabold tabular-nums`}>
                    {g.count}
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        Tile size = complaint count{mode === "active" ? " (open cases only)" : ""}. Click a division, then a
        sub-division, then a ward to open the filtered list.
      </p>
    </div>
  );
}
