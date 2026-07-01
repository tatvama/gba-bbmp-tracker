"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateRtiFilingDateAction } from "@/lib/actions/rti";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function fmt(d: string | null): string {
  if (!d) return "—";
  return formatDate(d);
}

/**
 * Inline editor for the RTI filing date.
 * Replaces native date pickers with a custom React calendar popover aligned with GBA styling.
 * Renders via React Portal to prevent clipping by overflow-hidden parent containers.
 */
export function FilingDateEditor({
  rtiId,
  dateFiled,
  canEdit,
}: {
  rtiId: string;
  dateFiled: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(dateFiled ?? "");
  const [busy, setBusy] = React.useState(false);
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [calendarDate, setCalendarDate] = React.useState<Date>(new Date());
  const [mounted, setMounted] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);

  const triggerContainerRef = React.useRef<HTMLSpanElement>(null);
  const triggerInputWrapperRef = React.useRef<HTMLDivElement>(null);
  const portalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Sync calendar view month when editor opens
  React.useEffect(() => {
    if (editing) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        setCalendarDate(parsed);
      } else {
        setCalendarDate(new Date());
      }
    }
  }, [editing, value]);

  // Compute popover layout coordinate positions relative to screen scroll
  const updateCoords = React.useCallback(() => {
    if (triggerInputWrapperRef.current) {
      const rect = triggerInputWrapperRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
  }, []);

  React.useEffect(() => {
    if (showCalendar) {
      updateCoords();
      window.addEventListener("resize", updateCoords);
      window.addEventListener("scroll", updateCoords, true);
    }
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [showCalendar, updateCoords]);

  // Click outside to close calendar popover
  React.useEffect(() => {
    function clickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = triggerContainerRef.current?.contains(target);
      const insidePortal = portalRef.current?.contains(target);
      const insideSelectDropdown = (target as HTMLElement).closest('[role="listbox"]') || 
                                   (target as HTMLElement).closest('[data-radix-popper-content-wrapper]');

      if (!insideTrigger && !insidePortal && !insideSelectDropdown) {
        setShowCalendar(false);
      }
    }
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

  async function save() {
    setBusy(true);
    const res = await updateRtiFilingDateAction(rtiId, value || null);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setEditing(false);
    setShowCalendar(false);
    router.refresh();
  }

  if (!canEdit) return <span>{fmt(dateFiled)}</span>;

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        {fmt(dateFiled)}
        <button
          type="button"
          onClick={() => {
            setValue(dateFiled ?? "");
            setEditing(true);
          }}
          className="text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Edit filing date"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  // Calculate calendar grid metrics
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    cells.push(i);
  }

  const prevMonth = () => {
    setCalendarDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCalendarDate(new Date(year, month + 1, 1));
  };

  return (
    <span ref={triggerContainerRef} className="inline-flex items-center gap-1.5 relative">
      {/* Visual Trigger Input */}
      <div ref={triggerInputWrapperRef} className="relative">
        <Input
          type="text"
          readOnly
          value={value ? formatDate(value) : ""}
          placeholder="Select date"
          onClick={() => setShowCalendar(!showCalendar)}
          className="h-8 w-40 cursor-pointer pr-8 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          aria-label="Filing date"
        />
        <Calendar className="absolute right-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>      {/* Portal Date Picker Popover */}
      {mounted && showCalendar && coords && createPortal(
        <div
          ref={portalRef}
          style={{
            position: "absolute",
            top: `${coords.top + 4}px`,
            left: `${coords.left}px`,
          }}
          className="z-[999] p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg w-[280px] animate-in fade-in slide-in-from-top-1 duration-150 select-none"
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-3 gap-1">
            <div className="flex items-center gap-1 min-w-0">
              {/* Month Select */}
              <Select
                value={String(month)}
                onValueChange={(val) => {
                  const m = parseInt(val || "", 10);
                  if (!isNaN(m)) {
                    setCalendarDate(new Date(year, m, 1));
                  }
                }}
              >
                <SelectTrigger className="border-none bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 h-8 px-2 text-xs font-bold flex items-center gap-1 focus:ring-0 focus:ring-offset-0 cursor-pointer text-slate-850 dark:text-slate-200 shrink-0 w-[110px] justify-between">
                  <SelectValue>{calendarDate.toLocaleDateString("en-US", { month: "long" })}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[250px] z-[1000]">
                  {Array.from({ length: 12 }, (_, i) => {
                    const optDate = new Date(2000, i, 1);
                    const label = optDate.toLocaleDateString("en-US", { month: "long" });
                    return (
                      <SelectItem key={i} value={String(i)}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Year Select */}
              <Select
                value={String(year)}
                onValueChange={(val) => {
                  const y = parseInt(val || "", 10);
                  if (!isNaN(y)) {
                    setCalendarDate(new Date(y, month, 1));
                  }
                }}
              >
                <SelectTrigger className="border-none bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 h-8 px-2 text-xs font-bold flex items-center gap-1 focus:ring-0 focus:ring-offset-0 cursor-pointer text-slate-850 dark:text-slate-200 shrink-0 w-[72px] justify-between">
                  <SelectValue>{year}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[250px] z-[1000]">
                  {Array.from({ length: 16 }, (_, i) => {
                    const optYear = new Date().getFullYear() - 5 + i;
                    return (
                      <SelectItem key={optYear} value={String(optYear)}>
                        {optYear}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={prevMonth}
                className="h-7 w-7 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg cursor-pointer shrink-0"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={nextMonth}
                className="h-7 w-7 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg cursor-pointer shrink-0"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4 text-slate-550" />
              </Button>
            </div>
          </div>

          {/* Weekdays Labels */}
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
            <span>S</span>
            <span>M</span>
            <span>T</span>
            <span>W</span>
            <span>T</span>
            <span>F</span>
            <span>S</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-1 justify-items-center">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-8 w-8" />;
              }

              const isSelected = value && (() => {
                const parts = value.split("-").map(Number);
                return parts[0] === year && parts[1] === month + 1 && parts[2] === day;
              })();

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => {
                    const monthStr = String(month + 1).padStart(2, "0");
                    const dayStr = String(day).padStart(2, "0");
                    setValue(`${year}-${monthStr}-${dayStr}`);
                    setShowCalendar(false);
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-full text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 cursor-pointer"
                >
                  <span
                    className={cn(
                      "h-7 w-7 flex items-center justify-center rounded-full transition-all duration-150",
                      isSelected
                        ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-extrabold shadow-3xs"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    {day}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5 mt-2.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              onClick={() => {
                setValue("");
                setShowCalendar(false);
              }}
            >
              Clear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              onClick={() => {
                setValue(new Date().toISOString().slice(0, 10));
                setShowCalendar(false);
              }}
            >
              Today
            </Button>
          </div>
        </div>,
        document.body
      )}

      {/* Action Controls */}
      <Button type="button" variant="default" size="sm" className="h-8 px-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer" disabled={busy} onClick={save}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2 cursor-pointer" onClick={() => setEditing(false)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
