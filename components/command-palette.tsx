"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, ArrowRight, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav/nav-items";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  /* ⌘K / Ctrl+K to toggle */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* Reset + focus on open */
  React.useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  /* Filtered nav items */
  const items = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return NAV_ITEMS;
    return NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(needle));
  }, [q]);

  const showGlobalSearch = q.trim().length > 0;
  const total = items.length + (showGlobalSearch ? 1 : 0);
  const active = Math.min(cursor, Math.max(total - 1, 0));

  function go(href: string) {
    router.push(href);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < items.length) {
        const item = items[active];
        if (item) go(item.href);
      } else if (showGlobalSearch) {
        go(`/search?q=${encodeURIComponent(q.trim())}`);
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-label="Command palette"
          className="fixed left-1/2 top-[12%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border bg-card shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[4%] data-[state=open]:slide-in-from-top-[4%]"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b px-4 py-3.5">
            <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search or jump to a page…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls="cmd-listbox"
            />
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            id="cmd-listbox"
            role="listbox"
            className="max-h-72 overflow-y-auto py-1.5"
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === active;
              return (
                <button
                  key={item.href}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => go(item.href)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors duration-100",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  <span className="flex-1 font-medium">{item.label}</span>
                  {isActive && (
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}

            {showGlobalSearch && (
              <button
                role="option"
                aria-selected={active === items.length}
                onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors duration-100",
                  active === items.length
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Search className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                <span>
                  Search everywhere for{" "}
                  <strong className="font-semibold">&ldquo;{q.trim()}&rdquo;</strong>
                </span>
                {active === items.length && (
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </button>
            )}

            {items.length === 0 && !showGlobalSearch && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No pages found for &ldquo;{q}&rdquo;
              </p>
            )}
          </div>

          {/* Keyboard hints footer */}
          <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="flex h-4 w-4 items-center justify-center rounded border bg-card">
                <ArrowUp className="h-2.5 w-2.5" />
              </kbd>
              <kbd className="flex h-4 w-4 items-center justify-center rounded border bg-card">
                <ArrowDown className="h-2.5 w-2.5" />
              </kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="flex h-4 items-center justify-center rounded border bg-card px-1">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              <span>open</span>
            </span>
            <span className="ml-auto">
              Press{" "}
              <kbd className="rounded border bg-card px-1">⌘K</kbd> anytime
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
