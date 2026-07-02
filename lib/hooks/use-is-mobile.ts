"use client";

import * as React from "react";

/**
 * True on touch-first devices (phones/tablets) — `pointer: coarse` is the
 * primary input's nature, not the viewport width, so a narrow desktop window
 * stays "desktop" and a large tablet stays "mobile". Used to show the live
 * camera capture only where there IS a usable rear camera.
 * Returns false during SSR/first paint (no layout shift for desktop users).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsMobile(mq.matches || navigator.maxTouchPoints > 1);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return isMobile;
}
