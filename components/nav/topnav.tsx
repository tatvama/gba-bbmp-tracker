"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu, type UserMenuProps } from "./user-menu";
import { Sidebar } from "./sidebar";
import { TaskCenter } from "./task-center";
import { NotificationsBell } from "./notifications-bell";
import { CommandPalette } from "@/components/command-palette";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { KbdShortcut } from "@/components/kbd-shortcut";
import { useTranslation } from "@/lib/i18n/client";

export function TopNav({ email, role }: UserMenuProps) {
  const router = useRouter();
  const { t } = useTranslation("navigation");
  const [mobileOpen, setMobileOpen] = React.useState(false);

  function openPalette() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true, bubbles: true }),
    );
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md no-print relative">
      <div className="flex items-center gap-3.5">
        {/* Mobile nav */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 cursor-pointer hover:bg-muted/80"
            aria-label={t("nav.openNavigation")}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4 text-foreground/80" />
          </Button>
          <SheetContent side="left" className="p-0 flex flex-col h-full w-72 bg-card border-r border-border/80">
            <SheetTitle className="border-b border-border/60 px-4 py-3.5 text-sm font-semibold text-foreground/90">
              {t("nav.mobileTitle")}
            </SheetTitle>
            <div className="flex-1 overflow-y-auto animate-page-slide" onClick={() => setMobileOpen(false)}>
              <Sidebar isMobile />
            </div>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 group transition-transform duration-200 active:scale-[0.98]"
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
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-black text-[11px] tracking-tight text-primary-foreground shadow-sm border border-primary/10 transition-all duration-250 group-hover:scale-105 group-hover:shadow-md active:scale-95">
            GBA
          </span>
          <div className="hidden flex-col sm:flex">
            <span className="text-[13px] font-bold leading-tight text-foreground/95 tracking-tight group-hover:text-primary transition-colors">
              BBMP Ward Tracker
            </span>
            <span className="text-[10px] font-medium leading-none text-muted-foreground mt-0.5">
              Bengaluru · 225 wards
            </span>
          </div>
        </Link>
      </div>

      {/* Center: Search trigger */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:block">
        <button
          onClick={openPalette}
          className="h-9 w-[320px] flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 text-xs text-muted-foreground transition-all duration-200 hover:border-muted-foreground/30 hover:bg-muted/50 hover:text-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary/45"
          aria-label={t("nav.openCommandPalette")}
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          <span className="flex-1 text-left font-medium">{t("nav.searchPlaceholder")}</span>
          <KbdShortcut className="hidden sm:inline-flex" />
        </button>
      </div>

      {/* Mobile: icon-only search */}
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="flex sm:hidden h-9 w-9 hover:bg-muted transition-colors cursor-pointer"
        aria-label={t("nav.search")}
      >
        <Link href="/search">
          <Search className="h-4 w-4 text-muted-foreground" />
        </Link>
      </Button>

      <div className="flex items-center gap-1.5">
        <TaskCenter />
        <NotificationsBell />
        <LanguageSwitcher />
        <ModeToggle />
        <UserMenu email={email} role={role} />
      </div>

      <CommandPalette />
    </header>
  );
}
