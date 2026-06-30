import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ForensicZipImport } from "@/components/forensic/forensic-zip-import";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forensic ZIP Import" };

export default async function ForensicImportPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Forensic ZIP Import" />
        <EmptyState title="Not permitted" description="Your role cannot import forensic audit packets." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Forensic ZIP Import"
        description="Upload the ZIP from the forensic-audit skill (one folder per job code) to create a complaint per job, with the drafted letter and forensic findings attached."
      />
      {!isAiConfigured() && (
        <p className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-amber-400">
          AI is not configured on the server. Folders that already contain the forensic JSON import fully; folders with
          only a letter (no JSON) will be created without auto-extracted details — add them manually.
        </p>
      )}
      <Suspense fallback={null}>
        <ForensicZipImport />
      </Suspense>
    </div>
  );
}
