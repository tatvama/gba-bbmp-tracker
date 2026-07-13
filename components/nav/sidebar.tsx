"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_SECTIONS } from "./nav-items";
import { useTranslation } from "@/lib/i18n/client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPONENT DOCUMENTATION: Sidebar
 * ─────────────────────────────────────────────────────────────────────────────
 * Purpose:
 *   Primary navigation panel. Features grouped routing links, dynamic active
 *   highlighting paths, responsive mobile modes, and collapsible desktop views.
 *
 * Usage:
 *   ```tsx
 *   import { Sidebar } from "@/components/nav/sidebar";
 *
 *   <Sidebar /> // Desktop Layout
 *   <Sidebar isMobile /> // Mobile Drawer view
 *   ```
 *
 * Props:
 *   - isMobile (boolean, optional): Disables desktop wrapper and collapse states.
 *   - className (string, optional): Style override classes.
 *
 * Responsive Behavior:
 *   - Mobile/Tablet: Hidden by default, nested inside a slide-out drawer.
 *     - Desktop: Displayed side-by-side with main page content. Supports collapsing
 *       width from w-64 (256px) down to w-16 (64px) to maximize screen width.
 *
 * Accessibility:
 *   - Uses semantic <nav> container.
 *   - Menu items have visible active highlights and hover states.
 *
 * Do's:
 *   - Do specify item tooltips when collapsed.
 *
 * Don'ts:
 *   - Don't add nested navigation menus that exceed depth limits.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function Sidebar({
  className,
  isMobile = false,
}: {
  className?: string;
  isMobile?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const { t } = useTranslation("navigation");

  const activeHref = NAV_ITEMS.map((i) => i.href)
    .filter((href) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"),
    )
    .sort((a, b) => b.length - a.length)[0];

  const NavLink = ({ item }: { item: (typeof NAV_ITEMS)[number] }) => {
    const Icon = item.icon;
    const active = item.href === activeHref;
    const label = t(item.labelKey);

    const handleClick = (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      
      e.preventDefault();
      if (typeof document !== "undefined" && (document as any).startViewTransition) {
        (document as any).startViewTransition(() => {
          router.push(item.href);
        });
      } else {
        router.push(item.href);
      }
    };

    return (
      <li className="relative px-1.5">
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-[45%] w-[3px] rounded-r bg-primary"
          />
        )}
        <Link
          href={item.href}
          onClick={handleClick}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex items-center rounded-md px-3 py-2 text-xs transition-all duration-200 ease-out active:scale-[0.98]",
            collapsed && !isMobile ? "justify-center" : "gap-2.5",
            active
              ? "bg-primary/10 text-primary font-bold"
              : "font-semibold text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
          title={collapsed && !isMobile ? label : undefined}
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors duration-200",
              active
                ? "text-primary"
                : "text-muted-foreground/60 group-hover:text-foreground/80",
            )}
          />
          {(!collapsed || isMobile) && <span className="truncate">{label}</span>}
        </Link>
      </li>
    );
  };

  const navContent = (
    <nav
      className={cn("flex flex-1 flex-col justify-between overflow-y-auto px-1 py-4 bg-card", className)}
      aria-label="Primary navigation"
    >
      <div className="space-y-4">
        {NAV_SECTIONS.map((section, i) => {
          const items = NAV_ITEMS.filter((it) => it.group === section.group);
          if (items.length === 0) return null;
          return (
            <div key={section.group} className="flex flex-col gap-0.5">
              {section.labelKey && (!collapsed || isMobile) && (
                <p className="mb-1 px-4.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  {t(section.labelKey)}
                </p>
              )}
              {section.labelKey && collapsed && !isMobile && (
                <div className="mx-2 border-t border-border/40 my-1" />
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Collapse Trigger at bottom */}
      {!isMobile && (
        <div className="mt-auto pt-4 px-1.5 border-t border-border/40">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-all duration-200"
            aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            ) : (
              <div className="flex items-center gap-2.5 w-full">
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span className="font-semibold truncate">{t("nav.collapseSidebar")}</span>
              </div>
            )}
          </button>
        </div>
      )}
    </nav>
  );

  if (isMobile) {
    return navContent;
  }

  return (
    <aside
      className={cn(
        "sticky top-13 hidden h-[calc(100vh-3.25rem)] shrink-0 flex-col border-r bg-card/65 backdrop-blur-md lg:flex transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {navContent}
    </aside>
  );
}
