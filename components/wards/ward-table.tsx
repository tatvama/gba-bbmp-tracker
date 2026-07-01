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
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp, MoreVertical } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { CorpPill, DerivedBadge, VerificationBadge } from "@/components/badges";
import { formatNumber } from "@/lib/format";
import { exportRows } from "@/lib/export";

const STORAGE_KEY = "ward-table-filters";

function WardCard({ w, router }: { w: WardWithRelations; router: any }) {
  const o = w.old_wards ?? [];
  return (
    <Card
      onClick={() => router.push(`/wards/${w.new_no}`)}
      className="border border-slate-200 bg-white shadow-2xs rounded-xl overflow-hidden hover:border-blue-200 dark:bg-slate-900/40 dark:border-slate-800 transition-all duration-205 group cursor-pointer active:bg-slate-50/50 dark:active:bg-slate-850"
    >
      <CardContent className="p-3.5 space-y-3">
        {/* Header: Ward Number & Status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border dark:border-slate-750 font-mono">
            Ward {w.new_no}
          </span>
          <VerificationBadge status={w.verification_status} />
        </div>

        {/* Ward Name */}
        <div>
          <h3 className="font-bold text-sm text-slate-850 dark:text-slate-200 truncate group-hover:text-blue-650">
            {w.new_name}
          </h3>
          {o.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 font-medium">
              <span>Old Wards: {o.join(", ")}</span>
            </div>
          )}
        </div>

        {/* Corporation details & Derived Badge */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-105 dark:border-slate-850/60 mt-1">
          {w.derived_corporation ? (
            <>
              <CorpPill code={w.derived_corporation.code} name={w.derived_corporation.name} derived />
              <DerivedBadge />
            </>
          ) : (
            <span className="text-[10px] italic text-slate-450">not resolved</span>
          )}
        </div>

        {/* Footer Action */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-105 dark:border-slate-850/60 text-[11px] text-slate-500">
          <span className="font-medium">Properties: {formatNumber(w.property_count)}</span>
          <span className="text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
            View Details →
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function WardTable({ data }: { data: WardWithRelations[] }) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "new_no", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [zone, setZone] = React.useState<string>("all");
  const [corp, setCorp] = React.useState<string>("all");
  const [ac, setAc] = React.useState<string>("all");
  const [verification, setVerification] = React.useState<string>("all");
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setGlobalFilter(s.globalFilter ?? "");
        setZone(s.zone ?? "all");
        setCorp(s.corp ?? "all");
        setAc(s.ac ?? "all");
        setVerification(s.verification ?? "all");
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ globalFilter, zone, corp, ac, verification }),
      );
    } catch {
      /* ignore */
    }
  }, [globalFilter, zone, corp, ac, verification]);

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
  const assemblyConstituencies = React.useMemo(
    () =>
      Array.from(new Set(data.map((w) => w.assembly_constituency).filter(Boolean))).sort() as string[],
    [data],
  );
  const verificationStatuses = React.useMemo(
    () =>
      Array.from(new Set(data.map((w) => w.verification_status).filter(Boolean))).sort() as string[],
    [data],
  );

  const filtered = React.useMemo(
    () =>
      data.filter(
        (w) =>
          (zone === "all" || w.zone === zone) &&
          (corp === "all" || w.derived_corporation?.code === corp) &&
          (ac === "all" || w.assembly_constituency === ac) &&
          (verification === "all" || w.verification_status === verification),
      ),
    [data, zone, corp, ac, verification],
  );

  const hasFilters =
    globalFilter !== "" || zone !== "all" || corp !== "all" || ac !== "all" || verification !== "all";

  function resetFilters() {
    setGlobalFilter("");
    setZone("all");
    setCorp("all");
    setAc("all");
    setVerification("all");
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
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            onClick={() => router.push(`/wards/${row.original.new_no}`)}
            className="h-7 px-4 text-xs font-bold rounded-lg bg-[#e27226] hover:bg-[#c95d18] text-white border-0 cursor-pointer transition-colors shadow-xs"
          >
            View
          </Button>
        ),
      },
    ],
    [router],
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
      {/* Mobile Filter & Toolbar Header */}
      <div className="flex flex-col gap-2 md:hidden mb-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search wards, AC, zone…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="flex-1 h-11 text-sm bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="h-11 px-3 text-xs font-semibold gap-1.5 rounded-lg border-slate-200 dark:border-slate-800"
          >
            Filters {hasFilters && <span className="h-2 w-2 rounded-full bg-blue-650 shrink-0" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-3 text-xs font-semibold gap-1.5 rounded-lg border-slate-205 dark:border-slate-800"
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
              <DropdownMenuItem onClick={() => doExport("csv")} className="cursor-pointer text-xs font-medium">CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("xlsx")} className="cursor-pointer text-xs font-medium">Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showMobileFilters && (
          <div className="p-3.5 border border-slate-205 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Zone</span>
              <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350" value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value="all">All Zones</option>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Corporation</span>
              <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350" value={corp} onChange={(e) => setCorp(e.target.value)}>
                <option value="all">All Corporations</option>
                {corps.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Assembly Constituency</span>
              <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350" value={ac} onChange={(e) => setAc(e.target.value)}>
                <option value="all">All constituencies</option>
                {assemblyConstituencies.map((val) => <option key={val} value={val}>{val}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Verification Status</span>
              <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350" value={verification} onChange={(e) => setVerification(e.target.value)}>
                <option value="all">All statuses</option>
                {verificationStatuses.map((val) => <option key={val} value={val}>{val}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-200 dark:border-slate-850">
              <span className="text-[10.5px] text-slate-500 font-semibold">
                {table.getFilteredRowModel().rows.length} Wards Match
              </span>
              <div className="flex gap-2">
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs font-bold text-slate-500 hover:text-slate-750">
                    Reset
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => setShowMobileFilters(false)} className="h-8 text-xs font-bold px-3">
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Filter Toolbar (Unchanged) */}
      <div className="hidden md:flex mb-3 flex-row flex-wrap items-center gap-2">
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

      {/* Desktop Table View (Unchanged) */}
      <div className="hidden md:block">
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
      </div>

      {/* Mobile Card Listing Grid */}
      <div className="block md:hidden space-y-3">
        {table.getRowModel().rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed rounded-xl bg-slate-50/20 dark:bg-slate-900/10">
            No wards match your active search filters.
          </div>
        ) : (
          table.getRowModel().rows.map((row) => (
            <WardCard key={row.original.new_no} w={row.original} router={router} />
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="mt-4 flex items-center justify-between text-xs md:text-sm text-slate-500">
        <span>
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {table.getFilteredRowModel().rows.length}
          </span>{" "}
          ward{table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
          {hasFilters && (
            <span className="ml-1 text-xs text-slate-400">
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
            className="h-9 w-9 rounded-lg"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-9 w-9 rounded-lg"
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
