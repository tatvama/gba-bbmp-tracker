import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ReplyAnalyzer } from "@/components/rti/reply-analyzer";
import { getRti } from "@/lib/queries";
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

  return (
    <div className="mx-auto max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/rti/${id}`}><ArrowLeft className="h-4 w-4" /> Back to RTI</Link>
      </Button>
      <PageHeader
        title="Reply analyzer"
        description="Paste the PIO's reply to check, question-by-question, whether each was answered — and get suggested first-appeal grounds."
      />
      <ReplyAnalyzer rti={rti} aiConfigured={isAiConfigured()} />
    </div>
  );
}
