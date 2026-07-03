import * as React from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCardValue } from "./stat-card-value";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPONENT DOCUMENTATION: StatCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose:
 *   Standardized card components for rendering statistical figures, summary
 *   metrics, and indicators on dashboards.
 *
 * Usage:
 *   ```tsx
 *   import { StatCard, StatCardRow, StatCardIcon, StatCardValue, StatCardLabel } from "@/components/ui/stat-card";
 *   import { Building2 } from "lucide-react";
 *
 *   <StatCard href="/wards">
 *     <StatCardRow>
 *       <StatCardValue value={142} />
 *       <StatCardLabel>Total Wards</StatCardLabel>
 *       <StatCardSub>All active jurisdictions</StatCardSub>
 *       <StatCardIcon icon={Building2} bgClassName="bg-primary/10" className="text-primary" />
 *     </StatCardRow>
 *   </StatCard>
 *   ```
 *
 * Props (StatCard):
 *   - href (string, optional): Navigation link when the card is interactive.
 *   - children (React.ReactNode): Metric elements.
 *   - className (string, optional): Style override classes.
 *
 * Responsive Behavior:
 *   - Scales dynamically in CSS grid systems. Values stack neatly on narrow screens.
 *
 * Accessibility:
 *   - Wrapped in <Link> with visual active states when interactive.
 *   - Number output uses tabular-nums class for screen reader reading stability.
 *
 * Do's:
 *   - Do use tabular numbers (StatCardValue) to align digits vertically.
 *   - Do specify secondary description labels.
 *
 * Don'ts:
 *   - Don't apply custom drop shadows or gradients outside standard HSL tokens.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function StatCard({
  href,
  className,
  style,
  children,
}: {
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const card = (
    <div
      className={cn(
        "stat-card flex h-full flex-col rounded-xl border border-border/50 bg-card p-4 transition-all duration-250 ease-out hover:border-primary/20 hover:shadow-xs",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
  return href ? (
    <Link href={href} className="group block active:scale-[0.99] transition-transform duration-100">
      {card}
    </Link>
  ) : (
    card
  );
}

function StatCardRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3">{children}</div>;
}

function StatCardIcon({
  icon: Icon,
  className,
  bgClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
  bgClassName?: string;
}) {
  return (
    <div className={cn("shrink-0 rounded-lg p-2 transition-all duration-250 group-hover:scale-[1.03] group-hover:shadow-3xs", bgClassName)}>
      <Icon className={cn("h-4.5 w-4.5", className)} />
    </div>
  );
}

function StatCardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 break-words text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 leading-normal">
      {children}
    </p>
  );
}

function StatCardSub({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-medium text-muted-foreground/50 mt-0.5">{children}</p>;
}

function StatCardTrend({
  direction = "up",
  tone = "neutral",
  children,
}: {
  direction?: "up" | "down";
  tone?: "positive" | "negative" | "neutral";
  children: React.ReactNode;
}) {
  const Icon = direction === "down" ? TrendingDown : TrendingUp;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold",
        tone === "positive" && "text-teal",
        tone === "negative" && "text-destructive",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

export { StatCard, StatCardRow, StatCardIcon, StatCardValue, StatCardLabel, StatCardSub, StatCardTrend };
