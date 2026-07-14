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
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI reply analyzer" };

export default async function AnalyzePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  const { t } = await getTranslations("rti");
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title={t("form.replyAnalyzerTitle")} />
        <EmptyState title={t("form.notPermittedTitle")} description={t("form.notPermittedAnalyzer")} />
      </div>
    );
  }

  const rti = await getRti(id);
  if (!rti) notFound();

  const docs = await listRtiDocuments(id);
  const applicationDoc = docs.find((d) => d.doc_type === "Application") ?? null;

  const applicationText = applicationDoc?.ocr_text?.trim() || rti.info_requested?.trim() || "";
  const applicationSource = applicationDoc
    ? t("form.applicationDocumentSource", { pageCount: applicationDoc.page_count })
    : rti.info_requested
      ? t("form.infoRequestedFieldSource")
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
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 no-print">
        <Link href={`/rti/${id}`}><ArrowLeft className="h-4 w-4" /> {t("form.backToRti")}</Link>
      </Button>
      <ReplyAnalyzer
        rtiId={id}
        rti={rti}
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
