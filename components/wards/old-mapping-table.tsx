"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import type { WardWithRelations } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorpPill } from "@/components/badges";
import { exportRows } from "@/lib/export";

export function OldMappingTable({ data }: { data: WardWithRelations[] }) {
  const [q, setQ] = React.useState("");
  const [unmappedOnly, setUnmappedOnly] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((w) => {
      if (unmappedOnly && w.old_wards && w.old_wards.length > 0) return false;
      if (!needle) return true;
      const hay = [w.new_name, String(w.new_no), ...(w.old_wards ?? [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [data, q, unmappedOnly]);

  function doExport() {
    exportRows(
      filtered.map((w) => ({
        old_wards: (w.old_wards ?? []).join("; "),
        new_no: w.new_no,
        new_name: w.new_name,
        derived_corporation: w.derived_corporation?.name ?? "",
        mapped: w.old_wards && w.old_wards.length > 0 ? "yes" : "no",
      })),
      "old-198-to-225-mapping",
      "csv",
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input placeholder="Search old/new wards…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <div className="flex items-center gap-2">
          <Checkbox id="unmapped" checked={unmappedOnly} onCheckedChange={(v) => setUnmappedOnly(!!v)} />
          <Label htmlFor="unmapped" className="cursor-pointer text-sm">Unmapped only</Label>
        </div>
        <Button variant="outline" size="sm" className="sm:ml-auto" onClick={doExport}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Old · BBMP 198</TableHead>
              <TableHead>New · BBMP 225</TableHead>
              <TableHead>GBA · 369 (derived)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  {w.old_wards && w.old_wards.length > 0 ? (
                    <span className="text-sm">{w.old_wards.join(", ")}</span>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">not mapped in source</span>
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/wards/${w.new_no}`} className="font-medium text-primary hover:underline">
                    #{w.new_no} {w.new_name}
                  </Link>
                </TableCell>
                <TableCell>
                  {w.derived_corporation ? (
                    <CorpPill code={w.derived_corporation.code} name={w.derived_corporation.name} derived />
                  ) : (
                    <span className="text-xs italic text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{filtered.length} wards</p>
    </div>
  );
}
