"use client";

import * as React from "react";
import { isRecipientRoleKey, type RecipientRoleKey } from "@/lib/complaints/recipient-roles";

/**
 * Recipient-selection state for a complaint letter, persisted to localStorage so
 * the user's Copy-To choices survive a refresh / navigation while drafting, and
 * cleared once the letter is filed. Keyed per complaint + letter kind.
 */
export function useRecipientSelection(complaintId: string, kind: string) {
  const storageKey = React.useMemo(() => `cmp:${complaintId}:${kind}:recipients`, [complaintId, kind]);
  const [selected, setSelected] = React.useState<RecipientRoleKey[]>([]);

  // Hydrate whenever the (complaint, kind) key changes.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setSelected(Array.isArray(parsed) ? parsed.filter((k: unknown): k is RecipientRoleKey => typeof k === "string" && isRecipientRoleKey(k)) : []);
    } catch {
      setSelected([]);
    }
  }, [storageKey]);

  const write = React.useCallback(
    (next: RecipientRoleKey[]) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* private mode / quota — selection just won't persist */
      }
    },
    [storageKey],
  );

  const toggle = React.useCallback(
    (key: RecipientRoleKey) => {
      setSelected((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        write(next);
        return next;
      });
    },
    [write],
  );

  const clear = React.useCallback(() => {
    setSelected([]);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const setSelectedAll = React.useCallback(
    (next: RecipientRoleKey[]) => {
      setSelected(next);
      write(next);
    },
    [write]
  );

  return { selected, toggle, clear, setSelectedAll };
}
