"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { ROAD_WORK_180 } from "@/lib/ai/road-work-questions";
import type { RoadWorkQuestion, Severity180 } from "@/lib/ai/road-work-knowledge";

const SEV_STYLE: Record<Severity180, string> = {
  RED: "bg-destructive/10 text-destructive border-destructive/30",
  ORANGE: "bg-amber/15 text-amber-dark border-amber/40",
  AMBER: "bg-muted text-muted-foreground border-border",
};

function isQ(q: { en: string; kn: string } | RoadWorkQuestion): q is RoadWorkQuestion {
  return "code" in q;
}

/** Review step: 17 collapsible sections; tick/untick each of the 180 suspicions. */
export function SuspicionReview({
  selected,
  notes,
  reasons,
  onToggle,
  onNote,
}: {
  selected: Record<string, boolean>;
  notes: Record<string, string>;
  reasons: Record<string, string>;
  onToggle: (code: string) => void;
  onNote: (code: string, text: string) => void;
}) {
  return (
    <div className="space-y-2">
      {ROAD_WORK_180.map((section) => {
        const questions = section.questions.filter(isQ);
        const picked = questions.filter((q) => selected[q.code]).length;
        return (
          <details key={section.id} open={picked > 0} className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                {section.id} · {section.titleEn}
                <span className="font-normal text-muted-foreground">({section.titleKn})</span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {picked}/{questions.length} selected
              </span>
            </summary>
            <div className="border-t px-3 py-2">
              <p className="mb-2 text-xs italic text-muted-foreground">Basis: {section.legalBasis}</p>
              <ul className="space-y-2">
                {questions.map((q) => {
                  const on = !!selected[q.code];
                  return (
                    <li key={q.code} className={`rounded-md border p-2 ${on ? "border-primary/40 bg-primary/5" : "border-transparent"}`}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" checked={on} onChange={() => onToggle(q.code)} className="mt-1 h-4 w-4 shrink-0 rounded border-input" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SEV_STYLE[q.severity]}`}>{q.severity}</span>
                            <span className="text-xs font-medium text-muted-foreground">{q.code}</span>
                          </span>
                          <span className="mt-0.5 block text-sm">{q.en}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{q.kn}</span>
                          {reasons[q.code] && (
                            <span className="mt-1 block text-[11px] text-teal">↳ {reasons[q.code]}</span>
                          )}
                        </span>
                      </label>
                      {on && (
                        <input
                          value={notes[q.code] ?? ""}
                          onChange={(e) => onNote(q.code, e.target.value)}
                          placeholder="Observation / what you found (optional)…"
                          className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        );
      })}
    </div>
  );
}
