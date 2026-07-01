"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  FileText, Scale, Landmark, AlertCircle, Info, RefreshCw, Save, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DeadlineRules } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";
import { cn } from "@/lib/utils";

interface FieldMeta {
  key: keyof DeadlineRules;
  label: string;
  unit: "Days" | "Hours";
  defaultValueLabel: string;
  explanation: string;
  example: string;
}

const FIELD_METAS: Record<keyof DeadlineRules, FieldMeta> = {
  normalDays: {
    key: "normalDays",
    label: "Normal Response",
    unit: "Days",
    defaultValueLabel: "30 Days",
    explanation: "Controls the legal deadline to respond to a standard RTI application. Affects all public information officers.",
    example: "Application Date + 30 Days."
  },
  lifeLibertyHours: {
    key: "lifeLibertyHours",
    label: "Life & Liberty",
    unit: "Hours",
    defaultValueLabel: "48 Hours",
    explanation: "Controls the emergency response deadline when information concerns a person's life or liberty. Affects emergency life-safety issues.",
    example: "Receipt Date + 48 Hours."
  },
  firstAppealDays: {
    key: "firstAppealDays",
    label: "First Appeal Window",
    unit: "Days",
    defaultValueLabel: "30 Days",
    explanation: "The legal window (in days) during which an applicant can file a First Appeal after deadline expiry. Affects aggrieved applicants.",
    example: "Expiry Date + 30 Days."
  },
  secondAppealDays: {
    key: "secondAppealDays",
    label: "Second Appeal Window",
    unit: "Days",
    defaultValueLabel: "90 Days",
    explanation: "The legal window (in days) to file a Second Appeal to the Information Commission. Affects second appellants.",
    example: "FAA Order Date + 90 Days."
  },
  faaDisposalDays: {
    key: "faaDisposalDays",
    label: "FAA Disposal Target",
    unit: "Days",
    defaultValueLabel: "30 Days",
    explanation: "Target period for the First Appellate Authority (FAA) to dispose of an appeal. Affects FAAs and appellants.",
    example: "Appeal Date + 30 Days."
  },
  faaDisposalMaxDays: {
    key: "faaDisposalMaxDays",
    label: "FAA Disposal Max Limit",
    unit: "Days",
    defaultValueLabel: "45 Days",
    explanation: "Maximum extendable period for the FAA to resolve an appeal under special reasons. Affects FAAs.",
    example: "Appeal Date + 45 Days."
  },
  dueSoonDays: {
    key: "dueSoonDays",
    label: "Due Soon Threshold",
    unit: "Days",
    defaultValueLabel: "5 Days",
    explanation: "Timeline indicator for active applications. The warning badge turns yellow when this many days remain. Affects oversight dashboards.",
    example: "Badge turns yellow within 5 days remaining."
  },
  criticalOverdueDays: {
    key: "criticalOverdueDays",
    label: "Critical Overdue Threshold",
    unit: "Days",
    defaultValueLabel: "10 Days",
    explanation: "Timeline indicator for critical escalation. The status badge escalates to red after this many days overdue. Affects oversight dashboards.",
    example: "Badge turns red after 10 days overdue."
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

  const renderField = (key: keyof DeadlineRules) => {
    const meta = FIELD_METAS[key];
    const isHelpOpen = activeHelp === key;

    return (
      <div key={key} className="space-y-2 p-3 rounded-lg bg-slate-50/40 dark:bg-slate-900/10 border border-transparent hover:border-slate-200/50 dark:hover:border-slate-800/50 transition-all duration-200">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-bold text-slate-800 dark:text-slate-205 flex items-center gap-1.5">
            {meta.label}
            <button
              type="button"
              onClick={() => setActiveHelp(isHelpOpen ? null : key)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
              aria-label={`Help explanation for ${meta.label}`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </Label>

          <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
            RTI Act: {meta.defaultValueLabel}
          </Badge>
        </div>

        {isHelpOpen && (
          <div className="p-2.5 rounded-md bg-blue-50/45 dark:bg-blue-950/20 text-xs text-blue-800 dark:text-blue-300 leading-normal border border-blue-100/40 dark:border-blue-900/30 animate-in fade-in duration-200">
            <p className="font-semibold mb-1">{meta.explanation}</p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-mono">Example: {meta.example}</p>
          </div>
        )}

        <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
          <Input
            type="number"
            min={1}
            name={key}
            value={formValues[key]}
            onChange={(e) => handleInputChange(key, e.target.value)}
            required
            className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
          />
          <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
            {meta.unit}
          </div>
        </div>
      </div>
    );
  };

  return (
    <form action={formAction} className="space-y-6 pb-20">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SECTION 1: NORMAL RTI Response */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                Normal RTI Response
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Statutory windows for initial application processing
              </p>
            </div>
          </div>
          <CardContent className="p-3.5 space-y-3">
            {renderField("normalDays")}
            {renderField("lifeLibertyHours")}
          </CardContent>
        </Card>

        {/* SECTION 2: Appeals */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center shrink-0">
              <Scale className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                Appeals Filing
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Permitted filing intervals for First and Second Appeals
              </p>
            </div>
          </div>
          <CardContent className="p-3.5 space-y-3">
            {renderField("firstAppealDays")}
            {renderField("secondAppealDays")}
          </CardContent>
        </Card>

        {/* SECTION 3: FAA Processing */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center shrink-0">
              <Landmark className="h-5 w-5 text-amber-600 dark:text-amber-450" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                FAA Disposal Target
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Disposal timelines for First Appellate Authority resolutions
              </p>
            </div>
          </div>
          <CardContent className="p-3.5 space-y-3">
            {renderField("faaDisposalDays")}
            {renderField("faaDisposalMaxDays")}
          </CardContent>
        </Card>

        {/* SECTION 4: Alert Thresholds */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950 flex items-center justify-center shrink-0">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                Dashboard Alerting
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Escalation triggers and countdown indicators configuration
              </p>
            </div>
          </div>
          <CardContent className="p-3.5 space-y-3">
            {renderField("dueSoonDays")}
            {renderField("criticalOverdueDays")}
          </CardContent>
        </Card>
      </div>

      {/* STICKY SAVE CHANGES NOTIFICATION BAR */}
      {isDirty && (
        <div className="fixed bottom-4 left-4 right-4 md:left-64 md:right-4 z-40 bg-slate-900 text-slate-100 p-3.5 rounded-xl shadow-xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-3 duration-250 border border-slate-805">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold tracking-tight">Unsaved Configuration Changes</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              className="h-9 text-xs font-bold text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-9 px-4 text-xs font-bold bg-[#e27226] hover:bg-[#c95d18] text-white rounded-lg flex items-center gap-1.5"
            >
              {pending ? (
                "Saving Changes…"
              ) : (
                <>
                  <Save className="h-4 w-4" /> Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
