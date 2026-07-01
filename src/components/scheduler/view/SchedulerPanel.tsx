import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Clock, RefreshCw, X } from 'lucide-react';

import { Button } from '../../../shared/view/ui/Button';
import { Input } from '../../../shared/view/ui/Input';
import { ScrollArea } from '../../../shared/view/ui/ScrollArea';
import type { Project } from '../../../types/app';
import { api } from '../../../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduledTaskStatus =
  | 'pending'
  | 'running'
  | 'quota_blocked'
  | 'waiting_interactive'
  | 'done'
  | 'failed'
  | 'cancelled';

type ScheduledTaskUnit = {
  id: string;
  seq: number;
  status: string;
  app_session_id: string | null;
  result_summary: string | null;
  started_at: number | null;
  completed_at: number | null;
};

type ScheduledTask = {
  id: string;
  title: string;
  mode: string;
  prompt: string | null;
  trigger_type: 'asap' | 'delay' | 'cron';
  cron_expr: string | null;
  auth_policy: string;
  model: string | null;
  status: ScheduledTaskStatus;
  next_run_at: number | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: number;
  units: ScheduledTaskUnit[];
};

type TriggerType = 'asap' | 'delay' | 'cron';
type AuthPolicy = 'whitelist' | 'read_only' | 'bypass';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES: ScheduledTaskStatus[] = ['done', 'failed', 'cancelled'];

function statusBadge(status: ScheduledTaskStatus) {
  const map: Record<ScheduledTaskStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'border-border text-muted-foreground' },
    running: { label: 'Running', className: 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    quota_blocked: { label: 'Quota blocked', className: 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    waiting_interactive: { label: 'Waiting', className: 'border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-400' },
    done: { label: 'Done', className: 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400' },
    failed: { label: 'Failed', className: 'border-destructive/50 bg-destructive/10 text-destructive' },
    cancelled: { label: 'Cancelled', className: 'border-border text-muted-foreground/60' },
  };
  const { label, className } = map[status] ?? { label: status, className: 'border-border text-muted-foreground' };
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function formatNextRun(ts: number | null, status: ScheduledTaskStatus): string {
  if (!ts) return '';
  if (status === 'quota_blocked') {
    const diff = ts - Date.now();
    if (diff <= 0) return 'Soon';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.round(diff / 3600000);
    return `in ${hrs}h`;
  }
  return new Date(ts).toLocaleString();
}

function unitQueueStatus(u: ScheduledTaskUnit): 'completed' | 'in_progress' | 'pending' {
  if (u.status === 'done') return 'completed';
  if (u.status === 'running') return 'in_progress';
  return 'pending';
}

// ─── Create Form ──────────────────────────────────────────────────────────────

type FormState = {
  title: string;
  prompt: string;
  triggerType: TriggerType;
  delayMinutes: string;
  cronExpr: string;
  authPolicy: AuthPolicy;
  model: string;
};

const DEFAULT_FORM: FormState = {
  title: '',
  prompt: '',
  triggerType: 'asap',
  delayMinutes: '60',
  cronExpr: '0 2 * * *',
  authPolicy: 'whitelist',
  model: '',
};

function CreateTaskForm({
  projectPath,
  onCreated,
}: {
  projectPath: string;
  onCreated: (task: ScheduledTask) => void;
}) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.prompt.trim()) { setError('Prompt is required'); return; }

    const body: Record<string, unknown> = {
      title: form.title.trim(),
      prompt: form.prompt.trim(),
      projectPath,
      triggerType: form.triggerType,
      authPolicy: form.authPolicy,
    };
    if (form.triggerType === 'delay') body.delayMinutes = Number(form.delayMinutes) || 60;
    if (form.triggerType === 'cron') body.cronExpr = form.cronExpr.trim();
    if (form.model.trim()) body.model = form.model.trim();

    setSubmitting(true);
    try {
      const res = await api.scheduler.createTask(body);
      const data = await res.json() as { task?: ScheduledTask; error?: string };
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      setForm(DEFAULT_FORM);
      setOpen(false);
      onCreated(data.task!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
  const inputCls = 'h-8 text-xs';
  const selectCls =
    'flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  return (
    <div className="border-b border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        <span className="flex-1">New scheduled task</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3 px-4 pb-4">
          <div>
            <label className={labelCls}>Title</label>
            <Input className={inputCls} placeholder="e.g. Nightly refactor run" value={form.title} onChange={set('title')} />
          </div>

          <div>
            <label className={labelCls}>Prompt</label>
            <textarea
              value={form.prompt}
              onChange={set('prompt')}
              rows={4}
              placeholder="Describe what the agent should do…"
              className="flex min-h-[80px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Trigger</label>
              <select className={selectCls} value={form.triggerType} onChange={set('triggerType')}>
                <option value="asap">ASAP</option>
                <option value="delay">Delay</option>
                <option value="cron">Cron</option>
              </select>
            </div>

            {form.triggerType === 'delay' && (
              <div>
                <label className={labelCls}>Delay (minutes)</label>
                <Input className={inputCls} type="number" min={1} value={form.delayMinutes} onChange={set('delayMinutes')} />
              </div>
            )}

            {form.triggerType === 'cron' && (
              <div>
                <label className={labelCls}>Cron expression</label>
                <Input className={inputCls} placeholder="0 2 * * *" value={form.cronExpr} onChange={set('cronExpr')} />
              </div>
            )}

            {form.triggerType === 'asap' && <div />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Auth policy</label>
              <select className={selectCls} value={form.authPolicy} onChange={set('authPolicy')}>
                <option value="whitelist">Whitelist (default)</option>
                <option value="read_only">Read-only</option>
                <option value="bypass">Bypass (unsafe)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Model (optional)</label>
              <Input className={inputCls} placeholder="claude-sonnet-4-5" value={form.model} onChange={set('model')} />
            </div>
          </div>

          <div className="truncate font-mono text-[10px] text-muted-foreground/70">
            Project: {projectPath}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" size="sm" disabled={submitting} className="h-7 text-xs">
            {submitting ? 'Submitting…' : 'Submit task'}
          </Button>
        </form>
      )}
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onCancel,
  onNavigateToSession,
}: {
  task: ScheduledTask;
  onCancel: (id: string) => void;
  onNavigateToSession?: (sessionId: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isTerminal = TERMINAL_STATUSES.includes(task.status);
  const doneUnits = task.units.filter((u) => u.status === 'done').length;
  const totalUnits = task.units.length;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onCancel(task.id);
    } finally {
      setCancelling(false);
    }
  };

  const triggerLabel =
    task.trigger_type === 'cron'
      ? `cron: ${task.cron_expr}`
      : task.trigger_type === 'delay'
        ? 'delay'
        : 'asap';

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{task.title}</span>
            {statusBadge(task.status)}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5 flex-shrink-0" />
            <span>{triggerLabel}</span>
            {task.next_run_at && !isTerminal && (
              <span className="text-amber-600 dark:text-amber-400">
                · {formatNextRun(task.next_run_at, task.status)}
              </span>
            )}
            {totalUnits > 1 && (
              <span>· {doneUnits}/{totalUnits} units</span>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {!isTerminal && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={cancelling}
              onClick={() => { void handleCancel(); }}
              title="Cancel task"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {task.units.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setExpanded((v) => !v)}
              title="Toggle units"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
        </div>
      </div>

      {task.last_error && (
        <p className="break-words rounded bg-destructive/5 px-2 py-1 font-mono text-[10px] text-destructive">
          {task.last_error}
        </p>
      )}

      {expanded && task.units.length > 0 && (
        <div className="space-y-1 border-t border-border/40 pt-2">
          {task.units.map((unit) => {
            const qs = unitQueueStatus(unit);
            return (
              <div key={unit.id} className="flex items-center gap-2 text-xs">
                <span className={
                  qs === 'completed' ? 'text-green-500' : qs === 'in_progress' ? 'animate-pulse text-blue-500' : 'text-muted-foreground/40'
                }>●</span>
                <span className={qs === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'}>
                  Unit {unit.seq + 1}
                </span>
                {unit.app_session_id && onNavigateToSession && (
                  <button
                    type="button"
                    onClick={() => onNavigateToSession(unit.app_session_id!)}
                    className="ml-auto text-[10px] text-primary hover:underline"
                  >
                    View session →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Scheduler Panel ──────────────────────────────────────────────────────────

type SchedulerPanelProps = {
  selectedProject: Project;
  onNavigateToSession?: (sessionId: string) => void;
};

export default function SchedulerPanel({ selectedProject, onNavigateToSession }: SchedulerPanelProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.scheduler.listTasks();
      if (!res.ok) { setError(`HTTP ${res.status}`); return; }
      const data = await res.json() as { tasks?: ScheduledTask[] };
      setTasks(data.tasks ?? []);
      setError(null);
    } catch {
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    pollRef.current = setInterval(() => { void fetchTasks(); }, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchTasks]);

  const handleCreated = useCallback((task: ScheduledTask) => {
    setTasks((prev) => [task, ...prev]);
  }, []);

  const handleCancel = useCallback(async (taskId: string) => {
    const res = await api.scheduler.cancelTask(taskId);
    if (res.ok) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'cancelled' as const } : t)),
      );
    }
  }, []);

  const projectPath = selectedProject.fullPath ?? selectedProject.path ?? '';

  const activeTasks = tasks.filter((t) => !TERMINAL_STATUSES.includes(t.status));
  const doneTasks = tasks.filter((t) => TERMINAL_STATUSES.includes(t.status));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CreateTaskForm projectPath={projectPath} onCreated={handleCreated} />

      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Scheduled tasks
          {tasks.length > 0 && <span className="ml-1.5 text-muted-foreground/60">({tasks.length})</span>}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => { void fetchTasks(); }}
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-4">
          {loading && (
            <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
          )}

          {!loading && error && (
            <p className="py-8 text-center text-xs text-destructive">{error}</p>
          )}

          {!loading && !error && tasks.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No scheduled tasks yet. Create one above.
            </p>
          )}

          {activeTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onCancel={handleCancel}
              onNavigateToSession={onNavigateToSession}
            />
          ))}

          {activeTasks.length > 0 && doneTasks.length > 0 && (
            <div className="border-t border-border/40 pt-1">
              <p className="mb-2 text-[10px] text-muted-foreground/60">Completed / Cancelled</p>
            </div>
          )}

          {doneTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onCancel={handleCancel}
              onNavigateToSession={onNavigateToSession}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
