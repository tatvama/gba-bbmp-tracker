"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the current route's server components on an interval by calling
 * router.refresh(). Render it ONLY while the thing you're waiting for is absent
 * (e.g. an in-progress background build): the next server render that includes
 * the result simply stops rendering this component, which clears the interval —
 * so it self-terminates without any explicit stop signal. No visible output.
 *
 * `maxRefreshes` is a hard backstop so that if the awaited result never lands
 * (a genuinely stuck job, an offline worker), the tab stops polling instead of
 * hammering the server forever. Reaching it just stops the polling — a manual
 * reload still works.
 */
export function AutoRefresh({ intervalMs = 5000, maxRefreshes = 40 }: { intervalMs?: number; maxRefreshes?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      if (count > maxRefreshes) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxRefreshes]);
  return null;
}
