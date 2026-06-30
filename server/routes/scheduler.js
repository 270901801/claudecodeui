/**
 * Long-horizon scheduler REST API.
 *
 * Submit tasks that run unattended on a schedule and auto-suspend/resume around
 * model quota. The tick loop in services/scheduler.service.js does the actual
 * running; these endpoints only create/list/read/cancel rows.
 *
 * Mounted at /api/scheduler behind authenticateToken (see index.js), so
 * req.user.id identifies the owner.
 */

import { promises as fs } from 'fs';

import express from 'express';

import { scheduledTasksDb, projectsDb } from '../modules/database/index.js';
import { cronNextRun, isValidCron } from '../utils/cron.js';

const router = express.Router();

const VALID_TRIGGERS = new Set(['asap', 'delay', 'cron']);
const VALID_MODES = new Set(['single_prompt', 'taskmaster']);
const VALID_AUTH = new Set(['bypass', 'whitelist', 'read_only']);

function taskWithUnits(task) {
  return { ...task, units: scheduledTasksDb.units(task.id) };
}

/**
 * POST /api/scheduler/tasks
 * Body: { title, projectPath, prompt, mode?, triggerType?, delayMinutes?,
 *         cronExpr?, model?, authPolicy?, maxRetries? }
 */
router.post('/tasks', async (req, res) => {
  const {
    title,
    projectPath,
    prompt,
    mode = 'single_prompt',
    triggerType = 'asap',
    delayMinutes,
    cronExpr,
    model,
    authPolicy = 'whitelist',
    maxRetries,
  } = req.body || {};

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({ error: 'projectPath is required' });
  }
  if (!VALID_MODES.has(mode)) {
    return res.status(400).json({ error: `mode must be one of ${[...VALID_MODES].join(', ')}` });
  }
  if (mode !== 'single_prompt') {
    return res.status(400).json({ error: 'Only single_prompt mode is supported in this build' });
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required for single_prompt tasks' });
  }
  if (!VALID_TRIGGERS.has(triggerType)) {
    return res.status(400).json({ error: `triggerType must be one of ${[...VALID_TRIGGERS].join(', ')}` });
  }
  if (!VALID_AUTH.has(authPolicy)) {
    return res.status(400).json({ error: `authPolicy must be one of ${[...VALID_AUTH].join(', ')}` });
  }

  // Resolve the scheduling cursor from the trigger.
  let nextRunAt = null;
  if (triggerType === 'delay') {
    const minutes = Number(delayMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return res.status(400).json({ error: 'delayMinutes must be a positive number for delay triggers' });
    }
    nextRunAt = Date.now() + minutes * 60_000;
  } else if (triggerType === 'cron') {
    if (!cronExpr || !isValidCron(cronExpr)) {
      return res.status(400).json({ error: 'cronExpr must be a valid 5-field cron expression' });
    }
    nextRunAt = cronNextRun(cronExpr, Date.now());
  }

  // Verify the project path exists, then register it so the session it produces
  // shows up under a known project in the UI.
  try {
    await fs.access(projectPath);
  } catch {
    return res.status(400).json({ error: `Project path does not exist: ${projectPath}` });
  }
  try {
    projectsDb.createProjectPath(projectPath, null);
  } catch (error) {
    console.warn('[Scheduler] project registration warning:', error?.message || error);
  }

  const task = scheduledTasksDb.create({
    userId: req.user.id,
    projectPath,
    title,
    mode,
    prompt,
    triggerType,
    cronExpr: triggerType === 'cron' ? cronExpr : null,
    authPolicy,
    model: model || null,
    maxRetries: Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : undefined,
    nextRunAt,
    units: [prompt],
  });

  return res.status(201).json(taskWithUnits(task));
});

/** GET /api/scheduler/tasks — list the caller's tasks (newest first). */
router.get('/tasks', (req, res) => {
  const tasks = scheduledTasksDb.listByUser(req.user.id).map(taskWithUnits);
  res.json({ tasks });
});

/** GET /api/scheduler/tasks/:id — one task with its units. */
router.get('/tasks/:id', (req, res) => {
  const task = scheduledTasksDb.get(req.params.id);
  if (!task || task.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Task not found' });
  }
  return res.json(taskWithUnits(task));
});

/** POST /api/scheduler/tasks/:id/cancel — stop a pending/blocked task. */
router.post('/tasks/:id/cancel', (req, res) => {
  const ok = scheduledTasksDb.cancel(req.params.id, req.user.id);
  if (!ok) {
    return res.status(404).json({ error: 'Task not found or already finished' });
  }
  return res.json(taskWithUnits(scheduledTasksDb.get(req.params.id)));
});

export default router;
