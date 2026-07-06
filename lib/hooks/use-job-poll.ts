"use client";

import * as React from "react";

/**
 * The setInterval + cleanup + activeRef-guard pattern this codebase already
 * proved independently in complaint-ai-drafts.tsx and AIInsightsPanel.tsx,
 * extracted once. Used as the Global Task Center's reliability fallback
 * (alongside an EventSource for push updates) — polling never depends on the
 * SSE connection staying open, so a dropped connection only means slightly
 * staler data for up to `intervalMs`, never stuck data.
 */
export function useJobPoll<T>(fetcher: () => Promise<T>, intervalMs = 5000): { data: T | undefined; refresh: () => void } {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const activeRef = React.useRef(true);
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  React.useEffect(() => () => {
    activeRef.current = false;
  }, []);

  const refresh = React.useCallback(() => {
    void fetcherRef.current()
      .then((next) => {
        if (activeRef.current) setData(next);
      })
      .catch(() => {
        /* transient — the next poll tick will retry */
      });
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, refresh };
}
