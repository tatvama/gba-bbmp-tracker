import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/db";
import { listAllTaskItems } from "@/lib/jobs/adapters";
import { subscribeJobChanges } from "@/lib/jobs/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LIVE background-job progress over Server-Sent Events — the Global Task
 * Center's realtime channel, built on the exact same pattern already proven
 * by app/api/import-queue/events/route.ts: every message is a full snapshot
 * of the caller's active + recent jobs (a handful of rows), so the client
 * just replaces its state — no diffing, no missed-event risk. The in-process
 * bus (lib/jobs/bus.ts) triggers pushes within ~150ms of a runner write; a
 * slow poll backs it up in case an event is ever missed; a comment heartbeat
 * keeps proxies from idling the connection out.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Not authorized.", { status: 403 });
  const admin = createAdminClient();
  const userId = user.id;

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
        const jobs = await listAllTaskItems(admin, userId);
        write(`data: ${JSON.stringify({ type: "snapshot", jobs })}\n\n`);
      };
      const schedule = () => {
        if (debounce) return; // coalesce bursts of bus events
        debounce = setTimeout(() => {
          debounce = null;
          void push();
        }, 150);
      };

      unsub = subscribeJobChanges(userId, schedule);
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
