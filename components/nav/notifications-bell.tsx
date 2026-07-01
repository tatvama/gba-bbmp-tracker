"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { listMyNotifications, markNotificationRead, markAllNotificationsRead, type AppNotification } from "@/lib/actions/jobs";
import { formatDateTime } from "@/lib/format";

/**
 * In-app alerts bell (top bar, every page). Polls the current user's
 * notifications; every finished/automated job drops a message here. Clicking one
 * marks it read and opens the linked page.
 */
export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = React.useState<AppNotification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const r = await listMyNotifications(20);
      setItems(r.items);
      setUnread(r.unread);
    } catch { /* transient */ }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function openNotif(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) await markNotificationRead(n.id);
    await load();
    if (n.link) router.push(n.link);
  }
  async function markAll() {
    await markAllNotificationsRead();
    await load();
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (o) void load(); }}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button onClick={markAll} className="text-xs font-medium text-primary hover:underline">Mark all read</button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">No notifications yet.</p>
        ) : (
          <ul className="max-h-96 overflow-auto">
            {items.map((n) => (
              <li key={n.id} className="border-b last:border-0">
                <button onClick={() => openNotif(n)} className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${!n.read_at ? "bg-primary/[0.04]" : ""}`}>
                  <div className="flex items-center gap-2">
                    {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className="truncate text-xs font-medium">{n.title}</span>
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
