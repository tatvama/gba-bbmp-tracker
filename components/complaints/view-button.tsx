"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function ViewButton({ href, caseNumber }: { href: string; caseNumber: string }) {
  const router = useRouter();
  const [navigating, setNavigating] = React.useState(false);

  const handleNavigate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNavigating(true);

    if (typeof document !== "undefined" && (document as any).startViewTransition) {
      (document as any).startViewTransition(() => {
        router.push(href);
      });
    } else {
      router.push(href);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="sm"
            disabled={navigating}
            onClick={handleNavigate}
            aria-label={`View details of complaint ${caseNumber}`}
            className={cn(
              "group relative overflow-hidden font-semibold transition-all duration-150 ease-out select-none shadow-xs rounded-lg cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
              "active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              "hover:shadow-md hover:scale-[1.02] active:translate-y-0",
              // Mobile/Tablet: Icon button only. Desktop (md and up): Icon + Text
              "w-8 h-8 p-0 md:w-auto md:h-8 md:px-3"
            )}
          >
            {navigating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="hidden md:inline pl-1.5 animate-pulse text-xs">Opening...</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                <span className="hidden md:inline pl-1 text-xs">View</span>
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>View details of this complaint</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
