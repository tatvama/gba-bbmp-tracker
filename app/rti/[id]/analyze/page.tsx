import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ReplyAnalyzer } from "@/components/rti/reply-analyzer";
import { getRti, listRtiDocuments } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI reply analyzer" };

export default async function AnalyzePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="Reply analyzer" />
        <EmptyState title="Not permitted" description="Your role cannot use the analyzer." />
      </div>
    );
  }

  const rti = await getRti(id);
  if (!rti) notFound();

  const docs = await listRtiDocuments(id);
  const applicationDoc = docs.find((d) => d.doc_type === "Application") ?? null;

  const applicationText = applicationDoc?.ocr_text?.trim() || rti.info_requested?.trim() || "";
  const applicationSource = applicationDoc
    ? `Application document (${applicationDoc.page_count} pg)`
    : rti.info_requested
      ? "RTI “information requested” field"
      : null;

  // Response documents = everything except Application / Acknowledgement, grouped by type.
  const RESPONSE_TYPES = ["Reply", "FAA Order", "Second Appeal Order", "Higher Appeal Order", "Other"] as const;
  const responseTextByType: Record<string, string> = {};
  const responseCounts: Record<string, number> = {};
  for (const t of RESPONSE_TYPES) {
    const ds = docs.filter((d) => d.doc_type === t);
    responseCounts[t] = ds.length;
    responseTextByType[t] = ds
      .map((d) => d.ocr_text ?? "")
      .filter((s) => s.trim())
      .join("\n\n--- next document ---\n\n")
      .trim();
  }
  // Fall back to the recorded reply summary for the Reply stage.
  if (!responseTextByType["Reply"] && rti.reply_summary?.trim()) {
    responseTextByType["Reply"] = rti.reply_summary.trim();
  }

  // Default to the most advanced stage that has a document.
  const present = RESPONSE_TYPES.filter((t) => responseTextByType[t]);
  const defaultType = present.length ? present[present.length - 1]! : "Reply";

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/rti/${id}`}><ArrowLeft className="h-4 w-4" /> Back to RTI</Link>
      </Button>
      <PageHeader
        title="Response analyzer"
        description="Compares your RTI application against a response document — PIO reply, FAA order, or Information Commission order — point by point, and recommends the next escalation."
      />
      <ReplyAnalyzer
        rtiId={id}
        aiConfigured={isAiConfigured()}
        applicationText={applicationText}
        applicationSource={applicationSource}
        responseTextByType={responseTextByType}
        responseCounts={responseCounts}
        defaultType={defaultType}
      />
    </div>
  );
}
