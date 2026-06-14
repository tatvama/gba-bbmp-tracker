"use client";

import * as React from "react";
import { ChevronDown, Network, Wrench, MapPin, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GbaDivision } from "@/lib/queries";

export function GbaStructure({ divisions }: { divisions: GbaDivision[] }) {
  // Expand the first division by default; the rest collapsed.
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    divisions.length ? { [divisions[0]!.name]: true } : {},
  );
  const [q, setQ] = React.useState("");

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? divisions
        .map((d) => ({
          ...d,
          subdivisions: d.subdivisions
            .map((s) => ({
              ...s,
              wards: s.wards.filter(
                (w) =>
                  w.ward_name_en.toLowerCase().includes(needle) ||
                  String(w.ward_no).includes(needle) ||
                  s.name.toLowerCase().includes(needle) ||
                  d.name.toLowerCase().includes(needle),
              ),
            }))
            .filter((s) => s.wards.length > 0),
        }))
        .filter((d) => d.subdivisions.length > 0)
    : divisions;

  const allOpen = needle.length > 0; // auto-expand all when searching

  if (divisions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        GBA ward breakdown not loaded for this corporation.
      </p>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter wards, sub-divisions…"
        className="mb-3 h-9 w-full max-w-xs rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary/40"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No wards match &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const isOpen = allOpen || !!open[d.name];
            return (
              <div key={d.name} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <button
                  onClick={() =>
                    setOpen((o) => ({ ...o, [d.name]: !o[d.name] }))
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={isOpen}
                >
                  <div className="rounded-md bg-primary/8 p-1.5">
                    <Network className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{d.name}</p>
                    {d.assembly_constituency && (
                      <p className="truncate text-xs text-muted-foreground">
                        AC: {d.assembly_constituency}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {d.subdivisions.length} sub-div · {d.wardCount} wards
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="divide-y border-t">
                    {d.subdivisions.map((s) => (
                      <div key={s.name} className="px-4 py-3">
                        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground/80">
                          <Wrench className="h-3.5 w-3.5 text-teal" />
                          {s.name}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({s.wards.length})
                          </span>
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                          {s.wards.map((w) => (
                            <li
                              key={w.ward_no}
                              className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
                              title={w.ward_name_kn ?? undefined}
                            >
                              <span className="grid h-4 min-w-4 place-items-center rounded bg-primary/10 px-1 text-[10px] font-bold tabular-nums text-primary">
                                {w.ward_no}
                              </span>
                              <span className="text-foreground/85">{w.ward_name_en}</span>
                              {!w.legible && (
                                <span
                                  title="Romanisation uncertain — scanned source was only partly legible. Hover for the Kannada original."
                                  className="text-amber-dark"
                                >
                                  <Info className="h-3 w-3" />
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
        Romanised from the GBA memo (06-03-2026) Annexures 1-5, scanned Kannada source.
        Names marked <Info className="mx-0.5 inline h-3 w-3 text-amber-dark" /> were only
        partly legible — hover any ward for the Kannada original.
      </p>
    </div>
  );
}
