import * as React from "react";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, defaultValue, onChange, onClick, onFocus, ...props }, ref) => {
    const isDateType = type === "date";
    const [showCalendar, setShowCalendar] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const localRef = React.useRef<HTMLInputElement>(null);
    const resolvedRef = (ref || localRef) as React.RefObject<HTMLInputElement>;

    // Calendar state
    const [currentDate, setCurrentDate] = React.useState(() => {
      const initial = value || defaultValue || "";
      if (typeof initial === "string" && initial) {
        const d = new Date(initial);
        if (!isNaN(d.getTime())) return d;
      }
      return new Date();
    });

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const years = React.useMemo(() => {
      const currentYear = new Date().getFullYear();
      const list: number[] = [];
      for (let y = currentYear - 25; y <= currentYear + 15; y++) {
        list.push(y);
      }
      return list;
    }, []);

    // Detect click outside to close
    React.useEffect(() => {
      if (!showCalendar) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setShowCalendar(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showCalendar]);

    // Dispatch native React events when date is clicked
    const handleSelectDate = (selectedDay: number) => {
      const pad = (n: number) => n.toString().padStart(2, "0");
      const dateStr = `${year}-${pad(month + 1)}-${pad(selectedDay)}`;
      
      if (resolvedRef.current) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(resolvedRef.current, dateStr);
          const evInput = new Event("input", { bubbles: true });
          resolvedRef.current.dispatchEvent(evInput);
          const evChange = new Event("change", { bubbles: true });
          resolvedRef.current.dispatchEvent(evChange);
        }
        if (onChange) {
          const synthEvent = {
            target: resolvedRef.current,
            currentTarget: resolvedRef.current,
            preventDefault: () => {},
            stopPropagation: () => {},
            bubble: true,
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          onChange(synthEvent);
        }
      }
      setShowCalendar(false);
    };

    const handleClear = () => {
      if (resolvedRef.current) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(resolvedRef.current, "");
          const evInput = new Event("input", { bubbles: true });
          resolvedRef.current.dispatchEvent(evInput);
          const evChange = new Event("change", { bubbles: true });
          resolvedRef.current.dispatchEvent(evChange);
        }
        if (onChange) {
          const synthEvent = {
            target: resolvedRef.current,
            currentTarget: resolvedRef.current,
            preventDefault: () => {},
            stopPropagation: () => {},
            bubble: true,
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          onChange(synthEvent);
        }
      }
      setShowCalendar(false);
    };

    const handleToday = () => {
      const today = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      
      if (resolvedRef.current) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(resolvedRef.current, dateStr);
          const evInput = new Event("input", { bubbles: true });
          resolvedRef.current.dispatchEvent(evInput);
          const evChange = new Event("change", { bubbles: true });
          resolvedRef.current.dispatchEvent(evChange);
        }
        if (onChange) {
          const synthEvent = {
            target: resolvedRef.current,
            currentTarget: resolvedRef.current,
            preventDefault: () => {},
            stopPropagation: () => {},
            bubble: true,
          } as unknown as React.ChangeEvent<HTMLInputElement>;
          onChange(synthEvent);
        }
      }
      setShowCalendar(false);
    };

    // Calculate days grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const daysGrid = React.useMemo(() => {
      const list: (number | null)[] = [];
      for (let i = 0; i < firstDayIndex; i++) {
        list.push(null);
      }
      for (let d = 1; d <= daysInMonth; d++) {
        list.push(d);
      }
      return list;
    }, [year, month, daysInMonth, firstDayIndex]);

    const activeDay = React.useMemo(() => {
      const val = resolvedRef.current?.value || value || defaultValue || "";
      if (typeof val === "string" && val) {
        const d = new Date(val);
        if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month) {
          return d.getDate();
        }
      }
      return null;
    }, [value, defaultValue, resolvedRef, year, month, showCalendar]);

    const isToday = (d: number) => {
      const today = new Date();
      return today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    };

    if (isDateType) {
      return (
        <div ref={containerRef} className="relative w-full">
          <input
            type="text"
            readOnly
            placeholder="Select date..."
            onClick={() => setShowCalendar(true)}
            onFocus={() => setShowCalendar(true)}
            value={
              resolvedRef.current?.value
                ? resolvedRef.current.value.split("-").reverse().join("-")
                : typeof value === "string" && value
                ? value.split("-").reverse().join("-")
                : typeof defaultValue === "string" && defaultValue
                ? defaultValue.split("-").reverse().join("-")
                : ""
            }
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-background pl-3 pr-9 py-2 cursor-pointer select-none",
              "text-sm text-foreground placeholder:text-muted-foreground/50",
              "ring-offset-background transition-[border-color,box-shadow] duration-200",
              "focus-visible:outline-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/60",
              className
            )}
            {...props}
          />
          {/* Hidden real date input to store actual value for forms */}
          <input
            type="hidden"
            ref={resolvedRef}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
          />
          
          <CalendarIcon className="h-4 w-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />

          {/* Styled calendar popover */}
          {showCalendar && (
            <div
              className="absolute top-full left-0 mt-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl p-3 z-[100] select-none w-[260px] text-xs font-semibold text-slate-700 dark:text-slate-300 animate-in fade-in zoom-in-95 duration-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                  className="p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200/50 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-0.5">
                  <select
                    value={month}
                    onChange={(e) => setCurrentDate(new Date(year, parseInt(e.target.value), 1))}
                    className="bg-transparent font-extrabold border-none outline-none text-slate-800 dark:text-slate-250 cursor-pointer text-xs focus:ring-0 p-0 pr-1 hover:text-primary transition-colors"
                  >
                    {months.map((m, idx) => (
                      <option key={m} value={idx} className="dark:bg-slate-950 dark:text-slate-200">{m}</option>
                    ))}
                  </select>
                  <select
                    value={year}
                    onChange={(e) => setCurrentDate(new Date(parseInt(e.target.value), month, 1))}
                    className="bg-transparent font-extrabold border-none outline-none text-slate-800 dark:text-slate-250 cursor-pointer text-xs focus:ring-0 p-0 hover:text-primary transition-colors"
                  >
                    {years.map((y) => (
                      <option key={y} value={y} className="dark:bg-slate-950 dark:text-slate-200">{y}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                  className="p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-850 border border-slate-200/50 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Weekdays */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Su</span>
                <span>Mo</span>
                <span>Tu</span>
                <span>We</span>
                <span>Th</span>
                <span>Fr</span>
                <span>Sa</span>
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {daysGrid.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} />;
                  }
                  const isSelected = activeDay === day;
                  return (
                    <button
                      key={`day-${day}`}
                      type="button"
                      onClick={() => handleSelectDate(day)}
                      className={cn(
                        "h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 font-bold",
                        isSelected
                          ? "bg-primary text-white shadow-xs font-black"
                          : isToday(day)
                          ? "border border-blue-500/40 text-primary hover:bg-slate-50 dark:hover:bg-slate-800"
                          : "hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[9px] font-black tracking-wider uppercase text-slate-400">
                <button
                  type="button"
                  onClick={handleClear}
                  className="hover:text-rose-500 cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Today
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2",
          "text-sm text-foreground placeholder:text-muted-foreground/50",
          "ring-offset-background transition-[border-color,box-shadow] duration-200",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "focus-visible:outline-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/60",
          "read-only:bg-muted/40 read-only:text-muted-foreground",
          "aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:focus-visible:ring-destructive/25",
          className,
        )}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
