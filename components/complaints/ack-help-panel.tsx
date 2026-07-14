"use client";

import * as React from "react";
import { Sparkles, HelpCircle, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/client";

export function AckHelpPanel() {
  const { t } = useTranslation("complaints");
  const [open, setOpen] = React.useState(true);

  const steps = [
    { title: t("advanced.ack.helpStep1Title"), desc: t("advanced.ack.helpStep1Desc") },
    { title: t("advanced.ack.helpStep2Title"), desc: t("advanced.ack.helpStep2Desc") },
    { title: t("advanced.ack.helpStep3Title"), desc: t("advanced.ack.helpStep3Desc") },
    { title: t("advanced.ack.helpStep4Title"), desc: t("advanced.ack.helpStep4Desc") },
    { title: t("advanced.ack.helpStep5Title"), desc: t("advanced.ack.helpStep5Desc") },
  ];

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-850 dark:bg-slate-900 shadow-3xs overflow-hidden rounded-2xl select-none transition-all duration-200">
      <button
        type="button"
        className="flex w-full items-center justify-between border-b border-slate-100 dark:border-slate-850 px-4.5 py-3.5 bg-slate-50/50 dark:bg-slate-950/20 text-left cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-350">
          <HelpCircle className="h-4.5 w-4.5 text-primary shrink-0" />
          {t("advanced.ack.helpPanelTitle")}
        </span>
        <div className="rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 p-1 text-slate-455 dark:text-slate-500">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <CardContent className="p-4.5 space-y-4 text-xs leading-relaxed text-slate-655 dark:text-slate-400">
          <div className="space-y-3.5">
            {steps.map((step, idx) => (
              <div key={idx} className="flex gap-3 items-start group">
                <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-955/20 text-emerald-600 dark:text-emerald-500 border border-emerald-100 dark:border-emerald-900/30 group-hover:scale-105 transition-transform duration-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-800 dark:text-slate-205 text-[11.5px] leading-tight">{step.title}</p>
                  <p className="mt-1 text-[10.5px] text-slate-455 dark:text-slate-500 leading-normal font-medium">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl bg-primary/[0.03] dark:bg-primary/[0.01] p-3.5 border border-primary/10 text-primary">
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] uppercase tracking-wider mb-1">
              <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse" />
              {t("advanced.ack.aiAutocompleteTitle")}
            </div>
            <p className="text-[10.5px] font-semibold leading-relaxed mt-1 text-slate-600 dark:text-slate-400">
              {t("advanced.ack.aiAutocompleteDesc")}
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
