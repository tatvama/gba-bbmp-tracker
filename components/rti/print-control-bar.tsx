"use client";

import * as React from "react";
import { Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrintControlBarProps {
  id: string;
  downloadUrl: string;
}

export function PrintControlBar({ id, downloadUrl }: PrintControlBarProps) {
  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-end border-b bg-background/95 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        {/* Native print dialog trigger */}
        <Button
          size="sm"
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
        >
          <Printer className="h-4 w-4 mr-1" /> Print Document
        </Button>

        {/* Server-side PDF download trigger */}
        <Button asChild size="sm" variant="outline">
          <a href={downloadUrl} download>
            <FileDown className="h-4 w-4 mr-1" /> Download PDF
          </a>
        </Button>
      </div>
    </div>
  );
}
