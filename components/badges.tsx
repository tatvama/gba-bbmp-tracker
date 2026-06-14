import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CORP_TINT,
  VERIFICATION_LABEL,
  type VerificationStatus,
  type ConfidenceScore,
} from "@/lib/constants";
import { Info, CheckCircle2, Clock, AlertTriangle, UserX, HelpCircle } from "lucide-react";

/* ── Verification badge ──────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<
  VerificationStatus,
  { variant: React.ComponentProps<typeof Badge>["variant"]; icon: React.ElementType }
> = {
  VERIFIED:           { variant: "success",     icon: CheckCircle2 },
  PENDING:            { variant: "warning",     icon: Clock },
  NEEDS_CORRECTION:   { variant: "destructive", icon: AlertTriangle },
  RETIRED_TRANSFERRED:{ variant: "muted",       icon: UserX },
  UNKNOWN:            { variant: "outline",     icon: HelpCircle },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const { variant, icon: Icon } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1" title="Verification status">
      <Icon className="h-3 w-3" />
      {VERIFICATION_LABEL[status]}
    </Badge>
  );
}

/* ── Confidence badge ────────────────────────────────────────────────────── */

export function ConfidenceBadge({ score }: { score: ConfidenceScore }) {
  const map: Record<ConfidenceScore, string> = {
    HIGH:   "border-teal/60 text-teal bg-teal/5",
    MEDIUM: "border-amber/60 text-amber-dark bg-amber/5",
    LOW:    "border-destructive/60 text-destructive bg-destructive/5",
  };
  return (
    <Badge variant="outline" className={cn("font-medium", map[score])} title="Confidence score">
      {score.charAt(0) + score.slice(1).toLowerCase()} confidence
    </Badge>
  );
}

/* ── Derived badge ───────────────────────────────────────────────────────── */

export function DerivedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-amber/70 bg-amber/8 px-2 py-0.5 text-[11px] font-medium text-amber-dark",
        className,
      )}
      title="Derived from ward's Assembly Constituency — not an authoritative ward-to-ward mapping."
    >
      <Info className="h-3 w-3 shrink-0" />
      derived from constituency
    </span>
  );
}

/* ── Sample / seed badges ────────────────────────────────────────────────── */

export function SampleBadge() {
  return (
    <Badge
      variant="outline"
      className="border-clay/60 bg-clay/5 text-clay"
      title="Sample fallback data — not a real record"
    >
      sample
    </Badge>
  );
}

export function UnverifiedSeedTag() {
  return (
    <Badge
      variant="outline"
      className="border-amber/50 bg-amber/5 text-amber-dark"
    >
      unverified seed
    </Badge>
  );
}

/* ── Corporation pill ────────────────────────────────────────────────────── */

export function CorpPill({
  code,
  name,
  derived,
}: {
  code: string;
  name?: string | null;
  derived?: boolean;
}) {
  const tint = CORP_TINT[code] ?? "#8A8478";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm"
      style={{ backgroundColor: tint }}
      title={derived ? "Derived from constituency" : undefined}
    >
      {name ?? code}
    </span>
  );
}
