import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { ForensicMap } from "@/components/map/forensic-map";
import { getForensicMapPoints } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { MapPin } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint Map" };

export default async function ComplaintMapPage() {
  const { t } = await getTranslations("complaints");
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title={t("list.map.title")} />
        <EmptyState title={t("list.notPermittedTitle")} description={t("list.map.notPermittedDescription")} />
      </div>
    );
  }

  const points = await getForensicMapPoints();
  const offSite = points.filter((p) => p.kind === "photo" && p.flag === "far").length;

  return (
    <div>
      <PageHeader
        title={t("list.map.mainTitle")}
        description={t("list.map.mainDescription")}
        badge={offSite > 0 ? <Badge variant="destructive">{t("list.map.offSiteBadge", { count: offSite, plural: offSite === 1 ? "" : "s" })}</Badge> : undefined}
      />
      {points.length === 0 ? (
        <EmptyState icon={MapPin} title={t("list.map.noMappedTitle")} description={t("list.map.noMappedDescription")} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#3A6EA5" }} /> {t("list.map.legendComplaint")}</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#1F7A6E" }} /> {t("list.map.legendPhotoOnSite")}</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#C04A4A" }} /> {t("list.map.legendPhotoOffSite")}</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#E0922F" }} /> {t("list.map.legendPhotoNoRef")}</span>
          </div>
          <ForensicMap points={points} />
        </>
      )}
    </div>
  );
}
