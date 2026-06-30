import { redirect } from "next/navigation";

// BBMP Portal Import (live IFMS download) removed from the flow — uploads now go
// through the unified ZIP/letter upload.
export default function PortalImportRedirect() {
  redirect("/complaints/import");
}
