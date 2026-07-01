"use client";

import * as React from "react";
import { Loader2, Gavel, Search, FileText, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateComplaintDraft } from "@/lib/actions/complaints";
import { analyzeReplyGapAction, type ReplyGapResult } from "@/lib/actions/lifecycle";

type Kind =
  | "counter_reply"
  | "rti_from_complaint"
  | "records_preservation"
  | "escalation_letter"
  | "lokayukta_complaint"
  | "chief_secretary_letter";

const LADDER: { kind: Kind; label: string; hint: string }[] = [
  { kind: "counter_reply", label: "Counter-reply", hint: "Answer the reply point-by-point; demand what was left unaddressed." },
  { kind: "rti_from_complaint", label: "RTI", hint: "Compel production of the missing records under RTI 2005." },
  { kind: "records_preservation", label: "Records preservation", hint: "Freeze the originals/audit logs pending production." },
  { kind: "escalation_letter", label: "Escalation (next authority)", hint: "EE → Chief Engineer → Commissioner." },
  { kind: "lokayukta_complaint", label: "Lokayukta", hint: "Systemic pattern; cautious framing." },
  { kind: "chief_secretary_letter", label: "Chief Secretary / UDD", hint: "Administrative intervention + special enquiry." },
];

export function EscalationLadder({ complaintId }: { complaintId: string }) {
  const [gapBusy, setGapBusy] = React.useState(false);
  const [gap, setGap] = React.useState<ReplyGapResult | null>(null);
  const [draftKind, setDraftKind] = React.useState<Kind | null>(null);
  const [draftBusy, setDraftBusy] = React.useState<Kind | null>(null);
  const [draft, setDraft] = React.useState("");
  const [lint, setLint] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function runGap() {
    setGapBusy(true);
    setGap(null);
    try {
      setGap(await analyzeReplyGapAction({ complaintId }));
    } catch (e) {
      setGap({ ok: false, error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setGapBusy(false);
    }
  }

  async function draftRung(kind: Kind) {
    setDraftBusy(kind);
    setError(null);
    setLint(null);
    try {
      const res = await generateComplaintDraft({ complaintId, kind });
      if (!res.ok || !res.text) {
        setError(res.error || "Could not generate the draft.");
        return;
      }
      setDraftKind(kind);
      setDraft(res.text);
      setLint(res.lintWarning ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDraftBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Reply-gap analysis */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Search className="h-4 w-4" /> Reply-gap analysis
          </h2>
          <Button type="button" size="sm" variant="outline" onClick={runGap} disabled={gapBusy}>
            {gapBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyze latest reply"}
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Compares the department&apos;s latest reply against your demands + the records the forensic findings require, and
          flags what was left unaddressed.
        </p>
        {gap &&
          (gap.error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{gap.error}</p>
          ) : gap.data ? (
            <div className="text-sm">
              <p className="mb-1">
                <span className="font-semibold">{gap.data.unaddressedCount}</span> demand(s) unaddressed.{" "}
                {gap.data.escalationRecommended && <span className="text-amber-600 dark:text-amber-400">Escalation recommended.</span>}
              </p>
              {gap.data.summary && <p className="mb-2 text-xs text-muted-foreground">{gap.data.summary}</p>}
              <ul className="space-y-1">
                {gap.data.points.map((p, i) => (
                  <li key={i} className="text-xs">
                    <span
                      className={
                        p.status === "unaddressed"
                          ? "font-semibold text-rose-600 dark:text-rose-400"
                          : p.status === "partial"
                            ? "font-semibold text-amber-600 dark:text-amber-400"
                            : "font-semibold text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      [{p.status}]
                    </span>{" "}
                    {p.demand}
                  </li>
                ))}
              </ul>
            </div>
          ) : null)}
      </section>

      {/* Escalation ladder */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Gavel className="h-4 w-4" /> Escalation ladder
        </h2>
        {error && <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {LADDER.map((rung, idx) => {
            const staggerClass = `stagger-${(idx % 4) + 1}`;
            return (
              <button
                key={rung.kind}
                type="button"
                onClick={() => draftRung(rung.kind)}
                disabled={draftBusy !== null}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3 text-left transition-all duration-300 ease-in-out hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 animate-fade-in",
                  staggerClass,
                  draftKind === rung.kind ? "border-primary bg-primary/[0.02]" : "border-slate-200 dark:border-slate-800"
                )}
              >
                {draftBusy === rung.kind ? (
                  <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
                ) : (
                  <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  <span className="block text-sm font-semibold">{rung.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{rung.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {draft && (
          <div className="mt-4 animate-fade-in">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Draft — review & edit before filing</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(draft)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
            </div>
            {lint && <p className="mb-1 text-[11px] text-amber-600 dark:text-amber-400">Safe-language note: {lint}</p>}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-72 w-full rounded-lg border border-input bg-background p-3 font-sans text-xs leading-relaxed transition-all duration-200 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </section>
    </div>
  );
}
