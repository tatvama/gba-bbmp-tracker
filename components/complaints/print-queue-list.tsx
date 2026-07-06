"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Printer, Eye, FileText, Check, Loader2, Undo2,
  Send, Clock, AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DataToolbar, DataToolbarSearch } from "@/components/ui/data-toolbar";
import { DocumentViewer, type ViewerTarget } from "@/components/complaints/document-viewer";
import { markLetterPrintedAction, undoLetterPrintedAction } from "@/lib/actions/print-queue";
import { formatDate } from "@/lib/format";
import type { PrintQueueLetter } from "@/lib/queries";
import { COMPLAINT_DRAFT_KINDS, type ComplaintDraftKind } from "@/lib/constants";

const RISK_BADGE: Record<string, BadgeProps["variant"]> = {
  bill_stop: "destructive",
  serious: "warning",
  procedural: "info",
  low: "muted",
};

// letter_drafts.variant is either a forensic letter variant (bill_stop/lokayukta/
// rti/bilingual_summary) OR — for letters auto-drafted by the escalation
// scheduler — a ComplaintDraftKind (reminder_letter, legal_notice, …). Label
// + color both so a reminder is visually distinct from a legal notice or the
// original letter in the same queue.
const FORENSIC_VARIANT_LABEL: Record<string, string> = {
  bill_stop: "Bill-stop letter",
  lokayukta: "Lokayukta letter",
  rti: "RTI letter",
  bilingual_summary: "Bilingual summary",
};

const ESCALATION_VARIANT_BADGE: Record<string, BadgeProps["variant"]> = {
  reminder_letter: "warning",
  legal_notice: "destructive",
  lokayukta_complaint: "destructive",
  chief_secretary_letter: "destructive",
  cm_office_letter: "destructive",
  escalation_letter: "destructive",
  counter_reply: "info",
};

function variantLabel(variant: string | null): string | null {
  if (!variant) return null;
  if (variant in COMPLAINT_DRAFT_KINDS) return COMPLAINT_DRAFT_KINDS[variant as ComplaintDraftKind];
  return FORENSIC_VARIANT_LABEL[variant] ?? null;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${formatDate(iso)} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * The physical-letter dispatch cycle, in one list: PENDING letters (never
 * printed) come first, then PRINTED-but-not-yet-submitted ones (still "Draft"
 * on the complaint) as a reminder to actually send them. Once a complaint is
 * filed (submitted — recorded on the complaint's Submit step) its letter
 * drops out of this queue entirely; the case moves into the normal lifecycle.
 */
export function PrintQueueList({ letters }: { letters: PrintQueueLetter[] }) {
  const router = useRouter();
  const [lettersState, setLettersState] = React.useState<PrintQueueLetter[]>(letters);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [viewTarget, setViewTarget] = React.useState<ViewerTarget | null>(null);
  const [tempUrl, setTempUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    setLettersState(letters);
  }, [letters]);

  const q = search.trim().toLowerCase();
  const matches = (l: PrintQueueLetter) =>
    !q ||
    (l.complaintTitle ?? "").toLowerCase().includes(q) ||
    (l.caseNumber ?? "").toLowerCase().includes(q) ||
    (l.jobNumber ?? "").toLowerCase().includes(q);

  const pending = lettersState.filter((l) => l.printStatus === "pending" && matches(l));

  async function doPrint(letter: PrintQueueLetter) {
    setError(null);
    setBusyId(letter.id);
    const r = await markLetterPrintedAction(letter.id);
    if (!r.success) {
      setError(r.error ?? "Could not update the print record.");
      setBusyId(null);
      return;
    }
    // Smoothly remove item from local UI immediately
    setLettersState((prev) => prev.filter((item) => item.id !== letter.id));
    setBusyId(null);
    router.refresh();
  }

  async function openLetter(l: PrintQueueLetter) {
    if (l.pdfDocId) {
      setViewTarget({
        documentId: l.pdfDocId,
        title: l.fileName || "Letter preview",
        mimeType: "application/pdf",
        fileName: l.fileName,
      });
    } else if (l.content) {
      setError(null);
      setBusyId(l.id);
      try {
        const res = await fetch("/api/pdf/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: l.fileName || "Letter preview", text: l.content, reference: l.caseNumber }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || `Could not generate the PDF (HTTP ${res.status}).`);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setTempUrl(url);
        setViewTarget({
          documentId: "",
          title: l.fileName || "Letter preview",
          mimeType: "application/pdf",
          fileName: l.fileName,
          customUrl: url,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate PDF preview.");
      } finally {
        setBusyId(null);
      }
    } else {
      setError("No document file or content available to view.");
    }
  }

  function closeViewer() {
    setViewTarget(null);
    if (tempUrl) {
      URL.revokeObjectURL(tempUrl);
      setTempUrl(null);
    }
  }

  if (pending.length === 0) {
    return (
      <div className="space-y-4">
        {search && (
          <DataToolbar className="mb-0">
            <DataToolbarSearch value={search} onChange={setSearch} placeholder="Search complaint, case #, job #…" />
          </DataToolbar>
        )}
        <Card className="rounded-xl border border-slate-150 dark:border-slate-850 shadow-2xs bg-card">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="rounded-full bg-slate-100 dark:bg-slate-900 p-4 text-slate-400 select-none">
              <Printer className="h-10 w-10 animate-pulse" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">All letters have been printed.</h3>
            <p className="text-xs font-semibold text-slate-500 max-w-sm">There are currently no pending print jobs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DataToolbar className="mb-0">
        <DataToolbarSearch value={search} onChange={setSearch} placeholder="Search complaint, case #, job #…" />
      </DataToolbar>

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-rose-200/60 bg-rose-50/40 p-3 text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* pending: never printed */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 select-none">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Waiting to print
          </h2>
          <Badge variant="warning" className="text-[10px]">{pending.length}</Badge>
        </div>
        <AnimatePresence initial={false}>
          {pending.map((l) => (
            <LetterCard
              key={l.id}
              letter={l}
              busy={busyId === l.id}
              onOpen={() => openLetter(l)}
              onPrint={() => doPrint(l)}
            />
          ))}
        </AnimatePresence>
      </section>

      <DocumentViewer target={viewTarget} onClose={closeViewer} />
    </div>
  );
}

function LetterCard({
  letter: l,
  busy,
  onOpen,
  onPrint,
}: {
  letter: PrintQueueLetter;
  busy: boolean;
  onOpen: () => void;
  onPrint: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="rounded-lg p-2 bg-amber-100 dark:bg-amber-950/40 shrink-0">
            <Printer className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {l.complaintId ? (
                <Link href={`/complaints/${l.complaintId}`} className="truncate text-sm font-semibold text-foreground hover:text-primary">
                  {l.complaintTitle || "Complaint"}
                </Link>
              ) : (
                <span className="truncate text-sm font-semibold text-foreground">{l.complaintTitle || "Complaint"}</span>
              )}
              {l.riskBand && (
                <Badge variant={RISK_BADGE[l.riskBand] ?? "muted"} className="text-[10px]">
                  {l.riskBand.replace("_", " ")}
                </Badge>
              )}
              {variantLabel(l.variant) && (
                <Badge variant={ESCALATION_VARIANT_BADGE[l.variant ?? ""] ?? "muted"} className="text-[10px]">
                  {variantLabel(l.variant)}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              <span className="font-mono">{l.caseNumber ?? "no case #"}</span>
              {l.jobNumber && <> · job <span className="font-mono">{l.jobNumber}</span></>}
              {l.language && <> · {l.language}</>}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" /> queued {fmtDateTime(l.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0 mt-3 sm:mt-0">
          <Button
            size="sm"
            variant="outline"
            onClick={onOpen}
            disabled={busy}
            className="h-9 font-bold text-xs justify-center cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5 mr-1" /> View PDF
          </Button>
          <Button
            size="sm"
            onClick={onPrint}
            disabled={busy}
            className="h-9 font-bold text-xs justify-center cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Printer className="h-3.5 w-3.5 mr-1" />} Mark as printed
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
