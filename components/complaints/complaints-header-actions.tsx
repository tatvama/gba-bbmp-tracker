"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, LayoutDashboard, Smartphone, Upload, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/client";

export function ComplaintsHeaderActions({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation("complaints");
  const { t: tCommon } = useTranslation("common");
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">


      {/* Secondary Actions: Slide/flex on desktop, grouped in dropdown on mobile */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
        {/* Mobile Overflow Menu */}
        <div className="sm:hidden w-full">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 w-full justify-center gap-2 cursor-pointer font-semibold">
                <MoreHorizontal className="h-4 w-4" /> {t("list.headerActions.moreActions")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[calc(100vw-32px)] dark:bg-slate-900 dark:border-slate-800">
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/complaints/dashboard" className="flex items-center gap-2 py-2.5">
                  <LayoutDashboard className="h-4 w-4 text-slate-400" /> {t("list.headerActions.viewDashboard")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/complaints/mobile/upload" className="flex items-center gap-2 py-2.5">
                  <Smartphone className="h-4 w-4 text-slate-400" /> {t("list.headerActions.mobileUpload")}
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/complaints/import" className="flex items-center gap-2 py-2.5">
                    <Upload className="h-4 w-4 text-slate-400" /> {t("list.headerActions.importUpload")}
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Desktop Buttons */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="outline" className="cursor-pointer">
            <Link href="/complaints/dashboard">
              <LayoutDashboard className="h-4 w-4 mr-1.5" /> {t("list.headerActions.dashboard")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="cursor-pointer">
            <Link href="/complaints/mobile/upload">
              <Smartphone className="h-4 w-4 mr-1.5" /> {t("list.headerActions.mobile")}
            </Link>
          </Button>
          {canEdit && (
            <Button asChild size="sm" variant="outline" className="cursor-pointer">
              <Link href="/complaints/import">
                <Upload className="h-4 w-4 mr-1.5" /> {tCommon("action.upload")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
