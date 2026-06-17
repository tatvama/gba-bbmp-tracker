"use client";

import * as React from "react";
import { Loader2, Sparkles, Save, Copy, Check, Printer, FileDown, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { generateLetter, saveLetterEdit, lintLetterAction, type LetterResult } from "@/lib/actions/bill-letter";
import { LETTER_SIGNATORIES, LETTER_DRAFT_KINDS, LETTER_VARIANTS, type LetterVariant, type SignatoryKey } from "@/lib/constants";
import type { LintResult } from "@/lib/letters/safe-language";

export interface SavedDraft {
  id: string;
  variant: string;
  language: string;
  content: string | null;
  lintOk: boolean;
  signatoryKey: string;
  createdAt: string;
}

export function LetterDrafter({ jobNumber, aiConfigured, hasAudit, savedDrafts = [] }: { jobNumber: string; aiConfigured: boolean; hasAudit: boolean; savedDrafts?: SavedDraft[] }) {
  const [variant, setVariant] = React.useState<LetterVariant>("bill_stop");
  const [language, setLanguage] = React.useState<"Kannada" | "Bilingual">("Kannada");
  const [signatory, setSignatory] = React.useState<SignatoryKey>("raghav_gowda");
  const [useAi, setUseAi] = React.useState(aiConfigured);

  const [draft, setDraft] = React.useState("");
  const [draftId, setDraftId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lint, setLint] = React.useState<LintResult | null>(null);
  const [meta, setMeta] = React.useState<{ aiUsed?: boolean; aiDiscarded?: boolean } | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  function apply(r: LetterResult) {
    if (!r.ok) { setError(r.error ?? "Could not draft the letter."); return; }
    setError(null);
    if (typeof r.content === "string") setDraft(r.content);
    if (r.draftId) setDraftId(r.draftId);
    if (r.lint) setLint(r.lint);
    setMeta({ aiUsed: r.aiUsed, aiDiscarded: r.aiDiscarded });
  }

  async function onGenerate() {
    setBusy(true); setSaved(false);
    try {
      apply(await generateLetter({ jobNumber, variant, language, signatoryKey: signatory, useAi }));
    } finally { setBusy(false); }
  }

  async function onSave() {
    if (!draftId || !draft.trim()) return;
    setBusy(true);
    try {
      const r = await saveLetterEdit(draftId, draft);
      if (r.ok) { setSaved(true); if (r.lint) setLint(r.lint); setTimeout(() => setSaved(false), 2500); }
      else setError(r.error ?? "Could not save.");
    } finally { setBusy(false); }
  }

  async function onCheck() {
    const r = await lintLetterAction(draft);
    setLint(r.lint);
  }

  async function reopen(s: SavedDraft) {
    setDraft(s.content ?? "");
    setDraftId(s.id);
    setVariant(s.variant as LetterVariant);
    setLanguage(s.language === "Bilingual" ? "Bilingual" : "Kannada");
    setSignatory(s.signatoryKey as SignatoryKey);
    setError(null);
    setMeta(null);
    const r = await lintLetterAction(s.content ?? ""); // reflect lint of the reopened text
    setLint(r.lint);
  }

  async function onCopy() {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  }

  const dl = (fmt?: "csv") => `/api/job-audit/${encodeURIComponent(jobNumber)}/letter?draftId=${draftId}${fmt ? `&format=${fmt}` : ""}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_1fr]">
      {/* Controls */}
      <div className="space-y-3">
        {!hasAudit && (
          <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
            <AlertTriangle className="mb-1 h-4 w-4" /> Run the forensic audit for this job first — the letter is built from its findings.
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Letter type</Label>
          <Select value={variant} onValueChange={(v) => setVariant(v as LetterVariant)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LETTER_VARIANTS.map((v) => <SelectItem key={v} value={v}>{LETTER_DRAFT_KINDS[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Language</Label>
          <Select value={language} onValueChange={(v) => setLanguage(v as "Kannada" | "Bilingual")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Kannada">Kannada (ಕನ್ನಡ)</SelectItem>
              <SelectItem value="Bilingual">Bilingual (Kannada + English)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Signatory</Label>
          <Select value={signatory} onValueChange={(v) => setSignatory(v as SignatoryKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(LETTER_SIGNATORIES) as SignatoryKey[]).map((k) => (
                <SelectItem key={k} value={k}>{LETTER_SIGNATORIES[k].name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={useAi} onCheckedChange={(c) => setUseAi(Boolean(c))} disabled={!aiConfigured} />
          Polish with AI {aiConfigured ? "" : "(needs ANTHROPIC_API_KEY)"}
        </label>
        <Button onClick={onGenerate} disabled={busy || !hasAudit} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {draft ? "Regenerate" : "Generate letter"}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          AI prose is run through a safe-language gate. If it produces any accusatory wording the AI text is discarded and the deterministic draft is used. Drafts are editable and never auto-filed.
        </p>

        {savedDrafts.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <Label className="text-xs">Saved drafts ({savedDrafts.length})</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {savedDrafts.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => reopen(s)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted ${s.id === draftId ? "border-primary bg-muted" : ""}`}
                >
                  <span className="truncate">
                    {LETTER_DRAFT_KINDS[s.variant as LetterVariant] ?? s.variant}
                    <span className="ml-1 text-muted-foreground">{s.createdAt.slice(0, 10)}</span>
                  </span>
                  <Badge variant={s.lintOk ? "success" : "destructive"} className="shrink-0">{s.lintOk ? "✓" : "✗"}</Badge>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Click a draft to reopen and edit it.</p>
          </div>
        )}
      </div>

      {/* Draft + actions */}
      <div className="space-y-2">
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

        {meta?.aiDiscarded && (
          <div className="rounded-md border border-amber/50 bg-amber/10 px-3 py-1.5 text-xs text-amber-dark">
            ⚠ The AI draft contained prohibited wording and was discarded — showing the safe deterministic draft instead.
          </div>
        )}

        {lint && (
          lint.ok ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-700">
              <ShieldCheck className="h-4 w-4" /> Safe-language check passed
              {lint.warnings.length > 0 && <span className="text-amber-dark">· {lint.warnings.length} dash warning(s)</span>}
              {meta?.aiUsed && <Badge variant="muted">AI-polished</Badge>}
            </div>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
              <span className="flex items-center gap-1 font-semibold"><ShieldAlert className="h-4 w-4" /> Safe-language check FAILED — fix before filing:</span>
              <ul className="mt-1 list-disc pl-5">
                {lint.errors.slice(0, 6).map((e, i) => <li key={i}>{e.reason}: “{e.excerpt}”</li>)}
              </ul>
            </div>
          )
        )}

        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={22} placeholder="The generated Kannada letter appears here and is fully editable…" className="font-mono text-sm" />

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCheck} disabled={!draft}><ShieldCheck className="h-4 w-4" /> Check safe-language</Button>
          <Button variant="outline" size="sm" onClick={onSave} disabled={!draft || !draftId || busy}>
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? "Saved" : "Save edits"}
          </Button>
          <Button variant="outline" size="sm" onClick={onCopy} disabled={!draft}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!draft}><Printer className="h-4 w-4" /> Print</Button>
          {draftId && (
            <>
              <Button asChild variant="outline" size="sm"><a href={dl()} download><FileDown className="h-4 w-4" /> Word (.docx)</a></Button>
              <Button asChild variant="outline" size="sm"><a href={dl("csv")} download><FileDown className="h-4 w-4" /> Evidence CSV</a></Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
