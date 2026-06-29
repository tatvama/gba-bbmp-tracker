import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";

const VARIANT: Record<string, BadgeProps["variant"]> = {
  Draft: "muted",
  "Ready to File": "secondary",
  Filed: "secondary",
  "Awaiting Reply": "secondary",
  "Reply Received": "success",
  "Partial Reply": "warning",
  Rejected: "destructive",
  "No Reply": "destructive",
  "First Appeal Drafted": "warning",
  "First Appeal Filed": "warning",
  "FAA Order Received": "success",
  "Second Appeal Drafted": "warning",
  "Second Appeal Filed": "warning",
  "Complaint Filed": "destructive",
  Closed: "muted",
};

export function RtiStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={VARIANT[status] ?? "outline"}
      className="text-[11px] px-2.5 h-6 rounded-md font-semibold tracking-wide select-none inline-flex items-center gap-1.5 leading-none"
      dot
    >
      {status}
    </Badge>
  );
}
