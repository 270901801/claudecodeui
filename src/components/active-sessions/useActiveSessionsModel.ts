import { useEffect, useMemo, useRef, useState } from 'react';

import type { Project, LLMProvider } from '../../types/app';
import type { SessionActivityMap } from '../../hooks/useSessionProtection';
import type { PendingPermissionRequest } from '../chat/types/types';

const JUST_COMPLETED_TTL_MS = 6_000;

export interface ActiveSessionEntry {
  sessionId: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  provider: LLMProvider | null;
  statusText: string | null;
  startedAt: number;
  canInterrupt: boolean;
  pendingCount: number;
}

export interface JustCompletedEntry {
  sessionId: string;
  name: string;
  completedAt: number;
}

interface SessionMeta {
  name: string;
  projectId: string | null;
  projectName: string | null;
  provider: LLMProvider | null;
}

const buildSessionMeta = (projects: Project[]): Map<string, SessionMeta> => {
  const map = new Map<string, SessionMeta>();
  for (const project of projects) {
    const sessions = project.sessions ?? [];
    for (const session of sessions) {
      if (!session?.id || map.has(session.id)) {
        continue;
      }
      const name =
        session.title?.trim()
        || session.name?.trim()
        || session.summary?.trim()
        || `${session.id.slice(0, 8)}…`;
      map.set(session.id, {
        name,
        projectId: project.projectId ?? null,
        projectName: project.displayName ?? null,
        provider: session.provider ?? session.__provider ?? null,
      });
    }
  }
  return map;
};

interface UseActiveSessionsModelArgs {
  processingSessions: SessionActivityMap;
  projects: Project[];
  pendingBySession: ReadonlyMap<string, PendingPermissionRequest[]>;
}

/**
 * Derives everything the capsule renders from the existing sources of truth:
 * the processing map (5s-polled running state), the projects list (for human
 * names), and the global pending-permission registry. No new polling here.
 */
export function useActiveSessionsModel({
  processingSessions,
  projects,
  pendingBySession,
}: UseActiveSessionsModelArgs) {
  const sessionMeta = useMemo(() => buildSessionMeta(projects), [projects]);

  const running = useMemo<ActiveSessionEntry[]>(() => {
    const entries: ActiveSessionEntry[] = [];
    for (const [sessionId, activity] of processingSessions) {
      const meta = sessionMeta.get(sessionId);
      entries.push({
        sessionId,
        name: meta?.name ?? `${sessionId.slice(0, 8)}…`,
        projectId: meta?.projectId ?? null,
        projectName: meta?.projectName ?? null,
        provider: meta?.provider ?? null,
        statusText: activity.statusText,
        startedAt: activity.startedAt,
        canInterrupt: activity.canInterrupt,
        pendingCount: pendingBySession.get(sessionId)?.length ?? 0,
      });
    }
    // Sessions needing input float to the top, then oldest-running first.
    entries.sort((a, b) => {
      if (Boolean(b.pendingCount) !== Boolean(a.pendingCount)) {
        return b.pendingCount - a.pendingCount;
      }
      return a.startedAt - b.startedAt;
    });
    return entries;
  }, [processingSessions, sessionMeta, pendingBySession]);

  // Detect sessions that dropped out of the running set and surface them as a
  // transient "just completed" feed.
  const prevRunningRef = useRef<Set<string>>(new Set());
  const [justCompleted, setJustCompleted] = useState<JustCompletedEntry[]>([]);

  useEffect(() => {
    const currentIds = new Set(running.map((entry) => entry.sessionId));
    const previous = prevRunningRef.current;
    const completedNow: JustCompletedEntry[] = [];
    const completedAt = Date.now();

    for (const sessionId of previous) {
      if (!currentIds.has(sessionId)) {
        const meta = sessionMeta.get(sessionId);
        completedNow.push({
          sessionId,
          name: meta?.name ?? `${sessionId.slice(0, 8)}…`,
          completedAt,
        });
      }
    }

    prevRunningRef.current = currentIds;

    if (completedNow.length) {
      setJustCompleted((prev) => [
        ...prev.filter((entry) => !completedNow.some((c) => c.sessionId === entry.sessionId)),
        ...completedNow,
      ]);
    }
  }, [running, sessionMeta]);

  // Expire the "just completed" feed.
  useEffect(() => {
    if (!justCompleted.length) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - JUST_COMPLETED_TTL_MS;
      setJustCompleted((prev) => {
        const next = prev.filter((entry) => entry.completedAt > cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [justCompleted.length]);

  const needsInputTotal = useMemo(
    () => running.reduce((sum, entry) => sum + entry.pendingCount, 0),
    [running],
  );

  return { running, justCompleted, needsInputTotal };
}
