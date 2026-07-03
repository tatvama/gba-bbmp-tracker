"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  FileText,
  Scale,
  Landmark,
  AlertCircle,
  Info,
  RefreshCw,
  Save,
  Check,
  ShieldCheck,
  Clock,
  Building,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DeadlineRules } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";
import { cn } from "@/lib/utils";

interface FieldMeta {
  key: keyof DeadlineRules;
  label: string;
  unit: "Days" | "Hours";
  defaultValue: number;
  defaultValueLabel: string;
  explanation: string;
  example: string;
  legalReference: string;
  impacts: string[];
  icon: React.ReactNode;
}

const FIELD_METAS: Record<keyof DeadlineRules, FieldMeta> = {
  normalDays: {
    key: "normalDays",
    label: "Normal RTI Response",
    unit: "Days",
    defaultValue: 30,
    defaultValueLabel: "30 Days",
    explanation: "Controls the statutory deadline to respond to a standard RTI application.",
    example: "Application Date + 30 Days.",
    legalReference: "RTI Act Section 7(1)",
    impacts: ["Dashboard countdown", "Calendar view", "Reports status mapping", "Oversight audits"],
    icon: <FileText className="h-4.5 w-4.5 text-blue-500" />,
  },
  lifeLibertyHours: {
    key: "lifeLibertyHours",
    label: "Life & Liberty Response",
    unit: "Hours",
    defaultValue: 48,
    defaultValueLabel: "48 Hours",
    explanation: "Controls the emergency deadline when information concerns a person's life or liberty.",
    example: "Receipt Date/Time + 48 Hours.",
    legalReference: "RTI Act Section 7(1) Proviso",
    impacts: ["Immediate priority badges", "Life/safety escalations", "Calendar alerts"],
    icon: <Clock className="h-4.5 w-4.5 text-rose-500" />,
  },
  firstAppealDays: {
    key: "firstAppealDays",
    label: "First Appeal Filing Window",
    unit: "Days",
    defaultValue: 30,
    defaultValueLabel: "30 Days",
    explanation: "The statutory period (in days) during which an applicant can file a First Appeal after response deadline expiry.",
    example: "SLA Expiry Date + 30 Days.",
    legalReference: "RTI Act Section 19(1)",
    impacts: ["First appeal filing countdowns", "First appeal warning indicators", "Statutory SLA reports"],
    icon: <Scale className="h-4.5 w-4.5 text-purple-500" />,
  },
  secondAppealDays: {
    key: "secondAppealDays",
    label: "Second Appeal Filing Window",
    unit: "Days",
    defaultValue: 90,
    defaultValueLabel: "90 Days",
    explanation: "The statutory period (in days) to file a Second Appeal to the Central/State Information Commission.",
    example: "FAA Order Date + 90 Days.",
    legalReference: "RTI Act Section 19(3)",
    impacts: ["Commission escalation warnings", "Second appeal tracking ledger", "Legal audit reports"],
    icon: <Building className="h-4.5 w-4.5 text-purple-500" />,
  },
  faaDisposalDays: {
    key: "faaDisposalDays",
    label: "FAA Disposal Target",
    unit: "Days",
    defaultValue: 30,
    defaultValueLabel: "30 Days",
    explanation: "Standard statutory period for the First Appellate Authority (FAA) to resolve and dispose of an appeal.",
    example: "Appeal Filing Date + 30 Days.",
    legalReference: "RTI Act Section 19(6)",
    impacts: ["FAA countdown timers", "Appeals reports", "Oversight dashboards"],
    icon: <Landmark className="h-4.5 w-4.5 text-amber-500" />,
  },
  faaDisposalMaxDays: {
    key: "faaDisposalMaxDays",
    label: "FAA Disposal Max Limit",
    unit: "Days",
    defaultValue: 45,
    defaultValueLabel: "45 Days",
    explanation: "Maximum extendable period for the FAA to resolve an appeal for reasons recorded in writing.",
    example: "Appeal Filing Date + 45 Days.",
    legalReference: "RTI Act Section 19(6) Proviso",
    impacts: ["FAA limit warning flags", "Extension indicators", "Audit summaries"],
    icon: <Landmark className="h-4.5 w-4.5 text-amber-600" />,
  },
  dueSoonDays: {
    key: "dueSoonDays",
    label: "Due Soon Threshold",
    unit: "Days",
    defaultValue: 5,
    defaultValueLabel: "5 Days",
    explanation: "Timeline warning threshold. Active cases turn yellow when remaining days are below this limit.",
    example: "Alert badge turns yellow at 5 days remaining.",
    legalReference: "System Administrative Rule",
    impacts: ["Interactive status badges", "Dashboard oversight warning", "Calendar notification flags"],
    icon: <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />,
  },
  criticalOverdueDays: {
    key: "criticalOverdueDays",
    label: "Critical Overdue Threshold",
    unit: "Days",
    defaultValue: 10,
    defaultValueLabel: "10 Days",
    explanation: "Timelines escalation threshold. Cases turn red and flag as critical after being overdue by this limit.",
    example: "Alert badge turns red after 10 days overdue.",
    legalReference: "System Administrative Rule",
    impacts: ["Critical overdue filters", "Urgency overview alerts", "Automatic notifications"],
    icon: <AlertCircle className="h-4.5 w-4.5 text-rose-500" />,
  }
};

export function DeadlineRulesForm({
  action,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: DeadlineRules;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [formValues, setFormValues] = React.useState<DeadlineRules>({ ...initial });
  const [activeHelp, setActiveHelp] = React.useState<string | null>(null);

  // Check if any field differs from initial
  const isDirty = React.useMemo(() => {
    return Object.keys(initial).some(
      (k) => formValues[k as keyof DeadlineRules] !== initial[k as keyof DeadlineRules]
    );
  }, [formValues, initial]);

  const handleInputChange = (key: keyof DeadlineRules, val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setFormValues((prev) => ({ ...prev, [key]: num }));
    }
  };

  const handleReset = () => {
    setFormValues({ ...initial });
    setActiveHelp(null);
  };

  const handleRestoreDefaults = () => {
    const defaults: DeadlineRules = {
      normalDays: FIELD_METAS.normalDays.defaultValue,
      lifeLibertyHours: FIELD_METAS.lifeLibertyHours.defaultValue,
      firstAppealDays: FIELD_METAS.firstAppealDays.defaultValue,
      secondAppealDays: FIELD_METAS.secondAppealDays.defaultValue,
      faaDisposalDays: FIELD_METAS.faaDisposalDays.defaultValue,
      faaDisposalMaxDays: FIELD_METAS.faaDisposalMaxDays.defaultValue,
      dueSoonDays: FIELD_METAS.dueSoonDays.defaultValue,
      criticalOverdueDays: FIELD_METAS.criticalOverdueDays.defaultValue,
    };
    setFormValues(defaults);
  };

  const renderConfigurationCard = (key: keyof DeadlineRules) => {
    const meta = FIELD_METAS[key];
    const isHelpOpen = activeHelp === key;

    return (
      <Card key={key} className="overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
        <div className="p-4 space-y-3.5 flex-1">
          {/* Card Header title & badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-100/80 dark:bg-slate-800 rounded-lg shrink-0">
                {meta.icon}
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground dark:text-slate-100 flex items-center gap-1">
                  {meta.label}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setActiveHelp(isHelpOpen ? null : key)}
                          className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                          aria-label={`Show help info`}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-[10px]">
                        Click to toggle legal explanation
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </h3>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono block">
                  {meta.legalReference}
                </span>
              </div>
            </div>

            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-bold bg-slate-100 text-slate-500 border dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 whitespace-nowrap">
              SLA: {meta.defaultValueLabel}
            </Badge>
          </div>

          {/* Helper details panel */}
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            {meta.explanation}
          </p>

          {isHelpOpen && (
            <div className="p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 text-[11px] text-blue-800 dark:text-blue-300 leading-normal border border-blue-100/40 dark:border-blue-900/30 animate-in fade-in duration-200">
              <p className="font-semibold">Contextual Example:</p>
              <p className="font-mono text-blue-600 dark:text-blue-400">{meta.example}</p>
            </div>
          )}

          {/* Unit inputs and controls */}
          <div className="space-y-1.5 pt-1.5">
            <Label htmlFor={key} className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Configure Value
            </Label>
            <div className="relative rounded-lg overflow-hidden flex border border-slate-200 dark:border-slate-800 focus-within:ring-2 focus-within:ring-primary/45 transition-all duration-200">
              <Input
                type="number"
                min={1}
                name={key}
                id={key}
                value={formValues[key]}
                onChange={(e) => handleInputChange(key, e.target.value)}
                required
                className="flex-1 h-10 pr-12 text-sm font-bold border-none rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-slate-950/20"
              />
              <div className="h-10 px-3 bg-slate-50 dark:bg-slate-850 text-xs text-slate-400 font-bold flex items-center border-l border-slate-200 dark:border-slate-800 rounded-r-lg">
                {meta.unit}
              </div>
            </div>
            <div className="flex justify-between items-center text-[10px] text-muted-foreground font-bold">
              <span>Standard: {meta.defaultValueLabel}</span>
              {formValues[key] === meta.defaultValue ? (
                <span className="text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> Recommended value</span>
              ) : (
                <span className="text-amber-600">Customized limit</span>
              )}
            </div>
          </div>
        </div>

        {/* Impact area */}
        <div className="bg-slate-50/40 dark:bg-slate-900/20 px-4 py-3 border-t border-slate-100 dark:border-slate-800/80 text-[10px] font-semibold text-slate-400 space-y-1">
          <span className="text-slate-400 font-bold block uppercase tracking-wider">Affects:</span>
          <div className="flex flex-wrap gap-1">
            {meta.impacts.map((imp) => (
              <span key={imp} className="bg-slate-100/60 dark:bg-slate-800/50 text-[9.5px] px-1.5 py-0.5 rounded border border-slate-200/40 dark:border-slate-700/50">
                {imp}
              </span>
            ))}
          </div>
        </div>
      </Card>
    );
  };

  // Compute compliance score: count standard fields
  const compliantCount = Object.keys(FIELD_METAS).filter(
    (k) => formValues[k as keyof DeadlineRules] === FIELD_METAS[k as keyof DeadlineRules].defaultValue
  ).length;

  return (
    <form action={formAction} className="space-y-8 pb-24">
      
      {/* Configuration Status Messages */}
      {state.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-sm font-semibold text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
          Deadline rules saved. Badges and reports now use these updated values.
        </div>
      )}

      {/* 1. CONFIGURATION OVERVIEW BANNER */}
      <div className="grid gap-4 md:grid-cols-4 bg-gradient-to-r from-card via-card to-primary/[0.01] rounded-2xl border border-border p-5 shadow-2xs">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Configurable Rules</span>
          <span className="text-2xl font-black text-foreground">{Object.keys(FIELD_METAS).length} Policies</span>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">RTI Act Compliance</span>
          <span className="text-2xl font-black text-foreground flex items-center gap-1.5">
            <ShieldCheck className={cn("h-5 w-5", compliantCount === 8 ? "text-emerald-500" : "text-amber-500")} />
            {Math.round((compliantCount / 8) * 100)}% Standard
          </span>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Effective Policy</span>
          <span className="text-2xl font-black text-foreground">Active rules</span>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Configuration Version</span>
          <span className="text-2xl font-black text-foreground">v1.2</span>
        </div>
      </div>

      {/* 2. STICKY TOP SAVE ACTION BAR */}
      <div className="sticky top-14 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-2 text-xs font-bold">
          {isDirty ? (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="text-amber-600 dark:text-amber-400">Unsaved configuration changes pending</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-emerald-600 dark:text-emerald-400">Rules synchronized with legal standards</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestoreDefaults}
            className="h-9 text-xs font-bold dark:border-slate-800 dark:bg-slate-900 cursor-pointer gap-1"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore Legal Standards
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isDirty}
            onClick={handleReset}
            className="h-9 text-xs font-bold text-slate-500 hover:text-foreground dark:hover:text-slate-200 cursor-pointer gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reset
          </Button>

          <Button
            type="submit"
            disabled={pending || !isDirty}
            className="h-9 px-5 text-xs font-bold bg-[#e27226] hover:bg-[#c95d18] text-white rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {pending ? (
              "Saving Changes…"
            ) : (
              <>
                <Save className="h-4 w-4" /> Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 3. GROUPED CONFIGURATIONS */}
      <div className="space-y-8">
        
        {/* Category A: Response Deadlines */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Response Deadlines
            </h3>
          </div>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {renderConfigurationCard("normalDays")}
            {renderConfigurationCard("lifeLibertyHours")}
          </div>
        </div>

        {/* Category B: Appeals */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Appeals Filing & Disposal
            </h3>
          </div>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {renderConfigurationCard("firstAppealDays")}
            {renderConfigurationCard("secondAppealDays")}
            {renderConfigurationCard("faaDisposalDays")}
            {renderConfigurationCard("faaDisposalMaxDays")}
          </div>
        </div>

        {/* Category C: Oversight Alerts */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Oversight Alerts & Indicators
            </h3>
          </div>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {renderConfigurationCard("dueSoonDays")}
            {renderConfigurationCard("criticalOverdueDays")}
          </div>
        </div>
      </div>
    </form>
  );
}
