"use client";

import * as React from "react";
import {
  PlusCircle,
  FileText,
  FileCheck,
  BadgeCheck,
  RefreshCw,
  Calendar,
  Trash2,
  History,
  Eye,
  ChevronDown,
  ArrowRight,
  Clock,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getSignedUrlAction } from "@/lib/actions/rti";
import type { RtiHistoryEvent, RtiHistoryType } from "@/lib/rti-history";

// ── Event style map ─────────────────────────────────────────────────────────

interface EventStyle {
  label: string;
  Icon: LucideIcon;
  nodeCls: string; // node bg + text + ring
}

const STYLES: Record<RtiHistoryType, EventStyle> = {
  created: {
    label: "Application Created",
    Icon: PlusCircle,
    nodeCls: "bg-emerald-500 text-white ring-emerald-200 dark:ring-emerald-800",
  },
  document_uploaded: {
    label: "Document Uploaded",
    Icon: FileText,
    nodeCls: "bg-blue-500 text-white ring-blue-200 dark:ring-blue-800",
  },
  reply_uploaded: {
    label: "Reply Uploaded",
    Icon: FileCheck,
    // bg-teal uses the project's custom teal (#1F7A6E); teal-500 doesn't exist in this config
    nodeCls: "bg-teal text-white ring-emerald-200 dark:ring-emerald-900",
  },
  ack_uploaded: {
    label: "Acknowledgement Uploaded",
    Icon: BadgeCheck,
    nodeCls: "bg-cyan-600 text-white ring-cyan-200 dark:ring-cyan-900",
  },
  status_changed: {
    label: "Status Updated",
    Icon: RefreshCw,
    nodeCls: "bg-amber-500 text-white ring-amber-200 dark:ring-amber-800",
  },
  date_filed: {
    label: "Filing Date Set",
    Icon: Calendar,
    nodeCls: "bg-violet-500 text-white ring-violet-200 dark:ring-violet-800",
  },
  document_deleted: {
    label: "Document Removed",
    Icon: Trash2,
    nodeCls: "bg-rose-500 text-white ring-rose-200 dark:ring-rose-800",
  },
  changed: {
    label: "Updated",
    Icon: History,
    nodeCls: "bg-slate-400 text-white ring-slate-200 dark:ring-slate-700",
  },
};

const DOC_TYPES: RtiHistoryType[] = ["document_uploaded", "reply_uploaded", "ack_uploaded"];

// ── Stage logic ─────────────────────────────────────────────────────────────

function getStage(ev: RtiHistoryEvent): string | null {
  switch (ev.type) {
    case "created":
    case "date_filed":
      return "Application";
    case "document_uploaded":
      if (ev.docType === "Application") return "Application";
      if (ev.docType === "FAA Order") return "First Appeal";
      if (ev.docType === "Second Appeal Order") return "Second Appeal";
      if (ev.docType === "Higher Appeal Order") return "Higher Appeal";
      return "Documents";
    case "ack_uploaded":
      return "Acknowledgement";
    case "reply_uploaded":
      return "Reply";
    default:
      return null; // inherits previous stage
  }
}

type TlItem =
  | { kind: "sep"; label: string; key: string }
  | { kind: "ev"; event: RtiHistoryEvent; isLeft: boolean; isLast: boolean; key: string };

function buildItems(events: RtiHistoryEvent[]): TlItem[] {
  const out: TlItem[] = [];
  let stage: string | null = null;
  let n = 0;
  events.forEach((ev, i) => {
    const s = getStage(ev);
    if (s && s !== stage) {
      stage = s;
      out.push({ kind: "sep", label: s, key: `sep-${s}-${i}` });
    }
    out.push({ kind: "ev", event: ev, isLeft: n % 2 === 0, isLast: i === events.length - 1, key: ev.id });
    n++;
  });
  return out;
}

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtTs(v: string) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return { date: v, time: "" };
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase(),
  };
}

function fmtLong(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ViewBtn({ pdfPath }: { pdfPath: string }) {
  const [busy, setBusy] = React.useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const url = await getSignedUrlAction(pdfPath);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else alert("Could not generate a viewing link.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={busy} onClick={open}>
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
      Preview
    </Button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Filed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Awaiting Reply": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "Reply Received": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "First Appeal Draft": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "First Appeal Filed": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "Second Appeal Filed": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};

function StatusChip({ v }: { v: string | null | undefined }) {
  const cls = v ? (STATUS_COLORS[v] ?? "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", cls)}>
      {v || "—"}
    </span>
  );
}

/* One-line summary shown in collapsed state */
function Summary({ ev }: { ev: RtiHistoryEvent }) {
  if (DOC_TYPES.includes(ev.type)) {
    const parts = [
      ev.documentName ?? "Document.pdf",
      typeof ev.pageCount === "number" ? `${ev.pageCount} pg` : null,
      ev.performedBy ?? null,
    ].filter(Boolean);
    return <p className="text-[12px] text-muted-foreground truncate">{parts.join(" · ")}</p>;
  }
  if (ev.type === "status_changed") {
    return (
      <div className="flex items-center gap-1 flex-wrap mt-0.5">
        <StatusChip v={ev.oldValue} />
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <StatusChip v={ev.newValue} />
      </div>
    );
  }
  if (ev.type === "date_filed") {
    return <p className="text-[12px] text-muted-foreground">{fmtLong(ev.newValue)}</p>;
  }
  if (ev.type === "created") {
    return <p className="text-[12px] text-muted-foreground truncate">{ev.newValue || ""}</p>;
  }
  if (ev.type === "changed" && ev.fieldLabel) {
    return (
      <p className="text-[12px] text-muted-foreground truncate">
        {ev.fieldLabel}: {ev.oldValue || "—"} → {ev.newValue || "—"}
      </p>
    );
  }
  if (ev.type === "document_deleted") {
    return <p className="text-[12px] text-muted-foreground">Removed: {ev.oldValue ?? "document"}</p>;
  }
  return null;
}

/* Extra detail shown when expanded */
function Detail({ ev }: { ev: RtiHistoryEvent }) {
  if (!DOC_TYPES.includes(ev.type)) return null;
  const has = ev.documentTitle || ev.performedBy || ev.pdfPath;
  if (!has) return null;
  return (
    <div className="pt-2 mt-2 space-y-1 border-t border-border/40">
      {ev.documentTitle && (
        <p className="text-[12px] font-medium text-foreground">{ev.documentTitle}</p>
      )}
      {ev.performedBy && (
        <p className="text-[11px] text-muted-foreground">Uploaded by {ev.performedBy}</p>
      )}
      {ev.pdfPath && <ViewBtn pdfPath={ev.pdfPath} />}
    </div>
  );
}

/* Node circle */
function Node({ style }: { style: EventStyle }) {
  const { Icon } = style;
  return (
    <span className={cn(
      "flex h-8 w-8 items-center justify-center rounded-full shadow-sm ring-4 shrink-0 z-10",
      style.nodeCls,
    )}>
      <Icon className="h-[15px] w-[15px]" aria-hidden />
    </span>
  );
}

/* Stage separator spanning full width */
function StageSep({ label }: { label: string }) {
  return (
    <div className="relative flex items-center justify-center my-5 z-10" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px bg-border/40" />
      <span className="relative px-3 py-0.5 rounded-full border border-border/60 bg-background text-[10px] font-bold tracking-widest uppercase text-muted-foreground select-none">
        {label}
      </span>
    </div>
  );
}

/* One timeline event row */
function EventRow({ event, isLeft, isLast }: { event: RtiHistoryEvent; isLeft: boolean; isLast: boolean }) {
  const [open, setOpen] = React.useState(false);
  const style = STYLES[event.type];
  const { Icon: _Icon, ..._ } = style; // prevent unused lint
  void _;
  const { date, time } = fmtTs(event.createdAt);

  const heading =
    DOC_TYPES.includes(event.type) && event.docType && event.type === "document_uploaded"
      ? `${event.docType} Uploaded`
      : style.label;

  const canExpand = DOC_TYPES.includes(event.type) &&
    !!(event.documentTitle || event.performedBy || event.pdfPath);

  const card = (
    <div
      role={canExpand ? "button" : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? open : undefined}
      onClick={canExpand ? () => setOpen((v) => !v) : undefined}
      onKeyDown={canExpand ? (e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); } : undefined}
      className={cn(
        "relative rounded-xl border bg-card shadow-sm px-3 py-2.5 w-full",
        "transition-all duration-150",
        canExpand && "cursor-pointer hover:shadow-md hover:-translate-y-px",
        // speech-bubble pointer classes (CSS in globals.css, desktop only)
        isLeft ? "tl-arrow-r" : "tl-arrow-l",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground leading-snug truncate">{heading}</p>
          <Summary ev={event} />
        </div>
        <div className="shrink-0 text-right leading-none space-y-0.5">
          <p className="text-[11px] text-muted-foreground whitespace-nowrap">{date}</p>
          {time && <p className="text-[10px] text-muted-foreground/60">{time}</p>}
          {canExpand && (
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground/40 ml-auto transition-transform duration-200",
              open && "rotate-180",
            )} />
          )}
        </div>
      </div>

      {/* Smooth expand via CSS grid trick */}
      <div style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 220ms ease",
      }}>
        <div style={{ overflow: "hidden" }}>
          <Detail ev={event} />
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn(
      // Mobile: left-rail flex layout
      "relative flex items-start gap-2 mb-2",
      // Desktop: center-rail 3-col grid
      "md:grid md:grid-cols-[1fr_40px_1fr] md:gap-0 md:mb-3 md:items-start",
    )}>
      {/* Mobile node (hidden md+) */}
      <div className="flex flex-col items-center md:hidden shrink-0">
        <Node style={style} />
        {!isLast && <div className="w-px flex-1 mt-1 min-h-[20px] bg-border/40" />}
      </div>

      {/* Left slot: shows card when isLeft (always visible on mobile) */}
      <div className={cn(
        "md:flex md:items-start md:justify-end md:pr-5",
        isLeft ? "flex-1" : "hidden md:block",
      )}>
        {isLeft && card}
      </div>

      {/* Desktop center node (hidden on mobile) */}
      <div className="hidden md:flex md:flex-col md:items-center">
        <Node style={style} />
        {!isLast && <div className="w-px flex-1 mt-1 min-h-[20px] bg-border/40" />}
      </div>

      {/* Right slot: shows card when !isLeft (always visible on mobile) */}
      <div className={cn(
        "md:pl-5",
        !isLeft ? "flex-1" : "hidden md:block",
      )}>
        {!isLeft && card}
      </div>
    </div>
  );
}

// ── Public component ────────────────────────────────────────────────────────

export function HistoryTimeline({ events }: { events: RtiHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-10 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/40" aria-hidden />
        <p className="mt-2 text-sm font-semibold text-foreground">No activity yet</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          Uploads, status updates, and filing dates will appear here.
        </p>
      </div>
    );
  }

  const items = buildItems(events);

  return (
    <div className="relative" aria-label="Change history timeline">
      {/* Desktop center rail */}
      <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-border/50" aria-hidden />
      {/* Mobile left rail */}
      <div className="block md:hidden absolute left-4 top-0 bottom-0 w-px bg-border/50" aria-hidden />

      {items.map((item) => {
        if (item.kind === "sep") return <StageSep key={item.key} label={item.label} />;
        return (
          <EventRow
            key={item.key}
            event={item.event}
            isLeft={item.isLeft}
            isLast={item.isLast}
          />
        );
      })}
    </div>
  );
}
