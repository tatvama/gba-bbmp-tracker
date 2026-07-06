"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Send,
  ClipboardCheck,
  Mail,
  FileCheck2,
  MapPin,
  Camera,
  Bell,
  Gavel,
  CheckCircle2,
  RefreshCw,
  Archive,
  RotateCcw,
  StickyNote,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Search,
  Eye,
  LucideIcon,
  FileSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDocumentViewUrl } from "@/lib/actions/complaints";
import type { ComplaintHistoryEvent, ComplaintHistoryType } from "@/lib/complaint-history";
import type { ComplaintDocument } from "@/lib/types";
import { DocumentSummaryModal } from "@/components/complaints/document-summary-modal";

// ── Visual Mapping Helper ───────────────────────────────────────────────────

interface EventVisuals {
  Icon: LucideIcon;
  borderColor: string;
  iconColor: string;
  label: string;
  borderClass: string;
}

function getEventVisuals(event: ComplaintHistoryEvent): EventVisuals {
  const t = event.type;
  if (event.isAiCorrespondence) {
    return {
      Icon: Sparkles,
      borderColor: "border-purple-200 dark:border-purple-900/50",
      iconColor: "text-purple-600 dark:text-purple-400",
      label: "AI Correspondence",
      borderClass: "border-l-purple-500",
    };
  }

  switch (t) {
    case "Created":
    case "Filed":
      return {
        Icon: Plus,
        borderColor: "border-slate-200 dark:border-slate-800",
        iconColor: "text-slate-500 dark:text-slate-400",
        label: "Case Intake",
        borderClass: "border-l-slate-400 dark:border-l-slate-600",
      };
    case "Acknowledged":
      return {
        Icon: ClipboardCheck,
        borderColor: "border-blue-200 dark:border-blue-900/50",
        iconColor: "text-blue-600 dark:text-blue-400",
        label: "Case Acknowledged",
        borderClass: "border-l-blue-500",
      };
    case "Reply Received":
      return {
        Icon: Mail,
        borderColor: "border-indigo-200 dark:border-indigo-900/50",
        iconColor: "text-indigo-600 dark:text-indigo-400",
        label: "Reply Received",
        borderClass: "border-l-indigo-500",
      };
    case "Action Taken":
      return {
        Icon: FileCheck2,
        borderColor: "border-emerald-200 dark:border-emerald-900/50",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        label: "Action Taken",
        borderClass: "border-l-emerald-500",
      };
    case "Site Visit":
      return {
        Icon: MapPin,
        borderColor: "border-amber-200 dark:border-amber-900/50",
        iconColor: "text-amber-600 dark:text-amber-400",
        label: "Field Inspection",
        borderClass: "border-l-amber-500",
      };
    case "Photo Evidence":
      return {
        Icon: Camera,
        borderColor: "border-blue-200 dark:border-blue-900/50",
        iconColor: "text-blue-600 dark:text-blue-400",
        label: "Photo Evidence",
        borderClass: "border-l-blue-500",
      };
    case "Follow-up":
      return {
        Icon: Bell,
        borderColor: "border-amber-200 dark:border-amber-900/50",
        iconColor: "text-amber-650 dark:text-amber-450",
        label: "System Follow-up",
        borderClass: "border-l-amber-500",
      };
    case "Reminder":
      return {
        Icon: CheckCircle2,
        borderColor: "border-emerald-250 dark:border-emerald-900/50",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        label: "System Reminder",
        borderClass: "border-l-emerald-500",
      };
    case "Escalation":
      return {
        Icon: Gavel,
        borderColor: "border-rose-250 dark:border-rose-900/50",
        iconColor: "text-rose-600 dark:text-rose-455",
        label: "Case Escalated",
        borderClass: "border-l-rose-500",
      };
    case "Status Change":
      return {
        Icon: RefreshCw,
        borderColor: "border-amber-250 dark:border-amber-900/50",
        iconColor: "text-amber-600 dark:text-amber-450",
        label: "Status Updated",
        borderClass: "border-l-slate-400 dark:border-l-slate-600",
      };
    case "Closure":
      return {
        Icon: Archive,
        borderColor: "border-slate-200 dark:border-slate-800",
        iconColor: "text-slate-600 dark:text-slate-500",
        label: "Case Closed",
        borderClass: "border-l-slate-400 dark:border-l-slate-600",
      };
    case "Reopened":
      return {
        Icon: RotateCcw,
        borderColor: "border-rose-250 dark:border-rose-900/50",
        iconColor: "text-rose-600 dark:text-rose-455",
        label: "Case Reopened",
        borderClass: "border-l-rose-500",
      };
    default:
      return {
        Icon: StickyNote,
        borderColor: "border-slate-200 dark:border-slate-800",
        iconColor: "text-slate-500 dark:text-slate-400",
        label: "Internal Note",
        borderClass: "border-l-slate-400 dark:border-l-slate-600",
      };
  }
}

// ── Time & Date Formatting ───────────────────────────────────────────────────

function formatTimestampDate(dateString: string): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTimestampTime(dateString: string): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function groupEventsByDate(
  events: ComplaintHistoryEvent[],
  sortOrder: "newest" | "oldest",
): { label: string; items: ComplaintHistoryEvent[] }[] {
  const groups: Record<string, ComplaintHistoryEvent[]> = {};
  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

  for (const event of events) {
    const d = new Date(event.createdAt);
    const key = isNaN(d.getTime())
      ? "Earlier Activity"
      : d.toDateString() === todayStr
      ? "Today"
      : d.toDateString() === yesterdayStr
      ? "Yesterday"
      : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    (groups[key] ??= []).push(event);
  }

  const sortedEntries = Object.entries(groups).sort((a, b) => {
    const dateA = a[0] === "Today" ? new Date() : a[0] === "Yesterday" ? new Date(Date.now() - 86400000) : new Date(a[0]);
    const dateB = b[0] === "Today" ? new Date() : b[0] === "Yesterday" ? new Date(Date.now() - 86400000) : new Date(b[0]);
    return sortOrder === "newest" ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
  });

  return sortedEntries.map(([label, items]) => ({
    label,
    items: items.slice().sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    }),
  }));
}

// ── Attachment & Description sub-components ───────────────────────────────

const ActivityAttachment = React.memo(function ActivityAttachment({ event }: { event: ComplaintHistoryEvent }) {
  const [busy, setBusy] = React.useState(false);

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!event.documentId) return;
    setBusy(true);
    try {
      const r = await getDocumentViewUrl(event.documentId);
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  const name = event.documentName || "document.pdf";
  const ext = name.split(".").pop()?.toUpperCase() || "PDF";

  return (
    <button
      onClick={handleOpen}
      disabled={busy}
      className="inline-flex items-center gap-2 px-2.5 py-1 border rounded-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-left hover:border-slate-300 dark:hover:border-slate-700 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 max-w-[280px] sm:max-w-xs group cursor-pointer shadow-3xs text-[11px]"
      aria-label={`View attachment ${name}`}
    >
      <FileCheck2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
      <span className="font-bold text-slate-700 dark:text-slate-300 truncate group-hover:text-primary transition-colors">{name}</span>
      <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold uppercase shrink-0">
        {ext}{event.pageCount ? ` • ${event.pageCount}p` : ""}
      </span>
      <span className="text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 shrink-0 pl-0.5">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
      </span>
    </button>
  );
});

function ActivityDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const isLong = text.length > 150;

  if (!isLong) return <p className="text-[13px] text-slate-655 dark:text-slate-400 leading-relaxed font-medium">{text}</p>;

  return (
    <p className="text-[13px] text-slate-655 dark:text-slate-400 leading-relaxed font-medium">
      {expanded ? text : `${text.slice(0, 135)}...`}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="ml-1.5 font-bold text-[#e27226] hover:underline text-[10px] uppercase tracking-wide cursor-pointer focus:outline-none"
      >
        {expanded ? "Show Less" : "Show More"}
      </button>
    </p>
  );
}

// ── Unified 3-Column Timeline Item ──────────────────────────────────────────

interface ActivityItemProps {
  event: ComplaintHistoryEvent;
  doc: ComplaintDocument | null;
  onViewSummary: (doc: ComplaintDocument) => void;
  isFirstInDateGroup: boolean;
  groupLabel: string;
  isFirstGlobal: boolean;
  isLastGlobal: boolean;
}

const ActivityItem = React.memo(function ActivityItem({
  event,
  doc,
  onViewSummary,
  isFirstInDateGroup,
  groupLabel,
  isFirstGlobal,
  isLastGlobal,
}: ActivityItemProps) {
  const [expanded, setExpanded] = React.useState(false);
  const style = getEventVisuals(event);
  const hasDetail = !!event.documentId;
  const isLatest = isFirstGlobal;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); }
  };

  return (
    <div className="grid grid-cols-[36px_1fr] sm:grid-cols-[44px_1fr] md:grid-cols-[120px_44px_1fr] gap-x-3 sm:gap-x-5 md:gap-x-6 items-start relative select-none">
      
      {/* COLUMN 1: Group Date & Time (Left - Hidden on mobile/tablet) */}
      <div className="hidden md:flex flex-col items-end text-right pr-1.5 select-none leading-tight mt-2.5">
        {isFirstInDateGroup ? (
          <>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {groupLabel}
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-205 mt-1 font-mono">
              {formatTimestampTime(event.createdAt)}
            </span>
          </>
        ) : (
          <span className="text-xs font-bold text-slate-400 dark:text-slate-550 font-mono">
            {formatTimestampTime(event.createdAt)}
          </span>
        )}
      </div>

      {/* COLUMN 2: Timeline Connector & Node (Center) */}
      <div className="flex flex-col items-center justify-start h-full relative self-stretch select-none">
        {/* Top Connector Segment */}
        {!isFirstGlobal && (
          <div className="absolute top-0 bottom-[calc(100%-18px)] sm:bottom-[calc(100%-22px)] w-0.5 bg-slate-200 dark:bg-slate-800" />
        )}
        
        {/* Bottom Connector Segment */}
        {!isLastGlobal && (
          <div className="absolute top-[18px] sm:top-[22px] bottom-0 w-0.5 bg-slate-200 dark:bg-slate-800" />
        )}

        {/* Circular Node Element */}
        <div
          className={cn(
            "relative flex items-center justify-center rounded-full border bg-white dark:bg-slate-900 shadow-sm shrink-0 z-10 transition-all duration-200 hover:scale-105",
            isLatest ? "h-9 w-9 sm:h-11 sm:w-11 border-orange-500 ring-4 ring-orange-500/10" : "h-8 w-8 sm:h-10 sm:w-10 border-slate-200 dark:border-slate-800",
            style.borderColor
          )}
        >
          <style.Icon className={cn(isLatest ? "h-4.5 w-4.5 sm:h-5 sm:w-5" : "h-4 w-4 sm:h-4.5 sm:w-4.5", style.iconColor)} />
        </div>
      </div>

      {/* COLUMN 3: Activity Details Card (Right) */}
      <div className="pb-6 min-w-0">
        <div
          onClick={() => hasDetail && setExpanded(!expanded)}
          onKeyDown={handleKeyDown}
          tabIndex={hasDetail ? 0 : -1}
          role={hasDetail ? "button" : "presentation"}
          aria-expanded={hasDetail ? expanded : undefined}
          className={cn(
            "group border rounded-xl p-4 sm:p-5 flex flex-col justify-between bg-card transition-all duration-200 ease-out border-l-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            style.borderClass,
            isLatest ? "ring-1 ring-orange-500/15 border-l-orange-500 dark:border-l-orange-500 shadow-xs" : "shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-xs border-l-slate-350 dark:border-l-slate-700",
            hasDetail ? "cursor-pointer" : "cursor-default",
          )}
        >
          {/* Responsive date display for tablet/mobile where Left Column is hidden */}
          <div className="flex md:hidden items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2 mb-2">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 leading-none">
              {isFirstInDateGroup ? `${groupLabel} • ${formatTimestampTime(event.createdAt)}` : formatTimestampTime(event.createdAt)}
            </span>
            <span className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 leading-none">
              {timeAgo(event.createdAt)}
            </span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] sm:text-[15px] font-extrabold text-slate-850 dark:text-slate-100 leading-tight">
                  {event.title}
                </span>
                {isLatest && (
                  <Badge className="bg-orange-100 hover:bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/40 text-[9px] font-extrabold uppercase py-0 px-1.5 h-4.5 rounded leading-none shrink-0">
                    Latest
                  </Badge>
                )}
                {event.createdByProfile && (
                  <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-800/80 leading-none">
                    by {event.createdByProfile.name}
                  </span>
                )}
              </div>
              {event.summary && (
                <div className="mt-2.5">
                  <ActivityDescription text={event.summary} />
                </div>
              )}
            </div>
            
            {/* Collapse indicator & desktop duration */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden md:inline-block text-[10px] font-bold text-slate-400 dark:text-slate-500 select-none">
                {timeAgo(event.createdAt)}
              </span>
              {hasDetail && (
                <button
                  type="button"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-350 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Toggle details"
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {expanded && hasDetail && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="overflow-hidden mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ActivityAttachment event={event} />
                  {doc && doc.ai_summary_status === "ready" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewSummary(doc);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-left hover:border-slate-300 dark:hover:border-slate-700 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 shadow-3xs text-[11px] font-bold text-slate-750 dark:text-slate-300 cursor-pointer"
                      aria-label="View AI summary"
                    >
                      <FileSearch className="h-3.5 w-3.5 text-primary shrink-0" />
                      View Summary
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
});

// ── Filters & Feed Components ──────────────────────────────────────────────

const FILTERS: { value: string; label: string; test: (e: ComplaintHistoryEvent) => boolean }[] = [
  { value: "all", label: "All Activity", test: () => true },
  { value: "correspondence", label: "Correspondence", test: (e) => ["Reply Received", "Action Taken", "Escalation"].includes(e.type) || e.isAiCorrespondence },
  { value: "documents", label: "Documents", test: (e) => !!e.documentId },
  { value: "status", label: "Status Changes", test: (e) => ["Status Change", "Closure", "Reopened", "Filed", "Acknowledged"].includes(e.type) },
  { value: "reminders", label: "Reminders", test: (e) => ["Follow-up", "Reminder"].includes(e.type) },
];

function ActivityFeed({
  events,
  documents,
}: {
  events: ComplaintHistoryEvent[];
  documents: ComplaintDocument[];
}) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterType, setFilterType] = React.useState<string>("all");
  const [sortOrder, setSortOrder] = React.useState<"newest" | "oldest">("newest");
  const [summaryDoc, setSummaryDoc] = React.useState<ComplaintDocument | null>(null);

  const filteredEvents = React.useMemo(() => {
    const bucket = FILTERS.find((f) => f.value === filterType) ?? FILTERS[0]!;
    return events.filter((e) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const hay = `${e.title} ${e.summary ?? ""} ${e.docType ?? ""} ${e.documentName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return bucket.test(e);
    });
  }, [events, searchQuery, filterType]);

  const grouped = React.useMemo(() => groupEventsByDate(filteredEvents, sortOrder), [filteredEvents, sortOrder]);
  const totalFilteredCount = filteredEvents.length;

  return (
    <div className="space-y-6">
      {/* Unified Filters Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3.5 items-center justify-between bg-slate-50/50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 rounded-xl shadow-2xs w-full select-none">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="Search case history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9.5 h-9.5 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 w-full font-medium"
            aria-label="Search case history"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[145px] h-9.5 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shrink-0 font-bold cursor-pointer" aria-label="Filter events type">
              <SelectValue placeholder="All Activity" />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => <SelectItem key={f.value} value={f.value} className="text-xs font-semibold">{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
            <SelectTrigger className="w-[125px] h-9.5 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shrink-0 font-bold cursor-pointer" aria-label="Sort chronological order">
              <SelectValue placeholder="Newest First" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs font-semibold">Newest First</SelectItem>
              <SelectItem value="oldest" className="text-xs font-semibold">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Timeline Output Feed */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed rounded-xl py-14 text-center bg-card border-slate-200 dark:border-slate-800 select-none">
          <Clock className="h-8 w-8 text-slate-350 dark:text-slate-650 mb-2" />
          <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">No events found</h5>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs leading-normal">No history matches your search and filter criteria.</p>
        </div>
      ) : (
        <div className="relative pt-2">
          {/* Symmetrical Vertical line spanning the entire timeline feed container */}
          <div className="absolute left-[17px] sm:left-[21px] md:left-[165px] top-6 bottom-6 w-0.5 bg-slate-150 dark:bg-slate-800" />
          
          <div className="space-y-0">
            {(() => {
              let globalIndex = 0;
              return grouped.map(({ label, items }) => (
                <React.Fragment key={label}>
                  {items.map((event, idx) => {
                    const doc = event.documentId ? documents.find((d) => d.id === event.documentId) : null;
                    const isFirstGlobal = globalIndex === 0;
                    const isLastGlobal = globalIndex === totalFilteredCount - 1;
                    globalIndex++;

                    return (
                      <ActivityItem
                        key={event.id}
                        event={event}
                        doc={doc ?? null}
                        onViewSummary={(d) => setSummaryDoc(d)}
                        isFirstInDateGroup={idx === 0}
                        groupLabel={label}
                        isFirstGlobal={isFirstGlobal}
                        isLastGlobal={isLastGlobal}
                      />
                    );
                  })}
                </React.Fragment>
              ));
            })()}
          </div>
        </div>
      )}
      <DocumentSummaryModal doc={summaryDoc} onClose={() => setSummaryDoc(null)} />
    </div>
  );
}

export function HistoryTimeline({
  events,
  documents,
}: {
  events: ComplaintHistoryEvent[];
  documents: ComplaintDocument[];
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-14 text-center border-slate-200 dark:border-slate-800">
        <Clock className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" aria-hidden />
        <p className="text-xs font-bold text-slate-800 dark:text-slate-300">No activity yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground max-w-xs leading-normal">Uploads, replies, drafts, and status updates will appear here.</p>
      </div>
    );
  }
  return <ActivityFeed events={events} documents={documents} />;
}
