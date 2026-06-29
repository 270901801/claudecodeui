import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  ShieldAlert,
  StopCircle,
  X,
} from 'lucide-react';

import type { Project } from '../../types/app';
import type { SessionActivityMap } from '../../hooks/useSessionProtection';
import { useGlobalPendingPermissions } from '../../hooks/useGlobalPendingPermissions';
import PermissionRequestsBanner from '../chat/view/subcomponents/PermissionRequestsBanner';
import { grantClaudeToolPermission } from '../chat/utils/chatPermissions';

import { useActiveSessionsModel } from './useActiveSessionsModel';

interface ActiveSessionsCapsuleProps {
  processingSessions: SessionActivityMap;
  projects: Project[];
  activeSessionId: string | null;
  isMobile: boolean;
  onOpenSession: (sessionId: string, projectId: string | null) => void;
  onAbortSession: (sessionId: string) => void;
}

const formatElapsed = (startedAt: number, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
};

const updateAppBadge = (count: number) => {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(count);
    } else if (count <= 0 && typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge();
    }
  } catch {
    // Badging API not available / not permitted — ignore.
  }
};

export default function ActiveSessionsCapsule({
  processingSessions,
  projects,
  activeSessionId,
  isMobile,
  onOpenSession,
  onAbortSession,
}: ActiveSessionsCapsuleProps) {
  const runningSessionIds = Array.from(processingSessions.keys());
  const { pendingBySession, resolve } = useGlobalPendingPermissions(runningSessionIds);
  const { running, justCompleted, needsInputTotal } = useActiveSessionsModel({
    processingSessions,
    projects,
    pendingBySession,
  });

  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick once per second for the elapsed-time display (only while visible).
  useEffect(() => {
    if (!running.length) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running.length]);

  // Auto-expand when a new prompt needs an answer so the user notices it.
  const prevNeedsInputRef = useRef(0);
  useEffect(() => {
    if (needsInputTotal > prevNeedsInputRef.current) {
      setExpanded(true);
    }
    prevNeedsInputRef.current = needsInputTotal;
  }, [needsInputTotal]);

  // Reflect the running count on the installed-PWA app icon.
  useEffect(() => {
    updateAppBadge(running.length);
    return () => updateAppBadge(0);
  }, [running.length]);

  const hasRunning = running.length > 0;
  const showCompletedOnly = !hasRunning && justCompleted.length > 0;

  if (!hasRunning && !showCompletedOnly) {
    return null;
  }

  const collapsedLabel = needsInputTotal > 0
    ? `${needsInputTotal} 个待处理`
    : hasRunning
      ? `${running.length} 个运行中`
      : '已完成';

  const containerStyle: React.CSSProperties = {
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${isMobile ? '5rem' : '1.25rem'})`,
    right: isMobile ? '0.75rem' : '1.25rem',
  };

  const capsule = (
    <div className="fixed z-[60] flex flex-col items-end gap-2" style={containerStyle}>
      {expanded && (hasRunning || showCompletedOnly) && (
        <div className="w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
            <span className="text-sm font-medium text-foreground">活跃会话</span>
            <button
              type="button"
              aria-label="收起"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setExpanded(false)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {running.map((entry) => {
              const pending = pendingBySession.get(entry.sessionId) ?? [];
              const isActiveView = entry.sessionId === activeSessionId;
              // The active session's prompts are already shown by its own
              // in-view banner; avoid a duplicate (and a double-submit race).
              const showInlinePermissions = pending.length > 0 && !isActiveView;

              return (
                <div
                  key={entry.sessionId}
                  className="mb-1.5 rounded-xl border border-border/40 bg-background/60 p-2 last:mb-0"
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      onClick={() => onOpenSession(entry.sessionId, entry.projectId)}
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                        {entry.pendingCount > 0 ? (
                          <ShieldAlert className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {entry.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {[
                            entry.projectName,
                            entry.provider ? PROVIDER_LABEL[entry.provider] ?? entry.provider : null,
                            formatElapsed(entry.startedAt, now),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {entry.statusText && (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
                            {entry.statusText}
                          </span>
                        )}
                        {entry.pendingCount > 0 && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            需要授权 · {entry.pendingCount}
                          </span>
                        )}
                      </span>
                    </button>
                    {entry.canInterrupt && (
                      <button
                        type="button"
                        aria-label="中止"
                        className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onAbortSession(entry.sessionId)}
                      >
                        <StopCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {showInlinePermissions && (
                    <div className="mt-2">
                      <PermissionRequestsBanner
                        pendingPermissionRequests={pending}
                        handlePermissionDecision={(requestIds, decision) =>
                          resolve(entry.sessionId, requestIds, decision)
                        }
                        handleGrantToolPermission={(suggestion) =>
                          grantClaudeToolPermission(suggestion.entry)
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {showCompletedOnly &&
              justCompleted.map((entry) => (
                <div
                  key={entry.sessionId}
                  className="mb-1.5 flex items-center gap-2 rounded-xl border border-border/40 bg-background/60 p-2 last:mb-0"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="truncate text-sm text-foreground">{entry.name}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">已完成</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={[
          'flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium shadow-lg transition-colors',
          needsInputTotal > 0
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'border border-border/60 bg-card text-foreground hover:bg-muted',
        ].join(' ')}
        aria-label={`活跃会话面板：${collapsedLabel}`}
      >
        {needsInputTotal > 0 ? (
          <ShieldAlert className="h-4 w-4" />
        ) : hasRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        )}
        <span>{collapsedLabel}</span>
        {expanded ? <X className="h-3.5 w-3.5 opacity-70" /> : null}
      </button>
    </div>
  );

  return createPortal(capsule, document.body);
}
