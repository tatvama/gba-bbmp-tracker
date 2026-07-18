"use client";

import * as React from "react";
import { LayoutGrid, Table as TableIcon, Download, AlertTriangle, X } from "lucide-react";
import type { ContactWithRelations } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContactCard } from "@/components/contacts/contact-card";
import { VerificationBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { VERIFICATION_STATUSES, DESIGNATIONS } from "@/lib/constants";
import { findDuplicates } from "@/lib/dedupe";
import { formatPhone } from "@/lib/phone";
import { exportRows } from "@/lib/export";

export function ContactDirectory({
  contacts,
  initialStatus,
}: {
  contacts: ContactWithRelations[];
  initialStatus?: string;
}) {
  const [view, setView] = React.useState<"cards" | "table">("cards");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(initialStatus ?? "all");
  const [designation, setDesignation] = React.useState("all");
  const [corp, setCorp] = React.useState("all");
  const [missingOnly, setMissingOnly] = React.useState(false);

  const corps = React.useMemo(
    () =>
      Array.from(
        new Map(
          contacts
            .filter((c) => c.corporation)
            .map((c) => [c.corporation!.code, c.corporation!.name]),
        ),
      ),
    [contacts],
  );

  const dupeIds = React.useMemo(() => {
    const set = new Set<string>();
    const keyed = contacts.map((c) => ({
      id: c.id,
      fullName: c.full_name,
      phone: c.phone,
      whatsapp: c.whatsapp,
      email: c.email,
    }));
    for (const m of findDuplicates(keyed)) {
      if (m.a.id) set.add(m.a.id);
      if (m.b.id) set.add(m.b.id);
    }
    return set;
  }, [contacts]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (status !== "all" && c.verification_status !== status) return false;
      if (designation !== "all" && c.designation !== designation) return false;
      if (corp !== "all" && c.corporation?.code !== corp) return false;
      if (missingOnly && c.phone && c.email && c.office_address) return false;
      if (!needle) return true;
      const hay = [
        c.full_name,
        c.official_title,
        c.designation,
        c.phone,
        c.email,
        c.office_name,
        c.zone,
        c.division?.name,
        c.eng_subdivision?.name,
        c.corporation?.name,
        // ward numbers + names so an officer is findable by any ward they cover
        ...(c.jurisdictions ?? []).flatMap((j) => [j.ward_no != null ? String(j.ward_no) : null, j.ward_name, j.zone]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [contacts, q, status, designation, corp, missingOnly]);

  const hasFilters =
    q !== "" ||
    status !== "all" ||
    designation !== "all" ||
    corp !== "all" ||
    missingOnly;

  function resetFilters() {
    setQ("");
    setStatus("all");
    setDesignation("all");
    setCorp("all");
    setMissingOnly(false);
  }

  const filterPills = React.useMemo(() => {
    const pills = [];
    if (status !== "all") {
      pills.push({ label: `Status: ${status.replace(/_/g, " ")}`, onRemove: () => setStatus("all") });
    }
    if (designation !== "all") {
      pills.push({ label: `Designation: ${designation}`, onRemove: () => setDesignation("all") });
    }
    if (corp !== "all") {
      const corpName = corps.find(([code]) => code === corp)?.[1] ?? corp;
      pills.push({ label: `Corp: ${corpName}`, onRemove: () => setCorp("all") });
    }
    if (missingOnly) {
      pills.push({ label: "Missing Details", onRemove: () => setMissingOnly(false) });
    }
    return pills;
  }, [status, designation, corp, missingOnly, corps]);

  function doExport(format: "csv" | "xlsx") {
    exportRows(
      filtered.map((c) => ({
        full_name: c.full_name,
        designation: c.designation,
        phone: c.phone ?? "",
        whatsapp: c.whatsapp ?? "",
        email: c.email ?? "",
        eng_subdivision: c.eng_subdivision?.name ?? "",
        division: c.division?.name ?? "",
        corporation: c.corporation?.name ?? "",
        office_address: c.office_address ?? "",
        verification_status: c.verification_status,
        confidence_score: c.confidence_score,
        source: c.source ?? "",
      })),
      "engineer-directory",
      format,
    );
  }

  return (
    <div className="space-y-6">
      {/* Integrated Action Toolbar */}
      <FilterToolbar
        searchPlaceholder="Search by name, designation, sub-division, email..."
        searchValue={q}
        onSearchChange={setQ}
        actions={
          <>
            {/* Export dropdown */}
            <div className="flex items-center border border-border/60 rounded-lg overflow-hidden bg-background">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => doExport("csv")}
                className="h-8 rounded-none border-r border-border/60 px-3 font-semibold text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => doExport("xlsx")}
                className="h-8 rounded-none px-3 font-semibold text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5 mr-1" /> XLSX
              </Button>
            </div>

            {/* View layout toggler */}
            <div className="flex items-center border border-border/60 rounded-lg p-0.5 bg-muted/30">
              <Button
                variant={view === "cards" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setView("cards")}
                className="h-7 w-7 rounded-md"
                aria-label="Card grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-foreground/80" />
              </Button>
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setView("table")}
                className="h-7 w-7 rounded-md"
                aria-label="Table directory view"
              >
                <TableIcon className="h-3.5 w-3.5 text-foreground/80" />
              </Button>
            </div>
          </>
        }
        advancedFilters={
          <div className="flex flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:items-center w-full">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Status Selector */}
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-full sm:w-40 text-xs font-semibold">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {VERIFICATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Designation Selector */}
              <Select value={designation} onValueChange={setDesignation}>
                <SelectTrigger className="h-8 w-full sm:w-48 text-xs font-semibold">
                  <SelectValue placeholder="All Designations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Designations</SelectItem>
                  {DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Corporation Selector */}
              {corps.length > 0 && (
                <Select value={corp} onValueChange={setCorp}>
                  <SelectTrigger className="h-8 w-full sm:w-44 text-xs font-semibold">
                    <SelectValue placeholder="All Corporations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Corporations</SelectItem>
                    {corps.map(([code, name]) => (
                      <SelectItem key={code} value={code}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Duplicates / Missing Switch */}
            <div className="flex items-center gap-2 sm:ml-auto">
              <Checkbox
                id="missing"
                checked={missingOnly}
                onCheckedChange={(v) => setMissingOnly(!!v)}
                className="h-4 w-4 border-border/80"
              />
              <Label htmlFor="missing" className="cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground">
                Missing Details Only
              </Label>
            </div>
          </div>
        }
        filterPills={filterPills}
        onClearAll={resetFilters}
      />

      {/* Meta row */}
      <div className="mb-3 flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{filtered.length}</span>{" "}
          contact{filtered.length === 1 ? "" : "s"}
          {hasFilters && contacts.length !== filtered.length && (
            <span className="ml-1 text-xs">
              (filtered from {contacts.length})
            </span>
          )}
        </span>
        {dupeIds.size > 0 && (
          <Badge
            variant="outline"
            className="border-destructive/50 bg-destructive/5 text-destructive"
          >
            <AlertTriangle className="mr-1 h-3 w-3" />
            {dupeIds.size} possible duplicate
            {dupeIds.size === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No contacts match"
          description="Adjust your filters or import the latest directory."
        />
      ) : view === "cards" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={
                dupeIds.has(c.id)
                  ? "rounded-xl ring-2 ring-destructive/40"
                  : ""
              }
            >
              <ContactCard contact={c} href={`/contacts/${c.id}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-xs">
          <Table className="data-table">
            <TableHeader>
              <TableRow className="bg-muted/15 border-b border-border/40 hover:bg-muted/15">
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Sub-division</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className={
                    dupeIds.has(c.id) ? "bg-destructive/[0.03] hover:bg-destructive/[0.05]" : undefined
                  }
                >
                  <TableCell>
                    <a
                      href={`/contacts/${c.id}`}
                      className="font-bold text-foreground/95 hover:text-primary transition-colors"
                    >
                      {c.full_name}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground/95">
                    {c.designation}
                  </TableCell>
                  <TableCell className="text-muted-foreground/85">
                    {c.eng_subdivision?.name ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-foreground/80">
                    {c.phone ? formatPhone(c.phone) : "—"}
                  </TableCell>
                  <TableCell>
                    <VerificationBadge status={c.verification_status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
