import { CheckCircle2, ShieldCheck, HelpCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WorkVerificationStatus } from "@/lib/bbmp-works/types";

/**
 * Verification badge for a BBMP work record. Distinct from `VerificationBadge`
 * in components/badges.tsx (a 5-state enum for contact/ward verification) —
 * this maps the 4 states in WORK_VERIFICATION_STATUSES.
 */
const STATUS_CONFIG: Record<
  WorkVerificationStatus,
  { variant: React.ComponentProps<typeof Badge>["variant"]; icon: React.ElementType }
> = {
  Verified:                  { variant: "success",     icon: CheckCircle2 },
  "Partially Verified":      { variant: "warning",     icon: ShieldCheck },
  Unverified:                { variant: "outline",     icon: HelpCircle },
  "Conflicting Information": { variant: "destructive", icon: AlertTriangle },
};

export function WorkVerificationBadge({ status }: { status: WorkVerificationStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.Unverified;
  const { variant, icon: Icon } = config;
  return (
    <Badge variant={variant} className="gap-1" title="Verification status for this work record">
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

/**
 * One-line disclaimer — render ONCE under the page/card header, never per-field.
 * The backend computes a single verification status for the work as a whole,
 * not per individual fact, so the copy must not imply otherwise.
 */
export function VerificationDisclaimer() {
  return (
    <p className="text-xs text-muted-foreground">
      Verification status applies to this record as a whole — check individual figures against the sources below.
    </p>
  );
}
