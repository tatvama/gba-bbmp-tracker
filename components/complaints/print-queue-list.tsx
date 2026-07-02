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
import { DocumentViewer, type ViewerTarget } from "@/components/complaints/document-viewer";
import { markLetterPrintedAction, undoLetterPrintedAction } from "@/lib/actions/print-queue";
import { formatDate } from "@/lib/format";
import type { PrintQueueLetter } from "@/lib/queries";

const RISK_BADGE: Record<string, BadgeProps["variant"]> = {
  bill_stop: "destructive",
  serious: "warning",
  procedural: "info",
  low: "muted",
};

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
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [viewTarget, setViewTarget] = React.useState<ViewerTarget | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const pending = letters.filter((l) => l.printStatus === "pending");
  // Printed but the complaint hasn't been filed yet — still needs a human
  // to walk it to the post office / hand it over and record that step.
  const awaitingSubmit = letters.filter((l) => l.printStatus === "printed" && l.complaintStatus === "Draft");

  async function doPrint(letter: PrintQueueLetter) {
    setError(null);
    // Fire the browser print dialog for whichever file is open, or just the
    // stamped action if nothing's open — either way this records the stamp.
    setBusyId(letter.id);
    const r = await markLetterPrintedAction(letter.id);
    setBusyId(null);
    if (!r.success) {
      setError(r.error ?? "Could not update the print record.");
      return;
    }
    router.refresh();
  }

  async function doUndo(letterId: string) {
    setError(null);
    setBusyId(letterId);
    const r = await undoLetterPrintedAction(letterId);
    setBusyId(null);
    if (!r.success) {
      setError(r.error ?? "Could not undo.");
      return;
    }
    router.refresh();
  }

  function openLetter(l: PrintQueueLetter) {
    if (l.pdfDocId) {
      setViewTarget({ documentId: l.pdfDocId, title: l.fileName || "Complaint letter", mimeType: "application/pdf", fileName: l.fileName });
    } else if (l.docxDocId) {
      setViewTarget({
        documentId: l.docxDocId,
        title: l.fileName || "Complaint letter",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName: l.fileName,
      });
    }
  }

  if (letters.length === 0) {
    return (
      <Card className="rounded-xl border shadow-2xs">
        <CardContent className="py-10">
          <EmptyState title="Nothing to print" description="Every drafted letter has been printed and submitted." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-rose-200/60 bg-rose-50/40 p-3 text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* pending: never printed */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-405">
            Waiting to print
          </h2>
          <Badge variant="warning" className="text-[10px]">{pending.length}</Badge>
        </div>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nothing waiting.</p>
        ) : (
          <AnimatePresence initial={false}>
            {pending.map((l) => (
              <LetterCard
                key={l.id}
                letter={l}
                busy={busyId === l.id}
                onOpen={() => openLetter(l)}
                onPrint={() => doPrint(l)}
                onUndo={undefined}
              />
            ))}
          </AnimatePresence>
        )}
      </section>

      {/* printed but not yet submitted */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-405">
            Printed — not yet submitted
          </h2>
          <Badge variant="info" className="text-[10px]">{awaitingSubmit.length}</Badge>
        </div>
        {awaitingSubmit.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nothing waiting.</p>
        ) : (
          <AnimatePresence initial={false}>
            {awaitingSubmit.map((l) => (
              <LetterCard
                key={l.id}
                letter={l}
                busy={busyId === l.id}
                onOpen={() => openLetter(l)}
                onPrint={undefined}
                onUndo={() => doUndo(l.id)}
              />
            ))}
          </AnimatePresence>
        )}
      </section>

      <DocumentViewer target={viewTarget} onClose={() => setViewTarget(null)} />
    </div>
  );
}

function LetterCard({
  letter: l,
  busy,
  onOpen,
  onPrint,
  onUndo,
}: {
  letter: PrintQueueLetter;
  busy: boolean;
  onOpen: () => void;
  onPrint?: () => void;
  onUndo?: () => void;
}) {
  const canOpen = Boolean(l.pdfDocId || l.docxDocId);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className={`rounded-lg p-2 ${l.printStatus === "printed" ? "bg-blue-100 dark:bg-blue-950/40" : "bg-amber-100 dark:bg-amber-950/40"}`}>
          {l.printStatus === "printed" ? (
            <Send className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
          ) : (
            <Printer className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {l.complaintId ? (
              <Link href={`/complaints/${l.complaintId}`} className="truncate text-sm font-semibold text-slate-800 hover:text-primary dark:text-slate-200">
                {l.complaintTitle || "Complaint"}
              </Link>
            ) : (
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{l.complaintTitle || "Complaint"}</span>
            )}
            {l.riskBand && (
              <Badge variant={RISK_BADGE[l.riskBand] ?? "muted"} className="text-[10px]">
                {l.riskBand.replace("_", " ")}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            <span className="font-mono">{l.caseNumber ?? "no case #"}</span>
            {l.jobNumber && <> · job <span className="font-mono">{l.jobNumber}</span></>}
            {l.language && <> · {l.language}</>}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" /> queued {fmtDateTime(l.createdAt)}
          </p>
          {l.printStatus === "printed" && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
              <Check className="h-3 w-3" /> Printed {fmtDateTime(l.printedAt)}{l.printedByName ? ` by ${l.printedByName}` : ""} — go to the case to record submission.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canOpen && (
            <Button size="sm" variant="outline" onClick={onOpen}>
              <Eye className="h-3.5 w-3.5" /> {l.pdfDocId ? "View PDF" : "View DOCX"}
            </Button>
          )}
          {!canOpen && l.complaintId && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/complaints/${l.complaintId}`}><FileText className="h-3.5 w-3.5" /> Open case</Link>
            </Button>
          )}
          {onPrint && (
            <Button size="sm" onClick={onPrint} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Mark as printed
            </Button>
          )}
          {onUndo && l.complaintId && (
            <>
              <Button asChild size="sm">
                <Link href={`/complaints/${l.complaintId}`}><Send className="h-3.5 w-3.5" /> Record submission</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={onUndo} disabled={busy} title="Undo — put back in the print queue">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
