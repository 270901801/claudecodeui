import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SessionActivityMap } from '../../hooks/useSessionProtection';

const STORAGE_KEY = 'active-sessions:recent-ran';
// Upper bound the persisted list can ever grow to; the visible count is capped
// separately by the user-configurable limit (see {@link useMaxRecentSessions}).
const MAX_RECENT = 50;

export interface RecentRanRecord {
  sessionId: string;
  lastRanAt: number;
  /** Completed since it was last viewed — drives the unread red dot. */
  unviewed?: boolean;
}

const load = (): RecentRanRecord[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (record): record is RecentRanRecord =>
          !!record
          && typeof (record as RecentRanRecord).sessionId === 'string'
          && typeof (record as RecentRanRecord).lastRanAt === 'number',
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
};

const save = (records: RecentRanRecord[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage full / unavailable — ignore.
  }
};

/**
 * Persisted MRU list of sessions that have *run a task* on this client, so the
 * capsule can act as a quick-switcher even after a session goes idle (capped at
 * {@link MAX_RECENT}, survives reloads).
 *
 * Also tracks an "unviewed" flag: a session that finishes while it is not the
 * one on screen is marked unread (red dot) until the user opens it.
 */
export function useRecentRanSessions(
  processingSessions: SessionActivityMap,
  activeSessionId: string | null,
) {
  const [recent, setRecent] = useState<RecentRanRecord[]>(() => load());

  // Only the *set* of running ids matters; recompute on changes.
  const runningKey = useMemo(
    () => Array.from(processingSessions.keys()).sort().join('|'),
    [processingSessions],
  );

  const prevRunningRef = useRef<Set<string>>(new Set());
  const activeRef = useRef<string | null>(activeSessionId);
  activeRef.current = activeSessionId;

  useEffect(() => {
    const current = new Set(runningKey ? runningKey.split('|') : []);
    const previous = prevRunningRef.current;
    const completed: string[] = [];
    for (const sessionId of previous) {
      if (!current.has(sessionId)) {
        completed.push(sessionId);
      }
    }
    prevRunningRef.current = current;

    if (!current.size && !completed.length) {
      return;
    }

    setRecent((prev) => {
      const now = Date.now();
      const byId = new Map(prev.map((record) => [record.sessionId, record] as const));
      // Currently running: bump to top, clear any stale unread flag.
      for (const sessionId of current) {
        byId.set(sessionId, { sessionId, lastRanAt: now, unviewed: false });
      }
      // Just completed: mark unread unless the user was viewing it.
      for (const sessionId of completed) {
        byId.set(sessionId, {
          sessionId,
          lastRanAt: now,
          unviewed: sessionId !== activeRef.current,
        });
      }
      const next = Array.from(byId.values())
        .sort((a, b) => b.lastRanAt - a.lastRanAt)
        .slice(0, MAX_RECENT);
      save(next);
      return next;
    });
  }, [runningKey]);

  // Opening a session clears its unread flag.
  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    setRecent((prev) => {
      if (!prev.some((record) => record.sessionId === activeSessionId && record.unviewed)) {
        return prev;
      }
      const next = prev.map((record) =>
        record.sessionId === activeSessionId ? { ...record, unviewed: false } : record,
      );
      save(next);
      return next;
    });
  }, [activeSessionId]);

  const removeRecent = useCallback((sessionId: string) => {
    setRecent((prev) => {
      const next = prev.filter((record) => record.sessionId !== sessionId);
      save(next);
      return next;
    });
  }, []);

  return { recent, removeRecent };
}
