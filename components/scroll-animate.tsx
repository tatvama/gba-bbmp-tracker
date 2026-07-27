"use client";

import * as React from "react";

interface ScrollAnimateProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
}

const OFFSETS: Record<NonNullable<ScrollAnimateProps["direction"]>, string> = {
  up: "translateY(24px)",
  down: "translateY(-24px)",
  left: "translateX(24px)",
  right: "translateX(-24px)",
  none: "none",
};

/**
 * Fade/slide-in-on-scroll wrapper — CSS transition + IntersectionObserver
 * instead of framer-motion (this was the only user of framer-motion on the RTI
 * detail page besides history-timeline; removing it here drops that dependency
 * from this route's needed-on-mount bundle). Behavior matches the previous
 * motion.div: triggers once when ~80px into the viewport, never re-triggers.
 */
export function ScrollAnimate({
  children,
  className,
  delay = 0,
  direction = "up",
}: ScrollAnimateProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-80px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : OFFSETS[direction],
        transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}
