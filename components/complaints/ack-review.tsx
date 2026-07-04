"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle2, XCircle, Search, Scissors, Merge, RefreshCw,
  ArrowRight, FileText, Sparkles, Link2, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAckBatchAction, updateAckItemAction, searchComplaintsForMatchAction,
  reextractAckItemAction, mergeAckItemsAction, splitAckItemAction, commitAckBatchAction,
} from "@/lib/actions/ack-import";
import type { AckBatchView, AckReviewItem, ComplaintSummary, MatchConfidence } from "@/lib/complaints/ack-reconcile";

const CONF: Record<MatchConfidence, { dot: string; badge: string; label: string }> = {
  high: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", label: "High confidence" },
  medium: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", label: "Needs a look" },
  low: { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", label: "Low confidence" },
  none: { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", label: "No match found" },
};

function complaintLabel(c: ComplaintSummary | null): string {
  if (!c) return "";
  return c.caseNumber || c.complaintNumber || c.jobNumber || c.title || c.id.slice(0, 8);
}

/** Inline complaint search used to (re)assign a section to a complaint. */
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
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search complaint (case no, BBMP no, job code, subject)…"
          className="h-9 pl-8 text-sm"
        />
        {busy && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPick(c); setOpen(false); setQ(""); setResults([]); }}
              className="flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{c.caseNumber || "—"}</span>
                {c.jobNumber && <span className="rounded bg-indigo-100 px-1.5 font-mono text-[10px] text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{c.jobNumber}</span>}
                {c.status && <span className="text-[10px] text-slate-400">{c.status}</span>}
              </span>
              <span className="truncate text-slate-600 dark:text-slate-400">{c.title || "(no subject)"}</span>
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
  const [banner, setBanner] = React.useState<string | null>(null);

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

  /** Re-fetch the whole batch from the server (after structural edits). */
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
    setBanner(`Attached ${r.attached ?? 0} acknowledgment(s) to their complaints.`);
    await resync();
    router.refresh();
  }

  // ── Still processing (user navigated here directly) ────────────────────────
  if (batch.status === "processing") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium">{batch.stage || "Processing…"}</p>
        <p className="mt-1 text-xs text-slate-500">{batch.message || "Rendering, reading and matching…"}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={resync}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {banner && (
        <p className="rounded-lg border border-indigo-200/40 bg-indigo-50/40 p-3 text-sm text-indigo-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-indigo-300">
          {banner}
        </p>
      )}

      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{items.length}</span> acknowledgment(s) ·{" "}
          <span className="text-emerald-600">{counts.confirmed + counts.committed} confirmed</span> ·{" "}
          <span className="text-amber-600">{counts.pending} to review</span>
          {counts.unmatched > 0 && <> · <span className="text-rose-600">{counts.unmatched} unmatched</span></>}
          {counts.skipped > 0 && <> · {counts.skipped} skipped</>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={confirmAllHigh} className="h-9">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Confirm all high-confidence
            </Button>
          )}
          <Button size="sm" onClick={commit} disabled={committing || readOnly || counts.confirmed === 0} className="h-9 font-bold">
            {committing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
            {readOnly ? "Attached" : `Attach ${counts.confirmed} confirmed`}
          </Button>
        </div>
      </div>

      {/* Global page-strip: every page as a thumbnail, grouped by section. Merge
          between sections; split between pages within a section. */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Page strip — adjust boundaries</p>
        <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
          {items.map((it, si) => (
            <React.Fragment key={it.id}>
              {si > 0 && !readOnly && (
                <button
                  type="button"
                  title="Merge with previous acknowledgment"
                  onClick={() => structural(() => mergeAckItemsAction(items[si - 1]!.id, it.id), it.id)}
                  className="flex w-6 shrink-0 flex-col items-center justify-center rounded text-slate-300 hover:bg-indigo-50 hover:text-indigo-500 dark:hover:bg-indigo-950/30"
                >
                  <Merge className="h-4 w-4" />
                </button>
              )}
              <div className={`flex shrink-0 items-end gap-1 rounded-lg border p-1.5 ${si % 2 === 0 ? "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/30" : "border-slate-200 bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-900/50"}`}>
                {it.thumbUrls.length === 0 && (
                  <div className="flex h-24 w-16 items-center justify-center rounded bg-slate-100 text-slate-300 dark:bg-slate-800">
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
                          className="flex w-4 shrink-0 items-center justify-center self-stretch rounded text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
                        >
                          <Scissors className="h-3 w-3" />
                        </button>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Page ${pageNum}`} className="h-24 w-16 rounded border border-slate-200 object-cover dark:border-slate-700" />
                    </React.Fragment>
                  );
                })}
                <div className="ml-0.5 flex flex-col items-center gap-1 self-center px-1">
                  <span className={`h-2 w-2 rounded-full ${CONF[it.matchConfidence].dot}`} title={CONF[it.matchConfidence].label} />
                  <span className="whitespace-nowrap text-[10px] text-slate-400">#{si + 1}</span>
                  <span className="whitespace-nowrap text-[10px] text-slate-400">p{it.pageStart}{it.pageEnd > it.pageStart ? `–${it.pageEnd}` : ""}</span>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
        {busyId && <p className="px-1 pt-1 text-[11px] text-slate-400"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Updating boundaries…</p>}
      </div>

      {/* Section cards */}
      <div className="space-y-3">
        {items.map((it, si) => {
          const ex = it.extracted as Record<string, unknown>;
          const assigned = it.assigned;
          const conf = CONF[it.matchConfidence];
          const dimmed = it.decision === "skipped";
          return (
            <div
              key={it.id}
              className={`rounded-xl border bg-white p-4 shadow-sm transition-opacity dark:bg-slate-900 ${dimmed ? "opacity-60" : ""} ${
                it.decision === "confirmed" || it.decision === "committed"
                  ? "border-emerald-300 dark:border-emerald-900/50"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 font-bold text-white dark:bg-slate-200 dark:text-slate-900">Ack {si + 1}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Pages {it.pageStart}{it.pageEnd > it.pageStart ? `–${it.pageEnd}` : ""}
                </span>
                <span className={`rounded-full px-2 py-0.5 font-semibold ${conf.badge}`}>{conf.label}</span>
                {typeof ex.jobNumber === "string" && ex.jobNumber && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-mono text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{ex.jobNumber}</span>
                )}
                {it.decision === "committed" && <span className="rounded-full bg-emerald-600 px-2 py-0.5 font-semibold text-white">Attached</span>}
                <div className="ml-auto flex items-center gap-1">
                  {!readOnly && it.decision !== "committed" && (
                    <button
                      type="button"
                      onClick={() => structural(() => reextractAckItemAction(it.id), it.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Re-read this acknowledgment and re-match"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Re-read
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {/* Extracted */}
                <div className="space-y-1.5 text-sm">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{(ex.subject as string) || "(subject not read)"}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {typeof ex.referenceNumber === "string" && ex.referenceNumber && <span>Ref/inward: <span className="font-mono text-slate-700 dark:text-slate-300">{ex.referenceNumber}</span></span>}
                    {typeof ex.department === "string" && ex.department && <span>Office: {ex.department}</span>}
                    {typeof ex.areaOrWard === "string" && ex.areaOrWard && <span>Area: {ex.areaOrWard}</span>}
                  </div>
                  {typeof ex.summary === "string" && ex.summary && <p className="text-xs text-slate-500 dark:text-slate-400">{ex.summary}</p>}
                </div>

                {/* Match */}
                <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                  {assigned ? (
                    <div className="flex items-start gap-2">
                      <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/complaints/${assigned.id}`} target="_blank" className="block truncate text-sm font-semibold text-slate-800 hover:underline dark:text-slate-100">
                          {complaintLabel(assigned)}
                        </Link>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{assigned.title || "(no subject)"}</p>
                        {it.candidates[0]?.reasons?.length ? (
                          <p className="mt-0.5 text-[11px] text-slate-400">{it.candidates.find((c) => c.complaintId === assigned.id)?.reasons.join(" · ") || it.candidates[0].reasons.join(" · ")}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-rose-600 dark:text-rose-400">No complaint matched — pick one below.</p>
                  )}

                  {/* Candidate quick-picks */}
                  {!readOnly && it.candidates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {it.candidates.slice(0, 3).map((c) => (
                        <button
                          key={c.complaintId}
                          type="button"
                          onClick={() => assign(it, { id: c.complaintId, caseNumber: c.caseNumber, complaintNumber: c.complaintNumber, jobNumber: c.jobNumber, title: c.title, location: c.location, status: c.status })}
                          className={`rounded-full border px-2 py-0.5 text-[11px] hover:border-primary ${it.assignedComplaintId === c.complaintId ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                          title={c.reasons.join(" · ")}
                        >
                          {c.caseNumber || c.jobNumber || c.title?.slice(0, 24) || c.complaintId.slice(0, 6)} · {Math.round(c.score * 100)}%
                        </button>
                      ))}
                    </div>
                  )}

                  {!readOnly && <ComplaintPicker onPick={(c) => assign(it, c)} />}

                  {/* Decision */}
                  {!readOnly && it.decision !== "committed" && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant={it.decision === "confirmed" ? "default" : "outline"}
                        disabled={!it.assignedComplaintId}
                        onClick={() => setDecision(it, it.decision === "confirmed" ? "pending" : "confirmed")}
                        className="h-8"
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        {it.decision === "confirmed" ? "Confirmed" : "Confirm"}
                      </Button>
                      {it.decision === "skipped" ? (
                        <Button size="sm" variant="ghost" onClick={() => setDecision(it, "pending")} className="h-8">
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Un-skip
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDecision(it, "skipped")} className="h-8 text-slate-500">
                          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Skip
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800/85">
        <Button variant="outline" size="sm" asChild>
          <Link href="/complaints/acknowledgments">Back to batches</Link>
        </Button>
        {!readOnly && (
          <Button onClick={commit} disabled={committing || counts.confirmed === 0} className="font-bold">
            {committing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
            Attach {counts.confirmed} confirmed
          </Button>
        )}
      </div>
    </div>
  );
}
