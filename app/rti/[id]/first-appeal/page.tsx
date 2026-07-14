import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { FirstAppealForm } from "@/components/rti/first-appeal-form";
import { getRti } from "@/lib/queries";
import { createFirstAppeal } from "@/lib/actions/rti";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "First appeal" };

export default async function FirstAppealPage({
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
        <PageHeader title={t("page.firstAppealTitle")} />
        <EmptyState title={t("form.notPermittedTitle")} description={t("form.notPermittedDraftAppeal")} />
      </div>
    );
  }

  const rti = await getRti(id);
  if (!rti) notFound();
  const action = createFirstAppeal.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/rti/${id}`}><ArrowLeft className="h-4 w-4" /> {t("form.backToRti")}</Link>
      </Button>
      <PageHeader
        title={t("form.firstAppealPageTitle")}
        description={t("form.forSubject", { subject: rti.subject })}
      />
      <FirstAppealForm rti={rti} action={action} aiConfigured={isAiConfigured()} />
    </div>
  );
}
