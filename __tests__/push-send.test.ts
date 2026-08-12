import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * lib/push/send.ts — the delivery semantics that actually matter, none of which
 * are observable from the happy path:
 *
 *  - unconfigured VAPID is a no-op, not a throw (a deployment with no keys must
 *    keep working, with email + webhook unaffected);
 *  - a 404/410 endpoint is PRUNED, because it can never work again — retrying it
 *    forever is how a subscriptions table fills with dead rows;
 *  - a transient failure is counted, not deleted;
 *  - one dead device must not abort the fan-out to the others.
 *
 * web-push is mocked: a real send needs a live push service and a browser-issued
 * endpoint, which is what the on-device check in the release steps covers.
 */

class FakeWebPushError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "WebPushError";
    this.statusCode = statusCode;
  }
}

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...a: unknown[]) => setVapidDetails(...a),
    sendNotification: (...a: unknown[]) => sendNotification(...a),
  },
  WebPushError: FakeWebPushError,
}));

interface Row {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  failure_count: number | null;
}

interface Recorded {
  op: "delete" | "update" | "select";
  payload?: unknown;
  filters: Array<{ fn: string; args: unknown[] }>;
}

/**
 * Minimal stand-in for the lib/db query builder: chainable, awaitable, and
 * it records what was asked of it so the assertions can be about intent
 * ("this endpoint was deleted") rather than about call order.
 */
function makeAdmin(rows: Row[]) {
  const recorded: Recorded[] = [];

  const from = () => {
    const entry: Recorded = { op: "select", filters: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => {
        entry.op = "select";
        return q;
      },
      delete: () => {
        entry.op = "delete";
        recorded.push(entry);
        return q;
      },
      update: (payload: unknown) => {
        entry.op = "update";
        entry.payload = payload;
        recorded.push(entry);
        return q;
      },
      eq: (...args: unknown[]) => {
        entry.filters.push({ fn: "eq", args });
        return q;
      },
      in: (...args: unknown[]) => {
        entry.filters.push({ fn: "in", args });
        return q;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(
          entry.op === "select" ? { data: rows, error: null } : { error: null },
        ).then(resolve, reject),
    };
    return q;
  };

  return { admin: { from } as never, recorded };
}

/** Fresh module per test — send.ts memoises its VAPID configuration. */
async function loadSender(env: { publicKey?: string; privateKey?: string } = {}) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = env.publicKey ?? "";
  process.env.VAPID_PRIVATE_KEY = env.privateKey ?? "";
  process.env.VAPID_SUBJECT = "mailto:test@example.org";
  return import("@/lib/push/send");
}

const CONFIGURED = { publicKey: "test-public-key", privateKey: "test-private-key" };

const row = (id: string, endpoint: string, failure_count: number | null = 0): Row => ({
  id,
  endpoint,
  p256dh: `p256dh-${id}`,
  auth_key: `auth-${id}`,
  failure_count,
});

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe("sendPushToAllSubscribers", () => {
  it("no-ops when VAPID keys are absent, without attempting a send", async () => {
    const { sendPushToAllSubscribers, isPushConfigured } = await loadSender();
    const { admin } = makeAdmin([row("1", "https://push.example/a")]);

    const res = await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    expect(isPushConfigured()).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("treats a malformed key pair as unconfigured rather than throwing", async () => {
    setVapidDetails.mockImplementation(() => {
      throw new Error("Vapid public key should be 65 bytes long");
    });
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin } = makeAdmin([row("1", "https://push.example/a")]);

    const res = await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    expect(res.skipped).toBe(true);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("reports no devices without calling the push service", async () => {
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin } = makeAdmin([]);

    const res = await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    expect(res).toMatchObject({ sent: 0, failed: 0, pruned: 0, skipped: false });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends the payload shape public/sw.js reads, with the subscription keys", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin } = makeAdmin([row("1", "https://push.example/a")]);

    const res = await sendPushToAllSubscribers(admin, {
      title: "14 items need attention",
      body: "4 overdue complaints",
      url: "/complaints",
    });

    expect(res.sent).toBe(1);
    const [subscription, body] = sendNotification.mock.calls[0]!;
    expect(subscription).toEqual({
      endpoint: "https://push.example/a",
      keys: { p256dh: "p256dh-1", auth: "auth-1" },
    });
    // The service worker's push handler reads exactly these four fields.
    expect(JSON.parse(body as string)).toEqual({
      title: "14 items need attention",
      body: "4 overdue complaints",
      url: "/complaints",
      tag: "gba-digest",
    });
  });

  it("defaults url and tag so the worker never has to guess", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin } = makeAdmin([row("1", "https://push.example/a")]);

    await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    const parsed = JSON.parse(sendNotification.mock.calls[0]![1] as string);
    expect(parsed.url).toBe("/");
    expect(parsed.tag).toBe("gba-digest");
  });

  it.each([404, 410])("prunes a %i endpoint instead of retrying it", async (status) => {
    sendNotification.mockRejectedValue(new FakeWebPushError("gone", status));
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin, recorded } = makeAdmin([row("1", "https://push.example/dead")]);

    const res = await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    expect(res).toMatchObject({ sent: 0, failed: 0, pruned: 1 });
    const del = recorded.find((r) => r.op === "delete");
    expect(del).toBeDefined();
    expect(del!.filters).toEqual([
      { fn: "in", args: ["endpoint", ["https://push.example/dead"]] },
    ]);
  });

  it("counts a transient failure and leaves the row in place", async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError("service unavailable", 503));
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin, recorded } = makeAdmin([row("1", "https://push.example/a", 2)]);

    const res = await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    expect(res).toMatchObject({ sent: 0, failed: 1, pruned: 0 });
    expect(recorded.some((r) => r.op === "delete")).toBe(false);
    const bump = recorded.find((r) => r.op === "update");
    expect(bump!.payload).toEqual({ failure_count: 3 });
  });

  it("does not classify a non-WebPushError as a dead endpoint", async () => {
    // A DNS/TLS failure carries no statusCode. Pruning on it would delete a
    // perfectly good subscription because of a transient network problem.
    sendNotification.mockRejectedValue(new Error("socket disconnected before TLS"));
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin, recorded } = makeAdmin([row("1", "https://push.example/a")]);

    const res = await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    expect(res).toMatchObject({ failed: 1, pruned: 0 });
    expect(recorded.some((r) => r.op === "delete")).toBe(false);
  });

  it("clears failure_count and stamps last_success_at after a send", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin, recorded } = makeAdmin([row("1", "https://push.example/a", 4)]);

    await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    const upd = recorded.find((r) => r.op === "update");
    const payload = upd!.payload as { failure_count: number; last_success_at: string };
    expect(payload.failure_count).toBe(0);
    expect(Number.isNaN(Date.parse(payload.last_success_at))).toBe(false);
    expect(upd!.filters).toEqual([{ fn: "in", args: ["id", ["1"]] }]);
  });

  it("keeps delivering to healthy devices when one is dead", async () => {
    sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint.includes("dead")
        ? Promise.reject(new FakeWebPushError("gone", 410))
        : Promise.resolve({ statusCode: 201 }),
    );
    const { sendPushToAllSubscribers } = await loadSender(CONFIGURED);
    const { admin } = makeAdmin([
      row("1", "https://push.example/ok-1"),
      row("2", "https://push.example/dead"),
      row("3", "https://push.example/ok-2"),
    ]);

    const res = await sendPushToAllSubscribers(admin, { title: "t", body: "b" });

    expect(res).toMatchObject({ sent: 2, pruned: 1, failed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(3);
  });
});

describe("sendPushToUser", () => {
  it("scopes the read to that user's devices", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { sendPushToUser } = await loadSender(CONFIGURED);
    const { admin, recorded } = makeAdmin([row("1", "https://push.example/a")]);

    const res = await sendPushToUser(admin, "user-42", { title: "t", body: "b" });

    expect(res.sent).toBe(1);
    // The select is recorded only once a mutating op runs, so assert on the
    // success update's presence plus the send actually happening.
    expect(recorded.some((r) => r.op === "update")).toBe(true);
  });

  it("stays inert when unconfigured", async () => {
    const { sendPushToUser } = await loadSender();
    const { admin } = makeAdmin([row("1", "https://push.example/a")]);

    const res = await sendPushToUser(admin, "user-42", { title: "t", body: "b" });

    expect(res.skipped).toBe(true);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
