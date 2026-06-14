"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  Home,
  Network,
  Wrench,
  Building2,
  MapPin,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CORP_TINT } from "@/lib/constants";
import { squarify } from "@/lib/treemap";
import type {
  GbaTreeCorp,
  GbaTreeDiv,
  GbaTreeSub,
} from "@/lib/queries";

/* ── colour helpers (no extra deps) ─────────────────────────── */
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + amt)},${Math.min(255, g + amt)},${Math.min(255, b + amt)})`;
}
function darken(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amt)},${Math.max(0, g - amt)},${Math.max(0, b - amt)})`;
}
function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── level model ──────────────────────────────────────────────── */
type Level =
  | { kind: "root" }
  | { kind: "corp"; corp: GbaTreeCorp }
  | { kind: "div"; corp: GbaTreeCorp; div: GbaTreeDiv }
  | { kind: "sub"; corp: GbaTreeCorp; div: GbaTreeDiv; sub: GbaTreeSub };

interface Cell {
  key: string;
  label: string;
  detail?: string;
  count: number;
  countUnit: string;
  tint: string;
  next?: Level;
  wardNo?: number;
  legible?: boolean;
}

function buildCells(level: Level, corps: GbaTreeCorp[]): Cell[] {
  if (level.kind === "root") {
    return corps.map((c) => ({
      key: c.code,
      label: c.name,
      detail: `${c.divisionCount} div · ${c.subdivisionCount} sub-div`,
      count: c.wardCount,
      countUnit: "wards",
      tint: CORP_TINT[c.code] ?? "#8A8478",
      next: { kind: "corp" as const, corp: c },
    }));
  }
  if (level.kind === "corp") {
    const tint = CORP_TINT[level.corp.code] ?? "#8A8478";
    return level.corp.divisions.map((div) => ({
      key: div.name,
      label: div.name,
      detail: div.ac ?? undefined,
      count: div.wardCount,
      countUnit: "wards",
      tint,
      next: { kind: "div" as const, corp: level.corp, div },
    }));
  }
  if (level.kind === "div") {
    const tint = CORP_TINT[level.corp.code] ?? "#8A8478";
    return level.div.subdivisions.map((sub) => ({
      key: sub.name,
      label: sub.name,
      count: sub.wardCount,
      countUnit: "wards",
      tint,
      next: { kind: "sub" as const, corp: level.corp, div: level.div, sub },
    }));
  }
  const tint = CORP_TINT[level.corp.code] ?? "#8A8478";
  return level.sub.wards.map((w) => ({
    key: String(w.no),
    label: w.name,
    count: 1,
    countUnit: "",
    tint,
    wardNo: w.no,
    legible: w.legible,
  }));
}

/* ── tooltip state ───────────────────────────────────────────── */
interface TooltipState {
  cell: Cell;
  x: number;
  y: number;
  above: boolean;
}

/* ── main component ──────────────────────────────────────────── */
export function TreemapExplorer({ corps }: { corps: GbaTreeCorp[] }) {
  const [level, setLevel] = React.useState<Level>({ kind: "root" });
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [hoverKey, setHoverKey] = React.useState<string | null>(null);
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);
  const [animKey, setAnimKey] = React.useState(0);
  const canvasRef = React.useRef<HTMLDivElement>(null);

  /* measure canvas */
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function navigate(to: Level) {
    setHoverKey(null);
    setTooltip(null);
    setLevel(to);
    setAnimKey((k) => k + 1);
  }

  function back() {
    if (level.kind === "sub") navigate({ kind: "div", corp: level.corp, div: level.div });
    else if (level.kind === "div") navigate({ kind: "corp", corp: level.corp });
    else if (level.kind === "corp") navigate({ kind: "root" });
  }

  const cells = buildCells(level, corps);
  const tiles = size
    ? squarify(
        cells.map((c) => ({ item: c, value: Math.max(c.count, 1) })),
        { x: 0, y: 0, w: size.w, h: size.h },
      )
    : [];

  /* breadcrumb */
  type CrumbIcon = React.ComponentType<{ className?: string }>;
  const crumbs: { label: string; level: Level; Icon: CrumbIcon }[] = [
    { label: "All corporations", level: { kind: "root" }, Icon: Home },
  ];
  if (level.kind !== "root")
    crumbs.push({ label: level.corp.name, level: { kind: "corp", corp: level.corp }, Icon: Building2 });
  if (level.kind === "div" || level.kind === "sub")
    crumbs.push({ label: level.div.name, level: { kind: "div", corp: level.corp, div: level.div }, Icon: Network });
  if (level.kind === "sub")
    crumbs.push({ label: level.sub.name, level: level as Level, Icon: Wrench });

  const isLeaf = level.kind === "sub";
  const corpTint = level.kind !== "root" ? (CORP_TINT[level.corp.code] ?? "#8A8478") : null;
  const levelLabel = { root: "Corporation", corp: "Division", div: "Sub-division", sub: "Ward" }[level.kind];

  /* tooltip show/hide */
  function showTooltip(e: React.MouseEvent<HTMLButtonElement>, c: Cell) {
    const canvas = canvasRef.current?.getBoundingClientRect();
    const tile = e.currentTarget.getBoundingClientRect();
    if (!canvas || !size) return;
    const tooltipW = 230;
    const tileRelX = tile.left - canvas.left;
    const tileRelY = tile.top - canvas.top;
    const above = tileRelY > 110;
    const rawX = tileRelX + tile.width / 2 - tooltipW / 2;
    const x = Math.max(6, Math.min(rawX, size.w - tooltipW - 6));
    const y = above ? tileRelY - 8 : tileRelY + tile.height + 8;
    setTooltip({ cell: c, x, y, above });
  }

  return (
    <div className="space-y-3">

      {/* ── header card ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        {/* breadcrumb */}
        <nav className="flex min-w-0 flex-1 flex-wrap items-center" aria-label="Breadcrumb">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                )}
                <button
                  type="button"
                  onClick={() => navigate(c.level)}
                  disabled={isLast}
                  className={cn(
                    "inline-flex max-w-[38vw] items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-sm transition-colors",
                    isLast
                      ? "pointer-events-none font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <c.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{c.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={back}
            disabled={level.kind === "root"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
              level.kind !== "root"
                ? "cursor-pointer bg-card text-foreground hover:bg-muted"
                : "cursor-not-allowed opacity-35",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          {level.kind !== "root" && (
            <Link
              href={`/corporations/${level.corp.code}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Corp. page
            </Link>
          )}
        </div>
      </div>

      {/* ── canvas ───────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="relative h-[clamp(420px,65vh,700px)] w-full overflow-hidden rounded-2xl border border-white/5 shadow-2xl"
        style={{ background: "linear-gradient(160deg, #0f1117 0%, #161b27 100%)" }}
      >
        {/* corporation accent line */}
        {corpTint && (
          <div
            className="absolute inset-x-0 top-0 z-30 h-[3px]"
            style={{
              background: `linear-gradient(90deg, ${corpTint}, ${lighten(corpTint, 50)}, ${corpTint})`,
            }}
          />
        )}

        {/* level badge */}
        <div className="absolute left-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/60 backdrop-blur-sm">
          {levelLabel} · {cells.length}
        </div>

        {!size && (
          <div className="absolute inset-0 grid place-items-center text-sm text-white/30">
            Preparing…
          </div>
        )}

        {/* tiles */}
        {size && (
          <div key={animKey} className="absolute inset-0">
            {tiles.map((t, idx) => {
              const c = t.item;
              const drillable = !!c.next;
              const isHover = hoverKey === c.key;
              const W = Math.max(t.w - 3, 0);
              const H = Math.max(t.h - 3, 0);

              /* size thresholds */
              const showBigCount = W > 72 && H > 56 && !isLeaf;
              const showLabel    = W > 40 && H > 30;
              const showDetail   = c.detail && W > 110 && H > 70;
              const showWardNo   = c.wardNo !== undefined && W > 40 && H > 28;

              /* gradient */
              const grad = `linear-gradient(145deg, ${lighten(c.tint, 28)} 0%, ${c.tint} 50%, ${darken(c.tint, 22)} 100%)`;

              /* hover glow */
              const glowShadow = isHover && drillable
                ? `0 0 0 2px ${lighten(c.tint, 40)}, 0 12px 40px ${rgba(c.tint, 0.55)}`
                : `inset 0 0 0 1px rgba(255,255,255,0.07)`;

              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={drillable ? () => navigate(c.next!) : undefined}
                  onMouseEnter={(e) => { setHoverKey(c.key); showTooltip(e, c); }}
                  onMouseLeave={() => { setHoverKey(null); setTooltip(null); }}
                  className={cn(
                    "group absolute rounded-xl outline-none transition-[box-shadow,transform] duration-200",
                    drillable ? "cursor-pointer" : "cursor-default",
                    isHover && drillable && "z-20 scale-[1.018]",
                  )}
                  style={{
                    left: t.x + 1.5,
                    top: t.y + 1.5,
                    width: W,
                    height: H,
                    background: grad,
                    boxShadow: glowShadow,
                    animationName: "tileEnter",
                    animationDuration: "0.45s",
                    animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                    animationDelay: `${Math.min(idx * 28, 320)}ms`,
                    animationFillMode: "backwards",
                  }}
                >
                  {/* light overlay */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-xl"
                    style={{
                      background:
                        "linear-gradient(170deg,rgba(255,255,255,0.15) 0%,transparent 45%,rgba(0,0,0,0.35) 100%)",
                    }}
                  />

                  {/* ward number badge */}
                  {showWardNo && (
                    <span
                      className="absolute left-2 top-2 flex h-5 min-w-[1.35rem] items-center justify-center rounded-md px-1 text-[10px] font-bold tabular-nums text-white/90"
                      style={{ background: "rgba(0,0,0,0.35)" }}
                    >
                      {c.wardNo}
                    </span>
                  )}

                  {/* big count number */}
                  {showBigCount && (
                    <span className="absolute left-2.5 top-2.5 flex flex-col">
                      <span
                        className="font-black tabular-nums leading-none text-white"
                        style={{
                          fontSize: Math.max(18, Math.min(42, Math.sqrt(W * H) / 5.5)),
                          textShadow: "0 2px 8px rgba(0,0,0,0.45)",
                        }}
                      >
                        {c.count}
                      </span>
                      {H > 80 && (
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                          {c.countUnit}
                        </span>
                      )}
                    </span>
                  )}

                  {/* drill chevron */}
                  {drillable && isHover && W > 52 && H > 36 && (
                    <span
                      className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ background: "rgba(255,255,255,0.22)" }}
                    >
                      <ChevronRight className="h-3 w-3 text-white" />
                    </span>
                  )}

                  {/* legible flag */}
                  {c.legible === false && W > 36 && H > 28 && (
                    <span className="absolute right-2 top-2">
                      <Info className="h-3.5 w-3.5 text-amber-300/80" />
                    </span>
                  )}

                  {/* bottom label */}
                  {showLabel && (
                    <span
                      className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl px-2.5 pb-2 pt-6"
                      style={{
                        background:
                          "linear-gradient(0deg,rgba(0,0,0,0.62) 0%,transparent 100%)",
                      }}
                    >
                      <span
                        className="block truncate font-semibold leading-tight text-white"
                        style={{
                          fontSize: Math.max(11, Math.min(15, W / 13)),
                          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                        }}
                      >
                        {c.label}
                      </span>
                      {showDetail && (
                        <span className="mt-0.5 block truncate text-[10px] font-medium text-white/65">
                          {c.detail}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* floating tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-50 w-[230px] overflow-hidden rounded-xl border border-white/15 shadow-2xl"
            style={{
              left: tooltip.x,
              top: tooltip.above ? undefined : tooltip.y,
              bottom: tooltip.above ? (size ? size.h - tooltip.y : undefined) : undefined,
              background: "rgba(10,14,23,0.88)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
          >
            {/* corp accent stripe */}
            {corpTint && (
              <div
                className="h-[2px] w-full"
                style={{ background: `linear-gradient(90deg, ${corpTint}, ${lighten(corpTint, 40)})` }}
              />
            )}
            {!corpTint && tooltip.cell.tint && (
              <div
                className="h-[2px] w-full"
                style={{
                  background: `linear-gradient(90deg, ${tooltip.cell.tint}, ${lighten(tooltip.cell.tint, 40)})`,
                }}
              />
            )}
            <div className="px-3.5 py-3">
              <p className="font-semibold leading-snug text-white" style={{ fontSize: 13 }}>
                {tooltip.cell.label}
              </p>
              {tooltip.cell.wardNo !== undefined && (
                <p className="mt-0.5 text-[11px] text-white/50">Ward #{tooltip.cell.wardNo}</p>
              )}
              {tooltip.cell.count > 1 && (
                <p className="mt-1.5 text-[12px] font-bold text-white/80">
                  {tooltip.cell.count}{" "}
                  <span className="font-normal text-white/50">{tooltip.cell.countUnit}</span>
                </p>
              )}
              {tooltip.cell.detail && (
                <p className="mt-0.5 text-[11px] text-white/50">{tooltip.cell.detail}</p>
              )}
              {tooltip.cell.next && (
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                  Click to explore →
                </p>
              )}
              {tooltip.cell.legible === false && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-300/75">
                  <Info className="h-3 w-3 shrink-0" />
                  Romanisation uncertain
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── corporation switcher ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Jump to:
        </span>
        {corps.map((c) => {
          const active = level.kind !== "root" && level.corp.code === c.code;
          const tint = CORP_TINT[c.code] ?? "#8A8478";
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => navigate({ kind: "corp", corp: c })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                active
                  ? "border-transparent text-white shadow-sm"
                  : "border-border bg-card text-foreground/70 hover:bg-muted hover:text-foreground",
              )}
              style={active ? { backgroundColor: tint } : undefined}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: active ? "rgba(255,255,255,0.65)" : tint }}
              />
              {c.name}
              <span
                className={cn(
                  "tabular-nums text-[10px]",
                  active ? "text-white/65" : "text-muted-foreground",
                )}
              >
                {c.wardCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* provenance */}
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
        Romanised from the GBA memo (Annexures 1–5, scanned Kannada source). Wards marked{" "}
        <Info className="mx-0.5 inline h-3 w-3 text-amber-dark" /> were only partly legible —
        hover for the Kannada original.
      </p>
    </div>
  );
}
