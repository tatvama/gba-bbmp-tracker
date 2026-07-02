import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PrintQueueList } from "@/components/complaints/print-queue-list";
import { listPrintQueueLetters } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Letter print queue" };

/**
 * The physical-letter leg of the complaint cycle: every imported/drafted
 * letter waits here until it's PRINTED (stamped with date/time + user on the
 * case), then the submission (hand/post/RPAD + reference) is recorded on the
 * complaint — and the normal lifecycle continues from there.
 */
export default async function PrintQueuePage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Print queue" />
        <EmptyState title="Not permitted" description="Your role cannot manage complaint letters." />
      </div>
    );
  }

  const letters = await listPrintQueueLetters();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Letter print queue"
        description="Every drafted complaint letter that still needs printing. Print it here — the case is stamped with who printed it and when — then record how it was submitted (hand / post / RPAD) and the cycle continues."
      />
      <PrintQueueList letters={letters} />
    </div>
  );
}
