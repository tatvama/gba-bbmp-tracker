import type { NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { listImportSessions } from "@/lib/import-queue/store";
import { subscribeImportChanges } from "@/lib/import-queue/bus";
import { kickImportWorker } from "@/lib/import-queue/worker";
import type { ImportEventsPayload } from "@/lib/import-queue/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LIVE import progress over Server-Sent Events. Every message is a full
 * snapshot of the caller's active + recent sessions (a handful of rows), so
 * the client just replaces its state — no diffing, no missed-event risk. The
 * in-process bus (worker/chunk writes) triggers pushes within ~150 ms; a slow
 * poll backs it up in case an event is ever missed; a comment heartbeat keeps
 * proxies from idling the connection out.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return new Response("Not authorized.", { status: 403 });
  }
  const admin = createAdminClient();
  const userId = user.id;
  kickImportWorker(); // a fresh page-load after a server restart resumes the queue

  const encoder = new TextEncoder();
  let closed = false;
  let unsub: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      const push = async () => {
        const sessions = await listImportSessions(admin, userId);
        const payload: ImportEventsPayload = { type: "snapshot", sessions };
        write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const schedule = () => {
        if (debounce) return; // coalesce bursts of bus events
        debounce = setTimeout(() => {
          debounce = null;
          void push();
        }, 150);
      };

      unsub = subscribeImportChanges(userId, schedule);
      poll = setInterval(() => void push(), 5000);
      heartbeat = setInterval(() => write(`: ping\n\n`), 15000);
      void push();

      const close = () => {
        if (closed) return;
        closed = true;
        unsub?.();
        if (poll) clearInterval(poll);
        if (heartbeat) clearInterval(heartbeat);
        if (debounce) clearTimeout(debounce);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      unsub?.();
      if (poll) clearInterval(poll);
      if (heartbeat) clearInterval(heartbeat);
      if (debounce) clearTimeout(debounce);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
