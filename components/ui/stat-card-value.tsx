"use client";

import * as React from "react";
import { formatNumber } from "@/lib/format";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPONENT DOCUMENTATION: StatCardValue
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose:
 *   Sub-component of StatCard. Animates number counting on mount (0 -> value).
 *   Uses high-readability font configurations.
 *
 * Usage:
 *   ```tsx
 *   import { StatCardValue } from "@/components/ui/stat-card";
 *
 *   <StatCardValue value={142} />
 *   ```
 *
 * Props:
 *   - value (number | string): Number/text value to render.
 *   - animate (boolean, optional): Set to true to animate count-up on mount.
 *
 * Responsive Behavior:
 *   - Text sizes scale dynamically from 24px (mobile) to 30px (desktop).
 *
 * Accessibility:
 *   - Uses tabular-nums class to prevent layouts shaking.
 *   - Automatically skips animation when `prefers-reduced-motion` is matched.
 *
 * Do's:
 *   - Do specify values as numbers to trigger counting animation.
 *
 * Don'ts:
 *   - Don't wrap with custom text overrides.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
    <p className="text-2xl font-extrabold tabular-nums leading-none tracking-tight text-foreground/95 sm:text-3xl">
      {typeof display === "number" ? formatNumber(display) : display}
    </p>
  );
}
