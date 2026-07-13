"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import type { Division, Corporation } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorpPill } from "@/components/badges";
import { exportRows } from "@/lib/export";

/** Matches lib/queries.ts's listDivisions() return shape. */
type DivisionRow = Division & { corporation?: Pick<Corporation, "code" | "name"> | null };

export function OldMappingTable({ data }: { data: DivisionRow[] }) {
  const [q, setQ] = React.useState("");
  const [unmappedOnly, setUnmappedOnly] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((d) => {
      if (unmappedOnly && d.old_names && d.old_names.length > 0) return false;
      if (!needle) return true;
      const hay = [d.name, ...(d.old_names ?? [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [data, q, unmappedOnly]);

  function doExport() {
    exportRows(
      filtered.map((d) => ({
        old_names: (d.old_names ?? []).join("; "),
        name: d.name,
        corporation: d.corporation?.name ?? "",
        mapped: d.old_names && d.old_names.length > 0 ? "yes" : "no",
      })),
      "division-old-new-mapping",
      "csv",
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search old/new division names…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
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
              <TableHead>Old division name(s)</TableHead>
              <TableHead>Current division name</TableHead>
              <TableHead>Corporation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  {d.old_names && d.old_names.length > 0 ? (
                    <span className="text-sm">{d.old_names.join(", ")}</span>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">not mapped in source</span>
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/divisions/${d.id}`} className="font-medium text-primary hover:underline">
                    {d.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {d.corporation ? (
                    <CorpPill code={d.corporation.code} name={d.corporation.name} derived={d.corporation_derived} />
                  ) : (
                    <span className="text-xs italic text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{filtered.length} divisions</p>
    </div>
  );
}
