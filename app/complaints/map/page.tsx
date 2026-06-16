import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { ForensicMap } from "@/components/map/forensic-map";
import { getForensicMapPoints } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint Map" };

export default async function ComplaintMapPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Complaint Map" />
        <EmptyState title="Not permitted" description="Your role cannot view the map. Ask an admin for a Field Officer / Complaint Manager / Editor role." />
      </div>
    );
  }

  const points = await getForensicMapPoints();
  const offSite = points.filter((p) => p.kind === "photo" && p.flag === "far").length;

  return (
    <div>
      <PageHeader
        title="Complaint & photo map"
        description="Complaint reported locations and the GPS where each photo was actually taken. Red photo markers are 'off-site' — taken far from the reported work location."
        badge={offSite > 0 ? <Badge variant="destructive">{offSite} off-site photo{offSite === 1 ? "" : "s"}</Badge> : undefined}
      />
      {points.length === 0 ? (
        <EmptyState icon={MapPin} title="No mapped locations yet" description="Complaints need a latitude/longitude, and photos need EXIF GPS, to appear here." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#3A6EA5" }} /> Complaint</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#1F7A6E" }} /> Photo (on-site)</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#C04A4A" }} /> Photo (off-site)</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "#E0922F" }} /> Photo (no reference loc.)</span>
          </div>
          <ForensicMap points={points} />
        </>
      )}
    </div>
  );
}
