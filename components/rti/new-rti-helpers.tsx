"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function NewRtiIntro() {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border-b border-slate-200/60 dark:border-slate-800/80 pb-3">
      <h1 className="text-2xl sm:text-2.5xl font-extrabold text-slate-900 dark:text-slate-55 tracking-tight">
        New RTI Application
      </h1>
      
      {/* Mobile view description (concise with toggle) */}
      <div className="md:hidden mt-1.5">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          Create a new RTI record to track the application lifecycle.
        </p>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary font-bold flex items-center gap-1 mt-1 hover:underline cursor-pointer h-9 px-1 -ml-1"
        >
          {expanded ? "Show Less" : "Learn More"}
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
              After saving, you will upload the RTI Application and Filing Acknowledgement.
              The statutory reply countdown begins once the acknowledgement is confirmed.
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop view description (static full version) */}
      <p className="hidden md:block text-xs text-slate-500 dark:text-slate-405 leading-relaxed mt-1.5 max-w-3xl font-medium">
        Create a new RTI record to begin tracking the complete RTI lifecycle.
        After saving, you will upload the RTI Application and Filing Acknowledgement.
        The statutory reply countdown begins once the acknowledgement is confirmed.
      </p>
    </div>
  );
}

export function NewRtiStepper() {
  return (
    <>
      {/* Mobile progress indicator: Steps height reduced by at least 40% */}
      <div className="md:hidden flex items-center justify-between no-print border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-3 shadow-3xs text-xs">
        <div className="flex flex-col gap-0.5 select-none">
          <span className="font-bold text-slate-800 dark:text-slate-200">Step 1 of 4</span>
          <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Basic Information</span>
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
              <span className="text-xs font-bold text-slate-850 dark:text-slate-200">Basic Information</span>
              <span className="text-[10px] text-primary font-semibold">Active</span>
            </div>
          </div>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">→</span>

          {/* Step 2 */}
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-400 text-xs font-bold border dark:border-slate-700">
              2
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-650 dark:text-slate-400">Upload Documents</span>
              <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">Pending</span>
            </div>
          </div>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">→</span>

          {/* Step 3 */}
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-400 text-xs font-bold border dark:border-slate-700">
              3
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-650 dark:text-slate-400">Verification</span>
              <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">Pending</span>
            </div>
          </div>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">→</span>

          {/* Step 4 */}
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-400 text-xs font-bold border dark:border-slate-700">
              4
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-650 dark:text-slate-400">RTI Tracking</span>
              <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">Pending</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
