"use client";

import * as React from "react";
import {
  Plus,
  FileText,
  Award,
  Flag,
  Calendar,
  Trash2,
  History,
  UploadCloud,
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
  circleCls: string; // large circle background + border + text
  dotCls: string;    // small dot color
  textCls: string;   // text color for sub-info
  hoverCls: string;  // color-matched hover shadow and border classes
}

const STYLES: Record<RtiHistoryType, EventStyle> = {
  created: {
    label: "Case Created",
    Icon: Plus,
    circleCls: "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-400",
    dotCls: "bg-blue-500 dark:bg-blue-400",
    textCls: "text-blue-600 dark:text-blue-400",
    hoverCls: "hover:border-blue-300/50 hover:shadow-[0_8px_30px_rgba(59,130,246,0.08)] dark:hover:shadow-[0_8px_30px_rgba(59,130,246,0.15)]",
  },
  document_uploaded: {
    label: "Document Uploaded",
    Icon: FileText,
    circleCls: "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-400",
    dotCls: "bg-emerald-500 dark:bg-emerald-400",
    textCls: "text-emerald-600 dark:text-emerald-400",
    hoverCls: "hover:border-emerald-300/50 hover:shadow-[0_8px_30px_rgba(16,185,129,0.08)] dark:hover:shadow-[0_8px_30px_rgba(16,185,129,0.15)]",
  },
  reply_uploaded: {
    label: "Document Uploaded",
    Icon: FileText,
    circleCls: "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-400",
    dotCls: "bg-emerald-500 dark:bg-emerald-400",
    textCls: "text-emerald-600 dark:text-emerald-400",
    hoverCls: "hover:border-emerald-300/50 hover:shadow-[0_8px_30px_rgba(16,185,129,0.08)] dark:hover:shadow-[0_8px_30px_rgba(16,185,129,0.15)]",
  },
  ack_uploaded: {
    label: "Document Uploaded",
    Icon: Award,
    circleCls: "bg-purple-50 border-purple-200 text-purple-650 dark:bg-purple-950/40 dark:border-purple-900 dark:text-purple-450",
    dotCls: "bg-purple-500 dark:bg-purple-400",
    textCls: "text-purple-600 dark:text-purple-400",
    hoverCls: "hover:border-purple-300/50 hover:shadow-[0_8px_30px_rgba(168,85,247,0.08)] dark:hover:shadow-[0_8px_30px_rgba(168,85,247,0.15)]",
  },
  status_changed: {
    label: "Status Updated",
    Icon: Flag,
    circleCls: "bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-400",
    dotCls: "bg-orange-500 dark:bg-orange-400",
    textCls: "text-orange-600 dark:text-orange-400",
    hoverCls: "hover:border-orange-300/50 hover:shadow-[0_8px_30px_rgba(249,115,22,0.08)] dark:hover:shadow-[0_8px_30px_rgba(249,115,22,0.15)]",
  },
  date_filed: {
    label: "Date Filed",
    Icon: Calendar,
    circleCls: "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-400",
    dotCls: "bg-blue-500 dark:bg-blue-400",
    textCls: "text-blue-600 dark:text-blue-400",
    hoverCls: "hover:border-blue-300/50 hover:shadow-[0_8px_30px_rgba(59,130,246,0.08)] dark:hover:shadow-[0_8px_30px_rgba(59,130,246,0.15)]",
  },
  document_deleted: {
    label: "Document Removed",
    Icon: Trash2,
    circleCls: "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/40 dark:border-red-900 dark:text-red-400",
    dotCls: "bg-red-500 dark:bg-red-400",
    textCls: "text-red-650 dark:text-red-400",
    hoverCls: "hover:border-red-350/50 hover:shadow-[0_8px_30px_rgba(239,68,68,0.08)] dark:hover:shadow-[0_8px_30px_rgba(239,68,68,0.15)]",
  },
  changed: {
    label: "Updated",
    Icon: History,
    circleCls: "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400",
    dotCls: "bg-slate-500 dark:bg-slate-400",
    textCls: "text-slate-650 dark:text-slate-400",
    hoverCls: "hover:border-slate-350/50 hover:shadow-[0_8px_30px_rgba(100,116,139,0.08)] dark:hover:shadow-[0_8px_30px_rgba(100,116,139,0.15)]",
  },
};

const DOC_TYPES: RtiHistoryType[] = ["document_uploaded", "reply_uploaded", "ack_uploaded"];

// ── Formatters ──────────────────────────────────────────────────────────────

function formatTimestamp(dateString: string): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  
  const day = d.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12;
  
  return `${day} ${month} ${year}, ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
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
      Preview Detail
    </Button>
  );
}

// ── One timeline event row ──────────────────────────────────────────────────

function EventRow({ event, isLast }: { event: RtiHistoryEvent; isLast: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const style = STYLES[event.type] || STYLES.changed;
  
  // Dynamic Icon & styles overrides
  let Icon = style.Icon;
  let circleCls = style.circleCls;
  let dotCls = style.dotCls;
  let textCls = style.textCls;
  let hoverCls = style.hoverCls;

  if (event.type === "document_uploaded" && event.docType === "Application") {
    Icon = UploadCloud;
    circleCls = "bg-cyan-50 border-cyan-200 text-cyan-600 dark:bg-cyan-950/40 dark:border-cyan-900 dark:text-cyan-400";
    dotCls = "bg-cyan-500 dark:bg-cyan-400";
    textCls = "text-cyan-600 dark:text-cyan-400";
    hoverCls = "hover:border-cyan-300/50 hover:shadow-[0_8px_30px_rgba(6,182,212,0.08)] dark:hover:shadow-[0_8px_30px_rgba(6,182,212,0.15)]";
  }

  const heading =
    DOC_TYPES.includes(event.type) && event.docType && event.type === "document_uploaded"
      ? `${event.docType} Uploaded`
      : style.label;

  const canExpand = DOC_TYPES.includes(event.type) &&
    !!(event.documentTitle || event.performedBy || event.pdfPath);

  const handleDownload = async () => {
    if (!event.pdfPath) return;
    setBusy(true);
    try {
      const url = await getSignedUrlAction(event.pdfPath);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[48px_32px_1fr] gap-2 items-stretch">
      {/* Column 1: Large Circle */}
      <div className="flex items-start justify-center">
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center border shadow-xs z-10 bg-card", circleCls)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      
      {/* Column 2: Connector & Dot */}
      <div className="relative flex items-start justify-center">
        {/* Horizontal Connector */}
        <div className="absolute left-0 right-0 h-px bg-border/50 top-6" />
        {/* Dot */}
        <div className={cn("w-2.5 h-2.5 rounded-full z-10 mt-[19px] ring-4 ring-background animate-indicator-blink", dotCls)} />
      </div>
      
      {/* Column 3: Event Card */}
      <div className={cn(
        "border rounded-xl bg-card p-3.5 mb-2.5 flex flex-col justify-between transition-all duration-300 ease-out",
        "shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
        "hover:-translate-y-0.5",
        hoverCls
      )}>
        <div className="flex items-start justify-between gap-4">
          {/* Left part: Event details */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-snug">{heading}</p>
            
            {/* Sub-info */}
            {DOC_TYPES.includes(event.type) ? (
              <div className="mt-1">
                <p className={cn("text-xs font-semibold", textCls)}>
                  {event.docType === "Application" ? "Application" : event.docType === "FAA Order" ? "First Appeal" : event.docType === "Second Appeal Order" ? "Second Appeal" : event.docType || "Document"} ({event.pageCount || 1} pg)
                </p>
                {event.documentName && (
                  <button
                    onClick={handleDownload}
                    disabled={busy}
                    className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-red-500 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <span className="underline truncate max-w-[250px] sm:max-w-md">{event.documentName}</span>
                  </button>
                )}
              </div>
            ) : event.type === "status_changed" ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {event.oldValue || "Draft"}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {event.newValue}
                </span>
              </div>
            ) : event.type === "date_filed" ? (
              <div className="mt-1">
                <p className={cn("text-xs font-semibold", textCls)}>Filing Date</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-4 w-4 text-blue-500 shrink-0" />
                  <span>{fmtLong(event.newValue)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{event.newValue || event.oldValue || "—"}</p>
            )}
          </div>
          
          {/* Right part: Time / Date / Actions */}
          <div className="flex items-start gap-3 shrink-0">
            <div className="text-right leading-normal">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-end">
                <Calendar className="h-3.5 w-3.5 opacity-60" />
                <span>{formatTimestamp(event.createdAt)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">{timeAgo(event.createdAt)}</p>
            </div>
            
            {/* Chevron/Details Toggle (if expandable) */}
            {canExpand && (
              <button
                onClick={() => setOpen(!open)}
                className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground/55 hover:text-foreground"
                aria-label="Toggle details"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
              </button>
            )}
          </div>
        </div>

        {/* Smooth expand details */}
        <div style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 220ms ease",
        }}>
          <div style={{ overflow: "hidden" }}>
            <div className="pt-2 mt-2 space-y-1 border-t border-border/40">
              {event.documentTitle && (
                <p className="text-[12px] font-medium text-foreground">{event.documentTitle}</p>
              )}
              {event.performedBy && (
                <p className="text-[11px] text-muted-foreground">Uploaded by {event.performedBy}</p>
              )}
              {event.pdfPath && <ViewBtn pdfPath={event.pdfPath} />}
            </div>
          </div>
        </div>
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

  return (
    <div className="relative" aria-label="Change history timeline">
      {/* Continuous Vertical Timeline Line */}
      <div className="absolute left-[64px] top-6 bottom-6 w-px bg-border/50" aria-hidden />

      <div className="space-y-1">
        {events.map((event, index) => (
          <EventRow
            key={event.id}
            event={event}
            isLast={index === events.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
