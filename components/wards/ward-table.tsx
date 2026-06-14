"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { WardWithRelations } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CorpPill, DerivedBadge, VerificationBadge } from "@/components/badges";
import { formatNumber } from "@/lib/format";
import { exportRows } from "@/lib/export";

const STORAGE_KEY = "ward-table-filters";

export function WardTable({ data }: { data: WardWithRelations[] }) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "new_no", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [zone, setZone] = React.useState<string>("all");
  const [corp, setCorp] = React.useState<string>("all");

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setGlobalFilter(s.globalFilter ?? "");
        setZone(s.zone ?? "all");
        setCorp(s.corp ?? "all");
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ globalFilter, zone, corp }),
      );
    } catch {
      /* ignore */
    }
  }, [globalFilter, zone, corp]);

  const zones = React.useMemo(
    () =>
      Array.from(new Set(data.map((w) => w.zone).filter(Boolean))).sort() as string[],
    [data],
  );
  const corps = React.useMemo(
    () =>
      Array.from(
        new Map(
          data
            .filter((w) => w.derived_corporation)
            .map((w) => [w.derived_corporation!.code, w.derived_corporation!.name]),
        ),
      ),
    [data],
  );

  const filtered = React.useMemo(
    () =>
      data.filter(
        (w) =>
          (zone === "all" || w.zone === zone) &&
          (corp === "all" || w.derived_corporation?.code === corp),
      ),
    [data, zone, corp],
  );

  const hasFilters =
    globalFilter !== "" || zone !== "all" || corp !== "all";

  function resetFilters() {
    setGlobalFilter("");
    setZone("all");
    setCorp("all");
  }

  const columns = React.useMemo<ColumnDef<WardWithRelations>[]>(
    () => [
      {
        accessorKey: "new_no",
        header: ({ column }) => <SortBtn column={column} label="#" />,
        cell: ({ row }) => (
          <span className="font-bold tabular-nums text-foreground">
            {row.original.new_no}
          </span>
        ),
        size: 56,
      },
      {
        accessorKey: "new_name",
        header: "Ward name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.new_name}</span>
        ),
      },
      {
        id: "corp",
        header: "Corporation",
        accessorFn: (w) => w.derived_corporation?.name ?? "",
        cell: ({ row }) => {
          const c = row.original.derived_corporation;
          return c ? (
            <span className="inline-flex flex-wrap items-center gap-1">
              <CorpPill code={c.code} name={c.name} derived />
              <DerivedBadge />
            </span>
          ) : (
            <span className="text-xs italic text-muted-foreground">
              not resolved
            </span>
          );
        },
      },
      {
        id: "old_wards",
        header: "Old-198",
        accessorFn: (w) => (w.old_wards ?? []).join("; "),
        cell: ({ row }) => {
          const o = row.original.old_wards ?? [];
          return o.length ? (
            <span className="text-xs text-foreground/70">
              {o.length === 1 ? o[0] : `${o.length} wards`}
            </span>
          ) : (
            <span className="text-xs italic text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "assembly_constituency",
        header: "AC",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.assembly_constituency ?? "—"}</span>
        ),
      },
      {
        accessorKey: "zone",
        header: "Zone",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.zone ?? "—"}</span>
        ),
      },
      {
        id: "subdiv",
        header: "Eng. sub-division",
        accessorFn: (w) => w.eng_subdivision?.name ?? "—",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.eng_subdivision?.name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "property_count",
        header: ({ column }) => <SortBtn column={column} label="Properties" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs">
            {formatNumber(row.original.property_count)}
          </span>
        ),
      },
      {
        id: "verification",
        header: "Status",
        accessorFn: (w) => w.verification_status,
        cell: ({ row }) => (
          <VerificationBadge status={row.original.verification_status} />
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  function doExport(format: "csv" | "xlsx") {
    const rows = table.getFilteredRowModel().rows.map((r) => {
      const w = r.original;
      return {
        new_no: w.new_no,
        new_name: w.new_name,
        derived_corporation: w.derived_corporation?.name ?? "",
        derived: w.derived_corporation ? "derived from constituency" : "",
        old_wards: (w.old_wards ?? []).join("; "),
        assembly_constituency: w.assembly_constituency ?? "",
        zone: w.zone ?? "",
        division: w.division?.name ?? "",
        eng_subdivision: w.eng_subdivision?.name ?? "",
        property_count: w.property_count ?? "",
        verification_status: w.verification_status,
        confidence_score: w.confidence_score,
        source: w.source ?? "",
      };
    });
    exportRows(rows, "bbmp225-wards", format);
  }

  return (
    <div>
      {/* Filter toolbar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search wards, AC, zone…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={zone} onValueChange={setZone}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All zones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All zones</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={corp} onValueChange={setCorp}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="All corporations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All corporations</SelectItem>
            {corps.map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}

        <div className="flex items-center gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("csv")}
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("xlsx")}
          >
            <Download className="h-4 w-4" /> XLSX
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No wards match your filters.{" "}
                  {hasFilters && (
                    <button
                      onClick={resetFilters}
                      className="ml-1 text-primary underline"
                    >
                      Clear filters
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/wards/${row.original.new_no}`)
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">
            {table.getFilteredRowModel().rows.length}
          </span>{" "}
          ward{table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
          {hasFilters && (
            <span className="ml-1 text-xs">
              (filtered from {data.length})
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortBtn({
  column,
  label,
}: {
  column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  label: string;
}) {
  return (
    <button
      className="flex items-center gap-1 font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );
}
