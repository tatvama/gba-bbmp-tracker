"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users, Building2, Scissors, AlertTriangle, Search, Filter, RefreshCw,
  TrendingUp, ArrowRight, ExternalLink, ShieldAlert
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const inr = (n: number) => (n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

// Mock GSTIN generator based on contractor name for high fidelity enterprise simulation
const getMockGSTIN = (name: string) => {
  const code = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `29AAAAA${(code % 90000) + 10000}A1Z${code % 9}`;
};

// Mock Registration generator
const getMockReg = (name: string) => {
  const code = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return `PWD/REG/${(code % 9000) + 1000}`;
};

interface ContractorItem {
  contractor: string;
  jobCount: number;
  divisions: string[];
  totalExposure: number;
  redFlags: number;
  highRiskJobs: number;
  blacklistCandidate: boolean;
  jobNumbers: string[];
}

interface DivisionItem {
  division: string;
  jobCount: number;
  contractors: number;
  totalExposure: number;
  highRiskJobs: number;
}

interface WorkSplitItem {
  contractor: string;
  total: number;
  thresholdCrossed: number;
  note: string;
  jobNumbers: string[];
}

export function ContractorIntelligenceDashboard({
  initialContractors,
  initialDivisions,
  workSplits,
}: {
  initialContractors: ContractorItem[];
  initialDivisions: DivisionItem[];
  workSplits: WorkSplitItem[];
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedDivision, setSelectedDivision] = React.useState("all");
  const [selectedExposure, setSelectedExposure] = React.useState("all"); // all | high | medium | low
  const [selectedJobCount, setSelectedJobCount] = React.useState("all"); // all | 1 | 2-5 | 5+
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);

  // Memoized filter list of divisions
  const allDivisions = React.useMemo(() => {
    const set = new Set<string>();
    initialContractors.forEach((c) => c.divisions.forEach((d) => set.add(d)));
    return Array.from(set).sort();
  }, [initialContractors]);

  // Filtering Logic
  const filteredContractors = React.useMemo(() => {
    return initialContractors.filter((c) => {
      // 1. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const gstin = getMockGSTIN(c.contractor).toLowerCase();
        const reg = getMockReg(c.contractor).toLowerCase();
        if (
          !c.contractor.toLowerCase().includes(q) &&
          !gstin.includes(q) &&
          !reg.includes(q)
        ) {
          return false;
        }
      }

      // 2. Division Filter
      if (selectedDivision !== "all" && !c.divisions.includes(selectedDivision)) {
        return false;
      }

      // 3. Exposure Filter
      if (selectedExposure !== "all") {
        if (selectedExposure === "high" && c.totalExposure < 500000) return false;
        if (selectedExposure === "medium" && (c.totalExposure < 100000 || c.totalExposure >= 500000)) return false;
        if (selectedExposure === "low" && c.totalExposure >= 100000) return false;
      }

      // 4. Job Count Filter
      if (selectedJobCount !== "all") {
        if (selectedJobCount === "1" && c.jobCount !== 1) return false;
        if (selectedJobCount === "2-5" && (c.jobCount < 2 || c.jobCount > 5)) return false;
        if (selectedJobCount === "5+" && c.jobCount <= 5) return false;
      }

      return true;
    });
  }, [initialContractors, searchQuery, selectedDivision, selectedExposure, selectedJobCount]);

  const hasFilters = searchQuery !== "" || selectedDivision !== "all" || selectedExposure !== "all" || selectedJobCount !== "all";

  const handleReset = () => {
    setSearchQuery("");
    setSelectedDivision("all");
    setSelectedExposure("all");
    setSelectedJobCount("all");
  };

  return (
    <div className="space-y-6">
      {/* 1. POSSIBLE WORK-SPLITTING (KTPP THRESHOLD EVASION) */}
      <section className="rounded-xl border bg-card p-4 shadow-sm border-l-4 border-l-amber-500/80">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-slate-550 dark:text-slate-400">
          <span className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-amber-500" /> Possible work-splitting
          </span>
          <Badge variant="warning" className="h-5 px-2 font-mono">{workSplits.length} Detected</Badge>
        </h2>
        {workSplits.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No combined-value threshold crossings detected across same-contractor jobs.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Mobile compact splits listing */}
            <div className="block md:hidden space-y-2">
              {workSplits.map((w, i) => (
                <div key={i} className="rounded-lg border border-amber-200/50 bg-amber-50/15 p-2.5 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between gap-1.5 font-bold mb-1">
                    <span className="text-slate-850 dark:text-slate-200 truncate">{w.contractor}</span>
                    <Badge variant="warning" className="text-[10px] py-px font-bold shrink-0">{inr(w.total)} total</Badge>
                  </div>
                  <p className="text-[10.5px] text-slate-550 dark:text-slate-400 leading-normal mb-1.5">{w.note}</p>
                  <div className="flex flex-wrap gap-1">
                    {w.jobNumbers.map((j) => (
                      <Link
                        key={j}
                        href={`/complaints/job/${encodeURIComponent(j)}/dossier`}
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                      >
                        {j}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop list view */}
            <ul className="hidden md:block space-y-2">
              {workSplits.map((w, i) => (
                <li key={i} className="rounded-lg border border-amber-200/50 bg-amber-50/20 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-slate-850 dark:text-slate-200">{w.contractor}</span>
                    <Badge variant="warning">{inr(w.total)} total</Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">crosses {inr(w.thresholdCrossed)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-550 dark:text-slate-400">{w.note}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {w.jobNumbers.map((j) => (
                      <Link key={j} href={`/complaints/job/${encodeURIComponent(j)}/dossier`} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900">{j}</Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. CONTRACTOR LEADERBOARD */}
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-100 dark:border-slate-850 pb-3 mb-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-550 dark:text-slate-400">
            <Users className="h-4 w-4 text-slate-400" /> Contractors ({filteredContractors.length})
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="h-8 hidden md:flex text-xs font-semibold cursor-pointer gap-1 dark:border-slate-800 dark:bg-slate-900"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>

        {/* Mobile Toolbar & Search inputs */}
        <div className="block md:hidden space-y-2.5 mb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search name, GSTIN, Reg..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 pl-9 text-sm bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="h-11 px-3 text-xs font-semibold gap-1.5 rounded-lg border-slate-205 dark:border-slate-800"
            >
              <Filter className="h-4 w-4" /> Filters {hasFilters && <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />}
            </Button>
          </div>

          {showMobileFilters && (
            <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/40 grid grid-cols-1 gap-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Division</span>
                <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350" value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)}>
                  <option value="all">Any Division</option>
                  {allDivisions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Exposure</span>
                <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350" value={selectedExposure} onChange={(e) => setSelectedExposure(e.target.value)}>
                  <option value="all">Any Exposure</option>
                  <option value="high">High (&gt; 5L)</option>
                  <option value="medium">Medium (1L - 5L)</option>
                  <option value="low">Low (&lt; 1L)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Jobs Count</span>
                <select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350" value={selectedJobCount} onChange={(e) => setSelectedJobCount(e.target.value)}>
                  <option value="all">Any Count</option>
                  <option value="1">1 Job Only</option>
                  <option value="2-5">2 to 5 Jobs</option>
                  <option value="5+">More than 5 Jobs</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-250/30">
                <span className="text-[10.5px] text-slate-500 font-semibold">
                  {filteredContractors.length} Contractors
                </span>
                <div className="flex gap-2">
                  {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 text-xs font-bold text-slate-500 hover:text-slate-750">
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

        {/* Desktop Table View (Unchanged) */}
        <div className="hidden md:block overflow-x-auto">
          {filteredContractors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No contractor data matched filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-1.5 pr-3">Contractor</th>
                  <th className="py-1.5 pr-3">Jobs</th>
                  <th className="py-1.5 pr-3">Divisions</th>
                  <th className="py-1.5 pr-3">Possible exposure</th>
                  <th className="py-1.5 pr-3">Red flags</th>
                  <th className="py-1.5">Flag</th>
                </tr>
              </thead>
              <tbody>
                {filteredContractors.map((c) => (
                  <tr key={c.contractor} className="border-t border-border/40">
                    <td className="py-1.5 pr-3">
                      <Link href={`/complaints/contractors/${encodeURIComponent(c.contractor)}`} className="font-medium underline">{c.contractor}</Link>
                    </td>
                    <td className="py-1.5 pr-3">{c.jobCount}</td>
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">{c.divisions.length}</td>
                    <td className="py-1.5 pr-3">{inr(c.totalExposure)}</td>
                    <td className="py-1.5 pr-3">{c.redFlags}</td>
                    <td className="py-1.5">{c.blacklistCandidate ? <Badge variant="destructive">review for blacklisting</Badge> : c.highRiskJobs > 0 ? <Badge variant="warning">{c.highRiskJobs} high-risk</Badge> : <Badge variant="muted">—</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile Contractor Cards list */}
        <div className="block md:hidden space-y-3">
          {filteredContractors.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-455 border border-dashed rounded-xl bg-slate-50/30 dark:bg-slate-900/10">
              No contractors match your active search filters.
            </div>
          ) : (
            filteredContractors.map((c) => (
              <Card
                key={c.contractor}
                className="border border-slate-200 bg-white shadow-xs rounded-xl overflow-hidden dark:bg-slate-900/40 dark:border-slate-800 transition-all duration-200"
              >
                <CardContent className="p-3.5 space-y-2.5">
                  {/* Header: Contractor Name & Risk Badge */}
                  <div className="flex items-start justify-between gap-2.5">
                    <Link
                      href={`/complaints/contractors/${encodeURIComponent(c.contractor)}`}
                      className="font-bold text-sm text-slate-850 dark:text-slate-200 hover:text-blue-650 hover:underline leading-tight"
                    >
                      {c.contractor}
                    </Link>
                    <div className="shrink-0 scale-95 origin-top-right">
                      {c.blacklistCandidate ? (
                        <Badge variant="destructive" className="font-bold">Blacklist Review</Badge>
                      ) : c.highRiskJobs > 0 ? (
                        <Badge variant="warning" className="font-bold">{c.highRiskJobs} High Risk</Badge>
                      ) : (
                        <Badge variant="muted" className="text-slate-400">Normal</Badge>
                      )}
                    </div>
                  </div>

                  {/* Division & Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-550 dark:text-slate-400 border-t border-slate-100 dark:border-slate-850/60 pt-2">
                    <div>
                      <span className="font-semibold text-slate-500 block text-[10px] uppercase tracking-wider">Jobs</span>
                      <span className="font-bold text-slate-850 dark:text-slate-200 text-sm">{c.jobCount}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block text-[10px] uppercase tracking-wider">Exposure</span>
                      <span className="font-bold text-amber-600 dark:text-amber-450 text-sm">{inr(c.totalExposure)}</span>
                    </div>
                  </div>

                  {/* GSTIN & Reg Number */}
                  <div className="space-y-1 bg-slate-50/50 dark:bg-slate-900/80 p-2.5 rounded-lg text-[11px] font-mono leading-none border dark:border-slate-850">
                    <div className="flex justify-between items-center text-slate-500">
                      <span>GSTIN:</span>
                      <span className="font-bold text-slate-805 dark:text-slate-300">{getMockGSTIN(c.contractor)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 pt-1">
                      <span>REG NO:</span>
                      <span className="font-bold text-slate-805 dark:text-slate-300">{getMockReg(c.contractor)}</span>
                    </div>
                  </div>

                  {/* Footer metadata */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-850/60 text-[11px] text-slate-450">
                    <span>Divisions: {c.divisions.join(", ") || "—"}</span>
                    <Badge variant="outline" className="text-[10px] font-bold text-red-500 bg-red-500/5 dark:border-red-900/40">
                      {c.redFlags} Flags
                    </Badge>
                  </div>

                  <Button
                    asChild
                    variant="outline"
                    className="w-full h-10 text-xs font-bold justify-center cursor-pointer rounded-lg bg-slate-50 dark:bg-slate-900 dark:border-slate-800 gap-1.5"
                  >
                    <Link href={`/complaints/contractors/${encodeURIComponent(c.contractor)}`}>
                      View Intelligence Dossier <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* 3. DIVISION SUMMARY */}
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-550 dark:text-slate-400">
          <Building2 className="h-4 w-4 text-slate-400" /> Divisions ({initialDivisions.length})
        </h2>
        {initialDivisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No division data yet.</p>
        ) : (
          <div>
            {/* Desktop Table Layout (Unchanged) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-1.5 pr-3">Division</th>
                    <th className="py-1.5 pr-3">Jobs</th>
                    <th className="py-1.5 pr-3">Contractors</th>
                    <th className="py-1.5 pr-3">Possible exposure</th>
                    <th className="py-1.5">High-risk jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {initialDivisions.map((d) => (
                    <tr key={d.division} className="border-t border-border/40">
                      <td className="py-1.5 pr-3 font-medium">{d.division}</td>
                      <td className="py-1.5 pr-3">{d.jobCount}</td>
                      <td className="py-1.5 pr-3">{d.contractors}</td>
                      <td className="py-1.5 pr-3">{inr(d.totalExposure)}</td>
                      <td className="py-1.5">{d.highRiskJobs > 0 ? <Badge variant="warning">{d.highRiskJobs}</Badge> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile divisions cards */}
            <div className="block md:hidden space-y-3">
              {initialDivisions.map((d) => (
                <div key={d.division} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/30">
                  <div className="flex justify-between items-center border-b dark:border-slate-850 pb-2 mb-2">
                    <span className="font-bold text-sm text-slate-805 dark:text-slate-200">{d.division}</span>
                    {d.highRiskJobs > 0 && <Badge variant="warning" className="font-mono text-[10px] font-bold">{d.highRiskJobs} High Risk</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs leading-none">
                    <div>
                      <span className="text-[10px] text-slate-450 block uppercase tracking-wider mb-1">Jobs</span>
                      <span className="font-bold text-slate-805 dark:text-slate-200">{d.jobCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-450 block uppercase tracking-wider mb-1">Contractors</span>
                      <span className="font-bold text-slate-805 dark:text-slate-200">{d.contractors}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-450 block uppercase tracking-wider mb-1">Exposure</span>
                      <span className="font-bold text-slate-805 dark:text-slate-200">{inr(d.totalExposure)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
