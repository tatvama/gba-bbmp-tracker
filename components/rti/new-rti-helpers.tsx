"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/lib/i18n/client";

export function NewRtiIntro() {
  const [expanded, setExpanded] = React.useState(false);
  const { t } = useTranslation("rti");

  return (
    <div className="border-b border-slate-200/60 dark:border-slate-800/80 pb-3">
      <h1 className="text-2xl sm:text-2.5xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
        {t("page.createTitle")}
      </h1>

      {/* Mobile view description (concise with toggle) */}
      <div className="md:hidden mt-1.5">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          {t("form.introMobileShort")}
        </p>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary font-bold flex items-center gap-1 mt-1 hover:underline cursor-pointer h-9 px-1 -ml-1"
        >
          {expanded ? t("form.showLess") : t("form.learnMore")}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border dark:border-slate-800"
            >
              {t("form.introExpandedNote")}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop view description (static full version) */}
      <p className="hidden md:block text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1.5 max-w-3xl font-medium">
        {t("form.introDesktopIntro")} {t("form.introExpandedNote")}
      </p>
    </div>
  );
}

export function NewRtiStepper() {
  const { t } = useTranslation("rti");
  return (
    <>
      {/* Mobile progress indicator: Steps height reduced by at least 40% */}
      <div className="md:hidden flex items-center justify-between no-print border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-3 shadow-3xs text-xs">
        <div className="flex flex-col gap-0.5 select-none">
          <span className="font-bold text-slate-800 dark:text-slate-200">{t("form.stepOfTotal", { current: 1, total: 4 })}</span>
          <span className="text-[10px] text-primary font-bold uppercase tracking-wider">{t("form.stepBasicInformation")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-7 rounded bg-primary" />
          <span className="h-1.5 w-7 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50" />
          <span className="h-1.5 w-7 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50" />
          <span className="h-1.5 w-7 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50" />
        </div>
      </div>

      {/* Desktop traditional horizontal/vertical layout */}
      <div className="hidden md:block no-print border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4 shadow-3xs">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-2">
          {/* Step 1 */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-xs">
              1
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t("form.stepBasicInformation")}</span>
              <span className="text-[10px] text-primary font-semibold">{t("form.stepStatusActive")}</span>
            </div>
          </div>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">→</span>

          {/* Step 2 */}
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold border dark:border-slate-700">
              2
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{t("form.stepUploadDocuments")}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{t("form.stepStatusPending")}</span>
            </div>
          </div>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">→</span>

          {/* Step 3 */}
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold border dark:border-slate-700">
              3
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{t("verification.title")}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{t("form.stepStatusPending")}</span>
            </div>
          </div>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">→</span>

          {/* Step 4 */}
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold border dark:border-slate-700">
              4
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{t("form.stepRtiTracking")}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{t("form.stepStatusPending")}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
