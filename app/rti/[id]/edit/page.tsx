import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RtiForm } from "@/components/rti/rti-form";
import { getRti, getRtiFormOptions, listKnownJobCodes } from "@/lib/queries";
import { updateRti } from "@/lib/actions/rti";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit RTI" };

export default async function EditRtiPage({
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
        <PageHeader title={t("page.editTitle")} />
        <EmptyState title={t("form.notPermittedTitle")} description={t("form.notPermittedEditRti")} />
      </div>
    );
  }

  const [rti, options, jobCodes] = await Promise.all([getRti(id), getRtiFormOptions(), listKnownJobCodes()]);
  if (!rti) notFound();

  const action = updateRti.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("page.editTitle")} description={rti.internal_ref ?? rti.subject} />
      <RtiForm action={action} options={options} initial={rti} jobCodes={jobCodes} />
    </div>
  );
}
