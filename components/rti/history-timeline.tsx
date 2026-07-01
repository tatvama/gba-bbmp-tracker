"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  FileText,
  Flag,
  Calendar,
  Trash2,
  History,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Search,
  Eye,
  Award,
  Mail,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSignedUrlAction } from "@/lib/actions/rti";
import type { RtiHistoryEvent, RtiHistoryType } from "@/lib/rti-history";

// ── Event Style Map ──────────────────────────────────────────────────────────

interface ActivityStyle {
  label: string;
  Icon: LucideIcon;
  borderClass: string;     // Left border accent
  iconBgClass: string;     // 32px square container background
  iconTextClass: string;   // Icon fill stroke color
}

const STYLES: Record<RtiHistoryType, ActivityStyle> = {
  created: {
    label: "Case Created",
    Icon: Plus,
    borderClass: "border-l-blue-500",
    iconBgClass: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
    iconTextClass: "text-blue-600 dark:text-blue-400",
  },
  document_uploaded: {
    label: "Document Uploaded",
    Icon: FileText,
    borderClass: "border-l-cyan-500",
    iconBgClass: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400",
    iconTextClass: "text-cyan-600 dark:text-cyan-400",
  },
  reply_uploaded: {
    label: "Reply Received",
    Icon: Mail,
    borderClass: "border-l-emerald-500",
    iconBgClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    iconTextClass: "text-emerald-600 dark:text-emerald-400",
  },
  ack_uploaded: {
    label: "Acknowledgement",
    Icon: Award,
    borderClass: "border-l-amber-500",
    iconBgClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
    iconTextClass: "text-amber-600 dark:text-amber-400",
  },
  status_changed: {
    label: "Status Updated",
    Icon: Flag,
    borderClass: "border-l-slate-400 dark:border-l-slate-600",
    iconBgClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-455",
    iconTextClass: "text-slate-600 dark:text-slate-455",
  },
  date_filed: {
    label: "Filing Date Recorded",
    Icon: Calendar,
    borderClass: "border-l-purple-500",
    iconBgClass: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400",
    iconTextClass: "text-purple-600 dark:text-purple-400",
  },
  document_deleted: {
    label: "Document Removed",
    Icon: Trash2,
    borderClass: "border-l-rose-500",
    iconBgClass: "bg-rose-50 dark:bg-rose-955/40 text-rose-600 dark:text-rose-455",
    iconTextClass: "text-rose-600 dark:text-rose-455",
  },
  changed: {
    label: "Details Changed",
    Icon: History,
    borderClass: "border-l-slate-400 dark:border-l-slate-600",
    iconBgClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-455",
    iconTextClass: "text-slate-600 dark:text-slate-455",
  },
};

// ── Time & Date Formatting Utilities ─────────────────────────────────────────

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
  events: RtiHistoryEvent[],
  sortOrder: "newest" | "oldest"
): { label: string; items: RtiHistoryEvent[] }[] {
  const groups: Record<string, RtiHistoryEvent[]> = {};
  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

  for (const event of events) {
    const d = new Date(event.createdAt);
    if (isNaN(d.getTime())) {
      const key = "Earlier Activity";
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
      continue;
    }

    const dateStr = d.toDateString();
    let label = "";
    if (dateStr === todayStr) {
      label = "Today";
    } else if (dateStr === yesterdayStr) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label]?.push(event);
  }

  const sortedEntries = Object.entries(groups).sort((a, b) => {
    const dateA = a[0] === "Today" ? new Date() : a[0] === "Yesterday" ? new Date(Date.now() - 86400000) : new Date(a[0]);
    const dateB = b[0] === "Today" ? new Date() : b[0] === "Yesterday" ? new Date(Date.now() - 86400000) : new Date(b[0]);
    return sortOrder === "newest" ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
  });

  return sortedEntries.map(([label, items]) => {
    const sortedItems = items.slice().sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
    return { label, items: sortedItems };
  });
}

// ── Reusable Presentation Components ─────────────────────────────────────────

export const ActivityBadge = React.memo(function ActivityBadge({
  text,
  variant = "default",
}: {
  text: string;
  variant?: "success" | "warning" | "error" | "default";
}) {
  let badgeCls = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-350 border-slate-200 dark:border-slate-800";
  if (variant === "success") {
    badgeCls = "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/40";
  } else if (variant === "warning") {
    badgeCls = "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-955/20 dark:text-amber-450 dark:border-amber-900/40";
  } else if (variant === "error") {
    badgeCls = "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-955/20 dark:text-rose-450 dark:border-rose-900/40";
  }

  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider select-none shrink-0", badgeCls)}>
      {text}
    </span>
  );
});

export const ActivityUser = React.memo(function ActivityUser({ event }: { event: RtiHistoryEvent }) {
  const actor = event.performedBy || "System";
  const actionLabel = event.type === "created"
    ? "Created by"
    : event.type === "document_uploaded" || event.type === "reply_uploaded" || event.type === "ack_uploaded"
    ? "Uploaded by"
    : "Updated by";

  return (
    <span className="text-[12px] text-slate-500 dark:text-slate-455 font-semibold">
      {actionLabel} <span className="font-bold text-slate-700 dark:text-slate-300">{actor}</span>
    </span>
  );
});

export const ActivityTimestamp = React.memo(function ActivityTimestamp({ date }: { date: string }) {
  return (
    <div className="text-right select-none shrink-0 text-slate-450 dark:text-slate-500 font-semibold text-[11px] self-end mt-1.5 sm:mt-0">
      <span>{formatTimestampDate(date)} {formatTimestampTime(date)}</span>
      <span className="mx-1.5">•</span>
      <span className="font-bold text-slate-500 dark:text-slate-400">{timeAgo(date)}</span>
    </div>
  );
});

export const ActivityAttachment = React.memo(function ActivityAttachment({ event }: { event: RtiHistoryEvent }) {
  const [busy, setBusy] = React.useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!event.pdfPath) return;
    setBusy(true);
    try {
      const url = await getSignedUrlAction(event.pdfPath);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  const name = event.documentName || "document.pdf";
  const ext = name.split(".").pop()?.toUpperCase() || "PDF";
  const sizeStr = event.pageCount ? `${event.pageCount * 85} KB` : "120 KB";

  return (
    <button
      onClick={handleDownload}
      disabled={busy}
      className="inline-flex items-center gap-2 px-2.5 py-1 border rounded-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-left hover:border-slate-350 dark:hover:border-slate-700 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 max-w-[280px] sm:max-w-xs group cursor-pointer shadow-3xs text-[11px]"
      aria-label={`View attachment ${name}`}
    >
      <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
      <span className="font-bold text-slate-700 dark:text-slate-300 truncate group-hover:text-primary transition-colors">
        {name}
      </span>
      <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold uppercase shrink-0">
        {ext} • {sizeStr}
      </span>
      <span className="text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 shrink-0 pl-0.5">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
      </span>
    </button>
  );
});

// Description block with inline expander check
function ActivityDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const isLong = text.length > 150;

  if (!isLong) {
    return <p className="text-[13px] sm:text-[14px] text-slate-650 dark:text-slate-400 leading-normal">{text}</p>;
  }

  const displayText = expanded ? text : `${text.slice(0, 130)}...`;

  return (
    <p className="text-[13px] sm:text-[14px] text-slate-650 dark:text-slate-400 leading-normal">
      {displayText}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="ml-1.5 font-bold text-primary hover:underline text-[9.5px] uppercase tracking-wide cursor-pointer focus:outline-none"
      >
        {expanded ? "Show Less" : "Show More"}
      </button>
    </p>
  );
}

// ── Detail Table inside expanded drawers (lazily rendered) ───────────────────

function DetailGrid({ event }: { event: RtiHistoryEvent }) {
  return (
    <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 text-[11px] leading-relaxed">
      {event.performedBy && (
        <div>
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Actor</span>
          <span className="font-semibold text-slate-700 dark:text-slate-350">{event.performedBy}</span>
        </div>
      )}
      {event.docType && (
        <div>
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Document Type</span>
          <span className="font-semibold text-slate-700 dark:text-slate-350">{event.docType}</span>
        </div>
      )}
      {event.pageCount && (
        <div>
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Page Count</span>
          <span className="font-semibold text-slate-700 dark:text-slate-350">{event.pageCount} page(s)</span>
        </div>
      )}
      {event.fieldLabel && (
        <div>
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Field Edited</span>
          <span className="font-semibold text-slate-700 dark:text-slate-350">{event.fieldLabel}</span>
        </div>
      )}
      {event.oldValue && (
        <div className="col-span-1">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Previous Value</span>
          <span className="font-semibold text-slate-450 dark:text-slate-500 line-through truncate block max-w-[160px] sm:max-w-[200px]">{event.oldValue}</span>
        </div>
      )}
      {event.newValue && (
        <div className="col-span-1">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">New Value</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block max-w-[160px] sm:max-w-[200px]">{event.newValue}</span>
        </div>
      )}
    </div>
  );
}

// ── ActivityItem: Compact rounded event row container ────────────────────────

export const ActivityItem = React.memo(function ActivityItem({ event }: { event: RtiHistoryEvent }) {
  const [expanded, setExpanded] = React.useState(false);

  // Retrieve matching style parameters based on event type
  let style = STYLES[event.type] || STYLES.changed;

  // Custom coloring overrides based on documents type details
  if (event.type === "document_uploaded" && event.docType === "Application") {
    style = {
      ...style,
      Icon: UploadCloud,
      borderClass: "border-l-cyan-500",
      iconBgClass: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400",
      iconTextClass: "text-cyan-600 dark:text-cyan-400",
    };
  }

  if (event.type === "status_changed") {
    const val = (event.newValue || "").toLowerCase();
    if (val.includes("close")) {
      style = { ...style, borderClass: "border-l-slate-400 dark:border-l-slate-600" };
    } else if (val.includes("appeal") || val.includes("faa")) {
      style = { ...style, borderClass: "border-l-rose-500" };
    } else {
      style = { ...style, borderClass: "border-l-amber-500" };
    }
  }

  const heading =
    event.type === "document_uploaded" && event.docType
      ? `${event.docType} Uploaded`
      : style.label;

  let descriptionText = event.newValue || event.oldValue || "";
  if (event.type === "created") {
    descriptionText = `Initial case registered with subject: "${event.newValue}".`;
  } else if (event.type === "document_uploaded" || event.type === "reply_uploaded" || event.type === "ack_uploaded") {
    descriptionText = `Uploaded document "${event.documentName || "file.pdf"}" of type "${event.docType || "Attachment"}".`;
  } else if (event.type === "status_changed") {
    descriptionText = `Status updated from "${event.oldValue || "Draft"}" to "${event.newValue}".`;
  } else if (event.type === "date_filed") {
    descriptionText = `Filing date recorded as ${formatTimestampDate(event.newValue || "")}.`;
  } else if (event.type === "document_deleted") {
    descriptionText = `Document "${event.documentName}" was removed.`;
  } else if (event.type === "changed" && event.fieldLabel) {
    descriptionText = `Field "${event.fieldLabel}" changed to "${event.newValue || "—"}".`;
  }

  const hasMetadata = !!(event.performedBy || event.docType || event.pageCount || event.fieldLabel || event.oldValue || event.newValue);
  const isImportant = event.type === "status_changed" && (event.newValue === "Appeal Filed" || event.newValue === "Hearing Scheduled");
  const isOverdue = event.type === "changed" && event.fieldLabel === "overdue";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpanded(!expanded);
    }
  };

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      onKeyDown={handleKeyDown}
      tabIndex={hasMetadata ? 0 : -1}
      role={hasMetadata ? "button" : "presentation"}
      aria-expanded={hasMetadata ? expanded : undefined}
      className={cn(
        "group border rounded-xl p-3 sm:p-3.5 flex flex-col justify-between bg-card transition-all duration-150 ease-out border-l-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        style.borderClass,
        "shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-xs hover:bg-slate-50/20 dark:hover:bg-slate-850/20",
        hasMetadata ? "cursor-pointer" : "cursor-default"
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* 32px Square wrapped icon container */}
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs mt-0.5", style.iconBgClass)}>
            <style.Icon className="h-4.5 w-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[14px] sm:text-[15px] font-bold text-slate-800 dark:text-slate-200">
                {heading}
              </span>
              <ActivityUser event={event} />
              
              {isImportant && <ActivityBadge text={event.newValue || "Important"} variant="warning" />}
              {isOverdue && <ActivityBadge text="Overdue" variant="error" />}
            </div>

            <div className="mt-1">
              <ActivityDescription text={descriptionText} />
            </div>
          </div>
        </div>

        {/* Timestamp on right column for desktop, inline wraps below on mobile */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end border-t border-slate-50 dark:border-slate-900/40 pt-2 sm:pt-0 sm:border-0 shrink-0">
          <ActivityTimestamp date={event.createdAt} />
          {hasMetadata && (
            <button
              type="button"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Toggle details view"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Attachment Pills Row */}
      {event.pdfPath && (
        <div className="mt-2 pl-11 flex flex-wrap gap-1.5">
          <ActivityAttachment event={event} />
        </div>
      )}

      {/* Expansion details grid drawer */}
      <AnimatePresence initial={false}>
        {expanded && hasMetadata && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden mt-3 pl-11 border-t border-slate-100 dark:border-slate-800 pt-3"
            onClick={(e) => e.stopPropagation()} // Stop bubbling inside expanded drawer click
          >
            <DetailGrid event={event} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ── ActivityGroup: Calendar grouped days ─────────────────────────────────────

export const ActivityGroup = React.memo(function ActivityGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2 select-none py-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {label}
        </span>
        <div className="h-px bg-slate-100 dark:bg-slate-800/80 flex-1" />
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </motion.div>
  );
});

// ── ActivityFeed: Public timeline cockpit ───────────────────────────────────

export function ActivityFeed({ events }: { events: RtiHistoryEvent[] }) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterType, setFilterType] = React.useState<string>("all");
  const [sortOrder, setSortOrder] = React.useState<"newest" | "oldest">("newest");

  const filteredEvents = React.useMemo(() => {
    return events.filter((e) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const actor = (e.performedBy || "").toLowerCase();
        const docName = (e.documentName || "").toLowerCase();
        const heading = (e.docType || e.type || "").toLowerCase();
        const matches = actor.includes(q) || docName.includes(q) || heading.includes(q);
        if (!matches) return false;
      }

      if (filterType === "documents") {
        return e.type === "document_uploaded" || e.type === "reply_uploaded" || e.type === "ack_uploaded" || e.type === "document_deleted";
      }
      if (filterType === "status") {
        return e.type === "status_changed";
      }
      if (filterType === "edits") {
        return e.type === "changed" || e.type === "date_filed";
      }

      return true;
    });
  }, [events, searchQuery, filterType]);

  const grouped = React.useMemo(() => {
    return groupEventsByDate(filteredEvents, sortOrder);
  }, [filteredEvents, sortOrder]);

  return (
    <div className="space-y-3.5">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-slate-50/50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-2.5 rounded-xl shadow-3xs w-full">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 w-full"
            aria-label="Search change history log"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[125px] h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shrink-0 cursor-pointer" aria-label="Filter events type">
              <SelectValue placeholder="All Activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity</SelectItem>
              <SelectItem value="documents">Documents</SelectItem>
              <SelectItem value="status">Status Changes</SelectItem>
              <SelectItem value="edits">Audits & Edits</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
            <SelectTrigger className="w-[125px] h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shrink-0 cursor-pointer" aria-label="Sort activity chronological order">
              <SelectValue placeholder="Newest First" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Feed Area */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed rounded-xl py-12 text-center bg-card border-slate-200 dark:border-slate-800 select-none">
          <Clock className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
          <h5 className="text-xs font-bold text-slate-700 dark:text-slate-350">No events found</h5>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs leading-normal">
            No history logs match your search and filter criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ label, items }) => (
            <ActivityGroup key={label} label={label}>
              {items.map((e) => (
                <ActivityItem key={e.id} event={e} />
              ))}
            </ActivityGroup>
          ))}
        </div>
      )}
    </div>
  );
}

// ── HistoryTimeline Wrapper Component ────────────────────────────────────────

export function HistoryTimeline({ events }: { events: RtiHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 text-center border-slate-200 dark:border-slate-800">
        <Clock className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" aria-hidden />
        <p className="text-xs font-bold text-slate-800 dark:text-slate-300">No activity yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground max-w-xs leading-normal">
          Uploads, status updates, and filing dates will appear here.
        </p>
      </div>
    );
  }

  return <ActivityFeed events={events} />;
}
