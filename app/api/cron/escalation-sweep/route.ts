import { NextResponse, type NextRequest } from "next/server";
import { sweepEscalationCycles } from "@/lib/complaints/escalation-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * External-trigger escape hatch for the escalation ladder. The PRIMARY
 * mechanism is instrumentation.ts's in-process interval (runs with no HTTP
 * request needed) — this route exists only so an external scheduler can also
 * poke the same sweep if instrumentation.ts is ever unavailable in some deploy
 * target, same reasoning as /api/cron/ai-advisor.
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" https://yoursite/api/cron/escalation-sweep
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured on the server." }, { status: 503 });
  }
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const result = await sweepEscalationCycles();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
