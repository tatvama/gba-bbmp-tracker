"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  Binary, Calendar, Languages, Brain, EyeOff, HardDrive, RefreshCw, Save, Check, AlertCircle, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CASE_NUMBER_PREFIXES, type ComplaintSettings } from "@/lib/constants";
import { updateComplaintSettings } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/contacts";
import { cn } from "@/lib/utils";

const selectCls = "flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-800 dark:bg-slate-900 font-semibold";

interface FieldMeta {
  label: string;
  unit?: string;
  defaultVal: string;
  explanation: string;
  example?: string;
}

const METAS: Record<keyof ComplaintSettings, FieldMeta> = {
  caseNumberPrefix: {
    label: "Case Prefix",
    defaultVal: "DM-CMP",
    explanation: "Prefix prepended to all auto-generated internal case numbers.",
    example: "e.g. DM-CMP → DM-CMP-2026-000001"
  },
  startingSequence: {
    label: "Starting Sequence",
    unit: "#",
    defaultVal: "1",
    explanation: "Initial numeric counter for new complaint indexing.",
    example: "Counter starts at 1, increments for every new complaint."
  },
  followUpDaysAfterFiling: {
    label: "Follow-up After Filing",
    unit: "Days",
    defaultVal: "7 Days",
    explanation: "Standard waiting window in days before triggering first reminder follow-up alert."
  },
  followUpDaysAfterReply: {
    label: "Follow-up After Reply",
    unit: "Days",
    defaultVal: "15 Days",
    explanation: "Days before triggering next follow-up alert after a reply is logged."
  },
  siteVerificationDaysAfterAction: {
    label: "Verification Days",
    unit: "Days",
    defaultVal: "30 Days",
    explanation: "Allotted timeline for engineer site inspection after action is taken."
  },
  maxUploadMb: {
    label: "Maximum Upload Size",
    unit: "MB",
    defaultVal: "15 MB",
    explanation: "Maximum allowed file size limit for complaint attachments."
  },
  ocrLanguage: {
    label: "OCR Scanner Language",
    defaultVal: "English + Kannada",
    explanation: "Primary language libraries utilized by the document OCR text extraction engine."
  },
  ocrAutoRun: {
    label: "Run OCR Automatically",
    defaultVal: "ON",
    explanation: "Initiates automatic text-extraction scanning on all document copies immediately after upload."
  },
  aiAutoSummary: {
    label: "Generate AI Summary",
    defaultVal: "ON",
    explanation: "Triggers AI summary generation after text extraction concludes."
  },
  documentsPrivateByDefault: {
    label: "Private Documents",
    defaultVal: "OFF",
    explanation: "Marks all uploaded documents as private by default, restricting access to authorized roles."
  },
  aiAdvisorEnabled: {
    label: "AI Advisor",
    defaultVal: "ON",
    explanation: "Runs the AI Complaint Advisor in the background after every complaint update, surfacing health scores and recommendations."
  },
  aiAdvisorReminderSlaDays: {
    label: "Reminder SLA",
    unit: "Days",
    defaultVal: "14 Days",
    explanation: "Days with no reply before the advisor recommends generating a reminder letter."
  },
  aiAdvisorEscalationSlaDays: {
    label: "Escalation SLA",
    unit: "Days",
    defaultVal: "10 Days",
    explanation: "Days after a reminder is generated, still with no reply, before the advisor recommends escalation."
  },
  aiAdvisorPreReminderSlaDays: {
    label: "Acknowledgment Pre-Reminder SLA",
    unit: "Days",
    defaultVal: "7 Days",
    explanation: "Days after acknowledgment before the advisor recommends a pre-reminder follow-up letter."
  },
  excludeSaturdaysAsWorkingDay: {
    label: "Exclude Saturdays",
    defaultVal: "OFF",
    explanation: "The escalation ladder's 7-working-day reminder/legal-notice windows always skip Sunday. Turn this on to also skip Saturday."
  },
};

export function ComplaintSettingsForm({ initial }: { initial: ComplaintSettings }) {
  const [state, action, pending] = useActionState(updateComplaintSettings, {} as ActionState);
  const [formValues, setFormValues] = React.useState<ComplaintSettings>({ ...initial });

  React.useEffect(() => {
    setFormValues({ ...initial });
  }, [initial]);

  // Check dirty state
  const isDirty = React.useMemo(() => {
    return Object.keys(initial).some(
      (k) => formValues[k as keyof ComplaintSettings] !== initial[k as keyof ComplaintSettings]
    );
  }, [formValues, initial]);

  const handleInputChange = (key: keyof ComplaintSettings, val: string | number | boolean) => {
    setFormValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleReset = () => {
    setFormValues({ ...initial });
  };

  return (
    <form action={action} className="space-y-8 pb-20 select-none">
      {/* Sticky Action Toolbar & Breadcrumbs */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md py-4 border-b border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between -mx-4 px-4 md:-mx-6 md:px-6">
        <div className="min-w-0 space-y-1">
          {/* Breadcrumb nav */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium">
            <Link href="/" className="hover:text-foreground transition-colors truncate">
              Home
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            <Link href="/complaints" className="hover:text-foreground transition-colors truncate">
              Complaints
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            <span className="truncate text-foreground font-semibold">Settings</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl leading-none">
              Complaint settings
            </h1>
            {isDirty && (
              <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 font-bold text-[10px] animate-pulse">
                Unsaved Changes
              </Badge>
            )}
          </div>
        </div>

        {/* Sticky save / reset actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1 sm:pt-0">
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={!isDirty || pending}
            className="h-9 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
          <Button
            type="submit"
            disabled={!isDirty || pending}
            className="h-9 px-4 text-xs font-bold bg-[#e27226] hover:bg-[#c95d18] text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {pending ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving Changes…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-sm font-semibold text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
          Complaint settings saved. System behaviors now reflect these configuration parameters.
        </div>
      )}

      {/* Current Configuration Summary Card */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 dark:bg-slate-900/10 dark:border-slate-800 p-5 shadow-2xs">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4 pl-1">
          Current Configuration
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Tile 1: Prefix */}
          <div className="p-3.5 rounded-lg border border-slate-150 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between min-h-[70px]">
            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold flex items-center gap-1 leading-none uppercase">
              <Binary className="h-3.5 w-3.5 text-blue-500" /> Case Prefix
            </span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-2">
              {formValues.caseNumberPrefix || "None"}
            </span>
          </div>

          {/* Tile 2: OCR */}
          <div className="p-3.5 rounded-lg border border-slate-150 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between min-h-[70px]">
            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold flex items-center gap-1 leading-none uppercase">
              <Languages className="h-3.5 w-3.5 text-violet-500" /> OCR Engine
            </span>
            <div className="flex flex-col gap-0.5 mt-2">
              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                {formValues.ocrLanguage === "eng" ? "English" : formValues.ocrLanguage === "kan" ? "Kannada" : "English + Kan"}
              </span>
              <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                {formValues.ocrAutoRun ? "🟢 Auto Scan" : "⚪ Manual"}
              </span>
            </div>
          </div>

          {/* Tile 3: AI Advisor */}
          <div className="p-3.5 rounded-lg border border-slate-150 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between min-h-[70px]">
            <span className="text-[10px] text-slate-455 dark:text-slate-500 font-extrabold flex items-center gap-1 leading-none uppercase">
              <Brain className="h-3.5 w-3.5 text-pink-500" /> AI Summary
            </span>
            <div className="flex flex-col gap-0.5 mt-2">
              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                {formValues.aiAdvisorEnabled ? "Advisor On" : "Advisor Off"}
              </span>
              <span className={cn("text-[9px] font-bold", formValues.aiAutoSummary ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")}>
                {formValues.aiAutoSummary ? "🟢 Enabled" : "🔴 Disabled"}
              </span>
            </div>
          </div>

          {/* Tile 4: Follow-up */}
          <div className="p-3.5 rounded-lg border border-slate-150 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between min-h-[70px]">
            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold flex items-center gap-1 leading-none uppercase">
              <Calendar className="h-3.5 w-3.5 text-emerald-500" /> Follow-up
            </span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-2">
              {formValues.followUpDaysAfterFiling} Days
            </span>
          </div>

          {/* Tile 5: Verification */}
          <div className="p-3.5 rounded-lg border border-slate-150 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between min-h-[70px]">
            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-extrabold flex items-center gap-1 leading-none uppercase">
              <Check className="h-3.5 w-3.5 text-emerald-650" /> Verification
            </span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-2">
              {formValues.siteVerificationDaysAfterAction} Days
            </span>
          </div>

          {/* Tile 6: Upload Limit */}
          <div className="p-3.5 rounded-lg border border-slate-150 bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col justify-between min-h-[70px]">
            <span className="text-[10px] text-slate-455 dark:text-slate-500 font-extrabold flex items-center gap-1 leading-none uppercase">
              <HardDrive className="h-3.5 w-3.5 text-amber-500" /> Upload Limit
            </span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-2">
              🟢 {formValues.maxUploadMb} MB
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: General Configuration */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-all duration-200">
          <div className="p-5 border-b dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/20 rounded-t-xl">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
              <Binary className="h-5.5 w-5.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                General Configuration
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Manage complaint numbering and default case identifiers.
              </p>
            </div>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Field: caseNumberPrefix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-800 dark:text-slate-250">
                  Case Prefix
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.caseNumberPrefix.defaultVal}
                </Badge>
              </div>
              <Input
                name="caseNumberPrefix"
                value={formValues.caseNumberPrefix}
                onChange={(e) => handleInputChange("caseNumberPrefix", e.target.value)}
                list="prefixes"
                className="h-11 text-sm font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400 rounded-lg"
              />
              <datalist id="prefixes">
                {CASE_NUMBER_PREFIXES.map((p) => (
                  <option key={p} value={p === "CUSTOM" ? "" : p} />
                ))}
              </datalist>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.caseNumberPrefix.explanation} <span className="font-mono text-slate-450 dark:text-slate-450">{METAS.caseNumberPrefix.example}</span>
              </p>
            </div>

            {/* Field: startingSequence */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-800 dark:text-slate-250">
                  Starting Sequence
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.startingSequence.defaultVal}
                </Badge>
              </div>
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="startingSequence"
                  value={formValues.startingSequence}
                  onChange={(e) => handleInputChange("startingSequence", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400"
                />
                <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.startingSequence.unit}
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.startingSequence.explanation}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 2: Workflow Rules */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-all duration-200">
          <div className="p-5 border-b dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/20 rounded-t-xl">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
              <Calendar className="h-5.5 w-5.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                Workflow Rules
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Reminders, deadlines, and verification inspection triggers.
              </p>
            </div>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Field: followUpDaysAfterFiling */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-800 dark:text-slate-250">
                  Follow-up After Filing
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.followUpDaysAfterFiling.defaultVal}
                </Badge>
              </div>
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="followUpDaysAfterFiling"
                  value={formValues.followUpDaysAfterFiling}
                  onChange={(e) => handleInputChange("followUpDaysAfterFiling", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400"
                />
                <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.followUpDaysAfterFiling.unit}
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.followUpDaysAfterFiling.explanation}
              </p>
            </div>

            {/* Field: followUpDaysAfterReply */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-250">
                  Follow-up After Reply
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.followUpDaysAfterReply.defaultVal}
                </Badge>
              </div>
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="followUpDaysAfterReply"
                  value={formValues.followUpDaysAfterReply}
                  onChange={(e) => handleInputChange("followUpDaysAfterReply", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400"
                />
                <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.followUpDaysAfterReply.unit}
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.followUpDaysAfterReply.explanation}
              </p>
            </div>

            {/* Field: siteVerificationDaysAfterAction */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-250">
                  Verification Days
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.siteVerificationDaysAfterAction.defaultVal}
                </Badge>
              </div>
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="siteVerificationDaysAfterAction"
                  value={formValues.siteVerificationDaysAfterAction}
                  onChange={(e) => handleInputChange("siteVerificationDaysAfterAction", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400"
                />
                <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.siteVerificationDaysAfterAction.unit}
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.siteVerificationDaysAfterAction.explanation}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 3: OCR Configuration */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-all duration-200">
          <div className="p-5 border-b dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center shrink-0">
                <Languages className="h-5.5 w-5.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                  OCR Configuration
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Configure document text extraction language and automation.
                </p>
              </div>
            </div>
            <Badge className="bg-violet-100 hover:bg-violet-100 text-violet-850 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-900 border-violet-200 text-[10px] font-extrabold uppercase">
              {formValues.ocrLanguage === "eng" ? "English Only" : formValues.ocrLanguage === "kan" ? "Kannada Only" : "Multilingual"}
            </Badge>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Field: ocrLanguage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-250">
                  OCR Language
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Recommended: English + Kannada
                </Badge>
              </div>
              <select
                name="ocrLanguage"
                value={formValues.ocrLanguage}
                onChange={(e) => handleInputChange("ocrLanguage", e.target.value)}
                className={selectCls}
              >
                <option value="eng">English (eng)</option>
                <option value="kan">Kannada (kan)</option>
                <option value="eng+kan">English + Kannada (eng+kan)</option>
              </select>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.ocrLanguage.explanation}
              </p>
            </div>

            {/* Switch: Run OCR Automatically */}
            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-5">
              <div className="flex items-center justify-between group">
                <div className="flex flex-col pr-6 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                    Run OCR Automatically
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-550 leading-normal mt-0.5">
                    {METAS.ocrAutoRun.explanation}
                  </span>
                </div>
                <label className="relative inline-flex items-center shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    name="ocrAutoRun"
                    checked={formValues.ocrAutoRun}
                    onChange={(e) => handleInputChange("ocrAutoRun", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-855 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-650" />
                </label>
              </div>
              <p className="text-[9.5px] font-bold text-slate-500 mt-2">
                Status: <span className={formValues.ocrAutoRun ? "text-emerald-600 dark:text-emerald-400" : "text-slate-455"}>
                  {formValues.ocrAutoRun ? "🟢 Automatic OCR Enabled" : "⚪ Manual OCR Only"}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 4: AI Configuration */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-all duration-200">
          <div className="p-5 border-b dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                <Brain className="h-5.5 w-5.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-855 dark:text-slate-200 leading-tight">
                  AI Configuration
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Configure automatic summarization and advisor SLAs.
                </p>
              </div>
            </div>
            <Badge className={cn("text-[10px] font-extrabold uppercase border", formValues.aiAdvisorEnabled ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>
              {formValues.aiAdvisorEnabled ? "🟢 AI Advisor Active" : "🔴 AI Advisor Idle"}
            </Badge>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Switch: Generate AI Summary */}
            <div className="flex items-center justify-between group">
              <div className="flex flex-col pr-6 min-w-0">
                <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                  Generate AI Summary
                </span>
                <span className="text-[10px] text-slate-450 dark:text-slate-500 leading-normal mt-0.5">
                  {METAS.aiAutoSummary.explanation}
                </span>
              </div>
              <label className="relative inline-flex items-center shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  name="aiAutoSummary"
                  checked={formValues.aiAutoSummary}
                  onChange={(e) => handleInputChange("aiAutoSummary", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-855 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-655" />
              </label>
            </div>

            {/* Switch: Enable AI Advisor */}
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-5 group">
              <div className="flex flex-col pr-6 min-w-0">
                <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                  AI Advisor Integration
                </span>
                <span className="text-[10px] text-slate-450 dark:text-slate-500 leading-normal mt-0.5">
                  {METAS.aiAdvisorEnabled.explanation}
                </span>
              </div>
              <label className="relative inline-flex items-center shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  name="aiAdvisorEnabled"
                  checked={formValues.aiAdvisorEnabled}
                  onChange={(e) => handleInputChange("aiAdvisorEnabled", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-855 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-655" />
              </label>
            </div>

            {/* AI SLA timelines */}
            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold text-slate-855 dark:text-slate-250">
                    Reminder SLA
                  </Label>
                  <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                    Default: {METAS.aiAdvisorReminderSlaDays.defaultVal}
                  </Badge>
                </div>
                <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                  <Input
                    type="number"
                    min={1}
                    name="aiAdvisorReminderSlaDays"
                    value={formValues.aiAdvisorReminderSlaDays}
                    onChange={(e) => handleInputChange("aiAdvisorReminderSlaDays", parseInt(e.target.value, 10))}
                    required
                    disabled={!formValues.aiAdvisorEnabled}
                    className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400 disabled:opacity-50"
                  />
                  <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                    {METAS.aiAdvisorReminderSlaDays.unit}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                  {METAS.aiAdvisorReminderSlaDays.explanation}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold text-slate-855 dark:text-slate-250">
                    Escalation SLA
                  </Label>
                  <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                    Default: {METAS.aiAdvisorEscalationSlaDays.defaultVal}
                  </Badge>
                </div>
                <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                  <Input
                    type="number"
                    min={1}
                    name="aiAdvisorEscalationSlaDays"
                    value={formValues.aiAdvisorEscalationSlaDays}
                    onChange={(e) => handleInputChange("aiAdvisorEscalationSlaDays", parseInt(e.target.value, 10))}
                    required
                    disabled={!formValues.aiAdvisorEnabled}
                    className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400 disabled:opacity-50"
                  />
                  <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                    {METAS.aiAdvisorEscalationSlaDays.unit}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                  {METAS.aiAdvisorEscalationSlaDays.explanation}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-bold text-slate-855 dark:text-slate-250">
                    Acknowledgment Pre-Reminder SLA
                  </Label>
                  <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                    Default: {METAS.aiAdvisorPreReminderSlaDays.defaultVal}
                  </Badge>
                </div>
                <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                  <Input
                    type="number"
                    min={1}
                    name="aiAdvisorPreReminderSlaDays"
                    value={formValues.aiAdvisorPreReminderSlaDays}
                    onChange={(e) => handleInputChange("aiAdvisorPreReminderSlaDays", parseInt(e.target.value, 10))}
                    required
                    disabled={!formValues.aiAdvisorEnabled}
                    className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400 disabled:opacity-50"
                  />
                  <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                    {METAS.aiAdvisorPreReminderSlaDays.unit}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                  {METAS.aiAdvisorPreReminderSlaDays.explanation}
                </p>
              </div>

              <div className="flex items-center justify-between group pt-1">
                <div className="flex flex-col pr-6 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                    Exclude Saturdays
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal mt-0.5">
                    {METAS.excludeSaturdaysAsWorkingDay.explanation}
                  </span>
                </div>
                <label className="relative inline-flex items-center shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    name="excludeSaturdaysAsWorkingDay"
                    checked={formValues.excludeSaturdaysAsWorkingDay}
                    onChange={(e) => handleInputChange("excludeSaturdaysAsWorkingDay", e.target.checked)}
                    disabled={!formValues.aiAdvisorEnabled}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-855 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-650 peer-disabled:opacity-50" />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CARD 5: Upload Configuration */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-all duration-200">
          <div className="p-5 border-b dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <HardDrive className="h-5.5 w-5.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                  Upload Configuration
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Attachment upload size constraints and storage limits.
                </p>
              </div>
            </div>
            <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900 border-amber-250 text-[10px] font-extrabold uppercase">
              🔵 {formValues.maxUploadMb} MB Max
            </Badge>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Field: maxUploadMb */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-250">
                  Maximum Upload Size
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Recommended: 15 MB
                </Badge>
              </div>
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="maxUploadMb"
                  value={formValues.maxUploadMb}
                  onChange={(e) => handleInputChange("maxUploadMb", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-11 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 focus-visible:ring-1 focus-visible:ring-slate-400"
                />
                <div className="h-11 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.maxUploadMb.unit}
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.maxUploadMb.explanation} Status: <span className="font-bold text-emerald-650 dark:text-emerald-400">🟢 Payload Active ({formValues.maxUploadMb} MB)</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 6: Privacy & Security */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-all duration-200">
          <div className="p-5 border-b dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-rose-50 dark:bg-rose-950 flex items-center justify-center shrink-0">
                <EyeOff className="h-5.5 w-5.5 text-rose-600 dark:text-rose-455" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                  Privacy & Security
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Access controls, encryption policies, and security defaults.
                </p>
              </div>
            </div>
            <Badge className={cn("text-[10px] font-extrabold uppercase border", formValues.documentsPrivateByDefault ? "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400" : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-900/25")}>
              {formValues.documentsPrivateByDefault ? "🔒 Privacy Strict" : "🔓 Public Default"}
            </Badge>
          </div>
          <CardContent className="p-6 space-y-6">
            {/* Switch: Keep documents private */}
            <div className="space-y-1">
              <div className="flex items-center justify-between group">
                <div className="flex flex-col pr-6 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                    Private Documents
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal mt-0.5">
                    {METAS.documentsPrivateByDefault.explanation}
                  </span>
                </div>
                <label className="relative inline-flex items-center shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    name="documentsPrivateByDefault"
                    checked={formValues.documentsPrivateByDefault}
                    onChange={(e) => handleInputChange("documentsPrivateByDefault", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-855 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-655" />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal mt-3 pl-1">
                Status: <span className={formValues.documentsPrivateByDefault ? "text-amber-600 dark:text-amber-400 font-bold" : "text-slate-550 font-bold"}>
                  {formValues.documentsPrivateByDefault ? "🔒 Restricted Access Enabled" : "🔓 Unrestricted Access Allowed"}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
