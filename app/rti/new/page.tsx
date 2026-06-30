import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { RtiBulkImport } from "@/components/rti/rti-bulk-import";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
import { Scale, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "New RTI" };

export default async function NewRtiPage() {
  const user = await getSessionUser();
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="New RTI" />
        <EmptyState
          title="Not permitted"
          description="Your role cannot create RTIs. Ask an admin for the RTI Manager or Editor role."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-200/60 dark:border-slate-800/80 pb-4">
        <h1 className="text-2.5xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
          New RTI Application
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-405 leading-relaxed mt-1.5 max-w-3xl">
          Create a new RTI record to begin tracking the complete RTI lifecycle.
          After saving, you will upload the RTI Application and Filing Acknowledgement.
          The statutory reply countdown begins once the acknowledgement is confirmed.
        </p>
      </div>

      {/* 1. PROGRESS STEPPER */}
      <div className="no-print border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4 shadow-3xs">
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

      {/* Grid layout (Form + Side Info Panel) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RtiBulkImport />
        </div>
        <div className="lg:col-span-1">
          {/* 9. SIDE INFORMATION PANEL (Desktop/Tablet) */}
          <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs rounded-xl overflow-hidden h-fit">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <Scale className="h-4.5 w-4.5 text-primary shrink-0" />
                <h4 className="font-bold text-sm text-slate-850 dark:text-slate-100">RTI Lifecycle</h4>
              </div>
              <div className="relative pl-5 space-y-4 text-xs font-medium text-slate-600 dark:text-slate-405">
                {/* Timeline Line */}
                <div className="absolute left-[7px] top-1.5 bottom-1.5 w-0.5 bg-slate-100 dark:bg-slate-800" />

                {/* Step: Draft */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-primary dark:border-slate-900">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  </div>
                  <span className="font-bold text-primary">Draft (Form Saved)</span>
                </div>

                {/* Step: Acknowledgement Uploaded */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </div>
                  <span>Acknowledgement Uploaded</span>
                </div>

                {/* Step: Reply Countdown Starts */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </div>
                  <span>Reply Countdown Starts</span>
                </div>

                {/* Step: PIO Reply */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </div>
                  <span>PIO Reply</span>
                </div>

                {/* Step: First Appeal */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </div>
                  <span>First Appeal (if required)</span>
                </div>

                {/* Step: FAA Order */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </div>
                  <span>FAA Order</span>
                </div>

                {/* Step: Second Appeal */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </div>
                  <span>Second Appeal (if required)</span>
                </div>

                {/* Step: Case Closed */}
                <div className="relative flex items-center gap-3">
                  <div className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  </div>
                  <span>Case Closed</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
