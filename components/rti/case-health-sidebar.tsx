"use client";

import * as React from "react";
import { 
  Heart, 
  Workflow, 
  Clock, 
  AlertTriangle, 
  Cpu, 
  Eye, 
  FileCheck, 
  ArrowRight,
  ShieldAlert,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RtiDocument, RtiFirstAppeal, RtiSecondAppeal } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { activeDeadline, daysBetween, deadlineStatus } from "@/lib/rti-deadlines";
import type { DeadlineRules } from "@/lib/constants";

interface CaseHealthSidebarProps {
  rti: any;
  documents: RtiDocument[];
  firstAppeals: RtiFirstAppeal[];
  secondAppeals: RtiSecondAppeal[];
  rules: DeadlineRules;
  className?: string;
}

export function CaseHealthSidebar({
  rti,
  documents,
  firstAppeals,
  secondAppeals,
  rules,
  className,
}: CaseHealthSidebarProps) {
  const active = activeDeadline(rti, new Date(), rules);
  const days = active ? daysBetween(new Date(), active.due) : null;
  const isOverdue = days !== null && days < 0;

  // 1. Calculate Case Stage
  let stage = "Initial Application";
  let stageIndex = 0;
  if (rti.status === "Closed") {
    stage = "Case Closed";
    stageIndex = 3;
  } else if (secondAppeals.some((sa) => sa.status === "Filed" || sa.status === "Hearing Scheduled")) {
    stage = "Second Appeal Stage";
    stageIndex = 2;
  } else if (firstAppeals.some((fa) => fa.status === "Filed")) {
    stage = "First Appeal Stage";
    stageIndex = 1;
  }

  // 2. Health score logic
  let healthScore = 90;
  let healthColor = "text-teal-600 bg-teal-50 dark:bg-teal-950/30 dark:text-teal-400";
  let healthBarColor = "bg-teal-500";
  
  if (rti.status === "Closed") {
    healthScore = 100;
  } else if (isOverdue) {
    healthScore = 30;
    healthColor = "text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400";
    healthBarColor = "bg-rose-500";
  } else if (days !== null && days <= 7) {
    healthScore = 60;
    healthColor = "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400";
    healthBarColor = "bg-amber-500";
  }

  // 3. Risk Level
  let riskLevel = "Low Risk";
  let riskCls = "text-teal-600 bg-teal-50 dark:bg-teal-950/30 dark:text-teal-400 border-teal-200/50 dark:border-teal-900/30";
  if (isOverdue) {
    riskLevel = "High Risk (Overdue)";
    riskCls = "text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200/50 dark:border-rose-900/30 animate-pulse";
  } else if (days !== null && days <= 7) {
    riskLevel = "Medium Risk (Due Soon)";
    riskCls = "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/30";
  }

  // 4. AI & OCR Sync status
  const totalDocs = documents.length;
  const ocrDone = documents.filter((d) => d.ocr_status === "Completed").length;
  const aiDone = documents.filter((d) => d.ai_status === "Completed").length;

  const ocrPercent = totalDocs > 0 ? Math.round((ocrDone / totalDocs) * 100) : 100;
  const aiPercent = totalDocs > 0 ? Math.round((aiDone / totalDocs) * 100) : 100;

  // 5. Next statutory action
  let recommendedAction = "Awaiting response from public authority.";
  if (isOverdue) {
    recommendedAction = "Filing deadline missed. Prepare First Appeal drafting sequence immediately.";
  } else if (days !== null && days <= 5) {
    recommendedAction = "Approaching deadline. Send follow-up communication or draft appeal.";
  } else if (rti.status === "Reply Received") {
    recommendedAction = "Verify adequacy of supplied reply answers and decide satisfaction.";
  }

  const steps = [
    { label: "Application Filed", desc: rti.date_filed ? formatDate(rti.date_filed) : "Pending" },
    { label: "First Appeal (FAA)", desc: firstAppeals.length > 0 ? (firstAppeals[0]?.status || "Awaiting Reply") : "Awaiting Reply" },
    { label: "Second Appeal (KIC)", desc: secondAppeals.length > 0 ? (secondAppeals[0]?.status || "Awaiting FAA Order") : "Awaiting FAA Order" },
    { label: "Case Resolved", desc: rti.status === "Closed" ? "Archived" : "Pending Order" }
  ];

  return (
    <aside className={cn("space-y-5 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] overflow-y-auto pr-1 no-print", className)}>
      {/* Health Score Box */}
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-3xs space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Workspace Health</span>
          <span className={cn("text-xs font-extrabold px-2 py-0.5 rounded-md border", riskCls)}>
            {riskLevel}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center h-14 w-14 rounded-full border border-border bg-muted/20">
            <Heart className={cn("h-6 w-6", healthScore < 50 ? "text-rose-500 fill-rose-500 animate-pulse" : "text-teal-500 fill-teal-500")} />
            <span className="absolute -bottom-1 -right-1 text-[9px] font-extrabold px-1 bg-background border rounded-md text-foreground shadow-3xs">
              {healthScore}%
            </span>
          </div>

          <div className="flex-1 space-y-1">
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-500", healthBarColor)} style={{ width: `${healthScore}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground font-semibold leading-none pt-0.5">
              Target SLA deadline resolution score
            </p>
          </div>
        </div>
      </div>

      {/* SLA Deadlines Overview */}
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-3xs space-y-3">
        <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-muted-foreground/80" /> Statutory SLA tracking
        </h3>
        
        <div className="space-y-2 text-xs divide-y divide-border/30">
          <div className="pt-2 flex justify-between items-center">
            <span className="text-muted-foreground/80 font-semibold">Date Filed</span>
            <span className="font-bold text-foreground">{rti.date_filed ? formatDate(rti.date_filed) : "—"}</span>
          </div>
          <div className="pt-2 flex justify-between items-center">
            <span className="text-muted-foreground/80 font-semibold">Standard Due (30d)</span>
            <span className="font-bold text-foreground">{rti.normal_due ? formatDate(rti.normal_due) : "—"}</span>
          </div>
          {rti.is_life_liberty && (
            <div className="pt-2 flex justify-between items-center text-rose-600 dark:text-rose-400">
              <span className="font-semibold flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" /> Life/Liberty Due (48h)
              </span>
              <span className="font-bold">{rti.life_liberty_due ? formatDate(rti.life_liberty_due) : "—"}</span>
            </div>
          )}
          <div className="pt-2 flex justify-between items-center">
            <span className="text-muted-foreground/80 font-semibold">First Appeal Due</span>
            <span className="font-bold text-foreground">{rti.first_appeal_due ? formatDate(rti.first_appeal_due) : "—"}</span>
          </div>
          <div className="pt-2 flex justify-between items-center">
            <span className="text-muted-foreground/80 font-semibold">Second Appeal Due</span>
            <span className="font-bold text-foreground">{rti.second_appeal_due ? formatDate(rti.second_appeal_due) : "—"}</span>
          </div>
        </div>
      </div>

      {/* Case Stage Stepper */}
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-3xs space-y-4">
        <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Workflow className="h-4 w-4 text-muted-foreground/80" /> Workflow stage
        </h3>

        <div className="space-y-4 relative pl-3.5 before:absolute before:left-1 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
          {steps.map((step, idx) => {
            const isCompleted = idx < stageIndex || (idx === stageIndex && rti.status === "Closed");
            const isActive = idx === stageIndex && rti.status !== "Closed";
            
            return (
              <div key={idx} className="relative flex items-start gap-3">
                <span className={cn(
                  "absolute -left-[18px] top-1.5 h-2 w-2 rounded-full ring-4 ring-background",
                  isCompleted && "bg-teal-500",
                  isActive && "bg-blue-600 animate-pulse ring-blue-100 dark:ring-blue-900/30",
                  !isCompleted && !isActive && "bg-slate-300 dark:bg-slate-700"
                )} />
                <div className="space-y-0.5">
                  <p className={cn(
                    "text-[12px] font-bold leading-none",
                    isCompleted && "text-foreground/80",
                    isActive && "text-blue-600 dark:text-blue-400 font-extrabold",
                    !isCompleted && !isActive && "text-muted-foreground/60"
                  )}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 font-semibold">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Intelligence & Readiness Sync Status */}
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-3xs space-y-3">
        <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Cpu className="h-4 w-4 text-muted-foreground/80" /> Processing engine
        </h3>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg border border-border/40 p-2 bg-muted/10">
            <span className="text-[10px] text-muted-foreground/75 font-semibold block uppercase">OCR sync</span>
            <span className="text-sm font-extrabold text-foreground">{ocrPercent}%</span>
          </div>
          <div className="rounded-lg border border-border/40 p-2 bg-muted/10">
            <span className="text-[10px] text-muted-foreground/75 font-semibold block uppercase">AI index</span>
            <span className="text-sm font-extrabold text-foreground">{aiPercent}%</span>
          </div>
        </div>
      </div>

      {/* Recommended Action Alert */}
      <div className="rounded-xl border border-amber-200/50 bg-amber-500/8 dark:border-amber-900/40 p-6 shadow-3xs space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" /> Next Recommended Action
        </div>
        <p className="text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-400/80 font-medium">
          {recommendedAction}
        </p>
      </div>
    </aside>
  );
}
