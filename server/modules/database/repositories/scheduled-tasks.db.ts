/**
 * Scheduled tasks repository.
 *
 * Persistence for the long-horizon task scheduler: tasks that run unattended
 * on a schedule and auto-suspend when model quota is exhausted, resuming at the
 * next reset. All timestamps are epoch milliseconds. The scheduler tick loop is
 * the only writer of runtime status; the REST layer creates/cancels/reads.
 *
 * See server/services/scheduler.service.js for the state machine that drives
 * these rows.
 */

import crypto from 'crypto';

import { getConnection } from '@/modules/database/connection.js';

export type ScheduledTaskMode = 'single_prompt' | 'taskmaster';
export type ScheduledTaskTrigger = 'asap' | 'delay' | 'cron';
export type ScheduledTaskAuthPolicy = 'bypass' | 'whitelist' | 'read_only';
export type ScheduledTaskStatus =
  | 'pending'
  | 'running'
  | 'quota_blocked'
  | 'waiting_interactive'
  | 'done'
  | 'failed'
  | 'cancelled';

export type ScheduledTaskRow = {
  id: string;
  user_id: number;
  project_path: string;
  title: string;
  mode: ScheduledTaskMode;
  prompt: string | null;
  trigger_type: ScheduledTaskTrigger;
  cron_expr: string | null;
  auth_policy: ScheduledTaskAuthPolicy;
  model: string | null;
  max_retries: number;
  status: ScheduledTaskStatus;
  next_run_at: number | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: number;
  updated_at: number;
};

export type ScheduledTaskUnitStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type ScheduledTaskUnitRow = {
  id: string;
  task_id: string;
  seq: number;
  payload: string;
  provider_session_id: string | null;
  app_session_id: string | null;
  status: ScheduledTaskUnitStatus;
  result_summary: string | null;
  started_at: number | null;
  completed_at: number | null;
};

export type CreateScheduledTaskInput = {
  userId: number;
  projectPath: string;
  title: string;
  mode?: ScheduledTaskMode;
  prompt?: string | null;
  triggerType?: ScheduledTaskTrigger;
  cronExpr?: string | null;
  authPolicy?: ScheduledTaskAuthPolicy;
  model?: string | null;
  maxRetries?: number;
  /** Initial scheduling cursor (epoch ms). null = eligible immediately. */
  nextRunAt?: number | null;
  /** Execution units (payloads). single_prompt tasks pass exactly one. */
  units: string[];
};

// Statuses the tick loop may pick up and advance.
const RUNNABLE_STATUSES: ScheduledTaskStatus[] = ['pending', 'quota_blocked', 'waiting_interactive'];

export const scheduledTasksDb = {
  /** Creates a task and its execution units in one transaction. */
  create(input: CreateScheduledTaskInput): ScheduledTaskRow {
    const db = getConnection();
    const now = Date.now();
    const id = crypto.randomUUID();

    const insertTask = db.prepare(`
      INSERT INTO scheduled_tasks (
        id, user_id, project_path, title, mode, prompt, trigger_type, cron_expr,
        auth_policy, model, max_retries, status, next_run_at, last_error,
        consecutive_failures, created_at, updated_at
      ) VALUES (
        @id, @user_id, @project_path, @title, @mode, @prompt, @trigger_type, @cron_expr,
        @auth_policy, @model, @max_retries, 'pending', @next_run_at, NULL,
        0, @created_at, @updated_at
      )
    `);
    const insertUnit = db.prepare(`
      INSERT INTO scheduled_task_units (id, task_id, seq, payload, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);

    const tx = db.transaction(() => {
      insertTask.run({
        id,
        user_id: input.userId,
        project_path: input.projectPath,
        title: input.title,
        mode: input.mode ?? 'single_prompt',
        prompt: input.prompt ?? null,
        trigger_type: input.triggerType ?? 'asap',
        cron_expr: input.cronExpr ?? null,
        auth_policy: input.authPolicy ?? 'whitelist',
        model: input.model ?? null,
        max_retries: input.maxRetries ?? 3,
        next_run_at: input.nextRunAt ?? null,
        created_at: now,
        updated_at: now,
      });
      input.units.forEach((payload, seq) => {
        insertUnit.run(crypto.randomUUID(), id, seq, payload);
      });
    });
    tx();

    return scheduledTasksDb.get(id)!;
  },

  /** Returns a task by id, or null. */
  get(id: string): ScheduledTaskRow | null {
    const db = getConnection();
    return (
      (db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as ScheduledTaskRow | undefined) ?? null
    );
  },

  /** Lists a user's tasks, newest first. */
  listByUser(userId: number): ScheduledTaskRow[] {
    const db = getConnection();
    return db
      .prepare('SELECT * FROM scheduled_tasks WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as ScheduledTaskRow[];
  },

  /** Returns the units of a task ordered by seq. */
  units(taskId: string): ScheduledTaskUnitRow[] {
    const db = getConnection();
    return db
      .prepare('SELECT * FROM scheduled_task_units WHERE task_id = ? ORDER BY seq ASC')
      .all(taskId) as ScheduledTaskUnitRow[];
  },

  /**
   * Returns tasks the tick loop should consider now: runnable status and
   * next_run_at due (NULL = due immediately). Ordered by soonest due.
   */
  claimDue(now: number): ScheduledTaskRow[] {
    const db = getConnection();
    const placeholders = RUNNABLE_STATUSES.map(() => '?').join(', ');
    return db
      .prepare(
        `SELECT * FROM scheduled_tasks
         WHERE status IN (${placeholders})
           AND (next_run_at IS NULL OR next_run_at <= ?)
         ORDER BY next_run_at IS NULL DESC, next_run_at ASC`
      )
      .all(...RUNNABLE_STATUSES, now) as ScheduledTaskRow[];
  },

  /** Returns the lowest-seq pending unit of a task, or null if none remain. */
  nextPendingUnit(taskId: string): ScheduledTaskUnitRow | null {
    const db = getConnection();
    return (
      (db
        .prepare("SELECT * FROM scheduled_task_units WHERE task_id = ? AND status = 'pending' ORDER BY seq ASC LIMIT 1")
        .get(taskId) as ScheduledTaskUnitRow | undefined) ?? null
    );
  },

  /** Patches task fields and bumps updated_at. */
  update(id: string, patch: Partial<Omit<ScheduledTaskRow, 'id' | 'created_at'>>): void {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    const db = getConnection();
    const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE scheduled_tasks SET ${setClause}, updated_at = @updated_at WHERE id = @id`).run({
      ...patch,
      id,
      updated_at: Date.now(),
    });
  },

  /** Patches a unit by id. */
  updateUnit(id: string, patch: Partial<Omit<ScheduledTaskUnitRow, 'id' | 'task_id' | 'seq'>>): void {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    const db = getConnection();
    const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE scheduled_task_units SET ${setClause} WHERE id = @id`).run({ ...patch, id });
  },

  /** Marks a task cancelled. Returns true if a row was affected. */
  cancel(id: string, userId: number): boolean {
    const db = getConnection();
    const info = db
      .prepare(
        `UPDATE scheduled_tasks SET status = 'cancelled', next_run_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ? AND status NOT IN ('done', 'cancelled')`
      )
      .run(Date.now(), id, userId);
    return info.changes > 0;
  },

  /**
   * Recovery: any task left 'running' by a crash/restart is reset to pending so
   * the tick loop re-picks it (its completed units are preserved). Called once
   * at scheduler startup.
   */
  resetOrphanedRunning(): number {
    const db = getConnection();
    const info = db
      .prepare(
        `UPDATE scheduled_tasks SET status = 'pending', next_run_at = NULL, updated_at = ?
         WHERE status = 'running'`
      )
      .run(Date.now());
    // Units stuck 'running' likewise go back to pending.
    db.prepare("UPDATE scheduled_task_units SET status = 'pending' WHERE status = 'running'").run();
    return info.changes;
  },
};
