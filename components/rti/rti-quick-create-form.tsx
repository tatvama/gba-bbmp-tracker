"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  FileText,
  Building2,
  Folder,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RTI_CATEGORIES, PRIORITIES } from "@/lib/constants";
import { createRti } from "@/lib/actions/rti";
import type { ActionState } from "@/lib/actions/contacts";
import { cn } from "@/lib/utils";

const selectCls =
  "flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-2xs hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900/50 cursor-pointer transition-all duration-150";

export function RtiQuickCreateForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createRti,
    {} as ActionState,
  );

  React.useEffect(() => {
    if (state?.success && state.id) router.push(`/rti/${state.id}`);
  }, [state, router]);

  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
      <CardContent className="p-6">
        <form action={formAction} className="space-y-6">
          {state?.error && (
            <p className="rounded-lg border border-rose-250/30 bg-rose-50/10 p-3.5 text-sm text-rose-600 dark:text-rose-400">
              {state.error}
            </p>
          )}

          {/* 7. REFERENCE NUMBER PREVIEW */}
          <div className="p-3.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/30 dark:border-slate-800 dark:bg-slate-950/30">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Reference Number
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                RTI-2026-XXXXX
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-550 italic">
                Generated automatically after saving
              </span>
            </div>
          </div>

          {/* SECTION 1: BASIC INFORMATION */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
              1. Basic Information
            </h3>

            {/* Subject / Title */}
            <div className="space-y-1.5">
              <Label
                htmlFor="subject"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-750 dark:text-slate-300"
              >
                <FileText className="h-3.5 w-3.5 text-slate-405" />
                Subject / Title <span className="text-rose-500 font-bold">*</span>
              </Label>
              <Input
                id="subject"
                name="subject"
                required
                minLength={3}
                placeholder="e.g. Road work bills for Jayanagar 4th Block"
                className="h-11 px-3.5 rounded-lg bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 focus-visible:ring-primary placeholder:text-slate-400 dark:placeholder:text-slate-600"
              />
              {state?.fieldErrors?.subject && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-1">
                  {state.fieldErrors.subject}
                </p>
              )}
            </div>

            {/* Public Authority */}
            <div className="space-y-1.5">
              <Label
                htmlFor="publicAuthority"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-750 dark:text-slate-300"
              >
                <Building2 className="h-3.5 w-3.5 text-slate-405" />
                Public Authority{" "}
                <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                  (Optional)
                </span>
              </Label>
              <Input
                id="publicAuthority"
                name="publicAuthority"
                placeholder="e.g. BBMP South Zone — PIO, Engineering"
                className="h-11 px-3.5 rounded-lg bg-white dark:bg-slate-955 border-slate-200 dark:border-slate-850 focus-visible:ring-primary placeholder:text-slate-400 dark:placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* SECTION 2: REQUEST DETAILS */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
              2. Request Details
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Category */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="category"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-750 dark:text-slate-300"
                >
                  <Folder className="h-3.5 w-3.5 text-slate-405" />
                  Category{" "}
                  <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                    (Optional)
                  </span>
                </Label>
                <select
                  id="category"
                  name="category"
                  className={selectCls}
                  defaultValue=""
                >
                  <option value="">— Select —</option>
                  {RTI_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="priority"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-750 dark:text-slate-300"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-slate-405" />
                  Priority
                </Label>
                <select
                  id="priority"
                  name="priority"
                  className={selectCls}
                  defaultValue="Medium"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 3: NEXT STEP INFO CARD */}
          <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/20 dark:border-slate-800/80 dark:bg-slate-950/20 space-y-2.5">
            <h5 className="text-xs font-bold text-blue-800 dark:text-blue-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Next Step
            </h5>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              After creating this RTI, you will upload:
            </p>
            <ul className="text-xs text-slate-650 dark:text-slate-400 space-y-1 pl-1 font-semibold">
              <li className="flex items-center gap-1.5">
                <span className="text-blue-500 font-bold text-xs">✔</span> RTI Application
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-blue-500 font-bold text-xs">✔</span> Filing Acknowledgement
              </li>
            </ul>
            <p className="text-[10px] text-slate-450 dark:text-slate-500 leading-normal italic pt-2 border-t border-blue-100/40 dark:border-slate-800/40">
              The 30-day statutory reply countdown begins only after acknowledgement confirmation.
            </p>
          </div>

          <input type="hidden" name="status" value="Draft" />
          <input type="hidden" name="wardType" value="BBMP" />

          {/* 8. FOOTER PANEL / CTA SECTION */}
          <div className="border-t border-slate-150 dark:border-slate-800/85 pt-5 mt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-500 dark:text-slate-405 max-w-md">
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                  RTI Creation
                </p>
                Once this RTI is created, you will immediately upload the RTI Application &amp; Filing Acknowledgement.
              </div>
              <div className="shrink-0">
                <Button
                  type="submit"
                  disabled={pending}
                  className="w-full sm:w-auto px-5 h-10 font-bold shadow-xs rounded-lg"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                  Create RTI &amp; Continue
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center sm:text-left select-none">
              You can edit these details later from the RTI Details page.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
