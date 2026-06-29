"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_SECTIONS } from "./nav-items";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const activeHref = NAV_ITEMS.map((i) => i.href)
    .filter((href) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"),
    )
    .sort((a, b) => b.length - a.length)[0];

  const NavLink = ({ item }: { item: (typeof NAV_ITEMS)[number] }) => {
    const Icon = item.icon;
    const active = item.href === activeHref;

    const handleClick = (e: React.MouseEvent) => {
      // Avoid intercepting modifier clicks (Ctrl+Click, CMD+Click, etc.)
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
      <li className="relative">
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-[60%] w-[3.5px] rounded-r-md bg-primary"
          />
        )}
        <Link
          href={item.href}
          onClick={handleClick}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
            active
              ? "bg-primary/[0.08] dark:bg-primary/[0.12] font-bold text-primary"
              : "font-medium text-foreground/50 hover:bg-foreground/[0.05] hover:text-foreground/80",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors duration-150",
              active
                ? "text-primary"
                : "text-foreground/35 group-hover:text-foreground/65",
            )}
          />
          <span className="truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      className={cn("flex h-full flex-col gap-0 overflow-y-auto px-2 py-3", className)}
      aria-label="Primary navigation"
    >
      {NAV_SECTIONS.map((section, i) => {
        const items = NAV_ITEMS.filter((it) => it.group === section.group);
        if (items.length === 0) return null;
        return (
          <div key={section.group} className={cn("flex flex-col gap-0.5", i > 0 && "mt-5")}>
            {section.label && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
                {section.label}
              </p>
            )}
            <ul className="space-y-px">
              {items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
            {i < NAV_SECTIONS.length - 1 && items.length > 0 && (
              <div className="mx-3 mt-5 border-t border-border/60" />
            )}
          </div>
        );
      })}
    </nav>
  );
}
