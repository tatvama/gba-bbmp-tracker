"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Info,
  MapPin,
  Building2,
  Building,
  Network,
  Wrench,
  History,
  Search,
  ChevronRight,
  ChevronDown,
  FileText,
  Clock,
  AlertOctagon,
  CheckCircle2,
  MapPinned,
  Navigation,
  HardHat,
  UserRound,
  CircleAlert,
  BadgeCheck,
  CircleX,
  Clock3,
  LoaderCircle,
  X,
  Download,
  Eye,
  ZoomIn,
  ZoomOut,
  HelpCircle,
  ShieldAlert,
  Activity,
  FileCode
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CORP_TINT } from "@/lib/constants";
import type { GbaTreeCorp } from "@/lib/queries";
import type { ComplaintWithRelations } from "@/lib/types";

export interface OrgTreemapRow {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  corporation: string | null;
  division: string | null;
  subDivision: string | null;
  wardNo: number | null;
  wardName: string | null;
  status: string;
  priority?: string;
  overdue?: boolean;
  zone?: string | null;
}

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
  icon?: React.ComponentType<any>;
  progress?: number;
  isExpanded?: boolean;
  onToggleExpand?: (e: React.MouseEvent) => void;
  isMatched?: boolean;
}

function NodeCard({
  label, sublabel, count, countUnit, tint,
  active, hovered, onClick, onHover, nodeRef, size = "md", className,
  icon: Icon, progress, isExpanded, onToggleExpand, isMatched
}: NodeCardProps) {
  const lifted = active || hovered;
  
  const boxShadow = active
    ? `0 0 0 3px rgba(37,99,235,.15), 0 4px 12px ${toRgba(tint, 0.15)}`
    : isMatched
    ? `0 0 0 3px rgba(245,158,11,.2), 0 4px 12px ${toRgba(tint, 0.1)}`
    : hovered
    ? `0 2px 8px ${toRgba(tint, 0.15)}, 0 0 0 1px ${toRgba(tint, 0.5)}`
    : `0 1px 3px rgba(0,0,0,0.04), 0 0 0 1.5px ${toRgba(tint, 0.15)}`;

  const bg = active
    ? "#ffffff"
    : isMatched
    ? "#fffdf5"
    : `${toRgba(tint, hovered ? 0.06 : 0.03)}`;

  const borderStyle = active
    ? "1.5px solid #2563EB"
    : isMatched
    ? "1.5px solid #F59E0B"
    : hovered
    ? `1px solid ${toRgba(tint, 0.7)}`
    : `1px solid ${toRgba(tint, 0.25)}`;

  return (
    <button
      ref={nodeRef}
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        "flex flex-col rounded-xl transition-all duration-200 focus-visible:outline-none select-none cursor-pointer text-left",
        size === "lg" ? "w-[190px] p-3" : size === "md" ? "w-[160px] p-2.5" : "w-[140px] p-2",
        className
      )}
      style={{
        backgroundColor: bg,
        boxShadow,
        border: borderStyle,
        transform: lifted ? "translateY(-2px) scale(1.01)" : undefined,
      }}
    >
      <div className="flex items-center justify-between w-full gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5 text-slate-500">
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tint }} />}
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              {countUnit || "node"}
            </span>
          </div>
          <h4 className="font-extrabold text-slate-800 leading-tight truncate text-xs">
            {label}
          </h4>
        </div>

        {count !== undefined && (
          <span className="text-sm font-black tabular-nums leading-none ml-1.5 shrink-0 text-slate-700">
            {count}
          </span>
        )}
      </div>

      {progress !== undefined && (
        <div className="w-full mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {sublabel && (
        <p className="text-[9px] text-slate-450 font-bold mt-1.5 truncate w-full border-t pt-1.5 border-slate-150">
          {sublabel}
        </p>
      )}

      {onToggleExpand && (
        <div 
          onClick={onToggleExpand}
          className="flex items-center gap-0.5 text-[8.5px] font-bold text-slate-400 hover:text-primary transition-colors cursor-pointer mt-2 leading-none w-full justify-end border-t pt-1.5 border-slate-50"
        >
          {isExpanded ? <ChevronDown className="h-2.5 w-2.5 shrink-0" /> : <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
          <span>{isExpanded ? "Collapse" : "Expand"}</span>
        </div>
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
    <div className="flex items-center gap-1 self-start rounded-xl border bg-muted/40 p-1 shadow-2xs">
      <button
        type="button"
        onClick={() => onChange("gba")}
        className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-extrabold transition-all duration-200 cursor-pointer",
          mode === "gba"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span>GBA</span>
        <span className={cn(
          "inline-flex h-5 min-w-[2.2rem] items-center justify-center rounded-md px-1.5 text-[9px] font-black tabular-nums",
          mode === "gba" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
        )}>
          {gbaTotal}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("bbmp")}
        className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-extrabold transition-all duration-200 cursor-pointer",
          mode === "bbmp"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span>BBMP</span>
        <span className={cn(
          "inline-flex h-5 min-w-[2.2rem] items-center justify-center rounded-md px-1.5 text-[9px] font-black tabular-nums",
          mode === "bbmp" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
        )}>
          {bbmpTotal}
        </span>
      </button>
    </div>
  );
}

/* ── 7-level tree structures ────────────────────────────────────── */
interface AggregatedOfficer {
  id: string;
  type: "officer";
  label: string;
  designation: string;
  status: string;
  complaintsCount: number;
  complaintsList: any[];
}

interface AggregatedEngineer {
  id: string;
  type: "engineer";
  label: string;
  designation: string;
  complaintsCount: number;
  complaintsList: any[];
  children: AggregatedOfficer[];
}

interface AggregatedWard {
  id: string;
  no: number;
  name: string;
  kn: string | null;
  legible: boolean;
  extra?: string;
  type: "ward";
  label: string;
  complaintCount: number;
  activeCount: number;
  overdueCount: number;
  closedCount: number;
  complaintsList: any[];
  children: AggregatedEngineer[];
}

interface AggregatedSub {
  id: string;
  name: string;
  wardCount: number;
  type: "subdivision";
  label: string;
  complaintCount: number;
  activeCount: number;
  overdueCount: number;
  closedCount: number;
  children: AggregatedWard[];
}

interface AggregatedDiv {
  name: string;
  ac: string | null;
  wardCount: number;
  id: string;
  type: "division";
  label: string;
  complaintCount: number;
  activeCount: number;
  overdueCount: number;
  closedCount: number;
  children: AggregatedSub[];
}

interface AggregatedCorp {
  code: string;
  name: string;
  wardCount: number;
  divisionCount: number;
  subdivisionCount: number;
  id: string;
  type: "corporation";
  label: string;
  complaintCount: number;
  activeCount: number;
  overdueCount: number;
  closedCount: number;
  children: AggregatedDiv[];
}

function buildDetailedTree(
  tree: GbaTreeCorp[],
  complaints: ComplaintWithRelations[],
  isGba: boolean
): AggregatedCorp[] {
  const today = new Date().toISOString().slice(0, 10);
  
  // Filter complaints for GBA or BBMP
  const filtered = complaints.filter(c => 
    isGba ? (c.ward_type === "GBA" || !!c.gba_ward_id) : (c.ward_type !== "GBA" && !c.gba_ward_id)
  );

  // Map to group complaints by ward number
  const complaintsByWard = new Map<number, ComplaintWithRelations[]>();
  for (const c of filtered) {
    const wNo = c.ward?.new_no;
    if (wNo === undefined || wNo === null) continue;
    if (!complaintsByWard.has(wNo)) {
      complaintsByWard.set(wNo, []);
    }
    complaintsByWard.get(wNo)!.push(c);
  }

  const getStatus = (c: ComplaintWithRelations) => {
    const isClosed = c.status === "Resolved" || c.status === "Closed";
    const isOverdue = !!(c.next_follow_up_date && c.next_follow_up_date < today && !isClosed);
    return { isClosed, isOverdue, isActive: !isClosed && !isOverdue };
  };

  return tree.map(corp => {
    const corpId = `corp-${corp.code}`;
    let corpTotal = 0;
    let corpActive = 0;
    let corpOverdue = 0;
    let corpClosed = 0;

    const divisions = corp.divisions.map(div => {
      const divId = `div-${corp.code}-${div.name}`;
      let divTotal = 0;
      let divActive = 0;
      let divOverdue = 0;
      let divClosed = 0;

      const subdivisions = div.subdivisions.map(sub => {
        const subId = `sub-${corp.code}-${div.name}-${sub.name}`;
        let subTotal = 0;
        let subActive = 0;
        let subOverdue = 0;
        let subClosed = 0;

        const wards = sub.wards.map(w => {
          const wardId = `ward-${corp.code}-${div.name}-${sub.name}-${w.no}`;
          const wardComplaints = complaintsByWard.get(w.no) || [];
          
          let wTotal = 0;
          let wActive = 0;
          let wOverdue = 0;
          let wClosed = 0;

          // Group by engineer
          const engineerMap = new Map<string, { name: string; designation: string; list: any[] }>();
          for (const c of wardComplaints) {
            const stats = getStatus(c);
            wTotal++;
            if (stats.isActive) wActive++;
            if (stats.isOverdue) wOverdue++;
            if (stats.isClosed) wClosed++;

            const eng = c.assigned_engineer;
            const engId = eng?.id || "unassigned";
            const engName = eng?.full_name || "Unassigned Engineer";
            const engDesig = eng?.designation || "Field Engineer";

            if (!engineerMap.has(engId)) {
              engineerMap.set(engId, { name: engName, designation: engDesig, list: [] });
            }
            engineerMap.get(engId)!.list.push(c);
          }

          // Build Engineer nodes
          const engineersList = Array.from(engineerMap.entries()).map(([engId, info]) => {
            const nodeEngId = `${wardId}-eng-${engId}`;
            
            // Group engineer complaints by officer
            const officerMap = new Map<string, { name: string; designation: string; list: any[] }>();
            for (const c of info.list) {
              const off = c.assigned_officer;
              const offId = off?.id || "unassigned";
              const offName = off?.full_name || "Unassigned Officer";
              const offDesig = off?.designation || "Zone Officer";

              if (!officerMap.has(offId)) {
                officerMap.set(offId, { name: offName, designation: offDesig, list: [] });
              }
              officerMap.get(offId)!.list.push(c);
            }

            // Build Officer nodes
            const officersList = Array.from(officerMap.entries()).map(([offId, offInfo]) => {
              const nodeOffId = `${nodeEngId}-off-${offId}`;
              return {
                id: nodeOffId,
                type: "officer" as const,
                label: offInfo.name,
                designation: offInfo.designation,
                status: "Active",
                complaintsCount: offInfo.list.length,
                complaintsList: offInfo.list
              };
            });

            return {
              id: nodeEngId,
              type: "engineer" as const,
              label: info.name,
              designation: info.designation,
              complaintsCount: info.list.length,
              complaintsList: info.list,
              children: officersList
            };
          });

          subTotal += wTotal;
          subActive += wActive;
          subOverdue += wOverdue;
          subClosed += wClosed;

          return {
            id: wardId,
            no: w.no,
            name: w.name,
            kn: w.kn,
            legible: w.legible,
            extra: w.extra,
            type: "ward" as const,
            label: w.name,
            complaintCount: wTotal,
            activeCount: wActive,
            overdueCount: wOverdue,
            closedCount: wClosed,
            complaintsList: wardComplaints,
            children: engineersList
          };
        });

        divTotal += subTotal;
        divActive += subActive;
        divOverdue += subOverdue;
        divClosed += subClosed;

        return {
          id: subId,
          name: sub.name,
          wardCount: sub.wardCount,
          type: "subdivision" as const,
          label: sub.name,
          complaintCount: subTotal,
          activeCount: subActive,
          overdueCount: subOverdue,
          closedCount: subClosed,
          children: wards
        };
      });

      corpTotal += divTotal;
      corpActive += divActive;
      corpOverdue += divOverdue;
      corpClosed += divClosed;

      return {
        id: divId,
        name: div.name,
        ac: div.ac,
        wardCount: div.wardCount,
        type: "division" as const,
        label: div.name,
        complaintCount: divTotal,
        activeCount: divActive,
        overdueCount: divOverdue,
        closedCount: divClosed,
        children: subdivisions
      };
    });

    return {
      id: corpId,
      code: corp.code,
      name: corp.name,
      wardCount: corp.wardCount,
      divisionCount: corp.divisionCount,
      subdivisionCount: corp.subdivisionCount,
      type: "corporation" as const,
      label: corp.name,
      complaintCount: corpTotal,
      activeCount: corpActive,
      overdueCount: corpOverdue,
      closedCount: corpClosed,
      children: divisions
    };
  });
}

/* ── main redesign component ──────────────────────────────────── */
export function OrgTreemap({
  gbaCorps,
  bbmpCorps,
  complaints,
  printPending,
  className
}: {
  gbaCorps: GbaTreeCorp[];
  bbmpCorps: GbaTreeCorp[];
  complaints: ComplaintWithRelations[];
  printPending: number;
  className?: string;
}) {
  const [mode, setMode] = React.useState<Mode>("gba");
  const gbaTotal = React.useMemo(() => buildDetailedTree(gbaCorps, complaints, true).reduce((s, c) => s + c.complaintCount, 0), [gbaCorps, complaints]);
  const bbmpTotal = React.useMemo(() => buildDetailedTree(bbmpCorps, complaints, false).reduce((s, c) => s + c.complaintCount, 0), [bbmpCorps, complaints]);

  const [activeCorp, setActiveCorp] = React.useState<string | null>(null);
  const [activeDiv,  setActiveDiv]  = React.useState<string | null>(null);
  const [activeSub,  setActiveSub]  = React.useState<string | null>(null);
  const [activeWard, setActiveWard] = React.useState<string | null>(null);
  const [activeEng,  setActiveEng]  = React.useState<string | null>(null);
  const [activeOff,  setActiveOff]  = React.useState<string | null>(null);
  
  const [hoverId,    setHoverId]    = React.useState<string | null>(null);
  const [lines,      setLines]      = React.useState<SvgLine[]>([]);
  const [zoom,       setZoom]       = React.useState(100);
  const [searchQuery, setSearchQuery] = React.useState("");

  // right inspector node state
  const [inspectorNode, setInspectorNode] = React.useState<any | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const nodeMap = React.useRef<Record<string, HTMLElement | null>>({});

  // 1. Build the detailed 7-level tree
  const corps = React.useMemo(() => buildDetailedTree(mode === "gba" ? gbaCorps : bbmpCorps, complaints, mode === "gba"), [mode, gbaCorps, bbmpCorps, complaints]);

  const corp = corps.find(c => c.code === activeCorp) ?? null;
  const div  = corp?.children.find(d => d.name === activeDiv) ?? null;
  const sub  = div?.children.find(s => s.name === activeSub) ?? null;
  const wardNode = sub?.children.find(w => w.id === activeWard) ?? null;
  const engNode = wardNode?.children.find(e => e.id === activeEng) ?? null;

  // Aggregate stats for KPI cards
  const kpiStats = React.useMemo(() => {
    let open = 0;
    let pending = 0;
    let inProgress = 0;
    let closed = 0;
    
    // Filter complaints based on active mode
    const modeComplaints = complaints.filter(c => 
      mode === "gba" ? (c.ward_type === "GBA" || !!c.gba_ward_id) : (c.ward_type !== "GBA" && !c.gba_ward_id)
    );

    for (const c of modeComplaints) {
      const status = c.status;
      if (status === "Resolved" || status === "Closed") {
        closed++;
      } else if (status === "Assigned To Engineer" || status === "Work In Progress" || status === "Site Visit Done" || status === "Reply Received" || status === "Action Taken Report Received" || status === "Reopened" || status === "Escalated" || status === "Partially Resolved") {
        inProgress++;
      } else if (status === "Draft" || status === "Site Visit Pending" || status === "No Response") {
        pending++;
      } else {
        open++;
      }
    }
    return { total: modeComplaints.length, open, pending, inProgress, closed };
  }, [complaints, mode]);

  // Today filed complaints trend calculation
  const todayTrend = React.useMemo(() => {
    const now = new Date().getTime();
    const past24h = now - 24 * 60 * 60 * 1000;
    const modeComplaints = complaints.filter(c => 
      mode === "gba" ? (c.ward_type === "GBA" || !!c.gba_ward_id) : (c.ward_type !== "GBA" && !c.gba_ward_id)
    );
    return modeComplaints.filter(c => new Date(c.created_at).getTime() >= past24h).length;
  }, [complaints, mode]);

  const gbaWardsTotal = gbaCorps.reduce((s, c) => s + c.wardCount, 0);
  const bbmpWardsTotal = bbmpCorps.reduce((s, c) => s + c.wardCount, 0);
  const totalWardsCount = mode === "gba" ? gbaWardsTotal : bbmpWardsTotal;

  function switchMode(m: Mode) {
    setMode(m);
    setActiveCorp(null);
    setActiveDiv(null);
    setActiveSub(null);
    setActiveWard(null);
    setActiveEng(null);
    setLines([]);
    setInspectorNode(null);
  }

  // Force recompute on container size changes
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick(t => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Generic ref callback
  function reg<T extends HTMLElement>(id: string): React.RefCallback<T> {
    return (el: T | null) => {
      nodeMap.current[id] = el;
    };
  }

  // Keyboard shortcut Ctrl + K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.getElementById("hierarchy-search");
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Search filter and auto-expand logic
  const isSearchMatched = React.useCallback((nodeId: string, nodeType: string, label: string, extraData?: any) => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase();
    
    if (label.toLowerCase().includes(q)) return true;
    if (nodeType === "ward" && extraData?.no?.toString() === q) return true;
    if (nodeType === "engineer" && extraData?.designation?.toLowerCase().includes(q)) return true;
    if (nodeType === "officer" && extraData?.designation?.toLowerCase().includes(q)) return true;
    
    // Check inside complaint id
    if (extraData?.complaintsList) {
      return extraData.complaintsList.some((c: any) => 
        c.id.toLowerCase().includes(q) ||
        (c.internal_case_number && c.internal_case_number.toLowerCase().includes(q)) ||
        c.title.toLowerCase().includes(q)
      );
    }
    return false;
  }, [searchQuery]);

  // Auto expand nodes matching search path
  React.useEffect(() => {
    if (!searchQuery.trim()) return;

    // Walk tree and find matches
    for (const c of corps) {
      const matchCorp = isSearchMatched(c.id, c.type, c.label, c);
      let matchDivNode: any = null;
      let matchSubNode: any = null;
      let matchWardNode: any = null;
      let matchEngNode: any = null;

      for (const d of c.children) {
        const matchDiv = isSearchMatched(d.id, d.type, d.label, d);
        if (matchDiv) { matchDivNode = d; break; }

        for (const s of d.children) {
          const matchSub = isSearchMatched(s.id, s.type, s.label, s);
          if (matchSub) { matchDivNode = d; matchSubNode = s; break; }

          for (const w of s.children) {
            const matchWard = isSearchMatched(w.id, w.type, w.label, w);
            if (matchWard) { matchDivNode = d; matchSubNode = s; matchWardNode = w; break; }

            for (const eng of w.children) {
              const matchEng = isSearchMatched(eng.id, eng.type, eng.label, eng);
              if (matchEng) { matchDivNode = d; matchSubNode = s; matchWardNode = w; matchEngNode = eng; break; }

              for (const off of eng.children) {
                const matchOff = isSearchMatched(off.id, off.type, off.label, off);
                if (matchOff) { matchDivNode = d; matchSubNode = s; matchWardNode = w; matchEngNode = eng; break; }
              }
            }
          }
        }
      }

      if (matchCorp || matchDivNode || matchSubNode || matchWardNode || matchEngNode) {
        setActiveCorp(c.code);
        if (matchDivNode) setActiveDiv(matchDivNode.name);
        if (matchSubNode) setActiveSub(matchSubNode.name);
        if (matchWardNode) setActiveWard(matchWardNode.id);
        if (matchEngNode) setActiveEng(matchEngNode.id);
        break;
      }
    }
  }, [searchQuery, corps, isSearchMatched]);

  // Compute SVG lines
  React.useEffect(() => {
    const cnt = containerRef.current;
    if (!cnt) return;
    const cr = cnt.getBoundingClientRect();

    const pos = (id: string): NodePos | null => {
      const el = nodeMap.current[id];
      if (!el) return null;
      const er = el.getBoundingClientRect();
      // Adjust with zoom scale factor
      const scale = zoom / 100;
      return {
        x: (er.left - cr.left + er.width / 2) / scale,
        yTop: (er.top - cr.top) / scale,
        yBot: (er.top - cr.top + er.height) / scale
      };
    };

    const next: SvgLine[] = [];
    const rootPos = pos("root");

    // Root -> Corps
    if (rootPos) {
      for (const c of corps) {
        const p = pos(c.id);
        if (p) next.push({ d: makeCurve(rootPos, p), color: CORP_TINT[c.code] ?? "#888", glow: activeCorp === c.code });
      }
    }

    // Corp -> Divs
    if (activeCorp && corp) {
      const pp = pos(corp.id);
      if (pp) {
        for (const d of corp.children) {
          const p = pos(d.id);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp] ?? "#888", glow: activeDiv === d.name });
        }
      }
    }

    // Div -> Subs
    if (activeDiv && div) {
      const pp = pos(div.id);
      if (pp) {
        for (const s of div.children) {
          const p = pos(s.id);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp!] ?? "#888", glow: activeSub === s.name });
        }
      }
    }

    // Sub -> Wards
    if (activeSub && sub) {
      const pp = pos(sub.id);
      if (pp) {
        for (const w of sub.children) {
          const p = pos(w.id);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp!] ?? "#888", glow: activeWard === w.id });
        }
      }
    }

    // Ward -> Engineers
    if (activeWard && wardNode) {
      const pp = pos(wardNode.id);
      if (pp) {
        for (const eng of wardNode.children) {
          const p = pos(eng.id);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp!] ?? "#888", glow: activeEng === eng.id });
        }
      }
    }

    // Engineer -> Officers
    if (activeEng && engNode) {
      const pp = pos(engNode.id);
      if (pp) {
        for (const off of engNode.children) {
          const p = pos(off.id);
          if (p) next.push({ d: makeCurve(pp, p), color: CORP_TINT[activeCorp!] ?? "#888" });
        }
      }
    }

    setLines(prev =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    );
  }, [activeCorp, activeDiv, activeSub, activeWard, activeEng, corps, corp, div, sub, wardNode, engNode, zoom]);

  // Navigation handlers
  const nav = {
    corp(code: string) {
      if (activeCorp === code) {
        setActiveCorp(null); setActiveDiv(null); setActiveSub(null); setActiveWard(null); setActiveEng(null);
      } else {
        setActiveCorp(code); setActiveDiv(null); setActiveSub(null); setActiveWard(null); setActiveEng(null);
      }
      setInspectorNode(null);
    },
    div(name: string) {
      if (activeDiv === name) {
        setActiveDiv(null); setActiveSub(null); setActiveWard(null); setActiveEng(null);
      } else {
        setActiveDiv(name); setActiveSub(null); setActiveWard(null); setActiveEng(null);
      }
      setInspectorNode(null);
    },
    sub(name: string) {
      if (activeSub === name) {
        setActiveSub(null); setActiveWard(null); setActiveEng(null);
      } else {
        setActiveSub(name); setActiveWard(null); setActiveEng(null);
      }
      setInspectorNode(null);
    },
    ward(id: string) {
      if (activeWard === id) {
        setActiveWard(null); setActiveEng(null);
        setInspectorNode(null);
      } else {
        setActiveWard(id); setActiveEng(null);
        const wNode = sub?.children.find(w => w.id === id) ?? null;
        if (wNode) setInspectorNode(wNode);
      }
    },
    eng(id: string) {
      if (activeEng === id) {
        setActiveEng(null);
      } else {
        setActiveEng(id);
      }
      setInspectorNode(null);
    }
  };

  // CSV Export Download
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,Level,Name,Complaint Count\n";
    csvContent += `Root,${rootLabel.title},${rootLabel.count}\n`;
    corps.forEach(c => {
      csvContent += `Corporation,${c.name},${c.complaintCount}\n`;
      if (activeCorp === c.code) {
        c.children.forEach(d => {
          csvContent += `Division,${d.name},${d.complaintCount}\n`;
          if (activeDiv === d.name) {
            d.children.forEach(s => {
              csvContent += `Subdivision,${s.name},${s.complaintCount}\n`;
              if (activeSub === s.name) {
                s.children.forEach(w => {
                  csvContent += `Ward,${w.name},${w.complaintCount}\n`;
                  if (activeWard === w.id) {
                    w.children.forEach(eng => {
                      csvContent += `Engineer,${eng.label},${eng.complaintsCount}\n`;
                      if (activeEng === eng.id) {
                        eng.children.forEach(off => {
                          csvContent += `Officer,${off.label},${off.complaintsCount}\n`;
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `complaints_hierarchy_${mode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Breadcrumbs resolver
  const breadcrumbs = React.useMemo(() => {
    const list = [{ label: mode === "gba" ? "GBA" : "BBMP", id: "root" }];
    if (activeCorp && corp) {
      list.push({ label: corp.name, id: `corp-${corp.code}` });
    }
    if (activeDiv && div) {
      list.push({ label: div.name, id: `div-${corp?.code}-${div.name}` });
    }
    if (activeSub && sub) {
      list.push({ label: sub.name, id: `sub-${corp?.code}-${div?.name}-${sub.name}` });
    }
    if (activeWard && wardNode) {
      list.push({ label: `Ward ${wardNode.no} - ${wardNode.name}`, id: wardNode.id });
    }
    if (activeEng && engNode) {
      list.push({ label: engNode.label, id: engNode.id });
    }
    return list;
  }, [mode, activeCorp, activeDiv, activeSub, activeWard, activeEng, corp, div, sub, wardNode, engNode]);

  const selectBreadcrumb = (part: { label: string, id: string }) => {
    if (part.id === "root") {
      setActiveCorp(null); setActiveDiv(null); setActiveSub(null); setActiveWard(null); setActiveEng(null); setActiveOff(null);
    } else if (part.id.startsWith("corp-")) {
      const code = part.id.split("-")[1];
      setActiveCorp(code || null); setActiveDiv(null); setActiveSub(null); setActiveWard(null); setActiveEng(null); setActiveOff(null);
    } else if (part.id.startsWith("div-")) {
      const name = part.id.split("-")[2];
      setActiveDiv(name || null); setActiveSub(null); setActiveWard(null); setActiveEng(null); setActiveOff(null);
    } else if (part.id.startsWith("sub-")) {
      const name = part.id.split("-")[3];
      setActiveSub(name || null); setActiveWard(null); setActiveEng(null); setActiveOff(null);
    } else if (part.id.startsWith("ward-")) {
      setActiveWard(part.id); setActiveEng(null); setActiveOff(null);
    } else if (part.id.startsWith("eng-")) {
      setActiveEng(part.id); setActiveOff(null);
    }
  };

  const rootLabel = mode === "gba"
    ? { title: "Greater Bengaluru Authority", count: gbaTotal, meta: `complaints · ${corps.length} corporations · ${gbaWardsTotal} wards` }
    : { title: "BBMP — Bruhat Bengaluru Mahanagara Palike", count: bbmpTotal, meta: `complaints · ${corps.length} corporations · ${bbmpWardsTotal} wards` };

  // Render Mobile accordion view
  const renderMobileAccordion = () => {
    return (
      <div className="md:hidden space-y-3 bg-white border rounded-2xl p-4 shadow-sm select-none mt-4">
        <div className="text-sm font-bold text-slate-800 border-b pb-2">
          {mode === "gba" ? "GBA Hierarchy Explorer" : "BBMP Hierarchy Explorer"}
        </div>
        <div className="space-y-2 mt-2">
          {corps.map(c => {
            const isCorpOpen = activeCorp === c.code;
            return (
              <div key={c.id} className="border rounded-xl overflow-hidden bg-slate-50/50">
                <button
                  onClick={() => nav.corp(c.code)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-black text-slate-800 bg-white hover:bg-slate-50 border-b cursor-pointer"
                >
                  <span className="flex items-center gap-1.5"><Building className="h-3.5 w-3.5 text-blue-500" /> {c.name} ({c.complaintCount})</span>
                  <span>{isCorpOpen ? "▼" : "▶"}</span>
                </button>
                {isCorpOpen && (
                  <div className="p-3 space-y-2 bg-white">
                    {c.children.map(d => {
                      const isDivOpen = activeDiv === d.name;
                      return (
                        <div key={d.id} className="border rounded-lg overflow-hidden">
                          <button
                            onClick={() => nav.div(d.name)}
                            className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-50/50 hover:bg-slate-50 border-b cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5"><MapPinned className="h-3.5 w-3.5 text-emerald-500" /> {d.name} ({d.complaintCount})</span>
                            <span>{isDivOpen ? "▼" : "▶"}</span>
                          </button>
                          {isDivOpen && (
                            <div className="p-2 space-y-1 bg-white">
                              {d.children.map(s => {
                                const isSubOpen = activeSub === s.name;
                                return (
                                  <div key={s.id} className="border rounded-md overflow-hidden">
                                    <button
                                      onClick={() => nav.sub(s.name)}
                                      className="w-full px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-600 bg-slate-50/20 cursor-pointer"
                                    >
                                      <span className="flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5 text-purple-500" /> {s.name} ({s.complaintCount})</span>
                                      <span>{isSubOpen ? "▼" : "▶"}</span>
                                    </button>
                                    {isSubOpen && (
                                      <div className="p-2 space-y-1 bg-white">
                                        {s.children.map(w => {
                                          const isWardOpen = activeWard === w.id;
                                          return (
                                            <div key={w.id} className="border rounded-md overflow-hidden">
                                              <button
                                                onClick={() => {
                                                  nav.ward(w.id);
                                                }}
                                                className="w-full px-2.5 py-1.5 flex items-center justify-between text-[10px] font-bold text-slate-655 cursor-pointer"
                                              >
                                                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-sky-500" /> Ward {w.no} - {w.name} ({w.complaintCount})</span>
                                                <span>{isWardOpen ? "▼" : "▶"}</span>
                                              </button>
                                              {isWardOpen && (
                                                <div className="p-2 space-y-1 bg-slate-50/50">
                                                  {w.children.map(eng => {
                                                    const isEngOpen = activeEng === eng.id;
                                                    return (
                                                      <div key={eng.id} className="border rounded bg-white">
                                                        <button
                                                          onClick={() => {
                                                            nav.eng(eng.id);
                                                          }}
                                                          className="w-full px-2 py-1 flex items-center justify-between text-[10px] font-semibold text-slate-600 cursor-pointer"
                                                        >
                                                          <span className="flex items-center gap-1.5"><HardHat className="h-3.5 w-3.5 text-amber-500" /> {eng.label} ({eng.complaintsCount})</span>
                                                          <span>{isEngOpen ? "▼" : "▶"}</span>
                                                        </button>
                                                        {isEngOpen && (
                                                          <div className="p-2 space-y-1 bg-slate-50/30">
                                                            {eng.children.map(off => (
                                                              <div
                                                                key={off.id}
                                                                onClick={() => setActiveOff(off.id)}
                                                                className="px-2 py-1 text-[9px] font-medium text-slate-550 hover:text-primary cursor-pointer flex items-center gap-1.5"
                                                              >
                                                                <UserRound className="h-3.5 w-3.5 text-slate-400" />
                                                                <span>{off.label} ({off.complaintsCount})</span>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      
      {/* 📋 KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total */}
        <div className="rounded-2xl border bg-card p-6 shadow-2xs space-y-2 hover:shadow-sm transition-all duration-300 transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Total Complaints</span>
            <CircleAlert className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 leading-none">{kpiStats.total}</p>
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
            <span>Across {totalWardsCount} Wards</span>
            <span className="text-emerald-600">+{todayTrend} Today</span>
          </div>
        </div>

        {/* Open */}
        <div className="rounded-2xl border bg-card p-6 shadow-2xs space-y-2 hover:shadow-sm transition-all duration-300 transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Open</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 leading-none">{kpiStats.open}</p>
          <span className="inline-flex items-center bg-emerald-50 text-emerald-700 text-[9px] font-black py-0.5 px-1.5 rounded-full uppercase tracking-wider">
            {kpiStats.total > 0 ? Math.round((kpiStats.open / kpiStats.total) * 100) : 0}% of total
          </span>
        </div>

        {/* Pending */}
        <div className="rounded-2xl border bg-card p-6 shadow-2xs space-y-2 hover:shadow-sm transition-all duration-300 transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Pending</span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 leading-none">{kpiStats.pending}</p>
          <span className="inline-flex items-center bg-amber-50 text-amber-700 text-[9px] font-black py-0.5 px-1.5 rounded-full uppercase tracking-wider">
            {kpiStats.total > 0 ? Math.round((kpiStats.pending / kpiStats.total) * 100) : 0}% of total
          </span>
        </div>

        {/* In Progress */}
        <div className="rounded-2xl border bg-card p-6 shadow-2xs space-y-2 hover:shadow-sm transition-all duration-300 transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">In Progress</span>
            <LoaderCircle className="h-4 w-4 animate-spin text-blue-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 leading-none">{kpiStats.inProgress}</p>
          <span className="inline-flex items-center bg-blue-50 text-blue-700 text-[9px] font-black py-0.5 px-1.5 rounded-full uppercase tracking-wider">
            Active Workload
          </span>
        </div>

        {/* Closed */}
        <div className="rounded-2xl border bg-card p-6 shadow-2xs space-y-2 hover:shadow-sm transition-all duration-300 transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Closed</span>
            <BadgeCheck className="h-5 w-5 text-rose-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 leading-none">{kpiStats.closed}</p>
          <span className="inline-flex items-center bg-rose-50 text-rose-700 text-[9px] font-black py-0.5 px-1.5 rounded-full uppercase tracking-wider">
            Resolved
          </span>
        </div>
      </div>

      {/* Floating Toolbar & Legend controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <ModeToggle mode={mode} onChange={switchMode} gbaTotal={gbaTotal} bbmpTotal={bbmpTotal} />
          
          {/* Floating Search Input with Ctrl + K */}
          <div className="relative flex items-center bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden pr-3">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5" />
            <input
              id="hierarchy-search"
              placeholder="Search wards, officers... (Ctrl + K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-6 border-none outline-none focus:ring-0 text-xs w-[240px] font-semibold text-slate-700 placeholder-slate-400"
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 text-xs font-bold leading-none p-1 rounded-full cursor-pointer">&times;</button>
            ) : (
              <kbd className="hidden sm:inline-block pointer-events-none select-none rounded border bg-slate-50 px-1.5 font-mono text-[9px] font-bold text-slate-400">⌘K</kbd>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 bg-white border rounded-xl px-4 py-2 text-[11px] font-semibold text-slate-500 shadow-2xs select-none">
          <span className="text-[10px] text-slate-400 uppercase mr-1">Density:</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> 0–10</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> 11–50</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> 51–100</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> 100+</span>
        </div>
      </div>

      {/* Breadcrumb Path navigation */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white border rounded-xl px-4 py-3 shadow-2xs select-none">
        {breadcrumbs.map((part, i) => (
          <React.Fragment key={part.id}>
            {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300 shrink-0 mx-0.5" />}
            <button
              onClick={() => selectBreadcrumb(part)}
              className={cn(
                "cursor-pointer hover:text-primary transition-colors hover:underline",
                i === breadcrumbs.length - 1 ? "text-primary font-black" : ""
              )}
            >
              {part.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Desktop SVG Canvas Tree */}
      <div
        ref={containerRef}
        className="hidden md:block relative overflow-auto rounded-2xl border bg-card shadow-sm"
        style={{ minHeight: 520 }}
      >
        {/* SVG Bezier overlay curves */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible"
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        >
          {lines.filter(l => l.glow).map((l, i) => (
            <path key={`glow-${i}`} d={l.d} fill="none" stroke={l.color} strokeWidth={6} strokeOpacity={0.12} strokeLinecap="round" />
          ))}
          {lines.map((l, i) => (
            <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={l.glow ? 2 : 1.5} strokeOpacity={l.glow ? 0.65 : 0.3} strokeLinecap="round" className="transition-all duration-300" />
          ))}
        </svg>

        {/* Nodes wrapper */}
        <div 
          className="relative flex flex-col items-center gap-12 px-6 py-10 origin-top transition-transform duration-200" 
          style={{ zIndex: 1, transform: `scale(${zoom / 100})` }}
        >
          
          {/* 🏛️ Level 1: Root Node */}
          <div 
            ref={reg<HTMLDivElement>("root")} 
            className="flex flex-col items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 shadow-md text-white w-[220px] select-none hover:scale-101 hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-blue-200" />
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-200">
                {rootLabel.title}
              </span>
            </div>
            <span className="text-2xl font-black tabular-nums leading-none mt-0.5">
              {rootLabel.count}
            </span>
            <span className="text-[10px] font-semibold text-blue-100 opacity-90 mt-0.5">
              complaints · {mode === "gba" ? "369 wards" : "225 wards"}
            </span>
          </div>

          {/* 🏢 Level 2: Corporation nodes row */}
          <div className="flex flex-wrap justify-center gap-6">
            {corps.map(c => {
              const isMatched = isSearchMatched(c.id, c.type, c.label, c);
              const progress = c.complaintCount > 0 ? Math.round((c.closedCount / c.complaintCount) * 100) : 0;
              return (
                <NodeCard
                  key={c.code}
                  nodeRef={reg(c.id)}
                  label={c.name}
                  icon={Building}
                  count={c.complaintCount}
                  countUnit="complaints"
                  tint={CORP_TINT[c.code] ?? "#888"}
                  active={activeCorp === c.code}
                  isExpanded={activeCorp === c.code}
                  onToggleExpand={(e) => {
                    e.stopPropagation();
                    nav.corp(c.code);
                  }}
                  progress={progress}
                  isMatched={isMatched}
                  onClick={() => nav.corp(c.code)}
                  size="lg"
                />
              );
            })}
          </div>

          {/* 📍 Level 3: Division nodes row */}
          {activeCorp && corp && (
            <div className="flex flex-wrap justify-center gap-5 animate-slide-down">
              {corp.children.map(d => {
                const isMatched = isSearchMatched(d.id, d.type, d.label, d);
                const progress = d.complaintCount > 0 ? Math.round((d.closedCount / d.complaintCount) * 100) : 0;
                return (
                  <NodeCard
                    key={d.name}
                    nodeRef={reg(d.id)}
                    label={d.name}
                    icon={MapPinned}
                    count={d.complaintCount}
                    countUnit="complaints"
                    tint={CORP_TINT[activeCorp!] ?? "#888"}
                    active={activeDiv === d.name}
                    isExpanded={activeDiv === d.name}
                    onToggleExpand={(e) => {
                      e.stopPropagation();
                      nav.div(d.name);
                    }}
                    progress={progress}
                    isMatched={isMatched}
                    onClick={() => nav.div(d.name)}
                    size="md"
                  />
                );
              })}
            </div>
          )}

          {/* 🧭 Level 4: Sub-division nodes row */}
          {activeDiv && div && (
            <div className="flex flex-wrap justify-center gap-4 animate-slide-down">
              {div.children.map(s => {
                const isMatched = isSearchMatched(s.id, s.type, s.label, s);
                return (
                  <NodeCard
                    key={s.name}
                    nodeRef={reg(s.id)}
                    label={s.name}
                    icon={Navigation}
                    count={s.complaintCount}
                    countUnit="complaints"
                    tint={CORP_TINT[activeCorp!] ?? "#888"}
                    active={activeSub === s.name}
                    isExpanded={activeSub === s.name}
                    onToggleExpand={(e) => {
                      e.stopPropagation();
                      nav.sub(s.name);
                    }}
                    isMatched={isMatched}
                    onClick={() => nav.sub(s.name)}
                    size="sm"
                  />
                );
              })}
            </div>
          )}

          {/* 📌 Level 5: Wards Compact row */}
          {activeSub && sub && (
            <div className="flex flex-wrap justify-center gap-3 animate-slide-down max-w-5xl">
              {sub.children.map(w => {
                const tint = CORP_TINT[activeCorp!] ?? "#888";
                const isMatched = isSearchMatched(w.id, w.type, w.label, w);
                const isSelected = activeWard === w.id;
                
                // Color mapping by complaint density
                let densityColor = "bg-emerald-500";
                if (w.complaintCount > 100) densityColor = "bg-rose-500";
                else if (w.complaintCount > 50) densityColor = "bg-orange-500";
                else if (w.complaintCount > 10) densityColor = "bg-amber-500";

                return (
                  <div
                    key={w.id}
                    ref={reg(w.id)}
                    onClick={() => {
                      nav.ward(w.id);
                    }}
                    className={cn(
                      "flex flex-col rounded-xl border p-3 hover:shadow-md cursor-pointer transition-all duration-200 select-none w-[160px] hover:-translate-y-0.5",
                      isSelected ? "ring-4 ring-blue-500/20 border-blue-500 bg-white" : "border-slate-200 bg-white/70",
                      isMatched ? "border-amber-500 bg-amber-50/20 shadow-sm" : ""
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Ward {w.no}</span>
                      <span className={cn("h-2 w-2 rounded-full", densityColor)} title={`${w.complaintCount} complaints`} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 leading-tight truncate mt-1">{w.name}</span>
                    <div className="flex items-center justify-between text-[10px] font-black text-slate-500 mt-2.5 border-t border-slate-100 pt-1.5">
                      <span>{w.complaintCount} cases</span>
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          nav.ward(w.id);
                        }}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        {isSelected ? "Collapse" : "Expand"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 👷 Level 6: Engineer nodes row */}
          {activeWard && wardNode && (
            <div className="flex flex-wrap justify-center gap-4 animate-slide-down">
              {wardNode.children.length === 0 ? (
                <div className="text-xs italic text-slate-400 font-bold py-2 bg-slate-50 px-4 border rounded-xl">No active assignments</div>
              ) : (
                wardNode.children.map(eng => {
                  const isMatched = isSearchMatched(eng.id, eng.type, eng.label, eng);
                  return (
                    <NodeCard
                      key={eng.id}
                      nodeRef={reg(eng.id)}
                      label={eng.label}
                      icon={HardHat}
                      count={eng.complaintsCount}
                      countUnit="Assigned"
                      tint={CORP_TINT[activeCorp!] ?? "#888"}
                      active={activeEng === eng.id}
                      isExpanded={activeEng === eng.id}
                      onToggleExpand={(e) => {
                        e.stopPropagation();
                        nav.eng(eng.id);
                      }}
                      isMatched={isMatched}
                      onClick={() => nav.eng(eng.id)}
                      size="sm"
                    />
                  );
                })
              )}
            </div>
          )}

          {/* 👤 Level 7: Officer nodes row */}
          {activeEng && engNode && (
            <div className="flex flex-wrap justify-center gap-4 animate-slide-down">
              {engNode.children.length === 0 ? (
                <div className="text-xs italic text-slate-400 font-bold py-2 bg-slate-50 px-4 border rounded-xl">No assigned officers</div>
              ) : (
                engNode.children.map(off => {
                  const isMatched = isSearchMatched(off.id, off.type, off.label, off);
                  const isSelected = activeOff === off.id;
                  const tint = CORP_TINT[activeCorp!] ?? "#888";
                  return (
                    <div
                      key={off.id}
                      ref={reg(off.id)}
                      onClick={() => {
                        setActiveOff(off.id);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 select-none hover:shadow-sm w-[160px]",
                        isSelected ? "ring-4 ring-blue-500/20 border-blue-500 bg-white" : "border-slate-200 bg-white",
                        isMatched ? "border-amber-500 bg-amber-50/20" : ""
                      )}
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-slate-800 leading-tight truncate">{off.label}</p>
                        <p className="text-[8px] text-slate-400 uppercase font-black tracking-wider leading-none mt-0.5">{off.designation}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </div>

      {/* Render Mobile accordion view for smaller screens */}
      {renderMobileAccordion()}

      {/* Right Drawer Inspector Panel */}
      <AnimatePresence>
        {inspectorNode && (
          <>
            {/* Overlay backdrop */}
            <div 
              className="fixed inset-0 bg-slate-900/10 backdrop-blur-3xs z-40 no-print" 
              onClick={() => setInspectorNode(null)} 
            />

            {/* Slide-out Drawer */}
            <motion.div
              initial={{ x: "100%", opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.5 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-screen w-[440px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col no-print"
            >
              {/* Header */}
              <div className="p-5 border-b flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                    {inspectorNode.type === "root" ? <Building2 className="h-4.5 w-4.5" /> :
                     inspectorNode.type === "corporation" ? <Building className="h-4.5 w-4.5" /> :
                     inspectorNode.type === "division" ? <MapPinned className="h-4.5 w-4.5" /> :
                     inspectorNode.type === "subdivision" ? <Navigation className="h-4.5 w-4.5" /> :
                     inspectorNode.type === "ward" ? <MapPin className="h-4.5 w-4.5" /> :
                     inspectorNode.type === "engineer" ? <HardHat className="h-4.5 w-4.5" /> :
                     <UserRound className="h-4.5 w-4.5" />}
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {inspectorNode.type} Node Info
                    </span>
                    <h3 className="text-sm font-black text-slate-900 leading-tight truncate max-w-[280px]">
                      {inspectorNode.label || inspectorNode.name}
                    </h3>
                  </div>
                </div>

                <button 
                  onClick={() => setInspectorNode(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
                
                {/* 1. Dynamic Overview Statistics */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" /> Overview & Statistics
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold">
                    <div className="border rounded-xl p-3 bg-slate-50/50">
                      <span className="text-xl font-black text-slate-800 leading-none">
                        {inspectorNode.complaintCount || inspectorNode.complaintsCount || inspectorNode.complaintsList?.length || 0}
                      </span>
                      <span className="block text-[8.5px] text-slate-400 uppercase tracking-wider mt-1">Total complaints</span>
                    </div>
                    {inspectorNode.type !== "officer" && inspectorNode.type !== "engineer" ? (
                      <div className="border rounded-xl p-3 bg-slate-50/50">
                        <span className="text-xl font-black text-slate-800 leading-none">
                          {inspectorNode.activeCount ?? 0}
                        </span>
                        <span className="block text-[8.5px] text-slate-400 uppercase tracking-wider mt-1">Active Cases</span>
                      </div>
                    ) : (
                      <div className="border rounded-xl p-3 bg-slate-50/50">
                        <span className="text-xs font-bold text-slate-700 capitalize leading-none">
                          {inspectorNode.designation || "Zone Officer"}
                        </span>
                        <span className="block text-[8.5px] text-slate-400 uppercase tracking-wider mt-1.5">Designation</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Detailed Breakdown Grid */}
                {inspectorNode.type !== "officer" && inspectorNode.type !== "engineer" && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-slate-400" /> Status Breakdown
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                      <div className="p-2 border rounded bg-emerald-50/50 text-emerald-800 border-emerald-100/40">
                        <span className="block font-black text-sm">{inspectorNode.activeCount ?? 0}</span>
                        <span className="text-[7.5px] uppercase">Active</span>
                      </div>
                      <div className="p-2 border rounded bg-rose-50/50 text-rose-800 border-rose-100/40">
                        <span className="block font-black text-sm">{inspectorNode.overdueCount ?? 0}</span>
                        <span className="text-[7.5px] uppercase">Overdue</span>
                      </div>
                      <div className="p-2 border rounded bg-slate-50 text-slate-655 border-slate-150">
                        <span className="block font-black text-sm">{inspectorNode.closedCount ?? 0}</span>
                        <span className="text-[7.5px] uppercase">Closed</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Details description */}
                {inspectorNode.extra && (
                  <div className="p-3 border rounded-xl bg-slate-50 text-xs font-semibold text-slate-500">
                    <span className="block text-[8px] text-slate-400 uppercase tracking-wider mb-1 font-bold">Historical / Delimitation Info</span>
                    {inspectorNode.extra}
                  </div>
                )}

                {/* 4. Recent activity log / complaints details */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Recent Activity & Complaints
                  </h4>
                  
                  {(!inspectorNode.complaintsList || inspectorNode.complaintsList.length === 0) ? (
                    <p className="text-xs text-slate-400 italic font-semibold text-center py-4 bg-slate-50 border rounded-xl">No complaints filed in this area</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 space-y-2">
                      {inspectorNode.complaintsList.map((c: any) => (
                        <li key={c.id} className="pt-2.5 first:pt-0">
                          <div className="flex items-start justify-between gap-2.5">
                            <span className="text-xs font-extrabold text-slate-700 leading-snug line-clamp-2">
                              {c.title}
                            </span>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shrink-0 leading-none",
                              c.status === "Resolved" || c.status === "Closed" ? "bg-emerald-100 text-emerald-800" :
                              c.status === "Assigned To Engineer" || c.status === "Work In Progress" ? "bg-blue-100 text-blue-800" :
                              "bg-slate-100 text-slate-655"
                            )}>
                              {c.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">
                            <span className="font-mono">{c.id.slice(0, 8)}</span>
                            <span>&middot;</span>
                            <span>{c.priority || "Medium"} Priority</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t flex items-center justify-between gap-3 bg-slate-50">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center justify-center gap-1.5 flex-1 px-4 py-2 border rounded-xl text-xs font-extrabold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 cursor-pointer shadow-3xs"
                >
                  <Download className="h-4 w-4" /> Download Report
                </button>
                
                {inspectorNode.complaintsList && inspectorNode.complaintsList.length > 0 && (
                  <button
                    onClick={() => {
                      // Navigate or show complaints details logic
                      window.open(`/complaints?search=${inspectorNode.label || inspectorNode.name}`, "_blank");
                    }}
                    className="flex items-center justify-center gap-1.5 flex-1 px-4 py-2 border border-transparent rounded-xl text-xs font-extrabold text-white bg-primary hover:bg-blue-700 cursor-pointer shadow-sm"
                  >
                    <Eye className="h-4 w-4" /> View Complaints
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 🧭 Bottom Information Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border rounded-xl px-5 py-3 text-xs font-bold text-slate-500 shadow-2xs no-print select-none">
        <div className="flex items-center gap-1.5">
          <History className="h-4 w-4 text-slate-400" />
          <span>Last Updated: Just now</span>
        </div>
        <div>Total Wards: {totalWardsCount}</div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400 uppercase font-black">Controls:</span>
          <button 
            onClick={() => setZoom(z => Math.max(50, z - 10))} 
            className="h-6 w-6 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center cursor-pointer font-extrabold shadow-3xs"
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <span className="font-mono min-w-[2.5rem] text-center">{zoom}%</span>
          <button 
            onClick={() => setZoom(z => Math.min(150, z + 10))} 
            className="h-6 w-6 border border-slate-200 rounded hover:bg-slate-50 flex items-center justify-center cursor-pointer font-extrabold shadow-3xs"
          >
            <ZoomIn className="h-3 w-3" />
          </button>
          <button onClick={() => setZoom(100)} className="text-primary hover:underline cursor-pointer text-[10px] font-black">Reset</button>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleExportCSV} className="hover:text-primary transition-colors cursor-pointer hover:underline flex items-center gap-1"><Download className="h-3.5 w-3.5" /> Export CSV</button>
          <button className="hover:text-primary transition-colors cursor-pointer hover:underline flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" /> Help</button>
        </div>
      </div>

    </div>
  );
}
