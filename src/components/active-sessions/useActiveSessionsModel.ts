import { useMemo } from 'react';

import type { Project, LLMProvider } from '../../types/app';
import type { SessionActivityMap } from '../../hooks/useSessionProtection';
import type { PendingPermissionRequest } from '../chat/types/types';

import type { RecentRanRecord } from './useRecentRanSessions';
import { useMaxRecentSessions } from './recentSessionsLimit';

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

export interface RecentSessionEntry {
  sessionId: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  provider: LLMProvider | null;
  lastRanAt: number;
  unviewed: boolean;
}

interface SessionMeta {
  name: string;
  projectId: string | null;
  projectName: string | null;
  provider: LLMProvider | null;
}

const fallbackName = (sessionId: string): string => `${sessionId.slice(0, 8)}…`;

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
        || fallbackName(session.id);
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
  recent: RecentRanRecord[];
}

/**
 * Derives the capsule's two tiers from existing sources of truth:
 *  - `running`: sessions currently processing a request (the 5s-polled map);
 *  - `recentIdle`: persisted MRU of sessions that ran but are now idle, so the
 *    capsule doubles as a quick-switcher instead of emptying out.
 * Names come from the projects list; no new polling is introduced here.
 */
export function useActiveSessionsModel({
  processingSessions,
  projects,
  pendingBySession,
  recent,
}: UseActiveSessionsModelArgs) {
  const sessionMeta = useMemo(() => buildSessionMeta(projects), [projects]);
  const maxRecent = useMaxRecentSessions();

  const running = useMemo<ActiveSessionEntry[]>(() => {
    const entries: ActiveSessionEntry[] = [];
    for (const [sessionId, activity] of processingSessions) {
      const meta = sessionMeta.get(sessionId);
      entries.push({
        sessionId,
        name: meta?.name ?? fallbackName(sessionId),
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

  const recentIdle = useMemo<RecentSessionEntry[]>(() => {
    return recent
      .filter((record) => !processingSessions.has(record.sessionId))
      .slice(0, maxRecent)
      .map((record) => {
        const meta = sessionMeta.get(record.sessionId);
        return {
          sessionId: record.sessionId,
          name: meta?.name ?? fallbackName(record.sessionId),
          projectId: meta?.projectId ?? null,
          projectName: meta?.projectName ?? null,
          provider: meta?.provider ?? null,
          lastRanAt: record.lastRanAt,
          unviewed: Boolean(record.unviewed),
        };
      });
  }, [recent, processingSessions, sessionMeta, maxRecent]);

  const needsInputTotal = useMemo(
    () => running.reduce((sum, entry) => sum + entry.pendingCount, 0),
    [running],
  );

  return { running, recentIdle, needsInputTotal };
}
