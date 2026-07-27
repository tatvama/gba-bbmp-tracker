"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Eye, Loader2, Mail, Plus, Send, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/section-header";
import { formatDateTime } from "@/lib/format";
import {
  sendLetterEmailAction,
  listLetterEmailsAction,
  listRecommendedRecipientsAction,
  listDepartmentRecipientsAction,
  previewLetterAttachmentAction,
  getMailStatusAction,
  type MailStatus,
} from "@/lib/actions/mail";
import type { LetterEmailRow, RecipientOption, RecommendedRecipient } from "@/lib/mail/queries";
import type { AttachmentPreview } from "@/lib/mail/send";
import { SELECTABLE_LETTER_KINDS } from "@/lib/mail/routing";
import { DocumentViewer, type ViewerTarget } from "@/components/complaints/document-viewer";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ManualRow {
  /** Kept separate from the name so the letter can open formally —
   *  "To, The Executive Engineer" rather than a bare personal name. */
  designation: string;
  name: string;
  email: string;
}

const BLANK_ROW: ManualRow = { designation: "", name: "", email: "" };

/** Designations offered as quick picks; the field stays free text for anything else. */
const COMMON_DESIGNATIONS = [
  "Executive Engineer",
  "Assistant Executive Engineer",
  "Assistant Engineer",
  "Chief Engineer",
  "Superintending Engineer",
  "Joint Commissioner",
  "Deputy Commissioner",
  "Assistant Revenue Officer",
  "Chief Health Officer",
  "Chief Town Planner",
];

const emailLooksValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const STATUS_LABEL: Record<LetterEmailRow["status"], { text: string; variant: "success" | "destructive" | "warning" | "muted" }> = {
  sent: { text: "Sent", variant: "success" },
  failed: { text: "Failed", variant: "destructive" },
  skipped: { text: "Not sent", variant: "warning" },
  queued: { text: "Queued", variant: "muted" },
  sending: { text: "Sending", variant: "muted" },
};

/**
 * "Email this letter" — the front end for lib/mail.
 *
 * Exists because the directory frequently has no email for the responsible
 * officer (the imported ARO set covers wards 1-198; unassigned cases resolve to
 * nobody), so the automatic send on filing records a `skipped` row and nothing
 * happens. This panel surfaces that, and lets the user pick officers from the
 * directory and/or type a name + address, to several recipients at once.
 */
export function LetterEmailPanel({
  complaintId,
  documentId,
  mailStatus: mailStatusProp = null,
  initialHistory = [],
  variant = "standalone",
}: {
  complaintId: string;
  /** The letter PDF to attach; null lets the server pick the right one. */
  documentId: string | null;
  mailStatus?: MailStatus | null;
  initialHistory?: LetterEmailRow[];
  /** "embedded" renders inside the Submit step: opens immediately, self-fetches
   *  everything (the caller there has none of this server-fetched already),
   *  skips the card chrome, and locks the letter kind to the one being filed. */
  variant?: "standalone" | "embedded";
}) {
  const router = useRouter();
  const embedded = variant === "embedded";
  const [open, setOpen] = React.useState(embedded);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [mailStatus, setMailStatus] = React.useState<MailStatus | null>(mailStatusProp);

  // Scoped to THIS complaint's own division/sub-division/ward — never the whole
  // directory. See lib/mail/recommend-recipients.ts: it unions the officer's own
  // FK match with any ward-jurisdiction row that resolves into scope, and always
  // includes the case's already-assigned officer even if their own jurisdiction
  // match came up empty.
  const [recommended, setRecommended] = React.useState<RecommendedRecipient[]>([]);
  const [resolutionReason, setResolutionReason] = React.useState<string | null>(null);
  const [deptOptions, setDeptOptions] = React.useState<RecipientOption[]>([]);
  // Selection is by ADDRESS, which is coherent only because options are merged
  // one-per-address — see lib/mail/recipient-options.ts.
  const [picked, setPicked] = React.useState<string[]>([]);
  const [ccPicked, setCcPicked] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [manual, setManual] = React.useState<ManualRow[]>([]);
  const [letterKind, setLetterKind] = React.useState<string>(SELECTABLE_LETTER_KINDS[0]);
  const [history, setHistory] = React.useState<LetterEmailRow[]>(initialHistory);
  // undefined = still checking; null = nothing on file at all. Re-fetched
  // whenever the picked kind changes, so "which stored letter is this" is
  // answered before the user commits to sending, not left for them to guess.
  const [attachmentPreview, setAttachmentPreview] = React.useState<AttachmentPreview | null | undefined>(undefined);
  const [viewTarget, setViewTarget] = React.useState<ViewerTarget | null>(null);

  const lastAttempt = history[0] ?? null;
  const notSent = lastAttempt && lastAttempt.status !== "sent" ? lastAttempt : null;

  /**
   * Load the picker — ONLY this complaint's own division/sub-division/ward
   * recommendations, plus the cross-cutting head-office list (collapsed,
   * separate). Deliberately NOT the whole contact directory: with the
   * department/zone import landing ~70 more contacts in the same table, showing
   * every emailable contact turned this into a wall the user had to search
   * through to find the one or two people who actually matter for this case.
   * Anyone genuinely not covered by either list is reachable via "Add an
   * officer not in the system" below, not by browsing the full directory.
   */
  const load = React.useCallback(async () => {
    setLoading(true);
    // Clear the previous attempt's messages — reopening the panel should not show
    // a stale "Sent to …" from ten minutes ago.
    setError(null);
    setResult(null);
    const [recommendedRes, deptRes] = await Promise.all([
      listRecommendedRecipientsAction(complaintId),
      listDepartmentRecipientsAction(),
    ]);
    setLoading(false);
    if (recommendedRes.error) {
      setError(recommendedRes.error);
      return;
    }
    const recs = recommendedRes.recipients ?? [];
    setRecommended(recs);
    setResolutionReason(recommendedRes.resolutionReason ?? null);
    setDeptOptions(deptRes.options ?? []);

    // Pre-tick the officer the system itself resolved, so the common case is one
    // click rather than a search. Every OTHER division-matched recommendation is
    // shown with a reason but deliberately NOT pre-ticked — sending stays a
    // choice the user makes, not one the system makes for them.
    const suggested = recs.filter((r) => r.suggested).map((r) => r.email);
    setPicked((prev) => (prev.length ? prev : suggested));
    // Nothing scoped to this complaint at all (no assigned officer, no
    // division/ward match) → open with a blank row ready to type into. This is
    // the common case for wards outside the imported ARO range.
    if (!recs.length) setManual((prev) => (prev.length ? prev : [{ ...BLANK_ROW }]));
  }, [complaintId]);

  // Embedded mode has none of this pre-fetched by its caller (SubmitPanel), so it
  // self-loads immediately instead of waiting for a button click.
  React.useEffect(() => {
    if (!embedded) return;
    void load();
    if (!mailStatusProp) {
      void getMailStatusAction().then((r) => {
        if (!("error" in r)) setMailStatus(r);
      });
    }
    if (!initialHistory.length) {
      void listLetterEmailsAction(complaintId).then((r) => {
        if (r.rows) setHistory(r.rows);
      });
    }
    // Deliberately mount-only: embedded is a fixed prop for this render, and
    // mailStatusProp/initialHistory are the CALLER's initial values, not state to
    // re-sync against on every complaintId identity check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, complaintId]);

  // Which stored letter would actually go out for the currently-picked kind —
  // embedded has no kind picker (its documentId is fixed to the letter just
  // drafted), so this only matters in standalone mode.
  React.useEffect(() => {
    if (embedded || !open) return;
    let cancelled = false;
    setAttachmentPreview(undefined);
    void previewLetterAttachmentAction(complaintId, letterKind).then((r) => {
      if (!cancelled) setAttachmentPreview(r.preview ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [embedded, open, complaintId, letterKind]);

  /** Explicit "View" affordance for a resolved attachment — a plain filename
   *  reads as informational text, not obviously clickable, so the view
   *  action gets its own labelled button instead. A function returning JSX
   *  (called inline, not rendered as a JSX component) so it does not create a
   *  new component identity on every render. */
  const viewLetterButton = (preview: AttachmentPreview) => (
    <button
      type="button"
      onClick={() => setViewTarget({ documentId: preview.documentId, title: preview.filename, fileName: preview.filename })}
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      <Eye className="h-3 w-3" /> View
    </button>
  );

  function toggle(list: string[], setList: (v: string[]) => void, email: string) {
    setList(list.includes(email) ? list.filter((e) => e !== email) : [...list, email]);
  }

  const manualValid = manual.filter((m) => emailLooksValid(m.email));
  // A typed address that duplicates a ticked one is one recipient, not two — the
  // server de-duplicates, so the count must agree with what actually goes out.
  const manualNew = manualValid.filter((m) => !picked.includes(m.email.trim().toLowerCase()));
  const totalTo = picked.length + manualNew.length;

  const visibleRecommended = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recommended;
    return recommended.filter(
      (o) =>
        o.email.includes(q) ||
        o.label.toLowerCase().includes(q) ||
        (o.designation ?? "").toLowerCase().includes(q) ||
        o.officers.some((p) => p.name.toLowerCase().includes(q)),
    );
  }, [recommended, search]);

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);

    // A ticked address can come from either list rendered below — union both
    // for attribution (name/designation in the salutation).
    const byEmail = new Map([...recommended, ...deptOptions].map((o) => [o.email, o]));
    // For a shared mailbox the option carries name/designation = null, so the
    // letter opens generically instead of naming one of two officers.
    const fromOption = (e: string) => {
      const o = byEmail.get(e);
      return { name: o?.name ?? null, designation: o?.designation ?? null, email: e };
    };
    const to = [
      ...picked.map(fromOption),
      ...manualNew.map((m) => ({
        name: m.name.trim() || null,
        designation: m.designation.trim() || null,
        email: m.email.trim(),
      })),
    ];
    const cc = ccPicked.filter((e) => !picked.includes(e)).map(fromOption);

    const r = await sendLetterEmailAction({ complaintId, documentId, letterKind, to, cc });
    setSending(false);

    if (r.error && r.status !== "sent") {
      setError(r.error);
    } else if (r.status === "sent") {
      setResult(
        r.redirected
          ? `Sent to ${r.to?.join(", ")} — test mode is on, so the officials were not contacted.`
          : `Sent to ${r.to?.join(", ")}.`,
      );
      setManual([]);
      // Collapse to the one-line summary, same as the standalone panel shows
      // once closed — embedded has no separate "Close" button, so this is the
      // only way it stops looking like an open, actionable form after sending.
      if (embedded) setOpen(false);
    } else {
      setError(r.error ?? "The email was not sent.");
    }

    const h = await listLetterEmailsAction(complaintId);
    if (h.rows) setHistory(h.rows);
    router.refresh();
  }

  const body = (
    <>
        {/* Why the automatic send did not go out. This is the prompt the user asked for. */}
        {notSent && (
          <div className="flex flex-wrap items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                This letter has not been emailed{notSent.letter_kind ? ` (${notSent.letter_kind})` : ""}.
              </p>
              {notSent.error && <p className="mt-0.5 text-amber-700/90 dark:text-amber-400/90">{notSent.error}</p>}
              <p className="mt-0.5 text-muted-foreground">
                Choose the officers below, or type a name and email address, then send.
              </p>
            </div>
          </div>
        )}

        {!notSent && lastAttempt?.status === "sent" && !open && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5 shrink-0" />
            Last emailed {formatDateTime(lastAttempt.sent_at ?? lastAttempt.created_at)} to{" "}
            {(lastAttempt.to_addresses ?? []).join(", ")}
            {lastAttempt.redirected ? " (test mode)" : ""}
            {/* Embedded has no header "Close" button to reopen from, so it needs
                its own inline link back into the form. */}
            {embedded && (
              <button type="button" onClick={() => setOpen(true)} className="ml-1 underline text-muted-foreground hover:text-foreground">
                Change
              </button>
            )}
          </p>
        )}

        {open && (
          <div className="space-y-4">
            {mailStatus && mailStatus.mode !== "redirect" && mailStatus.mode !== "live" && (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {mailStatus.summary} The attempt will still be
                recorded.
              </p>
            )}

            {mailStatus?.mode === "live" && (
              <p className="flex items-start gap-1.5 rounded-md border border-rose-250 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Live mode — this will write to the real officials you select.
              </p>
            )}

            {/* Embedded only ever concerns the letter just drafted — no kind to
                choose, so the dropdown (and its extra decision) is skipped. */}
            {!embedded && (
              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-455 dark:text-slate-500">
                  What is being sent
                </label>
                <select className={selectCls} value={letterKind} onChange={(e) => setLetterKind(e.target.value)}>
                  {SELECTABLE_LETTER_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                {/* What will actually be attached if you hit send right now —
                    answered concretely instead of leaving the kind label to
                    speak for itself, which is the confusion this replaced. */}
                <div className="mt-1.5 text-[11px]">
                  {attachmentPreview === undefined && (
                    <p className="text-muted-foreground">Checking which stored letter matches…</p>
                  )}
                  {attachmentPreview === null && (
                    <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      No stored letter is on file for this case yet — sending now would go out with no attachment.
                    </p>
                  )}
                  {attachmentPreview && !attachmentPreview.matchedKind && (
                    <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        No {letterKind.toLowerCase()} is on file yet — sending now would instead attach the most
                        recent letter on record: <span className="font-medium">{attachmentPreview.filename}</span>
                        {attachmentPreview.createdAt && ` (filed ${formatDateTime(attachmentPreview.createdAt)})`}
                        {" · "}
                        {viewLetterButton(attachmentPreview)}
                      </span>
                    </p>
                  )}
                  {attachmentPreview && attachmentPreview.matchedKind && (
                    <p className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
                      <span>
                        Attaching: <span className="font-medium text-slate-700 dark:text-slate-300">{attachmentPreview.filename}</span>
                        {attachmentPreview.createdAt && ` — filed ${formatDateTime(attachmentPreview.createdAt)}`}
                      </span>
                      {viewLetterButton(attachmentPreview)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Recommended picker — scoped to THIS complaint's own division /
                sub-division / ward. Never the full contact directory. */}
            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="mb-2 border-b border-slate-100 pb-1.5 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Officers for this ward / division {recommended.length ? `(${recommended.length})` : ""}
                  </span>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Scoped to this complaint&apos;s own division, sub-division and ward — not the full directory.
                </p>
              </div>

              {!loading && !recommended.length && (
                <p className="text-xs text-muted-foreground">
                  {resolutionReason ?? "No officer covering this ward/division has an email on record. Add one by hand below."}
                </p>
              )}

              {recommended.length > 0 && (
                <>
                  {recommended.length > 8 && (
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter by name, designation or address…"
                      className="mb-2 h-9"
                      aria-label="Filter officers"
                    />
                  )}
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {visibleRecommended.map((o) => {
                      // Reasons other than "this is the officer already assigned
                      // to the case" — shown as explanatory text regardless of
                      // whether it's also the suggested pick, so a suggested
                      // officer who ALSO matches by role still shows why.
                      const extraReasons = o.reasons.filter((r) => r.kind !== "assigned");
                      const showRecommendedBadge = extraReasons.length > 0 && !o.suggested;
                      return (
                        // Keyed by address: options are merged one-per-address,
                        // which is what makes this unique. Keying by contact id
                        // would put two rows on one shared mailbox again.
                        <div key={o.email} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                            checked={picked.includes(o.email)}
                            onChange={() => toggle(picked, setPicked, o.email)}
                            aria-label={`Send to ${o.label} at ${o.email}`}
                          />
                          <div className="min-w-0 flex-1 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{o.label}</span>
                              {o.suggested && <Badge variant="info">Suggested</Badge>}
                              {showRecommendedBadge && <Badge variant="primary-subtle">Recommended</Badge>}
                              {o.note && !o.suggested && <Badge variant="muted">{o.note}</Badge>}
                            </div>
                            <div className="truncate text-muted-foreground">
                              {o.designation ? `${o.designation} · ` : ""}
                              {o.email}
                            </div>
                            {extraReasons.length > 0 && (
                              <div className="mt-0.5 text-[11px] text-primary/80">
                                {extraReasons.map((r) => r.label).join(" · ")}
                              </div>
                            )}
                            {/* A shared mailbox reaches more than one officer — say so,
                                rather than showing one name and quietly meaning two. */}
                            {o.officers.length > 1 && (
                              <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                                Reaches {o.officers.map((p) => p.name).join(", ")}
                              </div>
                            )}
                          </div>
                          <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 cursor-pointer accent-primary"
                              checked={ccPicked.includes(o.email)}
                              disabled={picked.includes(o.email)}
                              onChange={() => toggle(ccPicked, setCcPicked, o.email)}
                            />
                            Cc
                          </label>
                        </div>
                      );
                    })}
                    {!visibleRecommended.length && (
                      <p className="py-2 text-xs text-muted-foreground">No officer matches “{search}”.</p>
                    )}
                  </div>
                </>
              )}

              {/* Cross-cutting department-head / state-level contacts — collapsed by
                  default. Relevant to every complaint regardless of division, so
                  showing them expanded would bury the division-specific picks
                  above under ~30 mostly-irrelevant entries. */}
              {deptOptions.length > 0 && (
                <details className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                    Show head-office contacts ({deptOptions.length})
                  </summary>
                  <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {deptOptions.map((o) => (
                      <div key={o.email} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                          checked={picked.includes(o.email)}
                          onChange={() => toggle(picked, setPicked, o.email)}
                          aria-label={`Send to ${o.label} at ${o.email}`}
                        />
                        <div className="min-w-0 flex-1 text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{o.label}</span>
                          <div className="truncate text-muted-foreground">
                            {o.designation ? `${o.designation} · ` : ""}
                            {o.email}
                          </div>
                        </div>
                        <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 cursor-pointer accent-primary"
                            checked={ccPicked.includes(o.email)}
                            disabled={picked.includes(o.email)}
                            onChange={() => toggle(ccPicked, setCcPicked, o.email)}
                          />
                          Cc
                        </label>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Ad-hoc recipients */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-455 dark:text-slate-500">
                Add an officer not in the system
              </label>
              {manual.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nobody added by hand. Use this when the officer&apos;s details are not on record.
                </p>
              )}
              {manual.length > 0 && (
                <div className="hidden gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-455 dark:text-slate-500 sm:grid sm:grid-cols-[1.1fr_1fr_1.3fr_auto]">
                  <span>Designation</span>
                  <span>Name (optional)</span>
                  <span>Email</span>
                  <span className="w-9" />
                </div>
              )}
              {manual.map((row, i) => {
                const bad = row.email.trim().length > 0 && !emailLooksValid(row.email);
                const set = (patch: Partial<ManualRow>) =>
                  setManual((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
                return (
                  <div key={i} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1.1fr_1fr_1.3fr_auto]">
                    <div>
                      <Input
                        value={row.designation}
                        onChange={(e) => set({ designation: e.target.value })}
                        placeholder="Executive Engineer"
                        list="letter-email-designations"
                        className="h-9"
                        aria-label="Officer designation"
                      />
                      <span className="text-[10px] text-muted-foreground">Opens the letter formally</span>
                    </div>
                    <Input
                      value={row.name}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder="Sri / Smt name"
                      className="h-9"
                      aria-label="Officer name"
                    />
                    <div>
                      <Input
                        value={row.email}
                        onChange={(e) => set({ email: e.target.value })}
                        placeholder="officer@bbmp.gov.in"
                        type="email"
                        inputMode="email"
                        className={`h-9 ${bad ? "border-destructive" : ""}`}
                        aria-invalid={bad}
                        aria-label="Officer email address"
                      />
                      {bad && <span className="text-[10px] text-destructive">Not a valid email address</span>}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setManual((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove recipient"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <datalist id="letter-email-designations">
                {COMMON_DESIGNATIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManual((prev) => [...prev, { ...BLANK_ROW }])}
              >
                <Plus className="h-4 w-4" /> Add recipient
              </Button>
            </div>

            {error && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}
            {result && (
              <p className="flex items-start gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {result}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <Button onClick={send} disabled={sending || totalTo === 0}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : `Send to ${totalTo || "…"}${totalTo === 1 ? " recipient" : " recipients"}`}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {totalTo === 0
                  ? "Select an officer or add one by hand."
                  : mailStatus?.mode === "redirect"
                    ? `Test mode: goes to ${mailStatus.redirectTo}, not to the officials.`
                    : "The letter PDF is attached automatically."}
              </span>
            </div>
          </div>
        )}

        {/* Past attempts — the outbox nothing else surfaces. */}
        {history.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-455 dark:text-slate-500">
              Email history{history.length > 6 ? ` — latest 6 of ${history.length}` : ` (${history.length})`}
            </p>
            <ul className="space-y-1.5">
              {history.slice(0, 6).map((h) => {
                const s = STATUS_LABEL[h.status];
                return (
                  <li key={h.id} className="flex flex-wrap items-start gap-2 text-xs">
                    <Badge variant={s.variant}>{s.text}</Badge>
                    <span className="text-muted-foreground">{formatDateTime(h.sent_at ?? h.created_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">
                      {h.letter_kind ?? "Letter"}
                      {" → "}
                      {(h.to_addresses ?? []).join(", ") || "(nobody)"}
                      {h.redirected && (h.intended_to ?? []).length > 0 && (
                        <span className="text-muted-foreground"> (meant for {h.intended_to.join(", ")})</span>
                      )}
                    </span>
                    {h.status !== "sent" && h.error && (
                      <span className="w-full text-[11px] text-amber-700 dark:text-amber-400">{h.error}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
    </>
  );

  if (embedded) {
    // Plain bordered block matching the visual level of the adjacent TVCC
    // block in SubmitPanel, rather than a full Card nested inside one.
    return (
      <div className="space-y-2.5 rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted-foreground" /> Email the complaint letter to officers
        </p>
        {mailStatus?.summary && <p className="text-xs text-muted-foreground">{mailStatus.summary}</p>}
        {body}
      </div>
    );
  }

  return (
    <Card className="no-print border border-slate-150 dark:border-slate-850 shadow-xs rounded-xl mb-6">
      <SectionHeader
        icon={Mail}
        title="Email this letter"
        description={mailStatus?.summary ?? "Send the filed letter to the responsible officer."}
        badge={
          mailStatus?.mode === "redirect" ? (
            <Badge variant="warning">Test mode</Badge>
          ) : mailStatus?.mode === "live" ? (
            <Badge variant="success">Live</Badge>
          ) : mailStatus ? (
            <Badge variant="muted">{mailStatus.mode === "disabled" ? "Off" : "Not configured"}</Badge>
          ) : null
        }
        actions={
          !open ? (
            <Button
              size="sm"
              onClick={() => {
                setOpen(true);
                void load();
              }}
            >
              <Send className="h-3.5 w-3.5" /> {notSent ? "Send it now" : "Email letter"}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          )
        }
      />
      <CardContent className="space-y-4 p-5">{body}</CardContent>
      <DocumentViewer target={viewTarget} onClose={() => setViewTarget(null)} />
    </Card>
  );
}
