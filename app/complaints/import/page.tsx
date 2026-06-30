import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SmartUpload } from "@/components/complaints/smart-upload";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload — ZIP or letter" };

export default async function ComplaintUploadPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Upload" />
        <EmptyState title="Not permitted" description="Your role cannot upload or import complaints." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Upload a ZIP or a letter"
        description="One place to start a complaint. Drop a forensic-audit ZIP (one folder per job code) or a single complaint letter/PDF — it auto-detects which and runs the right task."
      />
      {!isAiConfigured() && (
        <p className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-amber-400">
          AI is not configured on the server. ZIP folders that already contain the forensic JSON import fully; a letter
          (or a ZIP folder with no JSON) needs AI to read it — without a key, the case is created and you fill details manually.
        </p>
      )}
      <Suspense fallback={null}>
        <SmartUpload />
      </Suspense>
    </div>
  );
}
