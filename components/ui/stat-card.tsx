"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

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
        "stat-card group-hover:border-primary/30 flex h-full flex-col rounded-xl border bg-card p-4",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
  return href ? (
    <Link href={href} className="group block">
      {card}
    </Link>
  ) : (
    card
  );
}

function StatCardRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-2">{children}</div>;
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
    <div className={cn("shrink-0 rounded-lg p-2", bgClassName)}>
      <Icon className={cn("h-4 w-4", className)} />
    </div>
  );
}

/** Animates 0 → value on mount (ease-out, ~500ms); skipped for non-numeric values or reduced-motion. */
function StatCardValue({ value, animate = true }: { value: number | string; animate?: boolean }) {
  const numeric = typeof value === "number";
  const [display, setDisplay] = React.useState<number | string>(numeric && animate ? 0 : value);

  React.useEffect(() => {
    if (!numeric) return;
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const target = value as number;
    const duration = 500;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, numeric, animate]);

  return (
    <p className="text-2xl font-bold tabular-nums leading-none tracking-tight text-foreground">
      {typeof display === "number" ? formatNumber(display) : display}
    </p>
  );
}

function StatCardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 break-words text-xs font-semibold leading-tight text-foreground/80">
      {children}
    </p>
  );
}

function StatCardSub({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-muted-foreground">{children}</p>;
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
