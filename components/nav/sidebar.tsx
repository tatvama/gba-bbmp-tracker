"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, NAV_SECTIONS } from "./nav-items";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  const activeHref = NAV_ITEMS.map((i) => i.href)
    .filter((href) =>
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"),
    )
    .sort((a, b) => b.length - a.length)[0];

  const NavLink = ({ item }: { item: (typeof NAV_ITEMS)[number] }) => {
    const Icon = item.icon;
    const active = item.href === activeHref;
    return (
      <li>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-150",
            active
              ? "bg-primary/10 font-semibold text-primary"
              : "font-medium text-foreground/55 hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <Icon
            className={cn(
              "h-[15px] w-[15px] shrink-0 transition-colors",
              active ? "text-primary" : "text-foreground/35 group-hover:text-foreground/70",
            )}
          />
          <span className="truncate">{item.label}</span>
          {active && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Link>
      </li>
    );
  };

  return (
    <nav
      className={cn("flex h-full flex-col gap-0 overflow-y-auto px-3 py-4", className)}
      aria-label="Primary navigation"
    >
      {NAV_SECTIONS.map((section, i) => {
        const items = NAV_ITEMS.filter((it) => it.group === section.group);
        if (items.length === 0) return null;
        return (
          <div key={section.group} className={cn("flex flex-col gap-0.5", i > 0 && "mt-4")}>
            {section.label && (
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                {section.label}
              </p>
            )}
            <ul className="space-y-px">
              {items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </ul>
            {i < NAV_SECTIONS.length - 1 && items.length > 0 && (
              <div className="mt-4 border-t" />
            )}
          </div>
        );
      })}
    </nav>
  );
}
