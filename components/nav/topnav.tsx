"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { UserMenu, type UserMenuProps } from "./user-menu";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "@/components/command-palette";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function TopNav({ email, role }: UserMenuProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  function openPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/90 no-print relative">
      <div className="flex items-center gap-3.5">
        {/* Mobile nav */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-11 w-11 sm:h-9 sm:w-9 cursor-pointer"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <SheetContent side="left" className="p-0 flex flex-col h-full w-72 bg-card">
            <SheetTitle className="border-b px-4 py-3 text-sm font-semibold text-foreground">
              Navigation
            </SheetTitle>
            <div className="flex-1 overflow-y-auto" onClick={() => setMobileOpen(false)}>
              <Sidebar />
            </div>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 group"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            if (typeof document !== "undefined" && (document as any).startViewTransition) {
              (document as any).startViewTransition(() => {
                router.push("/");
              });
            } else {
              router.push("/");
            }
          }}
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-[10px] font-bold tracking-tight text-primary-foreground shadow-sm">
            GBA
          </span>
          <div className="hidden flex-col sm:flex">
            <span className="text-[13px] font-bold leading-tight text-slate-850 dark:text-slate-200 tracking-tight">
              BBMP Ward Tracker
            </span>
            <span className="text-[10px] font-medium leading-none text-slate-400 dark:text-slate-500 mt-0.5">
              Bengaluru · 225 wards
            </span>
          </div>
        </Link>
      </div>

      {/* Center: Search trigger */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:block">
        <button
          onClick={openPalette}
          className="h-9 w-[320px] flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-55 px-3 text-xs text-slate-450 transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900/35 dark:text-slate-500 dark:hover:border-slate-700 dark:hover:bg-slate-900/60 dark:hover:text-slate-305 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-800"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5 shrink-0 opacity-80 text-slate-405" />
          <span className="flex-1 text-left font-medium">Search wards, contacts…</span>
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 select-none rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-450 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Mobile: icon-only search */}
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="flex sm:hidden h-11 w-11 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        aria-label="Search"
      >
        <Link href="/search">
          <Search className="h-4 w-4 text-muted-foreground" />
        </Link>
      </Button>

      <div className="flex items-center gap-1">
        <ModeToggle />
        <UserMenu email={email} role={role} />
      </div>

      <CommandPalette />
    </header>
  );
}
