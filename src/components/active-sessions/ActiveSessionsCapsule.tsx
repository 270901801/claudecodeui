import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Clock,
  GripHorizontal,
  History,
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
import { useRecentRanSessions } from './useRecentRanSessions';

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

const formatRelative = (timestamp: number, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) {
    return '刚刚';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  return `${Math.floor(hours / 24)} 天前`;
};

const PROVIDER_LABEL: Record<string, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
};

const providerLabel = (provider: string | null): string | null =>
  provider ? PROVIDER_LABEL[provider] ?? provider : null;

// v3: uses right+bottom (distance from viewport edges) so the button's bottom-right
// corner stays fixed when the panel expands in either direction.
const POSITION_STORAGE_KEY = 'active-sessions:capsule-position-v3';

interface CapsulePosition {
  right: number;
  bottom: number;
}

const loadPosition = (): CapsulePosition | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CapsulePosition>;
    if (typeof parsed?.right === 'number' && typeof parsed?.bottom === 'number') {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch {
    // Malformed value — fall back to the default corner.
  }
  return null;
};

const savePosition = (pos: CapsulePosition | null): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (pos) {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
    } else {
      window.localStorage.removeItem(POSITION_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable — position simply won't persist.
  }
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
  const { recent, removeRecent } = useRecentRanSessions(processingSessions, activeSessionId);
  const { running, recentIdle, needsInputTotal } = useActiveSessionsModel({
    processingSessions,
    projects,
    pendingBySession,
    recent,
  });

  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Drag-to-move: the user can reposition the capsule anywhere on screen; the
  // chosen spot persists in localStorage. `null` means "default corner".
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CapsulePosition | null>(() => loadPosition());
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originRight: number;
    originBottom: number;
    moved: boolean;
  } | null>(null);
  // Set briefly after a real drag so the trailing click doesn't toggle the panel.
  const suppressClickRef = useRef(false);

  const handleDragPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) {
      return; // ignore right/middle clicks
    }
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originRight: window.innerWidth - rect.right,
      originBottom: window.innerHeight - rect.bottom,
      moved: false,
    };
    setDragging(true);
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture unsupported — the handlers below still drive the drag.
    }
  };

  const handleDragPointerMove = (event: React.PointerEvent) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) > 4) {
      state.moved = true;
    }
    if (!state.moved) {
      return;
    }
    const el = containerRef.current;
    const width = el?.offsetWidth ?? 0;
    const height = el?.offsetHeight ?? 0;
    const maxRight = Math.max(0, window.innerWidth - width);
    const maxBottom = Math.max(0, window.innerHeight - height);
    // Dragging right (dx > 0) → right distance decreases; left (dx < 0) → increases.
    const right = Math.min(Math.max(0, state.originRight - dx), maxRight);
    // Dragging down (dy > 0) → bottom decreases; up (dy < 0) → bottom increases.
    const bottom = Math.min(Math.max(0, state.originBottom - dy), maxBottom);
    setPosition({ right, bottom });
  };

  const handleDragPointerUp = (event: React.PointerEvent) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    setDragging(false);
    if (state.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    try {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  // Double-click the drag handle to snap back to the default corner.
  const resetPosition = () => {
    setPosition(null);
    savePosition(null);
  };

  const dragHandlers = {
    onPointerDown: handleDragPointerDown,
    onPointerMove: handleDragPointerMove,
    onPointerUp: handleDragPointerUp,
    onPointerCancel: handleDragPointerUp,
  };

  const hasRunning = running.length > 0;
  const hasRecent = recentIdle.length > 0;
  const unviewedCount = recentIdle.reduce((sum, entry) => sum + (entry.unviewed ? 1 : 0), 0);
  const visible = hasRunning || hasRecent;

  // Tick once per second for elapsed / relative time (only while visible).
  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [visible]);

  // Auto-expand when a new prompt needs an answer so the user notices it.
  const prevNeedsInputRef = useRef(0);
  useEffect(() => {
    if (needsInputTotal > prevNeedsInputRef.current) {
      setExpanded(true);
    }
    prevNeedsInputRef.current = needsInputTotal;
  }, [needsInputTotal]);

  // On mobile, tapping anywhere outside the capsule collapses the expanded panel.
  // On desktop the user closes it explicitly with the chevron button.
  useEffect(() => {
    if (!expanded || !isMobile) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [expanded, isMobile]);

  // Reflect the running count on the installed-PWA app icon.
  useEffect(() => {
    updateAppBadge(running.length);
    return () => updateAppBadge(0);
  }, [running.length]);

  // Persist the position once the drag settles (skip writes mid-drag).
  useEffect(() => {
    if (dragging || !position) {
      return;
    }
    savePosition(position);
  }, [position, dragging]);

  // Keep the capsule on screen when the viewport shrinks (rotate / resize).
  useEffect(() => {
    if (!position) {
      return undefined;
    }
    const onResize = () => {
      const el = containerRef.current;
      const width = el?.offsetWidth ?? 0;
      const height = el?.offsetHeight ?? 0;
      setPosition((prev) => {
        if (!prev) {
          return prev;
        }
        const right = Math.min(prev.right, Math.max(0, window.innerWidth - width));
        const bottom = Math.min(prev.bottom, Math.max(0, window.innerHeight - height));
        return right === prev.right && bottom === prev.bottom ? prev : { right, bottom };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position]);

  if (!visible) {
    return null;
  }

  const collapsedLabel = needsInputTotal > 0
    ? `${needsInputTotal} 个待处理`
    : hasRunning
      ? `${running.length} 个运行中`
      : `最近会话 · ${recentIdle.length}`;

  const containerStyle: React.CSSProperties = {
    ...(position
      ? { right: position.right, bottom: position.bottom }
      : {
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${isMobile ? '5rem' : '1.25rem'})`,
          right: isMobile ? '0.75rem' : '1.25rem',
        }),
    userSelect: dragging ? 'none' : undefined,
    touchAction: dragging ? 'none' : undefined,
  };

  const capsule = (
    <div ref={containerRef} className="fixed z-[60] flex flex-col items-end gap-2" style={containerStyle}>
      {expanded && (
        <div className="w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl">
          <div
            {...dragHandlers}
            onDoubleClick={resetPosition}
            title="拖拽移动 · 双击复位"
            className="flex select-none items-center justify-between border-b border-border/50 px-3 py-2"
            style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <GripHorizontal className="h-4 w-4 text-muted-foreground/60" />
              会话
            </span>
            <button
              type="button"
              aria-label="收起"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setExpanded(false)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {hasRunning && (
              <div className="px-1 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                运行中 · {running.length}
              </div>
            )}
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
                          {[entry.projectName, providerLabel(entry.provider), formatElapsed(entry.startedAt, now)]
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

            {hasRecent && (
              <div className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                最近 · {recentIdle.length}
              </div>
            )}
            {recentIdle.map((entry) => (
              <div
                key={entry.sessionId}
                className="mb-1.5 flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 p-2 last:mb-0"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  onClick={() => onOpenSession(entry.sessionId, entry.projectId)}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    {entry.unviewed ? (
                      <span className="h-2 w-2 rounded-full bg-red-500" aria-label="未查看" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={[
                        'block truncate text-sm',
                        entry.unviewed ? 'font-medium text-foreground' : 'text-foreground',
                      ].join(' ')}
                    >
                      {entry.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {[entry.projectName, providerLabel(entry.provider), formatRelative(entry.lastRanAt, now)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="从最近移除"
                  className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                  onClick={() => removeRecent(entry.sessionId)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        {...dragHandlers}
        onDoubleClick={resetPosition}
        onClick={() => {
          // A drag just ended on this button — don't also toggle the panel.
          if (suppressClickRef.current) {
            return;
          }
          setExpanded((value) => !value);
        }}
        title="拖拽移动 · 双击复位"
        className={[
          'relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium shadow-lg transition-colors',
          needsInputTotal > 0
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'border border-border/60 bg-card text-foreground hover:bg-muted',
        ].join(' ')}
        style={{ touchAction: 'none' }}
        aria-label={`活跃会话面板：${collapsedLabel}${unviewedCount > 0 ? `（${unviewedCount} 个未查看）` : ''}`}
      >
        {unviewedCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-card" />
        )}
        {needsInputTotal > 0 ? (
          <ShieldAlert className="h-4 w-4" />
        ) : hasRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <History className="h-4 w-4 text-muted-foreground" />
        )}
        <span>{collapsedLabel}</span>
        {expanded ? <X className="h-3.5 w-3.5 opacity-70" /> : null}
      </button>
    </div>
  );

  return createPortal(capsule, document.body);
}
