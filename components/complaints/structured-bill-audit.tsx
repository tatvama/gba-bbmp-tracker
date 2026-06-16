"use client";

import * as React from "react";
import { Loader2, Calculator, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditComplaintBills, type BillAuditResult } from "@/lib/actions/bill-audit";

function sev(s: string): "destructive" | "warning" | "muted" {
  return s === "High" ? "destructive" : s === "Medium" ? "warning" : "muted";
}
const money = (n: number | null | undefined) =>
  typeof n === "number" ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—";

export function StructuredBillAudit({ complaintId, aiConfigured }: { complaintId: string; aiConfigured: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<BillAuditResult | null>(null);

  async function run() {
    setBusy(true);
    try {
      setRes(await auditComplaintBills(complaintId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!aiConfigured && (
        <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
          <AlertTriangle className="mb-1 h-4 w-4" /> <span className="font-semibold">AI not configured.</span> Structured extraction needs ANTHROPIC_API_KEY (the deterministic checks then run on the extracted numbers).
        </div>
      )}
      <Button onClick={run} disabled={busy || !aiConfigured}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
        Run structured bill audit
      </Button>

      {res && !res.ok && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{res.error}</div>
      )}

      {res?.ok && res.audits.map((a) => (
        <Card key={a.documentId}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{a.documentType ?? "Bill"} — {a.bill.billNo ? `No. ${a.bill.billNo}` : "structured audit"}</CardTitle>
            {a.redFlagCount > 0 ? (
              <Badge variant="destructive"><ShieldAlert className="h-3 w-3" /> {a.redFlagCount} red flag{a.redFlagCount === 1 ? "" : "s"} · score {a.score}</Badge>
            ) : (
              <Badge variant="success"><ShieldCheck className="h-3 w-3" /> Arithmetic OK</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {a.bill.needsManualReview && (
              <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-amber-dark">
                Extraction confidence low / OCR unclear — verify the figures against the original bill.
              </p>
            )}

            {a.bill.lineItems.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Qty×Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a.bill.lineItems.map((li, i) => {
                      const calc = typeof li.qty === "number" && typeof li.rate === "number" ? li.qty * li.rate : null;
                      const off = calc !== null && typeof li.amount === "number" && Math.abs(calc - li.amount) > 1;
                      return (
                        <TableRow key={i}>
                          <TableCell className="max-w-xs truncate">{li.description}</TableCell>
                          <TableCell className="text-right tabular-nums">{li.qty ?? "—"} {li.unit ?? ""}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(li.rate)}</TableCell>
                          <TableCell className={`text-right tabular-nums ${off ? "font-bold text-destructive" : ""}`}>{money(li.amount)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{money(calc)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap gap-4 text-sm">
              <span>Sub-total: <strong>{money(a.bill.subTotal)}</strong></span>
              <span>Grand total: <strong>{money(a.bill.grandTotal)}</strong></span>
              {typeof a.bill.netPayable === "number" && <span>Net payable: <strong>{money(a.bill.netPayable)}</strong></span>}
              {typeof a.bill.sanctionedAmount === "number" && <span>Sanctioned: <strong>{money(a.bill.sanctionedAmount)}</strong></span>}
            </div>

            {a.findings.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Findings</h3>
                {a.findings.map((f, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={sev(f.severity)}>{f.severity}</Badge>
                      <span className="text-sm font-semibold">{f.title}</span>
                    </div>
                    <p className="mt-1 text-sm">{f.detail}</p>
                    {(f.expected || f.actual) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {f.expected ? `Expected ${f.expected}` : ""}{f.expected && f.actual ? " · " : ""}{f.actual ? `Actual ${f.actual}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No arithmetic or rate red flags in the extracted figures.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
