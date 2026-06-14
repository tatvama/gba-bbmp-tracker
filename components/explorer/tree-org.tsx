"use client";

import * as React from "react";
import { Info, MapPin, Building2, Network, Wrench, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { CORP_TINT } from "@/lib/constants";
import type { GbaTreeCorp } from "@/lib/queries";

/* ── colour helpers ────────────────────────────────────────────── */
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toRgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── svg curved connector ───────────────────────────────────────── */
interface NodePos { x: number; yTop: number; yBot: number }
interface SvgLine { d: string; color: string; glow?: boolean }

function makeCurve({ x: x1, yBot }: NodePos, { x: x2, yTop }: NodePos): string {
  const mid = (yBot + yTop) / 2;
  return `M ${x1} ${yBot} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${yTop}`;
}

/* ── node card ─────────────────────────────────────────────────── */
interface NodeCardProps {
  label: string;
  sublabel?: string;
  count?: number;
  countUnit?: string;
  tint: string;
  active?: boolean;
  hovered?: boolean;
  onClick?: () => void;
  onHover?: (v: boolean) => void;
  nodeRef?: React.RefCallback<HTMLButtonElement>;
  size?: "root" | "lg" | "md" | "sm";
  className?: string;
}

function NodeCard({
  label, sublabel, count, countUnit, tint,
  active, hovered, onClick, onHover, nodeRef, size = "md", className,
}: NodeCardProps) {
  const lifted = active || hovered;
  const boxShadow = active
    ? `0 8px 28px ${toRgba(tint, 0.4)}, 0 0 0 2px ${tint}`
    : hovered
    ? `0 4px 16px ${toRgba(tint, 0.25)}, 0 0 0 1.5px ${toRgba(tint, 0.6)}`
    : `0 1px 4px rgba(0,0,0,0.08), 0 0 0 1.5px ${toRgba(tint, 0.25)}`;

  const bg = active
    ? tint
    : `${toRgba(tint, hovered ? 0.12 : 0.07)}`;

  const textColor = active ? "#fff" : tint;
  const dimColor = active ? "rgba(255,255,255,0.65)" : toRgba(tint, 0.6);

  const padding = size === "root" ? "px-10 py-5" : size === "lg" ? "px-6 py-4" : size === "md" ? "px-4 py-3" : "px-3 py-2";
  const gap = size === "sm" ? "gap-0.5" : "gap-1";

  return (
    <button
      ref={nodeRef}
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      disabled={!onClick}
      className={cn(
        "flex flex-col items-center rounded-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2",
        gap, padding, !onClick && "cursor-default",
        className,
      )}
      style={{
        backgroundColor: bg,
        boxShadow,
        color: textColor,
        transform: lifted ? "translateY(-3px) scale(1.02)" : undefined,
      }}
    >
      {count !== undefined && (
        <span
          className={cn("font-black tabular-nums leading-none", size === "root" ? "text-4xl" : size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base")}
          style={{ textShadow: active ? "0 1px 4px rgba(0,0,0,0.25)" : undefined }}
        >
          {count}
        </span>
      )}
      {countUnit && (
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: dimColor }}>
          {countUnit}
        </span>
      )}
      <span
        className={cn(
          "text-center font-semibold leading-tight",
          size === "root" ? "text-sm" : size === "lg" ? "text-[13px]" : size === "md" ? "text-[12px]" : "text-[11px]",
        )}
        style={{ maxWidth: size === "sm" ? 110 : 150 }}
      >
        {label}
      </span>
      {sublabel && (
        <span className="text-[10px] text-center leading-tight" style={{ color: dimColor, maxWidth: 140 }}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

/* ── mode toggle ─────────────────────────────────────────────────── */
type Mode = "gba" | "bbmp";

interface ModeToggleProps {
  mode: Mode;
  onChange: (m: Mode) => void;
  gbaTotal: number;
  bbmpTotal: number;
}

function ModeToggle({ mode, onChange, gbaTotal, bbmpTotal }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 self-start rounded-xl border bg-muted/40 p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("gba")}
        className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
          mode === "gba"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="hidden sm:inline">GBA</span>
        <span className={cn(
          "inline-flex h-5 min-w-[2.4rem] items-center justify-center rounded-md px-1.5 text-[10px] font-black tabular-nums",
          mode === "gba" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
        )}>
          {gbaTotal}
        </span>
        <span className="hidden sm:inline">wards</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("bbmp")}
        className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
          mode === "bbmp"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="hidden sm:inline">BBMP</span>
        <span className={cn(
          "inline-flex h-5 min-w-[2.4rem] items-center justify-center rounded-md px-1.5 text-[10px] font-black tabular-nums",
          mode === "bbmp" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
        )}>
          {bbmpTotal}
        </span>
        <span className="hidden sm:inline">wards</span>
      </button>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────── */
export function TreeOrg({ gbaCorps, bbmpCorps }: { gbaCorps: GbaTreeCorp[]; bbmpCorps: GbaTreeCorp[] }) {
  const [mode, setMode]           = React.useState<Mode>("gba");
  const [activeCorp, setActiveCorp] = React.useState<string | null>(null);
  const [activeDiv,  setActiveDiv]  = React.useState<string | null>(null);
  const [activeSub,  setActiveSub]  = React.useState<string | null>(null);
  const [hoverId,    setHoverId]    = React.useState<string | null>(null);
  const [lines,      setLines]      = React.useState<SvgLine[]>([]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const nodeMap = React.useRef<Record<string, HTMLElement | null>>({});

  const corps = mode === "gba" ? gbaCorps : bbmpCorps;
  const corp = corps.find(c => c.code === activeCorp) ?? null;
  const div  = corp?.divisions.find(d => d.name === activeDiv) ?? null;
  const sub  = div?.subdivisions.find(s => s.name === activeSub) ?? null;

  const gbaTotal  = gbaCorps.reduce((s, c) => s + c.wardCount, 0);
  const bbmpTotal = bbmpCorps.reduce((s, c) => s + c.wardCount, 0);

  function switchMode(m: Mode) {
    setMode(m);
    setActiveCorp(null);
    setActiveDiv(null);
    setActiveSub(null);
    setLines([]);
  }

  /* Force line recompute on container resize */
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick(t => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Generic typed ref callback */
  function reg<T extends HTMLElement>(id: string): React.RefCallback<T> {
    return (el: T | null) => {
      nodeMap.current[id] = el;
    };
  }

  /* Compute SVG connector lines after every render */
  React.useEffect(() => {
    const cnt = containerRef.current;
    if (!cnt) return;
    const cr = cnt.getBoundingClientRect();

    const pos = (id: string): NodePos | null => {
      const el = nodeMap.current[id];
      if (!el) return null;
      const er = el.getBoundingClientRect();
      return { x: er.left - cr.left + er.width / 2, yTop: er.top - cr.top, yBot: er.top - cr.top + er.height };
    };

    const next: SvgLine[] = [];
    const rootPos = pos("root");

    /* root → corps */
    if (rootPos) {
      for (const c of corps) {
        const p = pos(`corp-${c.code}`);
        if (p) next.push({ d: makeCurve(rootPos, p), color: CORP_TINT[c.code] ?? "#888", glow: activeCorp === c.code });
      }
    }

    /* corp → divs */
    if (corp && activeCorp) {
      const pp = pos(`corp-${activeCorp}`);
      if (pp) {
        for (const d of corp.divisions) {
          const p = pos(`div-${d.name}`);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp] ?? "#888", glow: activeDiv === d.name });
        }
      }
    }

    /* div → subs */
    if (div && activeDiv) {
      const pp = pos(`div-${activeDiv}`);
      if (pp) {
        for (const s of div.subdivisions) {
          const p = pos(`sub-${s.name}`);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp!] ?? "#888", glow: activeSub === s.name });
        }
      }
    }

    /* sub → wards */
    if (sub && activeSub) {
      const pp = pos(`sub-${activeSub}`);
      if (pp) {
        for (const w of sub.wards) {
          const p = pos(`ward-${w.no}`);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp!] ?? "#888" });
        }
      }
    }

    setLines(prev =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCorp, activeDiv, activeSub, corps]);

  /* Navigation */
  const nav = {
    corp(code: string) {
      if (activeCorp === code) { setActiveCorp(null); setActiveDiv(null); setActiveSub(null); }
      else { setActiveCorp(code); setActiveDiv(null); setActiveSub(null); }
    },
    div(name: string) {
      if (activeDiv === name) { setActiveDiv(null); setActiveSub(null); }
      else { setActiveDiv(name); setActiveSub(null); }
    },
    sub(name: string) {
      setActiveSub(prev => prev === name ? null : name);
    },
  };

  /* root node labels per mode */
  const rootLabel = mode === "gba"
    ? { title: "Greater Bengaluru Authority", count: gbaTotal, meta: `${corps.length} corporations · ${corps.reduce((s,c)=>s+c.divisionCount,0)} divisions` }
    : { title: "BBMP — Bruhat Bengaluru Mahanagara Palike", count: bbmpTotal, meta: `${corps.length} corporations · ${corps.reduce((s,c)=>s+c.divisionCount,0)} divisions` };

  return (
    <div className="space-y-3">
      {/* top bar: toggle + hint */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModeToggle mode={mode} onChange={switchMode} gbaTotal={gbaTotal} bbmpTotal={bbmpTotal} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-primary" />Click a corporation → divisions</span>
          <span className="flex items-center gap-1.5"><Network className="h-3.5 w-3.5 text-teal" />Click a division → sub-divisions</span>
          <span className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-muted-foreground/70" />Click a sub-division → wards</span>
        </div>
      </div>

      {/* tree canvas */}
      <div
        ref={containerRef}
        className="relative overflow-auto rounded-2xl border bg-card shadow-sm"
        style={{ minHeight: 480 }}
      >
        {/* SVG connector overlay */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible"
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        >
          {lines.filter(l => l.glow).map((l, i) => (
            <path key={`glow-${i}`} d={l.d} fill="none" stroke={l.color} strokeWidth={6} strokeOpacity={0.12} />
          ))}
          {lines.map((l, i) => (
            <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={l.glow ? 2 : 1.5} strokeOpacity={l.glow ? 0.6 : 0.3} />
          ))}
        </svg>

        {/* nodes */}
        <div className="relative flex flex-col items-center gap-12 px-6 py-10" style={{ zIndex: 1 }}>

          {/* ── Root node ── */}
          <div ref={reg<HTMLDivElement>("root")} className="flex flex-col items-center gap-1.5 rounded-2xl bg-primary px-10 py-5 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/65">
              {rootLabel.title}
            </span>
            <span className="text-4xl font-black tabular-nums leading-none text-primary-foreground">
              {rootLabel.count}
            </span>
            <span className="text-[11px] font-semibold text-primary-foreground/70">
              wards · {rootLabel.meta}
            </span>
          </div>

          {/* ── Corporation nodes ── */}
          <div className="flex flex-wrap justify-center gap-4">
            {corps.map(c => (
              <NodeCard
                key={c.code}
                nodeRef={reg(`corp-${c.code}`)}
                label={c.name}
                sublabel={`${c.divisionCount} div · ${c.subdivisionCount} sub-div`}
                count={c.wardCount}
                countUnit="wards"
                tint={CORP_TINT[c.code] ?? "#888"}
                active={activeCorp === c.code}
                hovered={hoverId === `corp-${c.code}`}
                onClick={() => nav.corp(c.code)}
                onHover={v => setHoverId(v ? `corp-${c.code}` : null)}
                size="lg"
              />
            ))}
          </div>

          {/* ── Division nodes ── */}
          {corp && (
            <div className="flex flex-wrap justify-center gap-3" style={{ animationName: "tileEnter", animationDuration: "0.35s", animationFillMode: "backwards" }}>
              {corp.divisions.map(d => (
                <NodeCard
                  key={d.name}
                  nodeRef={reg(`div-${d.name}`)}
                  label={d.name}
                  sublabel={`${d.subdivisions.length} sub-div`}
                  count={d.wardCount}
                  countUnit="wards"
                  tint={CORP_TINT[activeCorp!] ?? "#888"}
                  active={activeDiv === d.name}
                  hovered={hoverId === `div-${d.name}`}
                  onClick={() => nav.div(d.name)}
                  onHover={v => setHoverId(v ? `div-${d.name}` : null)}
                  size="md"
                />
              ))}
            </div>
          )}

          {/* ── Sub-division nodes ── */}
          {div && (
            <div className="flex flex-wrap justify-center gap-2" style={{ animationName: "tileEnter", animationDuration: "0.35s", animationFillMode: "backwards" }}>
              {div.subdivisions.map(s => (
                <NodeCard
                  key={s.name}
                  nodeRef={reg(`sub-${s.name}`)}
                  label={s.name}
                  count={s.wardCount}
                  countUnit="wards"
                  tint={CORP_TINT[activeCorp!] ?? "#888"}
                  active={activeSub === s.name}
                  hovered={hoverId === `sub-${s.name}`}
                  onClick={() => nav.sub(s.name)}
                  onHover={v => setHoverId(v ? `sub-${s.name}` : null)}
                  size="sm"
                />
              ))}
            </div>
          )}

          {/* ── Ward chips ── */}
          {sub && (
            <div className="flex flex-wrap justify-center gap-1.5" style={{ animationName: "tileEnter", animationDuration: "0.35s", animationFillMode: "backwards" }}>
              {sub.wards.map(w => {
                const tint = CORP_TINT[activeCorp!] ?? "#888";
                return (
                  <div
                    key={w.no}
                    ref={reg<HTMLDivElement>(`ward-${w.no}`)}
                    title={w.extra ? `Previous wards: ${w.extra}` : w.kn ?? undefined}
                    className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all duration-150 hover:shadow-md cursor-default"
                    style={{
                      borderColor: toRgba(tint, 0.25),
                      backgroundColor: toRgba(tint, 0.06),
                    }}
                  >
                    <span
                      className="flex h-[18px] min-w-[1.4rem] items-center justify-center rounded-md px-1 text-[9px] font-black text-white"
                      style={{ backgroundColor: tint }}
                    >
                      {w.no}
                    </span>
                    <span className="text-xs font-medium text-foreground">{w.name}</span>
                    {mode === "bbmp" && w.extra && (
                      <span title={`Previous wards: ${w.extra}`}>
                        <History className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                      </span>
                    )}
                    {mode === "gba" && !w.legible && (
                      <span title="Romanisation uncertain — scanned source was only partly legible">
                        <Info className="h-3 w-3 shrink-0 text-amber-500" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* provenance */}
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
        {mode === "gba"
          ? <>GBA · Romanised from GBA memo Annexures 1–5 (scanned Kannada). Wards marked <Info className="mx-0.5 inline h-3 w-3 text-amber-dark" /> were only partly legible.</>
          : <>BBMP-225 · Official ward list from BBMP delimitation notification. <History className="mx-0.5 inline h-3 w-3 text-muted-foreground/60" /> icon indicates wards that absorbed old 198-ward areas — hover for details.</>
        }
      </p>
    </div>
  );
}
