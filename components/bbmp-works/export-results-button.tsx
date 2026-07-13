"use client";

import { Download, ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { exportRows } from "@/lib/export";
import { flattenWorkForExport } from "@/lib/bbmp-works/export";
import type { BBMPWorkDetails } from "@/lib/bbmp-works/types";

export function ExportResultsButton({ works }: { works: BBMPWorkDetails[] }) {
  function doExport(format: "csv" | "xlsx") {
    exportRows(works.map(flattenWorkForExport), "bbmp-work-search-results", format);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 font-semibold">
          <Download className="h-4 w-4 mr-1.5" /> Export <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => doExport("csv")} className="cursor-pointer text-xs flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => doExport("xlsx")} className="cursor-pointer text-xs flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Export Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
