"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface KbdShortcutProps {
  className?: string;
}

export function KbdShortcut({ className }: KbdShortcutProps) {
  const [label, setLabel] = React.useState("Ctrl+K");

  React.useEffect(() => {
    const isMac = typeof window !== "undefined" && 
      (/Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || ""));
    if (isMac) {
      setLabel("⌘K");
    }
  }, []);

  return (
    <kbd className={cn("rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground", className)}>
      {label}
    </kbd>
  );
}
