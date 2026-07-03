"use client";

import * as React from "react";
import { formatNumber } from "@/lib/format";

/** Animates 0 → value on mount (ease-out, ~500ms); skipped for non-numeric values or reduced-motion. */
export function StatCardValue({ value, animate = true }: { value: number | string; animate?: boolean }) {
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
