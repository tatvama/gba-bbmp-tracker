import { describe, it, expect, vi } from "vitest";

/**
 * Regression coverage for lib/jobs/runner.ts#sweepBackgroundJobs — previously
 * untested (production-stabilization audit finding). This is the 2-minute
 * dead-job reclaim sweep: if a process crashes mid-job, a 'running' row can
 * be stuck forever with nothing to ever flip it. Verifies the real function
 * queries for jobs stuck past their type's maxDurationMs and flips them to
 * 'failed' with a clear timeout error, per job type (not just one).
 */

type Call = { method: string; args: unknown[] };

function makeGenericBuilder(allCalls: Call[]) {
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") {
          return (resolve: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: [] }).then(resolve);
        }
        return (...args: unknown[]) => {
          allCalls.push({ method: prop, args });
          return builder;
        };
      },
    },
  );
  return builder;
}

vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn() }));
vi.mock("./bus", () => ({ publishJobChange: vi.fn() }));

describe("sweepBackgroundJobs — stale 'running' job reclaim", () => {
  it("checks every registered job type against its OWN maxDurationMs, not a single global timeout", async () => {
    // Ensure real job handlers are registered so allJobTypes()/getJobConfig() reflect the real registry.
    await import("@/lib/jobs/handlers");
    const { sweepBackgroundJobs } = await import("@/lib/jobs/runner");
    const { allJobTypes } = await import("@/lib/jobs/registry");

    const calls: Call[] = [];
    const admin = { from: (table: string) => (table === "background_jobs" ? makeGenericBuilder(calls) : (() => { throw new Error(`unexpected table: ${table}`); })()) };

    await sweepBackgroundJobs(admin as never);

    // One .update({status:"failed",...}) call per registered job type, each
    // scoped by .eq("type", X) and a real, distinct stale-cutoff .lt("updated_at", <iso>).
    const updateCalls = calls.filter((c) => c.method === "update");
    expect(updateCalls.length).toBe([...allJobTypes()].length);
    for (const c of updateCalls) {
      const patch = c.args[0] as { status: string; error: string };
      expect(patch.status).toBe("failed");
      expect(patch.error).toMatch(/timed out/i);
    }
    const typeFilters = calls.filter((c) => c.method === "eq" && c.args[0] === "type").map((c) => c.args[1]);
    expect(typeFilters.sort()).toEqual([...allJobTypes()].sort());

    const ltCalls = calls.filter((c) => c.method === "lt" && c.args[0] === "updated_at");
    expect(ltCalls.length).toBe([...allJobTypes()].length);
    for (const c of ltCalls) {
      expect(new Date(c.args[1] as string).toString()).not.toBe("Invalid Date");
    }
  });
});
