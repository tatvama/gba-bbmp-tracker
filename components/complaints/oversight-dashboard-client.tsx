"use client";

import * as React from "react";
import Link from "next/link";
import {
  IndianRupee, ShieldAlert, Copy, Clock, Users, Building2, ChevronDown, ChevronUp,
  ArrowRight, AlertTriangle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inr = (n: number) => (n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "₹0");

const BAND_LABEL: Record<string, string> = {
  bill_stop: "Bill-stop",
  serious: "Serious",
  procedural: "Procedural",
  low: "Low",
  unbanded: "Unbanded",
};

interface OversightStats {
  totalExposure: number;
  jobsAudited: number;
  redFlags: number;
  bands: Record<string, number>;
}

interface OverdueCounts {
  complaintsOverdue: number;
  rtiDue: number;
}

interface ContractorItem {
  contractor: string;
  jobCount: number;
  divisions: string[];
  totalExposure: number;
  redFlags: number;
  highRiskJobs: number;
  blacklistCandidate: boolean;
}

interface DivisionItem {
  division: string;
  jobCount: number;
  contractors: number;
  totalExposure: number;
  highRiskJobs: number;
}

export function OversightDashboardClient({
  stats,
  overdue,
  contractors,
  divisions,
  dupClustersCount,
  sameDivDup,
}: {
  stats: OversightStats;
  overdue: OverdueCounts;
  contractors: ContractorItem[];
  divisions: DivisionItem[];
  dupClustersCount: number;
  sameDivDup: number;
}) {
  const [descExpanded, setDescExpanded] = React.useState(false);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* MOBILE PAGE HEADER */}
      <div className="block md:hidden space-y-1.5 bg-slate-50/50 dark:bg-slate-900/30 p-3.5 rounded-xl border dark:border-slate-850">
        <h1 className="text-xl font-bold tracking-tight text-slate-850 dark:text-slate-105">
          Forensic oversight dashboard
        </h1>
        <div className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed">
          {descExpanded ? (
            <p>
              Platform-wide accountability view. All exposure figures are possible amounts requiring verification; risk bands and patterns are documented suspicions for enquiry, not findings of guilt.
            </p>
          ) : (
            <p className="line-clamp-2">
              Platform-wide accountability view. All exposure figures are possible amounts requiring verification...
            </p>
          )}
          <button
            type="button"
            onClick={() => setDescExpanded(!descExpanded)}
            className="text-blue-600 hover:text-blue-700 font-bold mt-1 inline-flex items-center gap-0.5 cursor-pointer text-[11px]"
          >
            {descExpanded ? "Show Less" : "Read More"}
            {descExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* MOBILE KPI GRID - 2 columns, height reduced by another 15-20% (h-15) */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <Card className="h-[68px] shadow-2xs hover:border-slate-350 transition-all duration-200">
          <CardContent className="p-2.5 flex flex-col justify-center h-full">
            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
              {inr(stats.totalExposure)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450 mt-1 flex items-center gap-1 leading-none">
              <IndianRupee className="h-3 w-3 shrink-0 text-slate-400" /> Exposure
            </span>
          </CardContent>
        </Card>

        <Card className="h-[68px] shadow-2xs hover:border-slate-350 transition-all duration-200">
          <CardContent className="p-2.5 flex flex-col justify-center h-full">
            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
              {stats.jobsAudited}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450 mt-1 flex items-center gap-1 leading-none">
              <ShieldAlert className="h-3 w-3 shrink-0 text-slate-400" /> Audited
            </span>
          </CardContent>
        </Card>

        <Link href="/complaints/duplicate-photos" className="block">
          <Card className="h-[68px] shadow-2xs hover:border-slate-350 transition-all duration-200 cursor-pointer border border-transparent hover:border-slate-200">
            <CardContent className="p-2.5 flex flex-col justify-center h-full">
              <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
                {dupClustersCount}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450 mt-1 flex items-center gap-1 leading-none">
                <Copy className="h-3 w-3 shrink-0 text-slate-400" /> Duplicates
              </span>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-[68px] shadow-2xs hover:border-slate-350 transition-all duration-200">
          <CardContent className="p-2.5 flex flex-col justify-center h-full">
            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
              {overdue.complaintsOverdue} · {overdue.rtiDue}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450 mt-1 flex items-center gap-1 leading-none">
              <Clock className="h-3 w-3 shrink-0 text-slate-400" /> Overdue
            </span>
          </CardContent>
        </Card>
      </div>

      {/* DESKTOP KPI GRID (Unchanged) */}
      <div className="hidden md:grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="h-full">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <IndianRupee className="h-3.5 w-3.5" /> Tracked possible exposure
            </div>
            <div className="text-2xl font-bold">{inr(stats.totalExposure)}</div>
          </CardContent>
        </Card>
        
        <Card className="h-full">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" /> Jobs audited
            </div>
            <div className="text-2xl font-bold">{stats.jobsAudited}</div>
          </CardContent>
        </Card>

        <Link href="/complaints/duplicate-photos">
          <Card className="h-full cursor-pointer hover:border-slate-300 transition-colors">
            <CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Copy className="h-3.5 w-3.5" /> Duplicate-photo clusters
              </div>
              <div className="text-2xl font-bold">
                {dupClustersCount}{sameDivDup ? ` (${sameDivDup} same-div)` : ""}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Overdue (complaints · RTI)
            </div>
            <div className="text-2xl font-bold">{overdue.complaintsOverdue} · {overdue.rtiDue}</div>
          </CardContent>
        </Card>
      </div>

      {/* JOBS BY RISK BAND - Proportional Progress Indicator */}
      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="mb-3 text-xs md:text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
          Jobs by risk band
        </h2>
        {stats.jobsAudited === 0 ? (
          <p className="text-xs text-slate-500 py-2">No audited jobs yet.</p>
        ) : (
          <div className="space-y-3">
            {/* Mobile compact progress bar stack */}
            <div className="block md:hidden space-y-3">
              {Object.entries(stats.bands).map(([band, n]) => {
                const maxJobs = stats.jobsAudited || 1;
                const percent = Math.min(100, Math.round((n / maxJobs) * 100));
                const isHighRisk = band === "bill_stop" || band === "serious";
                return (
                  <div key={band} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-850 dark:text-slate-300 flex items-center gap-1.5">
                        {isHighRisk && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                        {BAND_LABEL[band] ?? band}
                      </span>
                      <span className="text-slate-500">{n} {n === 1 ? "Job" : "Jobs"} ({percent}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          band === "bill_stop" || band === "serious" ? "bg-red-500" : band === "procedural" ? "bg-amber-500" : "bg-slate-400"
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop badges (Unchanged) */}
            <div className="hidden md:flex flex-wrap gap-2">
              {Object.entries(stats.bands).map(([band, n]) => (
                <Badge
                  key={band}
                  variant={band === "bill_stop" || band === "serious" ? "destructive" : band === "procedural" ? "warning" : "muted"}
                  className="text-[11px] font-bold"
                >
                  {BAND_LABEL[band] ?? band}: {n}
                </Badge>
              ))}
              <Badge variant="muted" className="text-[11px] font-bold">Red flags: {stats.redFlags}</Badge>
            </div>
          </div>
        )}
      </section>

      {/* LEADERBOARDS: Responsive vertical stacks on mobile, 2 cols on desktop */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* CONTRACTORS LEADERBOARD */}
        <section className="rounded-xl border bg-card p-4 shadow-xs">
          <h2 className="mb-3 flex items-center gap-2 text-xs md:text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
            <Users className="h-4 w-4 text-slate-400" /> Top contractors by exposure
          </h2>

          {/* Desktop view list (Unchanged) */}
          <ol className="hidden md:block space-y-1.5 text-sm">
            {contractors.slice(0, 6).map((c) => (
              <li key={c.contractor} className="flex items-center justify-between gap-2">
                <Link href={`/complaints/contractors/${encodeURIComponent(c.contractor)}`} className="min-w-0 truncate underline">{c.contractor}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">{c.jobCount} jobs · {inr(c.totalExposure)}{c.blacklistCandidate ? " ⚑" : ""}</span>
              </li>
            ))}
            {contractors.length === 0 && <li className="text-muted-foreground">No data yet.</li>}
          </ol>

          {/* Mobile view list cards with avatars and tap areas */}
          <div className="block md:hidden space-y-2">
            {contractors.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No contractor exposure detected.</p>
            ) : (
              contractors.slice(0, 6).map((c) => (
                <Link
                  key={c.contractor}
                  href={`/complaints/contractors/${encodeURIComponent(c.contractor)}`}
                  className="block w-full"
                >
                  <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 rounded-xl hover:border-blue-200 dark:hover:border-blue-800 transition-colors cursor-pointer group active:bg-slate-50/50 dark:active:bg-slate-850">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Users className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-850 dark:text-slate-250 text-sm block break-words line-clamp-2 leading-snug group-hover:text-blue-650">
                          {c.contractor}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                          <span className="font-bold text-slate-600 dark:text-slate-355 whitespace-nowrap">{inr(c.totalExposure)} Exposure</span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="whitespace-nowrap">{c.jobCount} {c.jobCount === 1 ? "Job" : "Jobs"}</span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="whitespace-nowrap">{c.divisions.length} {c.divisions.length === 1 ? "Div" : "Divs"}</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0 self-center ml-2" />
                  </div>
                </Link>
              ))
            )}
          </div>

          {contractors.length > 0 && (
            <Link href="/complaints/contractors" className="mt-3 inline-flex items-center gap-1 text-xs underline font-bold text-blue-600 hover:text-blue-700">
              All contractors →
            </Link>
          )}
        </section>

        {/* DIVISIONS LEADERBOARD */}
        <section className="rounded-xl border bg-card p-4 shadow-xs">
          <h2 className="mb-3 flex items-center gap-2 text-xs md:text-sm font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">
            <Building2 className="h-4 w-4 text-slate-400" /> Top divisions by exposure
          </h2>

          {/* Desktop list view (Unchanged) */}
          <ol className="hidden md:block space-y-1.5 text-sm">
            {divisions.slice(0, 6).map((d) => (
              <li key={d.division} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{d.division}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{d.jobCount} jobs · {inr(d.totalExposure)}</span>
              </li>
            ))}
            {divisions.length === 0 && <li className="text-muted-foreground">No data yet.</li>}
          </ol>

          {/* Mobile list view cards using same visual pattern */}
          <div className="block md:hidden space-y-2">
            {divisions.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No division risks detected.</p>
            ) : (
              divisions.slice(0, 6).map((d) => (
                <div key={d.division} className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 rounded-xl hover:border-blue-200 transition-colors group">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-850 dark:text-slate-250 text-sm block break-words line-clamp-2 leading-snug">
                        {d.division}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                        <span className="font-bold text-slate-600 dark:text-slate-355 whitespace-nowrap">{inr(d.totalExposure)} Exposure</span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="whitespace-nowrap">{d.jobCount} {d.jobCount === 1 ? "Job" : "Jobs"}</span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="whitespace-nowrap">{d.contractors} {d.contractors === 1 ? "Contr" : "Contrs"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 self-center ml-2">
                    {d.highRiskJobs > 0 && (
                      <Badge variant="warning" className="text-[10px] font-bold py-0.5 whitespace-nowrap scale-95 origin-right">
                        {d.highRiskJobs} High Risk
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

