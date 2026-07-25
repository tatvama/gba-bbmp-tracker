"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Mail, Plus, Send, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/section-header";
import { formatDateTime } from "@/lib/format";
import {
  sendLetterEmailAction,
  listLetterEmailsAction,
  listRecipientOptionsAction,
  type MailStatus,
} from "@/lib/actions/mail";
import type { LetterEmailRow, RecipientOption } from "@/lib/mail/queries";
import { SELECTABLE_LETTER_KINDS } from "@/lib/mail/routing";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface ManualRow {
  name: string;
  email: string;
}

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
  mailStatus,
  initialHistory,
}: {
  complaintId: string;
  /** The letter PDF to attach; null lets the server pick the right one. */
  documentId: string | null;
  mailStatus: MailStatus | null;
  initialHistory: LetterEmailRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);

  const [options, setOptions] = React.useState<RecipientOption[]>([]);
  const [resolutionReason, setResolutionReason] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [ccPicked, setCcPicked] = React.useState<string[]>([]);
  const [manual, setManual] = React.useState<ManualRow[]>([]);
  const [letterKind, setLetterKind] = React.useState<string>(SELECTABLE_LETTER_KINDS[0]);
  const [history, setHistory] = React.useState<LetterEmailRow[]>(initialHistory);

  const lastAttempt = history[0] ?? null;
  const notSent = lastAttempt && lastAttempt.status !== "sent" ? lastAttempt : null;

  /** Load the picker lazily — the contact list is the whole directory. */
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await listRecipientOptionsAction(complaintId);
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setOptions(r.options ?? []);
    setResolutionReason(r.resolutionReason ?? null);
    // Pre-tick the officer the system itself resolved, so the common case is one
    // click rather than a search.
    const suggested = (r.options ?? []).filter((o) => o.suggested).map((o) => o.email);
    setPicked((prev) => (prev.length ? prev : suggested));
    // Nothing on record → start them off with one blank row to type into.
    if (!suggested.length && !(r.options ?? []).length) setManual((prev) => (prev.length ? prev : [{ name: "", email: "" }]));
  }, [complaintId]);

  function toggle(list: string[], setList: (v: string[]) => void, email: string) {
    setList(list.includes(email) ? list.filter((e) => e !== email) : [...list, email]);
  }

  const manualValid = manual.filter((m) => emailLooksValid(m.email));
  const totalTo = picked.length + manualValid.length;

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);

    const byEmail = new Map(options.map((o) => [o.email, o]));
    const to = [
      ...picked.map((e) => ({ name: byEmail.get(e)?.name ?? null, email: e })),
      ...manualValid.map((m) => ({ name: m.name.trim() || null, email: m.email.trim() })),
    ];
    const cc = ccPicked.filter((e) => !picked.includes(e)).map((e) => ({ name: byEmail.get(e)?.name ?? null, email: e }));

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
    } else {
      setError(r.error ?? "The email was not sent.");
    }

    const h = await listLetterEmailsAction(complaintId);
    if (h.rows) setHistory(h.rows);
    router.refresh();
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

      <CardContent className="space-y-4 p-5">
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
              <p className="mt-1 text-[11px] text-muted-foreground">
                Used in the subject line, and to pick which stored letter is attached.
              </p>
            </div>

            {/* Directory picker */}
            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Officers on record {options.length ? `(${options.length})` : ""}
                </span>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

              {!loading && !options.length && (
                <p className="text-xs text-muted-foreground">
                  {resolutionReason ??
                    "No contact in the directory has an email address. Add recipients by hand below."}
                </p>
              )}

              {options.length > 0 && (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {options.map((o) => (
                    <div key={o.email} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                        checked={picked.includes(o.email)}
                        onChange={() => toggle(picked, setPicked, o.email)}
                        aria-label={`Send to ${o.name}`}
                      />
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{o.name}</span>
                          {o.suggested && <Badge variant="info">Suggested</Badge>}
                          {o.note && !o.suggested && <Badge variant="muted">{o.note}</Badge>}
                        </div>
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
              {manual.map((row, i) => {
                const bad = row.email.trim().length > 0 && !emailLooksValid(row.email);
                return (
                  <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
                    <Input
                      value={row.name}
                      onChange={(e) =>
                        setManual((prev) => prev.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                      }
                      placeholder="Officer name / designation"
                      className="h-9"
                    />
                    <div>
                      <Input
                        value={row.email}
                        onChange={(e) =>
                          setManual((prev) => prev.map((r, j) => (j === i ? { ...r, email: e.target.value } : r)))
                        }
                        placeholder="officer@bbmp.gov.in"
                        type="email"
                        inputMode="email"
                        className={`h-9 ${bad ? "border-destructive" : ""}`}
                        aria-invalid={bad}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManual((prev) => [...prev, { name: "", email: "" }])}
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
              Email history ({history.length})
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
      </CardContent>
    </Card>
  );
}
