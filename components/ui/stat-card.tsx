import * as React from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCardValue } from "./stat-card-value";

/**
 * Everything defined in THIS file is a plain (server-compatible) component —
 * no hooks, no browser APIs — so a Server Component page can pass an icon
 * component REFERENCE (e.g. Building2 from lucide-react) straight through as a
 * prop. Only StatCardValue needs client interactivity (its mount-count-up
 * animation), so it lives in its own "use client" module (./stat-card-value)
 * and is re-exported below. Keeping it in this file would force every export
 * here to be a Client Component, and a raw icon reference isn't serializable
 * across that boundary — see the "Only plain objects can be passed to Client
 * Components" RSC error this file was split to fix.
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
