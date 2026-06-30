import { redirect } from "next/navigation";

// Merged into the unified upload — a single entry auto-detects ZIP vs letter.
export default function ComplaintIntakeRedirect() {
  redirect("/complaints/import");
}
