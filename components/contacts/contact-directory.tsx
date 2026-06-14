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
        c.designation,
        c.phone,
        c.email,
        c.division?.name,
        c.eng_subdivision?.name,
        c.corporation?.name,
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
    <div>
      {/* Filter toolbar */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <Input
          placeholder="Search name, phone, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="lg:max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="lg:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {VERIFICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={designation} onValueChange={setDesignation}>
          <SelectTrigger className="lg:w-52">
            <SelectValue placeholder="All designations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All designations</SelectItem>
            {DESIGNATIONS.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {corps.length > 0 && (
          <Select value={corp} onValueChange={setCorp}>
            <SelectTrigger className="lg:w-48">
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
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id="missing"
            checked={missingOnly}
            onCheckedChange={(v) => setMissingOnly(!!v)}
          />
          <Label htmlFor="missing" className="cursor-pointer text-sm">
            Missing details only
          </Label>
        </div>

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

        <div className="flex items-center gap-2 lg:ml-auto">
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => setView(view === "cards" ? "table" : "cards")}
            aria-label="Toggle view"
          >
            {view === "cards" ? (
              <TableIcon className="h-4 w-4" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

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
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table className="data-table">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Designation
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sub-division
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Phone
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.id}
                  className={
                    dupeIds.has(c.id) ? "bg-destructive/5" : undefined
                  }
                >
                  <TableCell>
                    <a
                      href={`/contacts/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.full_name}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-foreground/80">
                    {c.designation}
                  </TableCell>
                  <TableCell className="text-sm text-foreground/70">
                    {c.eng_subdivision?.name ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
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
