"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  mapColumns,
  projectRow,
  validateRows,
  type CanonicalField,
} from "@/lib/import-mapper";
import { commitImport, type ImportResult } from "@/lib/actions/import";

const FIELDS: { key: CanonicalField; label: string; required?: boolean }[] = [
  { key: "fullName", label: "Full name", required: true },
  { key: "designation", label: "Designation", required: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "engSubDivision", label: "Eng. sub-division" },
  { key: "division", label: "Division" },
  { key: "corporation", label: "Corporation" },
  { key: "officeAddress", label: "Office address" },
  { key: "source", label: "Source" },
];

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Importer() {
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Partial<Record<CanonicalField, number>>>({});
  const [strategy, setStrategy] = React.useState<"skip" | "update">("skip");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet!, { header: 1, blankrows: false, defval: "" });
    const hdr = (aoa[0] ?? []).map((h) => String(h));
    setHeaders(hdr);
    setRows(aoa.slice(1).map((r) => r.map((c) => String(c ?? ""))));
    setMapping(mapColumns(hdr));
  }

  const validated = React.useMemo(
    () => (rows.length ? validateRows(rows, mapping) : []),
    [rows, mapping],
  );
  const validCount = validated.filter((r) => r.errors.length === 0).length;
  const errorCount = validated.length - validCount;

  function run(dryRun: boolean) {
    const payloadRows = rows.map((r) => projectRow(r, mapping));
    startTransition(async () => {
      const res = await commitImport({ fileName, rows: payloadRows, dryRun, duplicateStrategy: strategy });
      setResult(res);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <Label className="mb-2 block">Upload XLSX / CSV</Label>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center hover:bg-muted/40">
            <UploadCloud className="h-7 w-7 text-muted-foreground" />
            <span className="text-sm font-medium">{fileName || "Choose a file"}</span>
            <span className="text-xs text-muted-foreground">.xlsx, .xls or .csv with a header row</span>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} />
          </label>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-3 font-medium">Confirm column mapping</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  <select
                    className={selectCls}
                    value={mapping[f.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [f.key]: e.target.value === "" ? undefined : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">— not mapped —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {validated.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="font-medium">Dry-run preview</h3>
              <Badge variant="success">{validCount} valid</Badge>
              {errorCount > 0 && <Badge variant="destructive">{errorCount} with errors</Badge>}
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs">On duplicate:</Label>
                <select className={selectCls + " w-28"} value={strategy} onChange={(e) => setStrategy(e.target.value as "skip" | "update")}>
                  <option value="skip">skip</option>
                  <option value="update">update</option>
                </select>
              </div>
            </div>

            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validated.slice(0, 100).map((r) => (
                    <TableRow key={r.rowIndex} className={r.errors.length ? "bg-destructive/5" : ""}>
                      <TableCell className="text-muted-foreground">{r.rowIndex + 1}</TableCell>
                      <TableCell>{projectRow(r.raw, mapping).fullName ?? ""}</TableCell>
                      <TableCell>{projectRow(r.raw, mapping).designation ?? ""}</TableCell>
                      <TableCell>{projectRow(r.raw, mapping).phone ?? ""}</TableCell>
                      <TableCell className="text-xs text-destructive">{r.errors.join("; ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" disabled={pending} onClick={() => run(true)}>Dry run</Button>
              <Button disabled={pending || validCount === 0} onClick={() => run(false)}>
                {pending ? "Working…" : `Import ${validCount} contact${validCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className={result.error ? "border-destructive/40" : "border-teal/40"}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              {result.error ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-teal" />}
              <h3 className="font-medium">
                {result.error ? "Import failed" : result.dryRun ? "Dry run complete" : "Import committed"}
              </h3>
            </div>
            {result.error ? (
              <p className="mt-2 text-sm text-destructive">{result.error}</p>
            ) : (
              <ul className="mt-2 text-sm text-muted-foreground">
                <li>Total rows: {result.total}</li>
                <li>{result.dryRun ? "Would import" : "Imported"}: {result.imported}</li>
                <li>{result.dryRun ? "Would update" : "Updated"}: {result.updated}</li>
                <li>Skipped (duplicates): {result.skipped}</li>
                <li>Rows with errors: {result.errors.length}</li>
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
