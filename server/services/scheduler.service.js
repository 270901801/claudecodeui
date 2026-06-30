/**
 * Long-horizon task scheduler.
 *
 * A DB-backed tick loop that runs scheduled tasks unattended, auto-suspends
 * when model quota is exhausted, and resumes at the next reset. Survives
 * restarts (all state lives in scheduled_tasks / scheduled_task_units) and runs
 * tasks strictly serially in P0 (one unit at a time, globally).
 *
 * State machine (per task):
 *   pending ──due──► running
 *     ├─ no quota        → quota_blocked   (next_run_at = resets_at)
 *     ├─ interactive busy → waiting_interactive (next_run_at = now + 30s)
 *     └─ ok → run next pending unit
 *              ├─ success + more units → pending (immediate)
 *              ├─ success + last unit  → done   (or re-armed for cron)
 *              ├─ quota error at runtime → quota_blocked
 *              └─ real error → retry w/ backoff, or failed after max_retries
 *
 * Auth: each task's auth_policy drives tool authorization for its unattended
 * runs (see buildAuthOptions + scheduler-auth.js). 'whitelist' (default) and
 * 'read_only' enforce a programmatic policy via the SDK canUseTool callback;
 * 'bypass' opts into the SDK's bypassPermissions mode (no per-tool checks).
 */

import { scheduledTasksDb } from '../modules/database/index.js';
import { queryClaudeSDK, getActiveClaudeSDKSessions } from '../claude-sdk.js';
import { cronNextRun } from '../utils/cron.js';

import { hasQuotaToRun } from './quota.service.js';
import { makeAutoApprove } from './scheduler-auth.js';

const QUOTA_PLATFORM = process.env.SCHEDULER_QUOTA_PLATFORM || 'reclaude';
const TICK_IDLE_MS = 10_000; // re-arm when nothing was due
const TICK_BUSY_MS = 1_000; // re-arm fast after doing work, to drain a queue
const QUOTA_FALLBACK_MS = 15 * 60_000; // re-check window when no resets_at known
const INTERACTIVE_RETRY_MS = 30_000; // back off while a user session is active
const BACKOFF_BASE_MS = 30_000; // failure backoff: base * 2^(failures-1)
const BACKOFF_MAX_MS = 30 * 60_000;

let timer = null;
let started = false;
let ticking = false;

/**
 * Best-effort detection of a quota/rate-limit failure from an error string.
 * The authoritative signal would be structured SDK error fields, but
 * queryClaudeSDK collapses errors to a message; this matches the common
 * phrasings. TODO: tighten against a real captured usage-limit message.
 */
function looksLikeQuotaError(text) {
  if (!text) return false;
  return /usage limit|limit reached|rate.?limit|quota|\b429\b|overloaded|\b529\b/i.test(String(text));
}

/**
 * Minimal writer that satisfies the queryClaudeSDK `ws` contract and captures
 * the run outcome. Output is not streamed to clients in P0 — the session JSONL
 * lands on disk and the sessions-watcher surfaces it in the normal session
 * view, which is where the user reviews the run.
 */
class SchedulerRunWriter {
  constructor(userId) {
    this.userId = userId;
    this.sessionId = null;
    this.success = null; // null until a terminal 'complete' arrives
    this.exitCode = null;
    this.errorText = null;
    this.lastAssistantText = null;
  }

  send(data) {
    if (!data || typeof data !== 'object') return;
    const kind = data.kind;

    if (data.sessionId && !this.sessionId) this.sessionId = data.sessionId;
    if (kind === 'session_created' && data.newSessionId) this.sessionId = data.newSessionId;

    if (kind === 'error' && typeof data.content === 'string') {
      this.errorText = data.content;
    }
    if (kind === 'assistant' && typeof data.content === 'string') {
      this.lastAssistantText = data.content;
    }
    if (kind === 'complete') {
      this.success = Boolean(data.success) && data.exitCode === 0;
      this.exitCode = typeof data.exitCode === 'number' ? data.exitCode : null;
    }
  }

  end() {}
  setSessionId(sessionId) {
    if (sessionId) this.sessionId = sessionId;
  }
  getSessionId() {
    return this.sessionId;
  }
}

/**
 * Translates a task's auth_policy into SDK run options.
 * - bypass            → SDK bypassPermissions (no per-tool checks).
 * - whitelist/read_only → 'default' mode + an autoApprove decision so the
 *   canUseTool callback enforces the policy without blocking on a human.
 */
function buildAuthOptions(authPolicy, projectPath) {
  if (authPolicy === 'whitelist' || authPolicy === 'read_only') {
    return {
      permissionMode: 'default',
      autoApprove: makeAutoApprove(authPolicy, projectPath),
    };
  }
  // 'bypass' (or anything unexpected) → full bypass.
  return { permissionMode: 'bypassPermissions' };
}

function backoffMs(failures) {
  const ms = BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1);
  return Math.min(ms, BACKOFF_MAX_MS);
}

/**
 * Runs one unit through the Claude SDK and returns the outcome. Never throws.
 */
async function runUnit(task, unit, resumeSessionId) {
  const writer = new SchedulerRunWriter(task.user_id);
  try {
    await queryClaudeSDK(
      unit.payload,
      {
        projectPath: task.project_path,
        cwd: task.project_path,
        sessionId: resumeSessionId || null,
        model: task.model || undefined,
        ...buildAuthOptions(task.auth_policy, task.project_path),
      },
      writer,
    );
  } catch (error) {
    return {
      success: false,
      sessionId: writer.getSessionId(),
      errorText: error?.message || String(error),
    };
  }

  // queryClaudeSDK resolves without throwing on Claude-side errors; the writer's
  // terminal 'complete' tells us the real outcome.
  return {
    success: writer.success === true,
    sessionId: writer.getSessionId(),
    errorText: writer.errorText,
    summary: writer.lastAssistantText,
  };
}

/** Re-arms a cron task for its next fire, or marks a one-shot task done. */
function finishTask(task) {
  const now = Date.now();
  if (task.trigger_type === 'cron' && task.cron_expr) {
    const next = cronNextRun(task.cron_expr, now);
    if (next != null) {
      // Reset units so the recurring task runs cleanly next time.
      for (const u of scheduledTasksDb.units(task.id)) {
        scheduledTasksDb.updateUnit(u.id, {
          status: 'pending',
          provider_session_id: null,
          app_session_id: null,
          result_summary: null,
          started_at: null,
          completed_at: null,
        });
      }
      scheduledTasksDb.update(task.id, {
        status: 'pending',
        next_run_at: next,
        consecutive_failures: 0,
        last_error: null,
      });
      console.log(`[Scheduler] task ${task.id} (cron) done; next fire at ${new Date(next).toISOString()}`);
      return;
    }
  }
  scheduledTasksDb.update(task.id, { status: 'done', next_run_at: null, last_error: null });
  console.log(`[Scheduler] task ${task.id} done`);
}

/**
 * Advances a single task by at most one unit. Returns nothing; persists the
 * next state + next_run_at so the loop picks it back up appropriately.
 */
async function processTask(task) {
  scheduledTasksDb.update(task.id, { status: 'running' });
  const now = Date.now();

  // 1) Quota pre-flight.
  const quota = await hasQuotaToRun({ platform: QUOTA_PLATFORM });
  if (!quota.ok) {
    if (quota.reason === 'no_balance') {
      scheduledTasksDb.update(task.id, {
        status: 'failed',
        next_run_at: null,
        last_error: 'Quota balance exhausted (does not auto-recover).',
      });
      console.warn(`[Scheduler] task ${task.id} failed: quota balance exhausted`);
      return;
    }
    const resumeAt = quota.resetsAt ?? now + QUOTA_FALLBACK_MS;
    scheduledTasksDb.update(task.id, {
      status: 'quota_blocked',
      next_run_at: resumeAt,
      last_error: `Quota unavailable (${quota.reason}).`,
    });
    console.log(
      `[Scheduler] task ${task.id} quota_blocked (${quota.reason}); resume at ${new Date(resumeAt).toISOString()}`,
    );
    return;
  }

  // 2) Interactive priority: yield while a user session is running.
  if (getActiveClaudeSDKSessions().length > 0) {
    scheduledTasksDb.update(task.id, {
      status: 'waiting_interactive',
      next_run_at: now + INTERACTIVE_RETRY_MS,
    });
    return;
  }

  // 3) Pick the next resumable unit.
  const unit = scheduledTasksDb.nextPendingUnit(task.id);
  if (!unit) {
    finishTask(task);
    return;
  }

  // Resume the session of the most recent completed unit so multi-unit tasks
  // share one growing conversation (single_prompt tasks have none → new session).
  const completed = scheduledTasksDb.units(task.id).filter((u) => u.status === 'done');
  const resumeSessionId = completed.length ? completed[completed.length - 1].provider_session_id : null;

  scheduledTasksDb.updateUnit(unit.id, { status: 'running', started_at: now });
  console.log(`[Scheduler] task ${task.id} running unit seq=${unit.seq}`);

  const result = await runUnit(task, unit, resumeSessionId);

  if (result.success) {
    scheduledTasksDb.updateUnit(unit.id, {
      status: 'done',
      provider_session_id: result.sessionId ?? null,
      app_session_id: result.sessionId ?? null,
      result_summary: result.summary ? String(result.summary).slice(0, 500) : null,
      completed_at: Date.now(),
    });
    // More work? loop immediately; else finish.
    if (scheduledTasksDb.nextPendingUnit(task.id)) {
      scheduledTasksDb.update(task.id, { status: 'pending', next_run_at: Date.now(), consecutive_failures: 0 });
    } else {
      scheduledTasksDb.update(task.id, { consecutive_failures: 0 });
      finishTask(scheduledTasksDb.get(task.id));
    }
    return;
  }

  // Failure. A runtime quota/rate-limit error is NOT counted as a failure — we
  // suspend and let the next reset resume from this same pending unit.
  if (looksLikeQuotaError(result.errorText)) {
    const quotaNow = await hasQuotaToRun({ platform: QUOTA_PLATFORM });
    const resumeAt = quotaNow.resetsAt ?? Date.now() + QUOTA_FALLBACK_MS;
    scheduledTasksDb.updateUnit(unit.id, { status: 'pending', started_at: null });
    scheduledTasksDb.update(task.id, {
      status: 'quota_blocked',
      next_run_at: resumeAt,
      last_error: `Runtime quota limit: ${String(result.errorText).slice(0, 300)}`,
    });
    console.log(`[Scheduler] task ${task.id} hit runtime quota limit; resume at ${new Date(resumeAt).toISOString()}`);
    return;
  }

  const failures = (task.consecutive_failures ?? 0) + 1;
  if (failures >= task.max_retries) {
    scheduledTasksDb.updateUnit(unit.id, { status: 'failed', completed_at: Date.now() });
    scheduledTasksDb.update(task.id, {
      status: 'failed',
      next_run_at: null,
      consecutive_failures: failures,
      last_error: result.errorText ? String(result.errorText).slice(0, 500) : 'Run failed.',
    });
    console.warn(`[Scheduler] task ${task.id} failed after ${failures} attempts`);
    return;
  }

  const retryAt = Date.now() + backoffMs(failures);
  scheduledTasksDb.updateUnit(unit.id, { status: 'pending', started_at: null });
  scheduledTasksDb.update(task.id, {
    status: 'pending',
    next_run_at: retryAt,
    consecutive_failures: failures,
    last_error: result.errorText ? String(result.errorText).slice(0, 500) : 'Run failed.',
  });
  console.log(`[Scheduler] task ${task.id} retry ${failures}/${task.max_retries} at ${new Date(retryAt).toISOString()}`);
}

async function tick() {
  if (ticking) return false;
  ticking = true;
  let didWork = false;
  try {
    const due = scheduledTasksDb.claimDue(Date.now());
    if (due.length > 0) {
      // P0: process ONE task per tick, strictly serial. Re-arm fast to drain.
      didWork = true;
      await processTask(due[0]);
    }
  } catch (error) {
    console.error('[Scheduler] tick error:', error?.message || error);
  } finally {
    ticking = false;
  }
  return didWork;
}

function scheduleNext(delay) {
  if (!started) return;
  timer = setTimeout(async () => {
    const didWork = await tick();
    scheduleNext(didWork ? TICK_BUSY_MS : TICK_IDLE_MS);
  }, delay);
  timer.unref?.();
}

export function startScheduler() {
  if (started) return;
  started = true;
  try {
    const recovered = scheduledTasksDb.resetOrphanedRunning();
    if (recovered > 0) console.log(`[Scheduler] recovered ${recovered} task(s) left running by a restart`);
  } catch (error) {
    console.error('[Scheduler] startup recovery failed:', error?.message || error);
  }
  console.log(`[Scheduler] started (quota platform: ${QUOTA_PLATFORM})`);
  scheduleNext(TICK_BUSY_MS);
}

export function stopScheduler() {
  started = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
