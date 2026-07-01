"use client";

import * as React from "react";
import {
  FileText,
  Send,
  ClipboardCheck,
  Search,
  User,
  Calendar,
  Check,
  Wrench,
  Mail,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  Scale,
  Archive,
  MailX,
  Clock,
  HelpCircle,
  LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Helper to compute relative time / duration since status change
function getRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

type StatusConfig = {
  icon: LucideIcon;
  colors: string;
  isAttention: boolean;
};

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  Draft: {
    icon: FileText,
    colors: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-800",
    isAttention: false,
  },
  Filed: {
    icon: Send,
    colors: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900",
    isAttention: true,
  },
  Acknowledged: {
    icon: ClipboardCheck,
    colors: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900",
    isAttention: false,
  },
  "Under Review": {
    icon: Search,
    colors: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900",
    isAttention: true,
  },
  "Assigned To Engineer": {
    icon: User,
    colors: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900",
    isAttention: true,
  },
  "Site Visit Pending": {
    icon: Calendar,
    colors: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900",
    isAttention: true,
  },
  "Site Visit Done": {
    icon: Check,
    colors: "bg-teal-50 text-teal-700 border-teal-205 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900",
    isAttention: false,
  },
  "Work In Progress": {
    icon: Wrench,
    colors: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900",
    isAttention: true,
  },
  "Reply Received": {
    icon: Mail,
    colors: "bg-teal-50 text-teal-700 border-teal-205 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900",
    isAttention: false,
  },
  "Action Taken Report Received": {
    icon: FileCheck2,
    colors: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900",
    isAttention: false,
  },
  "Partially Resolved": {
    icon: AlertCircle,
    colors: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900",
    isAttention: true,
  },
  Resolved: {
    icon: CheckCircle2,
    colors: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900",
    isAttention: false,
  },
  Reopened: {
    icon: RefreshCw,
    colors: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900",
    isAttention: true,
  },
  Escalated: {
    icon: TrendingUp,
    colors: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900",
    isAttention: true,
  },
  "Converted To RTI": {
    icon: Scale,
    colors: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900",
    isAttention: true,
  },
  Closed: {
    icon: Archive,
    colors: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-800",
    isAttention: false,
  },
  "No Response": {
    icon: MailX,
    colors: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900",
    isAttention: true,
  },
  Overdue: {
    icon: Clock,
    colors: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900",
    isAttention: true,
  },
};

export function StatusBadge({ status, date }: { status: string; date?: string | Date | null }) {
  const config = STATUS_CONFIGS[status] || {
    icon: HelpCircle,
    colors: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-800",
    isAttention: false,
  };

  const Icon = config.icon;
  const timeText = React.useMemo(() => getRelativeTime(date), [date]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-0.5 h-6 rounded-md font-semibold text-xs border select-none transition-all duration-200 hover:scale-[1.03] hover:shadow-xs cursor-help",
              config.colors,
              config.isAttention && "animate-pulse-subtle hover:animate-none"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
            <span>{status}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-2 text-xs">
          <p className="font-semibold">{status}</p>
          {timeText && (
            <p className="text-[10px] text-muted-foreground mt-0.5 capitalize-first">
              Active since {timeText}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
