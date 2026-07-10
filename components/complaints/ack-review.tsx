"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, CheckCircle2, XCircle, Search, Scissors, Merge, RefreshCw,
  ArrowRight, FileText, Sparkles, Link2, RotateCcw, X, ChevronRight,
  ChevronLeft, Calendar, MapPin, Building2, HelpCircle, ArrowLeft,
  Eye, PanelRightClose, ScanText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AckWorkflowStepper } from "./ack-reconcile-upload";
import {
  getAckBatchAction, updateAckItemAction, searchComplaintsForMatchAction,
  reextractAckItemAction, mergeAckItemsAction, splitAckItemAction, commitAckBatchAction,
  rematchAckBatchAction,
} from "@/lib/actions/ack-import";
import { cn } from "@/lib/utils";
import type { AckBatchView, AckReviewItem, ComplaintSummary, MatchConfidence } from "@/lib/complaints/ack-reconcile";

const CONF: Record<MatchConfidence, { dot: string; badge: string; label: string; text: string }> = {
  high: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-250/50", label: "High Confidence", text: "text-emerald-600" },
  medium: { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-250/50", label: "Needs Review", text: "text-amber-600" },
  low: { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 border-orange-250/50", label: "Low Confidence", text: "text-orange-600" },
  none: { dot: "bg-slate-400", badge: "bg-slate-50 text-slate-650 dark:bg-slate-800 dark:text-slate-350 border-slate-200/50", label: "No Match", text: "text-slate-500" },
};

function complaintLabel(c: ComplaintSummary | null): string {
  if (!c) return "";
  return c.caseNumber || c.complaintNumber || c.jobNumber || c.title || c.id.slice(0, 8);
}

function ComplaintPicker({ onPick }: { onPick: (c: ComplaintSummary) => void }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<ComplaintSummary[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    let active = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await searchComplaintsForMatchAction(q);
      if (active) { setResults(r); setOpen(true); setBusy(false); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [q]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-450" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search complaint (case no, BBMP no, job code, subject)…"
          className="h-9 pl-8 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
        />
        {busy && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPick(c); setOpen(false); setQ(""); setResults([]); }}
              className="flex w-full flex-col gap-0.5 border-b border-slate-105/80 px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono font-semibold text-slate-750 dark:text-slate-200">{c.caseNumber || "—"}</span>
                {c.jobNumber && <span className="rounded bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 px-1.5 font-mono text-[9.5px] text-indigo-700">{c.jobNumber}</span>}
                {c.status && <span className="text-[9.5px] text-slate-400">{c.status}</span>}
              </span>
              <span className="truncate text-slate-500 dark:text-slate-400">{c.title || "(no subject)"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AckReview({ initial }: { initial: AckBatchView }) {
  const router = useRouter();
  const [batch, setBatch] = React.useState<AckBatchView>(initial);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [committing, setCommitting] = React.useState(false);
  const [rematching, setRematching] = React.useState(false);
  const [banner, setBanner] = React.useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterConfidence, setFilterConfidence] = React.useState<string>("all");
  const [filterStatus, setFilterStatus] = React.useState<string>("all");

  // Multi-select batch actions state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Slide Drawer details workspace state
  const [reviewItem, setReviewItem] = React.useState<AckReviewItem | null>(null);
  const [reviewItemIndex, setReviewItemIndex] = React.useState<number | null>(null);
  const [drawerTab, setDrawerTab] = React.useState<"info" | "ocr">("info");
  const [drawerActivePage, setDrawerActivePage] = React.useState<number>(0);

  React.useEffect(() => setBatch(initial), [initial]);

  const items = batch.items;
  const readOnly = batch.status === "committed";

  const counts = React.useMemo(() => {
    let confirmed = 0, skipped = 0, pending = 0, committed = 0, unmatched = 0;
    for (const it of items) {
      if (it.decision === "committed") committed++;
      else if (it.decision === "confirmed") confirmed++;
      else if (it.decision === "skipped") skipped++;
      else { pending++; if (!it.assignedComplaintId) unmatched++; }
    }
    return { confirmed, skipped, pending, committed, unmatched };
  }, [items]);

  const filteredItems = React.useMemo(() => {
    return items.map((it, originalIndex) => ({ ...it, originalIndex })).filter((it) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const ex = it.extracted as Record<string, unknown>;
        const matchSubject = String(ex.subject || "").toLowerCase().includes(q);
        const matchRef = String(ex.referenceNumber || "").toLowerCase().includes(q);
        const matchJob = String(ex.jobNumber || "").toLowerCase().includes(q);
        const matchArea = String(ex.areaOrWard || "").toLowerCase().includes(q);
        const matchCase = String(it.assigned?.caseNumber || "").toLowerCase().includes(q);
        const matchTitle = String(it.assigned?.title || "").toLowerCase().includes(q);
        if (!matchSubject && !matchRef && !matchJob && !matchArea && !matchCase && !matchTitle) {
          return false;
        }
      }

      if (filterConfidence !== "all" && it.matchConfidence !== filterConfidence) {
        return false;
      }

      if (filterStatus !== "all") {
        if (filterStatus === "pending" && it.decision !== "pending") return false;
        if (filterStatus === "confirmed" && it.decision !== "confirmed" && it.decision !== "committed") return false;
        if (filterStatus === "skipped" && it.decision !== "skipped") return false;
      }

      return true;
    });
  }, [items, searchQuery, filterConfidence, filterStatus]);

  async function resync() {
    const res = await getAckBatchAction(batch.id);
    if ("error" in res) { setBanner(res.error); return; }
    setBatch(res.batch);
  }

  function patchLocal(itemId: string, patch: Partial<AckReviewItem>) {
    setBatch((b) => ({ ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }));
  }

  async function setDecision(it: AckReviewItem, decision: AckReviewItem["decision"]) {
    if (readOnly) return;
    patchLocal(it.id, { decision });
    await updateAckItemAction({ itemId: it.id, decision });
  }

  async function assign(it: AckReviewItem, c: ComplaintSummary) {
    patchLocal(it.id, { assignedComplaintId: c.id, assigned: c });
    await updateAckItemAction({ itemId: it.id, assignedComplaintId: c.id });
    
    // Update review item if it is open in drawer
    if (reviewItem && reviewItem.id === it.id) {
      setReviewItem((prev) => prev ? { ...prev, assignedComplaintId: c.id, assigned: c } : null);
    }
  }

  async function structural(fn: () => Promise<{ ok: boolean; error?: string }>, id: string) {
    setBusyId(id);
    const r = await fn();
    setBusyId(null);
    if (!r.ok) { setBanner(r.error || "Action failed."); return; }
    await resync();
  }

  async function confirmAllHigh() {
    const targets = items.filter((it) => it.decision === "pending" && it.matchConfidence === "high" && it.assignedComplaintId);
    for (const it of targets) patchLocal(it.id, { decision: "confirmed" });
    await Promise.all(targets.map((it) => updateAckItemAction({ itemId: it.id, decision: "confirmed" })));
    setBanner(`Confirmed ${targets.length} high-confidence match(es).`);
  }

  async function commit() {
    setCommitting(true);
    setBanner(null);
    const r = await commitAckBatchAction(batch.id);
    setCommitting(false);
    if (!r.ok) { setBanner(r.error || "Attach failed."); return; }
    const dup = r.skippedDuplicate ? ` Skipped ${r.skippedDuplicate} already-acknowledged.` : "";
    setBanner(`Attached ${r.attached ?? 0} acknowledgment(s) to their complaints.${dup}`);
    await resync();
    router.refresh();
  }

  async function rematch() {
    setRematching(true);
    setBanner(null);
    const r = await rematchAckBatchAction(batch.id);
    setRematching(false);
    if (!r.ok) { setBanner(r.error || "Re-run failed."); return; }
    await resync();
    setBanner(
      r.matched
        ? `Re-ran matching against current complaints — ${r.matched} of ${r.total} now matched.`
        : `Re-ran matching — still no complaint carries these job numbers. Confirm the complaint exists and its Job Number is set, then try again.`,
    );
  }

  // Batch Select Actions
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => it.id)));
    }
  }

  async function batchConfirm() {
    const targets = items.filter((it) => selectedIds.has(it.id) && it.assignedComplaintId && it.decision !== "committed");
    for (const it of targets) patchLocal(it.id, { decision: "confirmed" });
    await Promise.all(targets.map((it) => updateAckItemAction({ itemId: it.id, decision: "confirmed" })));
    setSelectedIds(new Set());
    setBanner(`Successfully confirmed ${targets.length} matches.`);
  }

  async function batchSkip() {
    const targets = items.filter((it) => selectedIds.has(it.id) && it.decision !== "committed");
    for (const it of targets) patchLocal(it.id, { decision: "skipped" });
    await Promise.all(targets.map((it) => updateAckItemAction({ itemId: it.id, decision: "skipped" })));
    setSelectedIds(new Set());
    setBanner(`Skipped ${targets.length} acknowledgments.`);
  }

  function openDrawer(it: AckReviewItem, index: number) {
    setReviewItem(it);
    setReviewItemIndex(index);
    setDrawerActivePage(0);
    setDrawerTab("info");
  }

  function closeDrawer() {
    setReviewItem(null);
    setReviewItemIndex(null);
  }

  function navigateDrawer(dir: "prev" | "next") {
    if (reviewItemIndex === null) return;
    let nextIdx = dir === "prev" ? reviewItemIndex - 1 : reviewItemIndex + 1;
    if (nextIdx >= 0 && nextIdx < items.length) {
      openDrawer(items[nextIdx]!, nextIdx);
    }
  }

  if (batch.status === "processing") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900 shadow-3xs">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">{batch.stage || "Processing…"}</p>
        <p className="mt-1 text-xs text-slate-500">{batch.message || "Splitting, reading and matching…"}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={resync}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <AckWorkflowStepper currentStep={2} />

      {banner && (
        <div className="flex gap-2.5 rounded-xl border border-indigo-250 bg-indigo-50/20 p-3.5 text-xs text-indigo-700 dark:border-slate-800 dark:bg-slate-950/45 dark:text-indigo-400 select-none">
          <Sparkles className="h-4.5 w-4.5 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      {/* KPI Cards section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200 bg-white dark:border-slate-850 dark:bg-slate-900/60 shadow-3xs p-4 flex flex-col justify-between">
          <div className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider">Total Detected</div>
          <div className="text-2xl font-bold mt-1.5 text-slate-800 dark:text-slate-250">{items.length}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Found in scanned batch</p>
        </Card>
        <Card className="border border-slate-200 bg-white dark:border-slate-850 dark:bg-slate-900/60 shadow-3xs p-4 flex flex-col justify-between">
          <div className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider">Matched Proposed</div>
          <div className="text-2xl font-bold mt-1.5 text-emerald-600 dark:text-emerald-500">{counts.confirmed + counts.committed}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Linked successfully</p>
        </Card>
        <Card className="border border-slate-200 bg-white dark:border-slate-850 dark:bg-slate-900/60 shadow-3xs p-4 flex flex-col justify-between">
          <div className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider">Needs Review</div>
          <div className="text-2xl font-bold mt-1.5 text-amber-600 dark:text-amber-500">{counts.pending}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Awaiting verification</p>
        </Card>
        <Card className="border border-slate-200 bg-white dark:border-slate-850 dark:bg-slate-900/60 shadow-3xs p-4 flex flex-col justify-between">
          <div className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider">Skipped / Unmatched</div>
          <div className="text-2xl font-bold mt-1.5 text-slate-650 dark:text-slate-450">{counts.skipped}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Documents bypassed</p>
        </Card>
      </div>

      {/* Page-strip section */}
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs rounded-2xl p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
            Interactive Page Strip — Adjust boundaries
          </h4>
          <span className="text-[10px] text-slate-400">Merge items or split pages to define document sections</span>
        </div>
        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
          {items.map((it, si) => (
            <React.Fragment key={it.id}>
              {si > 0 && !readOnly && (
                <button
                  type="button"
                  title="Merge with previous acknowledgment"
                  onClick={() => structural(() => mergeAckItemsAction(items[si - 1]!.id, it.id), it.id)}
                  className="flex w-6 shrink-0 flex-col items-center justify-center rounded-lg text-slate-350 hover:bg-indigo-50/50 hover:text-indigo-600 dark:hover:bg-slate-850/50 transition-colors"
                >
                  <Merge className="h-4 w-4" />
                </button>
              )}
              <div className={cn(
                "flex shrink-0 items-end gap-1.5 rounded-xl border p-2 transition-all shadow-3xs",
                si % 2 === 0
                  ? "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20"
                  : "border-indigo-150 bg-indigo-50/20 dark:border-slate-800/80 dark:bg-indigo-950/5"
              )}>
                {it.thumbUrls.length === 0 && (
                  <div className="flex h-20 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-300 dark:bg-slate-800">
                    <FileText className="h-5 w-5" />
                  </div>
                )}
                {it.thumbUrls.map((url, pi) => {
                  const pageNum = it.pageStart + pi;
                  return (
                    <React.Fragment key={pageNum}>
                      {pi > 0 && !readOnly && (
                        <button
                          type="button"
                          title={`Split — start a new acknowledgment at page ${pageNum}`}
                          onClick={() => structural(() => splitAckItemAction(it.id, pageNum), it.id)}
                          className="flex w-4 shrink-0 items-center justify-center self-stretch rounded text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-slate-850/50 transition-colors"
                        >
                          <Scissors className="h-3 w-3" />
                        </button>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Page ${pageNum}`} className="h-20 w-14 rounded-md border border-slate-200 object-cover dark:border-slate-700 shadow-3xs" />
                    </React.Fragment>
                  );
                })}
                <div className="ml-1 flex flex-col items-center gap-1.5 self-center px-1">
                  <span className={cn("h-2.5 w-2.5 rounded-full shadow-3xs animate-pulse", CONF[it.matchConfidence].dot)} title={CONF[it.matchConfidence].label} />
                  <span className="whitespace-nowrap text-[9.5px] font-bold text-slate-700 dark:text-slate-300">#{si + 1}</span>
                  <span className="whitespace-nowrap text-[8.5px] text-slate-450 dark:text-slate-500 font-bold">p{it.pageStart}{it.pageEnd > it.pageStart ? `–${it.pageEnd}` : ""}</span>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
        {busyId && (
          <p className="px-1 pt-2.5 text-[10px] font-semibold text-slate-450 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            Updating batch layout...
          </p>
        )}
      </Card>

      {/* Toolbar / filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/50 dark:bg-slate-900 border border-slate-200 p-2.5 rounded-xl shadow-3xs w-full">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="Search matching items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 w-full"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-450 font-bold mr-1">Filter:</div>
          <select
            value={filterConfidence}
            onChange={(e) => setFilterConfidence(e.target.value)}
            className="h-9 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 cursor-pointer outline-none font-semibold text-slate-650"
            aria-label="Filter by AI match confidence"
          >
            <option value="all">All Confidences</option>
            <option value="high">High Confidence</option>
            <option value="medium">Needs Review</option>
            <option value="low">Low Confidence</option>
            <option value="none">No Matches</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 cursor-pointer outline-none font-semibold text-slate-650"
            aria-label="Filter by decision state"
          >
            <option value="all">All Decisions</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
      </div>

      {/* Grid List of Detected Items */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed rounded-2xl py-14 text-center bg-white border-slate-200 dark:border-slate-800 dark:bg-slate-900 select-none">
          <FileText className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <h5 className="text-sm font-bold text-slate-700 dark:text-slate-350">No acknowledgments matches</h5>
          <p className="text-xs text-slate-450 mt-1 max-w-xs">No records matched your active search query and filter criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((it) => {
            const ex = it.extracted as Record<string, unknown>;
            const assigned = it.assigned;
            const conf = CONF[it.matchConfidence];
            const isConfirmed = it.decision === "confirmed" || it.decision === "committed";
            const isSkipped = it.decision === "skipped";
            const isSelected = selectedIds.has(it.id);

            return (
              <Card
                key={it.id}
                className={cn(
                  "group relative flex flex-col justify-between rounded-2xl border bg-white dark:bg-slate-900 shadow-3xs hover:shadow-2xs transition-all duration-200 p-4",
                  isConfirmed ? "border-emerald-250 dark:border-emerald-950/50" : "border-slate-200 dark:border-slate-805",
                  isSkipped ? "opacity-60" : ""
                )}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(it.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/20 shrink-0 cursor-pointer"
                        aria-label={`Select item #${it.originalIndex + 1}`}
                      />
                      <span className="rounded-lg bg-slate-850 px-2 py-0.5 text-[9.5px] font-extrabold text-white dark:bg-slate-200 dark:text-slate-950">
                        Ack #{it.originalIndex + 1}
                      </span>
                      <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[9.5px] font-bold text-slate-600 dark:text-slate-300">
                        Pages {it.pageStart}{it.pageEnd > it.pageStart ? `–${it.pageEnd}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {it.alreadyAcknowledged && (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-bold tracking-tight text-sky-700 dark:border-sky-950/50 dark:bg-sky-950/20 dark:text-sky-300">
                          Already acknowledged
                        </span>
                      )}
                      <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-tight", conf.badge)}>
                        {conf.label}
                      </span>
                    </div>
                  </div>

                  {/* Card Content Grid */}
                  <div className="mt-3.5 grid grid-cols-4 gap-3 items-start">
                    {/* Thumbnail preview */}
                    <div className="col-span-1 relative group cursor-pointer" onClick={() => openDrawer(it, it.originalIndex)}>
                      {it.thumbUrls[0] ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={it.thumbUrls[0]}
                          alt="Ack page 1"
                          className="h-20 w-full object-cover rounded-lg border border-slate-200 dark:border-slate-800 shadow-3xs"
                        />
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-slate-50 border text-slate-400">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="h-4.5 w-4.5 text-white" />
                      </div>
                    </div>

                    {/* Extracted information details */}
                    <div className="col-span-3 space-y-1 text-xs">
                      <h4 className="font-bold text-slate-800 dark:text-slate-250 truncate line-clamp-1">
                        {String(ex.subject || "Subject not identified")}
                      </h4>
                      <div className="flex flex-col gap-0.5 text-[10.5px] text-slate-450 dark:text-slate-500">
                        {!!ex.referenceNumber && (
                          <div className="truncate">Ref: <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{String(ex.referenceNumber)}</span></div>
                        )}
                        {!!ex.jobNumber && (
                          <div className="truncate">Job Code: <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{String(ex.jobNumber)}</span></div>
                        )}
                        {!!ex.areaOrWard && (
                          <div className="truncate">Area: <span className="text-slate-700 dark:text-slate-300 font-semibold">{String(ex.areaOrWard)}</span></div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Matched Case Card */}
                  <div className="mt-3.5 space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-850 dark:bg-slate-950/20 text-xs">
                    {assigned ? (
                      <div className="flex items-start gap-2">
                        <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-650" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/complaints/${assigned.id}`} target="_blank" className="block truncate font-bold text-slate-800 hover:underline dark:text-slate-150">
                            {complaintLabel(assigned)}
                          </Link>
                          <p className="truncate text-[10px] text-slate-450">{assigned.title || "(no subject)"}</p>
                          {it.candidates[0]?.reasons?.length ? (
                            <p className="mt-0.5 text-[9px] text-slate-400 truncate">
                              {it.candidates.find((c) => c.complaintId === assigned.id)?.reasons.join(" · ") || it.candidates[0].reasons.join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] font-semibold text-rose-500 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" />
                        No matched case. Search and link target.
                      </p>
                    )}

                    {/* Candidate Pick list */}
                    {!readOnly && it.candidates.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                        {it.candidates.slice(0, 3).map((c) => (
                          <button
                            key={c.complaintId}
                            type="button"
                            onClick={() => assign(it, { id: c.complaintId, caseNumber: c.caseNumber, complaintNumber: c.complaintNumber, jobNumber: c.jobNumber, title: c.title, location: c.location, status: c.status })}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[9.5px] font-semibold transition-colors cursor-pointer",
                              it.assignedComplaintId === c.complaintId
                                ? "border-emerald-350 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                                : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400 hover:border-slate-350"
                            )}
                            title={c.reasons.join(" · ")}
                          >
                            {c.caseNumber || c.jobNumber || c.title?.slice(0, 16) || c.complaintId.slice(0, 6)} ({Math.round(c.score * 100)}%)
                          </button>
                        ))}
                      </div>
                    )}

                    {!readOnly && <ComplaintPicker onPick={(c) => assign(it, c)} />}
                  </div>
                </div>

                {/* Card Action footer */}
                {!readOnly && it.decision !== "committed" && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-850">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDrawer(it, it.originalIndex)}
                      className="h-8 text-xs font-bold gap-1 rounded-lg"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant={it.decision === "confirmed" ? "default" : "outline"}
                      disabled={!it.assignedComplaintId}
                      onClick={() => setDecision(it, it.decision === "confirmed" ? "pending" : "confirmed")}
                      className="h-8 text-xs font-bold gap-1 rounded-lg"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {it.decision === "confirmed" ? "Confirmed" : "Confirm"}
                    </Button>
                    
                    {it.decision === "skipped" ? (
                      <Button size="sm" variant="ghost" onClick={() => setDecision(it, "pending")} className="h-8 text-xs font-bold ml-auto rounded-lg text-slate-500">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setDecision(it, "skipped")} className="h-8 text-xs font-bold ml-auto rounded-lg text-slate-450 hover:text-rose-500">
                        <XCircle className="h-3.5 w-3.5" />
                        Skip
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Page Actions Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-850">
        <Button variant="outline" size="sm" className="h-9 font-bold rounded-lg" asChild>
          <Link href="/complaints/acknowledgments">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to batches
          </Link>
        </Button>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={rematch}
              disabled={rematching || committing}
              title="Re-check every acknowledgment against the current complaints — use this if a complaint was added (or its Job Number set) after this batch was scanned."
              className="h-9 font-bold rounded-lg gap-1.5"
            >
              {rematching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Re-run matching
            </Button>
            <Button onClick={commit} disabled={committing || counts.confirmed === 0} className="h-9 font-bold px-4 gap-1.5 rounded-lg shadow-sm">
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Attach {counts.confirmed} confirmed
            </Button>
          </div>
        )}
      </div>

      {/* Batch Actions bottom floating panel */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-full py-2 px-5 flex items-center gap-4 shadow-xl border border-slate-800 animate-in fade-in slide-in-from-bottom-5">
          <span className="text-xs font-semibold">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-slate-750" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={batchConfirm} className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 rounded-full px-3 gap-1 text-white border-0">
              <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
            </Button>
            <Button size="sm" onClick={batchSkip} className="h-7 text-xs font-bold bg-slate-800 hover:bg-slate-700 rounded-full px-3 gap-1 text-slate-300 border-0">
              <XCircle className="h-3.5 w-3.5" /> Skip
            </Button>
          </div>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white rounded-full p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Slide drawer Quick Review Panel */}
      <AnimatePresence>
        {reviewItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              className="fixed inset-0 z-50 bg-black backdrop-blur-2xs cursor-pointer"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full md:max-w-2xl bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-850 shadow-2xl flex flex-col justify-between"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 px-5 py-3 bg-slate-50/60 dark:bg-slate-900/60">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-850 dark:text-slate-200">
                    Review Acknowledgment #{reviewItemIndex !== null ? reviewItemIndex + 1 : ""}
                  </h3>
                  <span className="text-[10px] text-slate-450 mt-0.5">
                    Pages {reviewItem.pageStart}–{reviewItem.pageEnd} · AI match verification workspace
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-xl border border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 p-2 text-slate-500 transition-colors"
                >
                  <PanelRightClose className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Drawer Body Grid */}
              <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-850">
                {/* Left side: Document page previewer */}
                <div className="p-5 flex flex-col justify-between min-h-[300px] bg-slate-50/20 dark:bg-slate-950/20">
                  <div className="flex-1 flex items-center justify-center">
                    {reviewItem.thumbUrls[drawerActivePage] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={reviewItem.thumbUrls[drawerActivePage]}
                        alt={`Scan page ${reviewItem.pageStart + drawerActivePage}`}
                        className="max-h-[380px] object-contain rounded-lg border border-slate-200 dark:border-slate-850 shadow-md"
                      />
                    ) : (
                      <div className="flex h-64 w-44 items-center justify-center rounded-lg bg-slate-50 border text-slate-400">
                        <FileText className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  {reviewItem.thumbUrls.length > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 rounded-lg"
                        disabled={drawerActivePage === 0}
                        onClick={() => setDrawerActivePage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-[10px] font-bold text-slate-650">
                        Page {drawerActivePage + 1} of {reviewItem.thumbUrls.length}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0 rounded-lg"
                        disabled={drawerActivePage === reviewItem.thumbUrls.length - 1}
                        onClick={() => setDrawerActivePage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Right side: extracted info / tabs */}
                <div className="p-5 flex flex-col justify-between overflow-y-auto">
                  <div>
                    {/* Tabs triggers */}
                    <div className="flex border-b border-slate-100 dark:border-slate-850 pb-2 mb-4 gap-3 text-xs select-none">
                      <button
                        type="button"
                        onClick={() => setDrawerTab("info")}
                        className={cn("pb-1 px-1 font-bold border-b-2 transition-colors cursor-pointer", drawerTab === "info" ? "border-primary text-primary" : "border-transparent text-slate-450 hover:text-slate-700")}
                      >
                        Extracted Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawerTab("ocr")}
                        className={cn("pb-1 px-1 font-bold border-b-2 transition-colors cursor-pointer", drawerTab === "ocr" ? "border-primary text-primary" : "border-transparent text-slate-450 hover:text-slate-700")}
                      >
                        OCR Scanned Text
                      </button>
                    </div>

                    {drawerTab === "info" ? (
                      <div className="space-y-4">
                        {/* Match Confidence Level */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                          <span className="text-xs text-slate-450 font-bold">Match Confidence:</span>
                          <span className={cn("text-xs font-extrabold flex items-center gap-1.5", CONF[reviewItem.matchConfidence].text)}>
                            <span className={cn("h-2.5 w-2.5 rounded-full animate-pulse", CONF[reviewItem.matchConfidence].dot)} />
                            {CONF[reviewItem.matchConfidence].label}
                          </span>
                        </div>

                        {/* Extracted Fields */}
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450">Document Subject</div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 leading-normal">
                              {String(reviewItem.extracted.subject || "(Not identified)")}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450">Inward Ref No</div>
                              <div className="text-xs font-mono font-bold text-slate-850 dark:text-slate-250 mt-1">
                                {String(reviewItem.extracted.referenceNumber || "—")}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450">Job Code</div>
                              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                                {String(reviewItem.extracted.jobNumber || "—")}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450">Office / Department</div>
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-350 mt-1 flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 text-slate-450 shrink-0" />
                              {String(reviewItem.extracted.department || "—")}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450">Ward / Area Name</div>
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-350 mt-1 flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-slate-450 shrink-0" />
                              {String(reviewItem.extracted.areaOrWard || "—")}
                            </div>
                          </div>
                        </div>

                        {/* Assignment Details */}
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-850 space-y-2 text-xs">
                          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450">Target Complaint Link</div>
                          {reviewItem.assigned ? (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-850 dark:bg-slate-950/20">
                              <Link href={`/complaints/${reviewItem.assigned.id}`} target="_blank" className="font-bold text-slate-800 hover:underline dark:text-slate-200">
                                {complaintLabel(reviewItem.assigned)}
                              </Link>
                              <p className="text-[10.5px] text-slate-450 mt-1 truncate">{reviewItem.assigned.title || "(no subject)"}</p>
                            </div>
                          ) : (
                            <p className="text-[10.5px] font-bold text-rose-500">Not linked to a complaint.</p>
                          )}

                          {!readOnly && reviewItem.candidates.length > 0 && (
                            <div className="space-y-1.5 mt-2">
                              <div className="text-[9px] font-extrabold text-slate-450 uppercase">Proposed Matching Matches</div>
                              <div className="flex flex-wrap gap-1">
                                {reviewItem.candidates.slice(0, 3).map((c) => (
                                  <button
                                    key={c.complaintId}
                                    type="button"
                                    onClick={() => assign(reviewItem, { id: c.complaintId, caseNumber: c.caseNumber, complaintNumber: c.complaintNumber, jobNumber: c.jobNumber, title: c.title, location: c.location, status: c.status })}
                                    className={cn(
                                      "rounded-full border px-2.5 py-0.5 text-[9.5px] font-semibold transition-colors cursor-pointer",
                                      reviewItem.assignedComplaintId === c.complaintId
                                        ? "border-emerald-350 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                                        : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400 hover:border-slate-350"
                                    )}
                                  >
                                    {c.caseNumber || c.jobNumber || c.title?.slice(0, 16) || c.complaintId.slice(0, 6)} ({Math.round(c.score * 100)}%)
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {!readOnly && <ComplaintPicker onPick={(c) => assign(reviewItem, c)} />}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-850 dark:bg-slate-900/60 p-3 h-80 overflow-y-auto font-mono text-[10.5px] text-slate-600 dark:text-slate-450 leading-relaxed whitespace-pre-wrap">
                        {reviewItem.ocrText || "No OCR scanner text extracted."}
                      </div>
                    )}
                  </div>

                  {/* Drawer match review decisions */}
                  {!readOnly && reviewItem.decision !== "committed" && (
                    <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-850">
                      <Button
                        size="sm"
                        disabled={!reviewItem.assignedComplaintId}
                        onClick={() => {
                          setDecision(reviewItem, reviewItem.decision === "confirmed" ? "pending" : "confirmed");
                          closeDrawer();
                        }}
                        className="h-8 text-xs font-bold gap-1 rounded-lg"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {reviewItem.decision === "confirmed" ? "Confirmed" : "Confirm Match"}
                      </Button>
                      
                      {reviewItem.decision === "skipped" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDecision(reviewItem, "pending");
                            closeDrawer();
                          }}
                          className="h-8 text-xs font-bold rounded-lg text-slate-500"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Un-skip
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDecision(reviewItem, "skipped");
                            closeDrawer();
                          }}
                          className="h-8 text-xs font-bold rounded-lg text-slate-450 hover:text-rose-500"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Skip
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer footer (pagination selectors) */}
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-850 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-bold gap-1 rounded-lg"
                  disabled={reviewItemIndex === 0}
                  onClick={() => navigateDrawer("prev")}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-[10px] font-bold text-slate-450 select-none">
                  Item {reviewItemIndex !== null ? reviewItemIndex + 1 : ""} of {items.length}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-bold gap-1 rounded-lg"
                  disabled={reviewItemIndex === items.length - 1}
                  onClick={() => navigateDrawer("next")}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
