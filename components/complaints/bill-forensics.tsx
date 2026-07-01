"use client";

import * as React from "react";
import { Loader2, ShieldAlert, ShieldCheck, AlertTriangle, Check, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runBillForensics, type ForensicsActionResult } from "@/lib/actions/forensics";

function sev(s: string): "destructive" | "warning" | "muted" {
  return s === "High" ? "destructive" : s === "Medium" ? "warning" : "muted";
}

export function BillForensicsPanel({ complaintId, aiConfigured }: { complaintId: string; aiConfigured: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<ForensicsActionResult | null>(null);

  async function run() {
    setBusy(true);
    try {
      setRes(await runBillForensics(complaintId));
    } finally {
      setBusy(false);
    }
  }

  const f = res?.forensics;

  return (
    <div className="space-y-4">
      {!aiConfigured && (
        <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
          <AlertTriangle className="mb-1 h-4 w-4" /> <span className="font-semibold">AI not configured.</span> Set ANTHROPIC_API_KEY to run the cross-document audit.
        </div>
      )}

      <Button onClick={run} disabled={busy || !aiConfigured}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
        Run cross-document audit
      </Button>

      {res && !res.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{res.error}</div>
      )}

      {f && res?.ok && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Forensic audit ({res.documentCount} documents)</CardTitle>
              {f.redFlagCount > 0 ? (
                <Badge variant="destructive"><ShieldAlert className="h-3 w-3" /> {f.redFlagCount} red flag{f.redFlagCount === 1 ? "" : "s"}</Badge>
              ) : (
                <Badge variant="success"><ShieldCheck className="h-3 w-3" /> No obvious red flags</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {f.summary && <p className="text-sm text-muted-foreground">{f.summary}</p>}
              {f.needsManualReview && (
                <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-amber-dark animate-pulse-subtle">
                  Low confidence / OCR unclear — verify against the originals before acting.
                </p>
              )}

              {f.crossChecks.length > 0 && (
                <div className="animate-fade-in">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cross-document checks</h3>
                  <ul className="space-y-1 text-sm">
                    {f.crossChecks.map((cc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {cc.status === "ok" ? <Check className="mt-0.5 h-4 w-4 text-teal" />
                          : cc.status === "mismatch" ? <X className="mt-0.5 h-4 w-4 text-destructive" />
                          : <HelpCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                        <span><span className="font-medium">{cc.check}:</span> {cc.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {f.findings.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Findings</h3>
                  {f.findings.map((x, i) => {
                    const staggerClass = `stagger-${(i % 4) + 1}`;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "rounded-md border p-3 bg-card transition-all duration-300 ease-in-out hover:shadow-sm hover:border-slate-350 dark:hover:border-slate-750 animate-fade-in",
                          staggerClass
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={sev(x.severity)}>{x.severity}</Badge>
                          <span className="text-sm font-semibold">{x.title}</span>
                          <span className="text-xs text-muted-foreground">· {x.category}</span>
                        </div>
                        <p className="mt-1 text-sm">{x.detail}</p>
                        {x.evidence && <p className="mt-1 text-xs italic text-muted-foreground">“{x.evidence}”</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
