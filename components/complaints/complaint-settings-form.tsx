"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Binary, Calendar, Languages, Brain, EyeOff, HardDrive, Info, RefreshCw, Save, Check, AlertCircle, Sparkles
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
    defaultVal: "18 Days",
    explanation: "Days with no reply before the advisor recommends generating a reminder letter."
  },
  aiAdvisorEscalationSlaDays: {
    label: "Escalation SLA",
    unit: "Days",
    defaultVal: "10 Days",
    explanation: "Days after a reminder is generated, still with no reply, before the advisor recommends escalation."
  },
};

export function ComplaintSettingsForm({ initial }: { initial: ComplaintSettings }) {
  const [state, action, pending] = useActionState(updateComplaintSettings, {} as ActionState);
  const [formValues, setFormValues] = React.useState<ComplaintSettings>({ ...initial });
  const [activeHelp, setActiveHelp] = React.useState<string | null>(null);

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
    setActiveHelp(null);
  };

  const renderTooltip = (key: keyof ComplaintSettings) => {
    if (activeHelp !== key) return null;
    const meta = METAS[key];
    return (
      <div className="mt-1 p-2.5 rounded-lg bg-blue-50/45 dark:bg-blue-950/20 text-xs text-blue-800 dark:text-blue-300 leading-normal border border-blue-105/40 dark:border-blue-900/30 animate-in fade-in duration-200">
        <p className="font-semibold mb-0.5">{meta.explanation}</p>
        {meta.example && <p className="text-[11px] text-blue-600 dark:text-blue-400 font-mono mt-0.5">{meta.example}</p>}
      </div>
    );
  };

  return (
    <form action={action} className="space-y-6 pb-20">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SECTION 1: Complaint Number Prefix & Start Sequence */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
              <Binary className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                Complaint Number Indexing
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Case number prefix and sequence configurations
              </p>
            </div>
          </div>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Case Prefix
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "caseNumberPrefix" ? null : "caseNumberPrefix")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.caseNumberPrefix.defaultVal}
                </Badge>
              </div>
              {renderTooltip("caseNumberPrefix")}
              <Input
                name="caseNumberPrefix"
                value={formValues.caseNumberPrefix}
                onChange={(e) => handleInputChange("caseNumberPrefix", e.target.value)}
                list="prefixes"
                className="h-10 text-sm font-semibold border-slate-200 dark:border-slate-800"
              />
              <datalist id="prefixes">
                {CASE_NUMBER_PREFIXES.map((p) => (
                  <option key={p} value={p === "CUSTOM" ? "" : p} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Starting Sequence
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "startingSequence" ? null : "startingSequence")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.startingSequence.defaultVal}
                </Badge>
              </div>
              {renderTooltip("startingSequence")}
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="startingSequence"
                  value={formValues.startingSequence}
                  onChange={(e) => handleInputChange("startingSequence", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.startingSequence.unit}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: Workflow Rules */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                Workflow Timeline Rules
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Reminders and inspection verification triggers
              </p>
            </div>
          </div>
          <CardContent className="p-4 space-y-4">
            {/* Field: followUpDaysAfterFiling */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Follow-up After Filing
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "followUpDaysAfterFiling" ? null : "followUpDaysAfterFiling")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.followUpDaysAfterFiling.defaultVal}
                </Badge>
              </div>
              {renderTooltip("followUpDaysAfterFiling")}
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="followUpDaysAfterFiling"
                  value={formValues.followUpDaysAfterFiling}
                  onChange={(e) => handleInputChange("followUpDaysAfterFiling", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.followUpDaysAfterFiling.unit}
                </div>
              </div>
            </div>

            {/* Field: followUpDaysAfterReply */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Follow-up After Reply
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "followUpDaysAfterReply" ? null : "followUpDaysAfterReply")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.followUpDaysAfterReply.defaultVal}
                </Badge>
              </div>
              {renderTooltip("followUpDaysAfterReply")}
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="followUpDaysAfterReply"
                  value={formValues.followUpDaysAfterReply}
                  onChange={(e) => handleInputChange("followUpDaysAfterReply", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.followUpDaysAfterReply.unit}
                </div>
              </div>
            </div>

            {/* Field: siteVerificationDaysAfterAction */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Verification Days
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "siteVerificationDaysAfterAction" ? null : "siteVerificationDaysAfterAction")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.siteVerificationDaysAfterAction.defaultVal}
                </Badge>
              </div>
              {renderTooltip("siteVerificationDaysAfterAction")}
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="siteVerificationDaysAfterAction"
                  value={formValues.siteVerificationDaysAfterAction}
                  onChange={(e) => handleInputChange("siteVerificationDaysAfterAction", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.siteVerificationDaysAfterAction.unit}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3: OCR Language & Autostart */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center shrink-0">
              <Languages className="h-5 w-5 text-violet-605 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                OCR Configuration
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                OCR scanning language and automation configs
              </p>
            </div>
          </div>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  OCR Language
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "ocrLanguage" ? null : "ocrLanguage")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Recommended: English + Kannada
                </Badge>
              </div>
              {renderTooltip("ocrLanguage")}
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
            </div>

            {/* Switch: Run OCR Automatically */}
            <div className="space-y-1">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                <div className="flex flex-col gap-1 pr-4 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-205 flex items-center gap-1.5">
                    Run OCR Automatically
                    <button
                      type="button"
                      onClick={() => setActiveHelp(activeHelp === "ocrAutoRun" ? null : "ocrAutoRun")}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                      aria-label="Info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="text-[10px] text-slate-450 dark:text-slate-400 leading-normal">
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
              {renderTooltip("ocrAutoRun")}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4: AI summary configs */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-pink-50 dark:bg-pink-950 flex items-center justify-center shrink-0">
              <Brain className="h-5 w-5 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                AI Configuration
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                AI-driven analysis and summary parameters
              </p>
            </div>
          </div>
          <CardContent className="p-4 space-y-4">
            {/* Switch: Generate AI Summary */}
            <div className="space-y-1">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                <div className="flex flex-col gap-1 pr-4 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-205 flex items-center gap-1.5">
                    Generate AI Summary
                    <button
                      type="button"
                      onClick={() => setActiveHelp(activeHelp === "aiAutoSummary" ? null : "aiAutoSummary")}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                      aria-label="Info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="text-[10px] text-slate-450 dark:text-slate-400 leading-normal">
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
              {renderTooltip("aiAutoSummary")}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 5: Privacy Defaults */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-rose-50 dark:bg-rose-950 flex items-center justify-center shrink-0">
              <EyeOff className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                Privacy Configurations
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Access controls and security defaults
              </p>
            </div>
          </div>
          <CardContent className="p-4 space-y-4">
            {/* Switch: Keep documents private */}
            <div className="space-y-1">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                <div className="flex flex-col gap-1 pr-4 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-205 flex items-center gap-1.5">
                    Private Documents
                    <button
                      type="button"
                      onClick={() => setActiveHelp(activeHelp === "documentsPrivateByDefault" ? null : "documentsPrivateByDefault")}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                      aria-label="Info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="text-[10px] text-slate-450 dark:text-slate-400 leading-normal">
                    Initial privacy settings status on new document copy uploads.
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
              {renderTooltip("documentsPrivateByDefault")}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 6: Upload Configurations */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center shrink-0">
              <HardDrive className="h-5 w-5 text-amber-600 dark:text-amber-450" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                Upload Configurations
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Attachment payload limits and memory restrictions
              </p>
            </div>
          </div>
          <CardContent className="p-4 space-y-4">
            {/* Field: maxUploadMb */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Maximum Upload Size
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "maxUploadMb" ? null : "maxUploadMb")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Recommended: 15 MB
                </Badge>
              </div>
              {renderTooltip("maxUploadMb")}
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="maxUploadMb"
                  value={formValues.maxUploadMb}
                  onChange={(e) => handleInputChange("maxUploadMb", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.maxUploadMb.unit}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 7: AI Advisor */}
        <Card className="border border-slate-200 dark:border-slate-850 shadow-2xs rounded-xl">
          <div className="p-4 border-b dark:border-slate-850 flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-850 dark:text-slate-200 leading-tight">
                AI Advisor Configuration
              </h2>
              <p className="text-[11px] text-slate-450 dark:text-slate-400">
                Background health scoring, recommendations and reminder/escalation SLAs
              </p>
            </div>
          </div>
          <CardContent className="p-4 space-y-4">
            {/* Switch: Enable AI Advisor */}
            <div className="space-y-1">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10 group">
                <div className="flex flex-col gap-1 pr-4 min-w-0">
                  <span className="text-xs font-bold text-slate-850 dark:text-slate-205 flex items-center gap-1.5">
                    AI Advisor
                    <button
                      type="button"
                      onClick={() => setActiveHelp(activeHelp === "aiAdvisorEnabled" ? null : "aiAdvisorEnabled")}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                      aria-label="Info"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="text-[10px] text-slate-450 dark:text-slate-400 leading-normal">
                    Analyses every complaint in the background and surfaces recommendations. Advisory only — never sends anything automatically.
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
              {renderTooltip("aiAdvisorEnabled")}
            </div>

            {/* Field: aiAdvisorReminderSlaDays */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Reminder SLA
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "aiAdvisorReminderSlaDays" ? null : "aiAdvisorReminderSlaDays")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.aiAdvisorReminderSlaDays.defaultVal}
                </Badge>
              </div>
              {renderTooltip("aiAdvisorReminderSlaDays")}
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="aiAdvisorReminderSlaDays"
                  value={formValues.aiAdvisorReminderSlaDays}
                  onChange={(e) => handleInputChange("aiAdvisorReminderSlaDays", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.aiAdvisorReminderSlaDays.unit}
                </div>
              </div>
            </div>

            {/* Field: aiAdvisorEscalationSlaDays */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-bold text-slate-805 dark:text-slate-205 flex items-center gap-1.5">
                  Escalation SLA
                  <button
                    type="button"
                    onClick={() => setActiveHelp(activeHelp === "aiAdvisorEscalationSlaDays" ? null : "aiAdvisorEscalationSlaDays")}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 cursor-pointer"
                    aria-label="Info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </Label>
                <Badge variant="muted" className="text-[10px] py-0 px-2 font-mono text-slate-500">
                  Default: {METAS.aiAdvisorEscalationSlaDays.defaultVal}
                </Badge>
              </div>
              {renderTooltip("aiAdvisorEscalationSlaDays")}
              <div className="relative rounded-lg overflow-hidden flex shadow-2xs">
                <Input
                  type="number"
                  min={1}
                  name="aiAdvisorEscalationSlaDays"
                  value={formValues.aiAdvisorEscalationSlaDays}
                  onChange={(e) => handleInputChange("aiAdvisorEscalationSlaDays", parseInt(e.target.value, 10))}
                  required
                  className="flex-1 h-10 pr-12 text-sm font-semibold rounded-r-none border-slate-200 dark:border-slate-800"
                />
                <div className="h-10 px-3 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-bold flex items-center border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-lg">
                  {METAS.aiAdvisorEscalationSlaDays.unit}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* STICKY SAVE CHANGES ACTION BAR */}
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
