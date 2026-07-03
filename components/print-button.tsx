"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ className }: { className?: string }) {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()} className={className}>
      <Printer className="h-4 w-4 mr-1" /> Print
    </Button>
  );
}
