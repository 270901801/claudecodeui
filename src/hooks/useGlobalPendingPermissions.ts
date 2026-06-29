import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWebSocket } from '../contexts/WebSocketContext';
import type { ServerEvent } from '../contexts/WebSocketContext';
import type { PendingPermissionRequest } from '../components/chat/types/types';

/**
 * Subscribing with a very large `lastSeq` makes the server replay nothing
 * (it only replays events with `seq > lastSeq`). We still get the
 * `chat_subscribed` ack (with the run's current `pendingPermissions`) and the
 * run's writer is re-attached to this socket, so *future* permission events
 * flow normally. This keeps the background-session subscription from
 * re-streaming a whole transcript into the shared session store.
 */
const SKIP_REPLAY_SEQ = Number.MAX_SAFE_INTEGER;

const isActionable = (toolName?: unknown): boolean =>
  toolName !== 'ExitPlanMode' && toolName !== 'exit_plan_mode';

export type PermissionDecision = {
  allow?: boolean;
  message?: string;
  rememberEntry?: string | null;
  updatedInput?: unknown;
};

const removeRequest = (
  map: Map<string, PendingPermissionRequest[]>,
  sessionId: string,
  requestId: string,
): Map<string, PendingPermissionRequest[]> => {
  const existing = map.get(sessionId);
  if (!existing || !existing.some((request) => request.requestId === requestId)) {
    return map;
  }
  const filtered = existing.filter((request) => request.requestId !== requestId);
  const next = new Map(map);
  if (filtered.length) {
    next.set(sessionId, filtered);
  } else {
    next.delete(sessionId);
  }
  return next;
};

/**
 * Tracks pending tool-permission / question prompts for *every* running
 * session, not just the one currently in view, so they can be answered from a
 * global surface (the active-sessions capsule).
 *
 * The server resolves a `chat.permission-response` by `requestId` alone with
 * no session scoping, and the frontend shares a single websocket, so answering
 * from outside the session view is fully supported — the only gap this hook
 * fills is *receiving* the prompts for background sessions by subscribing to
 * all running sessions.
 */
export function useGlobalPendingPermissions(runningSessionIds: readonly string[]) {
  const { subscribe, sendMessage } = useWebSocket();
  const [pendingBySession, setPendingBySession] = useState<
    Map<string, PendingPermissionRequest[]>
  >(() => new Map());

  // Stable primitive key so effects only re-run when the *set* changes.
  const runningKey = useMemo(
    () => [...runningSessionIds].sort().join('|'),
    [runningSessionIds],
  );
  const runningIdsRef = useRef<readonly string[]>(runningSessionIds);
  runningIdsRef.current = runningSessionIds;

  const subscribeToRunning = useCallback(() => {
    const ids = runningIdsRef.current;
    if (!ids.length) {
      return;
    }
    sendMessage({
      type: 'chat.subscribe',
      sessions: ids.map((sessionId) => ({ sessionId, lastSeq: SKIP_REPLAY_SEQ })),
    });
  }, [sendMessage]);

  // (Re)subscribe whenever the running set changes.
  useEffect(() => {
    subscribeToRunning();
  }, [runningKey, subscribeToRunning]);

  // Drop tracked prompts for sessions that are no longer running.
  useEffect(() => {
    setPendingBySession((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const sessionId of next.keys()) {
        if (!runningIdsRef.current.includes(sessionId)) {
          next.delete(sessionId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [runningKey]);

  useEffect(() => {
    const handleEvent = (msg: ServerEvent) => {
      const sessionId = typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : null;

      switch (msg.kind) {
        case 'websocket_reconnected':
          subscribeToRunning();
          return;

        case 'chat_subscribed': {
          if (!sessionId || !Array.isArray(msg.pendingPermissions)) {
            return;
          }
          const list = (msg.pendingPermissions as PendingPermissionRequest[]).filter((request) =>
            isActionable(request?.toolName),
          );
          setPendingBySession((prev) => {
            const next = new Map(prev);
            if (list.length) {
              next.set(sessionId, list);
            } else {
              next.delete(sessionId);
            }
            return next;
          });
          return;
        }

        case 'permission_request': {
          if (!sessionId || typeof msg.requestId !== 'string' || !isActionable(msg.toolName)) {
            return;
          }
          setPendingBySession((prev) => {
            const existing = prev.get(sessionId) ?? [];
            if (existing.some((request) => request.requestId === msg.requestId)) {
              return prev;
            }
            const next = new Map(prev);
            next.set(sessionId, [
              ...existing,
              {
                requestId: msg.requestId as string,
                toolName: (msg.toolName as string) || 'UnknownTool',
                input: msg.input,
                context: msg.context,
                sessionId,
                receivedAt: new Date(),
              },
            ]);
            return next;
          });
          return;
        }

        case 'permission_cancelled': {
          if (!sessionId || typeof msg.requestId !== 'string') {
            return;
          }
          setPendingBySession((prev) => removeRequest(prev, sessionId, msg.requestId as string));
          return;
        }

        case 'complete': {
          if (!sessionId) {
            return;
          }
          setPendingBySession((prev) => {
            if (!prev.has(sessionId)) {
              return prev;
            }
            const next = new Map(prev);
            next.delete(sessionId);
            return next;
          });
          return;
        }

        default:
          return;
      }
    };

    return subscribe(handleEvent);
  }, [subscribe, subscribeToRunning]);

  const resolve = useCallback(
    (sessionId: string, requestIds: string | string[], decision: PermissionDecision) => {
      const ids = (Array.isArray(requestIds) ? requestIds : [requestIds]).filter(Boolean);
      if (!ids.length) {
        return;
      }
      ids.forEach((requestId) => {
        sendMessage({
          type: 'chat.permission-response',
          requestId,
          allow: Boolean(decision?.allow),
          updatedInput: decision?.updatedInput,
          message: decision?.message,
          rememberEntry: decision?.rememberEntry,
        });
      });
      setPendingBySession((prev) => {
        let next = prev;
        ids.forEach((requestId) => {
          next = removeRequest(next, sessionId, requestId);
        });
        return next;
      });
    },
    [sendMessage],
  );

  return { pendingBySession, resolve };
}
