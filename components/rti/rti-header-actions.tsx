"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSearch, Pencil, MoreVertical, CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { closeRtiCaseAction, reopenRtiCaseAction } from "@/lib/actions/rti";
import { cn } from "@/lib/utils";

interface RtiHeaderActionsProps {
  rtiId: string;
  status: string;
  canClose: boolean;
}

/**
 * Responsive action buttons wrapper for the RTI detail header.
 * Desktop: Displays full row [Analyze Reply] [Edit] [Close Case]
 * Tablet / Mobile: Displays primary [Analyze Reply] and low-priority actions in an overflow DropdownMenu.
 */
export function RtiHeaderActions({
  rtiId,
  status,
  canClose,
}: RtiHeaderActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const closed = status === "Closed";

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      {/* Desktop View: inline row */}
      <div className="hidden md:flex items-center gap-2.5">
        <Button asChild size="sm" variant="default" className="h-9 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer font-medium">
          <Link href={`/rti/${rtiId}/analyze`} className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" /> Analyze reply
          </Link>
        </Button>
        
        <Button asChild size="sm" variant="outline" className="h-9 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer font-medium bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <Link href={`/rti/${rtiId}/edit`} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </Button>

        {closed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 text-slate-700 dark:text-slate-350 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer font-medium bg-white dark:bg-slate-900"
            disabled={busy}
            onClick={() => run(() => reopenRtiCaseAction(rtiId))}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reopen case
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "h-9 hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer font-medium bg-white dark:bg-slate-900",
              canClose 
                ? "border-rose-200 text-rose-600 dark:border-rose-900/50 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-955/20" 
                : "border-slate-200 text-slate-400 dark:border-slate-850 dark:text-slate-600"
            )}
            disabled={busy || !canClose}
            title={canClose ? "Close this RTI case" : "Upload a reply or an appeal order before closing this case."}
            onClick={() => {
              if (!confirm("Close this RTI case? You can reopen it later.")) return;
              void run(() => closeRtiCaseAction(rtiId));
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Close case
          </Button>
        )}
      </div>

      {/* Mobile/Tablet View: Analyze Reply + Dropdown Menu */}
      <div className="flex md:hidden items-center gap-2.5 w-full sm:w-auto">
        <Button asChild size="sm" variant="default" className="h-9 flex-1 sm:flex-none hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer font-medium">
          <Link href={`/rti/${rtiId}/analyze`} className="flex items-center justify-center gap-2">
            <FileSearch className="h-4 w-4" /> Analyze reply
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 hover:bg-accent hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800" aria-label="More actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 z-[100] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href={`/rti/${rtiId}/edit`} className="flex items-center gap-2 w-full">
                <Pencil className="h-4 w-4 text-slate-400" /> Edit Details
              </Link>
            </DropdownMenuItem>
            {closed ? (
              <DropdownMenuItem
                disabled={busy}
                onClick={() => run(() => reopenRtiCaseAction(rtiId))}
                className="cursor-pointer"
              >
                <span className="flex items-center gap-2 w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 text-slate-400" />}
                  Reopen case
                </span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={busy || !canClose}
                onClick={() => {
                  if (!confirm("Close this RTI case? You can reopen it later.")) return;
                  void run(() => closeRtiCaseAction(rtiId));
                }}
                className={cn(
                  "cursor-pointer",
                  canClose && "text-rose-600 dark:text-rose-455 focus:text-rose-600 dark:focus:text-rose-400"
                )}
              >
                <span className="flex items-center gap-2 w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-slate-400" />}
                  Close case
                </span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
