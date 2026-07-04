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
import { getDocumentViewUrl } from "@/lib/actions/complaints";
import type { ComplaintHistoryEvent, ComplaintHistoryType } from "@/lib/complaint-history";

// ── Event Style Map ──────────────────────────────────────────────────────────

interface ActivityStyle {
  label: string;
  Icon: LucideIcon;
  borderClass: string;
  iconBgClass: string;
}

const STYLES: Record<ComplaintHistoryType, ActivityStyle> = {
  Created: { label: "Case Created", Icon: Plus, borderClass: "border-l-blue-500", iconBgClass: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" },
  Filed: { label: "Filed", Icon: Send, borderClass: "border-l-blue-500", iconBgClass: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" },
  Acknowledged: { label: "Acknowledged", Icon: ClipboardCheck, borderClass: "border-l-indigo-500", iconBgClass: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400" },
  "Reply Received": { label: "Reply Received", Icon: Mail, borderClass: "border-l-teal-500", iconBgClass: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400" },
  "Action Taken": { label: "Action Taken", Icon: FileCheck2, borderClass: "border-l-emerald-500", iconBgClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" },
  "Site Visit": { label: "Site Visit", Icon: MapPin, borderClass: "border-l-amber-500", iconBgClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" },
  "Photo Evidence": { label: "Photo Evidence", Icon: Camera, borderClass: "border-l-cyan-500", iconBgClass: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400" },
  "Follow-up": { label: "Follow-up", Icon: Bell, borderClass: "border-l-amber-500", iconBgClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" },
  Escalation: { label: "Escalation", Icon: Gavel, borderClass: "border-l-rose-500", iconBgClass: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400" },
  Reminder: { label: "Reminder", Icon: CheckCircle2, borderClass: "border-l-emerald-500", iconBgClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" },
  "Status Change": { label: "Status Updated", Icon: RefreshCw, borderClass: "border-l-slate-400 dark:border-l-slate-600", iconBgClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-500" },
  Closure: { label: "Closed", Icon: Archive, borderClass: "border-l-slate-400 dark:border-l-slate-600", iconBgClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-500" },
  Reopened: { label: "Reopened", Icon: RotateCcw, borderClass: "border-l-rose-500", iconBgClass: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400" },
  Note: { label: "Note", Icon: StickyNote, borderClass: "border-l-slate-400 dark:border-l-slate-600", iconBgClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-500" },
};

const AI_STYLE: ActivityStyle = { label: "AI Correspondence", Icon: Sparkles, borderClass: "border-l-violet-500", iconBgClass: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400" };

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

// ── Presentation pieces ──────────────────────────────────────────────────────

const ActivityTimestamp = React.memo(function ActivityTimestamp({ date }: { date: string }) {
  return (
    <div className="text-right select-none shrink-0 text-slate-400 dark:text-slate-500 font-semibold text-[11px] self-end mt-1.5 sm:mt-0">
      <span>{formatTimestampDate(date)} {formatTimestampTime(date)}</span>
      <span className="mx-1.5">•</span>
      <span className="font-bold text-slate-500 dark:text-slate-400">{timeAgo(date)}</span>
    </div>
  );
});

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

  if (!isLong) return <p className="text-[13px] sm:text-[14px] text-slate-600 dark:text-slate-400 leading-normal">{text}</p>;

  return (
    <p className="text-[13px] sm:text-[14px] text-slate-600 dark:text-slate-400 leading-normal">
      {expanded ? text : `${text.slice(0, 130)}...`}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="ml-1.5 font-bold text-primary hover:underline text-[9.5px] uppercase tracking-wide cursor-pointer focus:outline-none"
      >
        {expanded ? "Show Less" : "Show More"}
      </button>
    </p>
  );
}

const ActivityItem = React.memo(function ActivityItem({ event }: { event: ComplaintHistoryEvent }) {
  const [expanded, setExpanded] = React.useState(false);
  const style = event.isAiCorrespondence ? AI_STYLE : (STYLES[event.type] || STYLES.Note);
  const hasDetail = !!event.documentId;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); }
  };

  return (
    <div
      onClick={() => hasDetail && setExpanded(!expanded)}
      onKeyDown={handleKeyDown}
      tabIndex={hasDetail ? 0 : -1}
      role={hasDetail ? "button" : "presentation"}
      aria-expanded={hasDetail ? expanded : undefined}
      className={cn(
        "group border rounded-xl p-3 sm:p-3.5 flex flex-col justify-between bg-card transition-all duration-150 ease-out border-l-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        style.borderClass,
        "shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-xs hover:bg-slate-50/20 dark:hover:bg-slate-800/20",
        hasDetail ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs mt-0.5", style.iconBgClass)}>
            <style.Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-[14px] sm:text-[15px] font-bold text-slate-800 dark:text-slate-200">{event.title}</span>
            </div>
            {event.summary && (
              <div className="mt-1">
                <ActivityDescription text={event.summary} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end border-t border-slate-50 dark:border-slate-900/40 pt-2 sm:pt-0 sm:border-0 shrink-0">
          <ActivityTimestamp date={event.createdAt} />
          {hasDetail && (
            <button type="button" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0" aria-label="Toggle attachment">
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
            className="overflow-hidden mt-2.5 pl-11"
            onClick={(e) => e.stopPropagation()}
          >
            <ActivityAttachment event={event} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const ActivityGroup = React.memo(function ActivityGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="flex items-center gap-2 select-none py-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
        <div className="h-px bg-slate-100 dark:bg-slate-800/80 flex-1" />
      </div>
      <div className="space-y-2">{children}</div>
    </motion.div>
  );
});

const FILTERS: { value: string; label: string; test: (e: ComplaintHistoryEvent) => boolean }[] = [
  { value: "all", label: "All Activity", test: () => true },
  { value: "correspondence", label: "Correspondence", test: (e) => ["Reply Received", "Action Taken", "Escalation"].includes(e.type) || e.isAiCorrespondence },
  { value: "documents", label: "Documents", test: (e) => !!e.documentId },
  { value: "status", label: "Status Changes", test: (e) => ["Status Change", "Closure", "Reopened", "Filed", "Acknowledged"].includes(e.type) },
  { value: "reminders", label: "Reminders", test: (e) => ["Follow-up", "Reminder"].includes(e.type) },
];

function ActivityFeed({ events }: { events: ComplaintHistoryEvent[] }) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterType, setFilterType] = React.useState<string>("all");
  const [sortOrder, setSortOrder] = React.useState<"newest" | "oldest">("newest");

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

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-slate-50/50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-2.5 rounded-xl shadow-3xs w-full">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="Search case history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 w-full"
            aria-label="Search case history"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[145px] h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shrink-0 cursor-pointer" aria-label="Filter events type">
              <SelectValue placeholder="All Activity" />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
            <SelectTrigger className="w-[125px] h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shrink-0 cursor-pointer" aria-label="Sort chronological order">
              <SelectValue placeholder="Newest First" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed rounded-xl py-12 text-center bg-card border-slate-200 dark:border-slate-800 select-none">
          <Clock className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
          <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300">No events found</h5>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs leading-normal">No history matches your search and filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ label, items }) => (
            <ActivityGroup key={label} label={label}>
              {items.map((e) => <ActivityItem key={e.id} event={e} />)}
            </ActivityGroup>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryTimeline({ events }: { events: ComplaintHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 text-center border-slate-200 dark:border-slate-800">
        <Clock className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" aria-hidden />
        <p className="text-xs font-bold text-slate-800 dark:text-slate-300">No activity yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground max-w-xs leading-normal">Uploads, replies, drafts, and status updates will appear here.</p>
      </div>
    );
  }
  return <ActivityFeed events={events} />;
}
