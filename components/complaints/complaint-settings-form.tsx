"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  Binary, Calendar, Languages, Brain, EyeOff, HardDrive, RefreshCw, Save, Check, AlertCircle, Sparkles, ChevronRight
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

const selectCls = "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-800 dark:bg-slate-900";

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
    explanation: "Runs the AI Complaint Advisor in the background after every complaint update, surfacing health scores and recommendations. Turn off to disable all automatic analysis."
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
    <form action={action} className="space-y-6 pb-20 select-none">
      {/* Sticky Action Toolbar & Breadcrumbs */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur py-4 border-b border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between -mx-4 px-4 md:-mx-6 md:px-6">
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

      {/* Configuration Summary Bar */}
      <div className="rounded-xl border border-slate-150 bg-slate-50/20 dark:bg-slate-900/10 dark:border-slate-850 p-4 text-xs font-semibold text-slate-600 dark:text-slate-455 flex flex-wrap gap-y-2.5 gap-x-4 items-center shadow-2xs leading-none">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold shrink-0">Current Setup:</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Prefix:</span>
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">{formValues.caseNumberPrefix || "None"}</span>
          </div>
          <span className="text-slate-200 dark:text-slate-800 font-normal">|</span>
          
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">OCR:</span>
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">
              {formValues.ocrLanguage === "eng" ? "English" : formValues.ocrLanguage === "kan" ? "Kannada" : "English + Kannada"}
            </span>
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400">
              {formValues.ocrAutoRun ? "Auto" : "Manual"}
            </span>
          </div>
          <span className="text-slate-200 dark:text-slate-800 font-normal">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">AI Summary:</span>
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md", formValues.aiAutoSummary ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-slate-100 text-slate-600 dark:bg-slate-850 dark:text-slate-400")}>
              {formValues.aiAutoSummary ? "Enabled" : "Disabled"}
            </span>
          </div>
          <span className="text-slate-200 dark:text-slate-800 font-normal">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Follow-up:</span>
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">{formValues.followUpDaysAfterFiling}d / {formValues.followUpDaysAfterReply}d</span>
          </div>
          <span className="text-slate-200 dark:text-slate-800 font-normal">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Verification:</span>
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">{formValues.siteVerificationDaysAfterAction}d</span>
          </div>
          <span className="text-slate-200 dark:text-slate-800 font-normal">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Upload Limit:</span>
            <span className="text-slate-800 dark:text-slate-200 font-extrabold">{formValues.maxUploadMb} MB</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1: General Configuration */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-shadow">
          <div className="p-4.5 border-b dark:border-slate-800 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
              <Binary className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                General Configuration
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Case number prefix and sequence configurations
              </p>
            </div>
          </div>
          <CardContent className="p-4.5 space-y-4">
            {/* Field: caseNumberPrefix */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-850 dark:text-slate-200">
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
                className="h-10 text-sm font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              />
              <datalist id="prefixes">
                {CASE_NUMBER_PREFIXES.map((p) => (
                  <option key={p} value={p === "CUSTOM" ? "" : p} />
                ))}
              </datalist>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.caseNumberPrefix.explanation} {METAS.caseNumberPrefix.example}
              </p>
            </div>

            {/* Field: startingSequence */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-200">
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
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.startingSequence.unit}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.startingSequence.explanation} {METAS.startingSequence.example}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: Upload Configuration */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-shadow">
          <div className="p-4.5 border-b dark:border-slate-800 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center shrink-0">
              <HardDrive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                Upload Configuration
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Attachment payload limits and memory restrictions
              </p>
            </div>
          </div>
          <CardContent className="p-4.5 space-y-4">
            {/* Field: maxUploadMb */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-200">
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
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.maxUploadMb.unit}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.maxUploadMb.explanation} Status: <span className="font-bold text-emerald-600 dark:text-emerald-400">🟢 {formValues.maxUploadMb} MB Limit</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3: Privacy & Security */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-shadow">
          <div className="p-4.5 border-b dark:border-slate-800 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-rose-50 dark:bg-rose-950 flex items-center justify-center shrink-0">
              <EyeOff className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                Privacy & Security
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Access controls and security defaults
              </p>
            </div>
          </div>
          <CardContent className="p-4.5 space-y-4">
            {/* Switch: Keep documents private */}
            <div className="space-y-1">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                <div className="flex flex-col gap-1 pr-4 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                    Private Documents
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                    Initial privacy settings status on new document uploads.
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
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-600" />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.documentsPrivateByDefault.explanation} Status: <span className={formValues.documentsPrivateByDefault ? "text-amber-600 dark:text-amber-400 font-bold" : "text-slate-500 font-bold"}>
                  {formValues.documentsPrivateByDefault ? "🔒 Private by Default" : "🔓 Public by Default"}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4: Workflow Rules */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-shadow">
          <div className="p-4.5 border-b dark:border-slate-800 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                Workflow Rules
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Reminders and inspection verification triggers
              </p>
            </div>
          </div>
          <CardContent className="p-4.5 space-y-4">
            {/* Field: followUpDaysAfterFiling */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-850 dark:text-slate-200">
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
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.followUpDaysAfterFiling.unit}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.followUpDaysAfterFiling.explanation}
              </p>
            </div>

            {/* Field: followUpDaysAfterReply */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-200">
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
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.followUpDaysAfterReply.unit}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.followUpDaysAfterReply.explanation}
              </p>
            </div>

            {/* Field: siteVerificationDaysAfterAction */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-855 dark:text-slate-200">
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
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.siteVerificationDaysAfterAction.unit}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                {METAS.siteVerificationDaysAfterAction.explanation}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 5: OCR & AI Settings */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-2xs rounded-xl hover:shadow-xs transition-shadow lg:col-span-2">
          <div className="p-4.5 border-b dark:border-slate-800 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                OCR & AI Settings
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Configure OCR scanning, AI recaps, and AI Complaint Advisor
              </p>
            </div>
          </div>
          <CardContent className="p-4.5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - OCR */}
              <div className="space-y-5">
                {/* Field: ocrLanguage */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-bold text-slate-855 dark:text-slate-205">
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
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                    {METAS.ocrLanguage.explanation}
                  </p>
                </div>

                {/* Switch: Run OCR Automatically */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                    <div className="flex flex-col gap-1 pr-4 min-w-0">
                      <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                        Run OCR Automatically
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                        Initiates text extraction immediately on new document uploads.
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
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-600" />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                    {METAS.ocrAutoRun.explanation} Status: <span className={formValues.ocrAutoRun ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-slate-500 font-bold"}>
                      {formValues.ocrAutoRun ? "🟢 Automatic" : "🔴 Manual"}
                    </span>
                  </p>
                </div>

                {/* Switch: Generate AI Summary */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                    <div className="flex flex-col gap-1 pr-4 min-w-0">
                      <span className="text-xs font-bold text-slate-850 dark:text-slate-200">
                        Generate AI Summary
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                        Triggers AI recap digest automatically when OCR scanner processing concludes.
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
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-600" />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                    {METAS.aiAutoSummary.explanation} Status: <span className={formValues.aiAutoSummary ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-slate-550 font-bold"}>
                      {formValues.aiAutoSummary ? "🟢 Enabled" : "🔴 Disabled"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Right Column - AI Advisor */}
              <div className="space-y-5">
                {/* Switch: Enable AI Advisor */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                    <div className="flex flex-col gap-1 pr-4 min-w-0">
                      <span className="text-xs font-bold text-slate-855 dark:text-slate-200">
                        AI Advisor
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                        Analyses every complaint in the background and surfaces recommendations.
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
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:bg-slate-200 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-600" />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                    {METAS.aiAdvisorEnabled.explanation} Status: <span className={formValues.aiAdvisorEnabled ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-slate-500 font-bold"}>
                      {formValues.aiAdvisorEnabled ? "🟢 Enabled" : "🔴 Disabled"}
                    </span>
                  </p>
                </div>

                {/* Field: aiAdvisorReminderSlaDays */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-bold text-slate-855 dark:text-slate-200">
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
                      className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    />
                    <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                      {METAS.aiAdvisorReminderSlaDays.unit}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                    {METAS.aiAdvisorReminderSlaDays.explanation}
                  </p>
                </div>

                {/* Field: aiAdvisorEscalationSlaDays */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-bold text-slate-855 dark:text-slate-200">
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
                      className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    />
                    <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                      {METAS.aiAdvisorEscalationSlaDays.unit}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                    {METAS.aiAdvisorEscalationSlaDays.explanation}
                  </p>
                </div>

                {/* Field: aiAdvisorPreReminderSlaDays */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-bold text-slate-855 dark:text-slate-200">
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
                      className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    />
                    <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                      {METAS.aiAdvisorPreReminderSlaDays.unit}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal pl-1">
                    {METAS.aiAdvisorPreReminderSlaDays.explanation}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
