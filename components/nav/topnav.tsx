"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ModeToggle } from "@/components/mode-toggle";
import { UserMenu, type UserMenuProps } from "./user-menu";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "@/components/command-palette";

export function TopNav({ email, role }: UserMenuProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  function openPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
  }

  return (
    <header className="sticky top-0 z-40 flex h-13 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      {/* Mobile nav */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <DialogContent className="left-0 top-0 h-full max-h-full w-72 translate-x-0 translate-y-0 rounded-none p-0 sm:rounded-none">
          <DialogTitle className="border-b px-4 py-3 text-sm font-semibold">
            Navigation
          </DialogTitle>
          <div onClick={() => setMobileOpen(false)}>
            <Sidebar />
          </div>
        </DialogContent>
      </Dialog>

      {/* Brand */}
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-[10px] font-bold tracking-tight text-primary-foreground shadow-sm">
          GBA
        </span>
        <div className="hidden flex-col sm:flex">
          <span className="text-[13px] font-semibold leading-tight text-foreground">
            BBMP Ward Tracker
          </span>
          <span className="text-[10px] leading-none text-muted-foreground/70">
            Bengaluru · 225 wards
          </span>
        </div>
      </Link>

      {/* Search trigger */}
      <button
        onClick={openPalette}
        className={[
          "ml-4 hidden h-8 max-w-[320px] flex-1 items-center gap-2 rounded-lg",
          "border border-border/60 bg-muted/40 px-3",
          "text-xs text-muted-foreground",
          "transition-all duration-150",
          "hover:border-primary/35 hover:bg-muted/70 hover:text-foreground/80",
          "focus:outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25",
          "sm:flex",
        ].join(" ")}
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="flex-1 text-left">Search wards, contacts…</span>
        <kbd className="hidden lg:inline-flex">⌘K</kbd>
      </button>

      {/* Mobile: icon-only search */}
      <button
        onClick={() => router.push("/search")}
        className="ml-auto flex items-center sm:hidden"
        aria-label="Search"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
        <ModeToggle />
        <UserMenu email={email} role={role} />
      </div>

      <CommandPalette />
    </header>
  );
}
