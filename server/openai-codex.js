/**
 * OpenAI Codex SDK Integration
 * =============================
 *
 * This module provides integration with the OpenAI Codex SDK for non-interactive
 * chat sessions. It mirrors the pattern used in claude-sdk.js for consistency.
 *
 * ## Usage
 *
 * - queryCodex(command, options, ws) - Execute a prompt with streaming via WebSocket
 * - abortCodexSession(sessionId) - Cancel an active session
 * - isCodexSessionActive(sessionId) - Check if a session is running
 * - getActiveCodexSessions() - List all active sessions
 */

import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import { Codex } from '@openai/codex-sdk';

import { notifyRunFailed, notifyRunStopped } from './services/notification-orchestrator.js';
import { sessionsService } from './modules/providers/services/sessions.service.js';
import { providerAuthService } from './modules/providers/services/provider-auth.service.js';
import { providerModelsService } from './modules/providers/services/provider-models.service.js';
import { createCompleteMessage, createNormalizedMessage } from './shared/utils.js';

// Track active sessions
const activeCodexSessions = new Map();

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy'];

/**
 * Read the local ReClaude daemon's proxy ports from ~/.reclaude/state.json.
 *
 * ReClaude exports HTTP(S)_PROXY pointing at its own gateway port so the
 * `claude` CLI routes through the carpool gateway. That gateway only proxies
 * Anthropic traffic — when the Codex child inherits the same proxy its OpenAI
 * (chatgpt.com) CONNECT tunnels fail with 502. The port is dynamic and rotates
 * on daemon restart, so we detect it at runtime rather than hard-coding it.
 *
 * @returns {Set<string>} host:port strings owned by the ReClaude daemon
 */
function getReclaudeProxyTargets() {
  const targets = new Set();
  try {
    const statePath = path.join(os.homedir(), '.reclaude', 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const ports = [state?.port, state?.transparent_port, state?.last_port, state?.last_transparent_port];
    for (const port of ports) {
      if (Number.isFinite(Number(port))) {
        for (const host of ['127.0.0.1', 'localhost', '::1']) {
          targets.add(`${host}:${port}`);
        }
      }
    }
  } catch {
    // No ReClaude state (not installed / not running) — nothing to strip.
  }
  return targets;
}

function proxyPointsAt(value, targets) {
  if (!value || targets.size === 0) {
    return false;
  }
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    return targets.has(`${url.hostname}:${url.port}`);
  } catch {
    return false;
  }
}

/**
 * Build the environment for the spawned Codex CLI.
 *
 * Codex must reach OpenAI directly and must NOT be routed through the ReClaude
 * gateway proxy. Precedence for the replacement proxy:
 *   1. CODEX_HTTPS_PROXY / CODEX_HTTP_PROXY (explicit override; empty = direct)
 *   2. npm_config_https_proxy (the real upstream, when it isn't ReClaude's)
 *   3. unset (direct connection)
 *
 * @returns {Record<string, string>} a full env clone with proxies sanitized
 */
function buildCodexEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  const reclaudeTargets = getReclaudeProxyTargets();
  const explicitHttps = process.env.CODEX_HTTPS_PROXY;
  const explicitHttp = process.env.CODEX_HTTP_PROXY;
  const npmProxy = process.env.npm_config_https_proxy;
  const fallback = proxyPointsAt(npmProxy, reclaudeTargets) ? undefined : npmProxy;

  for (const key of PROXY_ENV_KEYS) {
    const current = env[key];
    if (!proxyPointsAt(current, reclaudeTargets)) {
      continue; // leave user-configured, non-ReClaude proxies untouched
    }

    const isHttp = key.toLowerCase() === 'http_proxy';
    const override = isHttp ? (explicitHttp ?? explicitHttps) : (explicitHttps ?? explicitHttp);
    const replacement = override !== undefined ? override : fallback;

    if (replacement) {
      env[key] = replacement;
    } else {
      delete env[key];
    }
  }

  return env;
}

function readUsageNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractCodexTokenBudget(event) {
  const info = event?.info || event?.payload?.info || event?.usage?.info;
  const usage = info?.total_token_usage || event?.usage?.total_token_usage || event?.usage;
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const inputTokens = readUsageNumber(usage.input_tokens);
  const outputTokens = readUsageNumber(usage.output_tokens);
  const used = readUsageNumber(usage.total_tokens) || inputTokens + outputTokens;

  return {
    used,
    total: readUsageNumber(info?.model_context_window || event?.usage?.model_context_window) || 200000,
    inputTokens,
    outputTokens,
    breakdown: {
      input: inputTokens,
      output: outputTokens,
    },
  };
}

/**
 * Transform Codex SDK event to WebSocket message format
 * @param {object} event - SDK event
 * @returns {object} - Transformed event for WebSocket
 */
function transformCodexEvent(event) {
  // Map SDK event types to a consistent format
  switch (event.type) {
    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      const item = event.item;
      if (!item) {
        return { type: event.type, item: null };
      }

      // Transform based on item type
      switch (item.type) {
        case 'agent_message':
          return {
            type: 'item',
            itemType: 'agent_message',
            message: {
              role: 'assistant',
              content: item.text
            }
          };

        case 'reasoning':
          return {
            type: 'item',
            itemType: 'reasoning',
            message: {
              role: 'assistant',
              content: item.text,
              isReasoning: true
            }
          };

        case 'command_execution':
          return {
            type: 'item',
            itemType: 'command_execution',
            command: item.command,
            output: item.aggregated_output,
            exitCode: item.exit_code,
            status: item.status
          };

        case 'file_change':
          return {
            type: 'item',
            itemType: 'file_change',
            changes: item.changes,
            status: item.status
          };

        case 'mcp_tool_call':
          return {
            type: 'item',
            itemType: 'mcp_tool_call',
            server: item.server,
            tool: item.tool,
            arguments: item.arguments,
            result: item.result,
            error: item.error,
            status: item.status
          };

        case 'web_search':
          return {
            type: 'item',
            itemType: 'web_search',
            query: item.query
          };

        case 'todo_list':
          return {
            type: 'item',
            itemType: 'todo_list',
            items: item.items
          };

        case 'error':
          return {
            type: 'item',
            itemType: 'error',
            message: {
              role: 'error',
              content: item.message
            }
          };

        default:
          return {
            type: 'item',
            itemType: item.type,
            item: item
          };
      }

    case 'turn.started':
      return {
        type: 'turn_started'
      };

    case 'turn.completed':
      return {
        type: 'turn_complete',
        usage: event.usage
      };

    case 'turn.failed':
      return {
        type: 'turn_failed',
        error: event.error
      };

    case 'thread.started':
      return {
        type: 'thread_started',
        threadId: event.thread_id || event.id
      };

    case 'error':
      return {
        type: 'error',
        message: event.message
      };

    default:
      return {
        type: event.type,
        data: event
      };
  }
}

/**
 * Map permission mode to Codex SDK options
 * @param {string} permissionMode - 'default', 'acceptEdits', or 'bypassPermissions'
 * @returns {object} - { sandboxMode, approvalPolicy }
 */
function mapPermissionModeToCodexOptions(permissionMode) {
  switch (permissionMode) {
    case 'acceptEdits':
      return {
        sandboxMode: 'workspace-write',
        approvalPolicy: 'never'
      };
    case 'bypassPermissions':
      return {
        sandboxMode: 'danger-full-access',
        approvalPolicy: 'never'
      };
    case 'default':
    default:
      return {
        sandboxMode: 'workspace-write',
        approvalPolicy: 'untrusted'
      };
  }
}

function normalizeCodexServiceTier(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'fast' || normalized === 'flex' ? normalized : undefined;
}

function normalizeCodexReasoningEffort(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(normalized) ? normalized : undefined;
}

/**
 * Copies a Codex JSONL session file up to (and including) the `task_complete`
 * event for the given `targetTurnId`, writing the result as a new session file
 * with `newSessionId`. When `targetTurnId` is null the full file is copied.
 *
 * Returns the path of the newly created file.
 */
async function forkCodexSessionFile(parentJsonlPath, targetTurnId, newSessionId) {
  const raw = await fsp.readFile(parentJsonlPath, 'utf8');
  const allLines = raw.split('\n');

  const output = [];
  let currentTurnId = null;
  let foundTarget = !targetTurnId; // If no target, include everything.
  let done = false;

  for (const line of allLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (entry.type === 'session_meta') {
      // Rewrite the session ID so the Codex CLI treats this as a new thread.
      if (entry.payload && typeof entry.payload === 'object') {
        entry.payload.id = newSessionId;
      }
      output.push(JSON.stringify(entry));
      continue;
    }

    if (done) break;

    output.push(trimmed);

    if (
      entry.type === 'event_msg' &&
      entry.payload?.type === 'task_started' &&
      typeof entry.payload.turn_id === 'string'
    ) {
      currentTurnId = entry.payload.turn_id;
      if (targetTurnId && currentTurnId === targetTurnId) {
        foundTarget = true;
      }
    }

    if (
      foundTarget &&
      targetTurnId &&
      currentTurnId === targetTurnId &&
      entry.type === 'event_msg' &&
      entry.payload?.type === 'task_complete'
    ) {
      done = true;
    }
  }

  if (targetTurnId && !foundTarget) {
    throw new Error(`Fork anchor turn_id "${targetTurnId}" not found in parent session`);
  }

  const now = new Date();
  const iso = now.toISOString();
  const year = iso.slice(0, 4);
  const month = iso.slice(5, 7);
  const day = iso.slice(8, 10);
  const sessionDir = path.join(os.homedir(), '.codex', 'sessions', year, month, day);
  await fsp.mkdir(sessionDir, { recursive: true });

  const ts = iso.slice(0, 19).replace(/:/g, '-');
  const newFilePath = path.join(sessionDir, `rollout-${ts}-${newSessionId}.jsonl`);
  await fsp.writeFile(newFilePath, output.join('\n') + '\n', 'utf8');
  return newFilePath;
}

/**
 * Execute a Codex query with streaming
 * @param {string} command - The prompt to send
 * @param {object} options - Options including cwd, sessionId, model, permissionMode, serviceTier, reasoningEffort
 * @param {WebSocket|object} ws - WebSocket connection or response writer
 */
export async function queryCodex(command, options = {}, ws) {
  const {
    sessionId,
    sessionSummary,
    cwd,
    projectPath,
    model,
    permissionMode = 'default',
    serviceTier,
    reasoningEffort,
    forkSession: isForkSession,
    resumeSessionAt: forkTurnId,
    parentJsonlPath,
  } = options;

  const resolvedModel = await providerModelsService.resolveResumeModel(
    'codex',
    sessionId,
    model,
  );

  const workingDirectory = cwd || projectPath || process.cwd();
  const { sandboxMode, approvalPolicy } = mapPermissionModeToCodexOptions(permissionMode);
  const resolvedServiceTier = normalizeCodexServiceTier(serviceTier);
  const resolvedReasoningEffort = normalizeCodexReasoningEffort(reasoningEffort);

  let codex;
  let thread;
  let capturedSessionId = sessionId;
  let sessionCreatedSent = false;
  let terminalFailure = null;
  const abortController = new AbortController();

  try {
    // Initialize Codex SDK. Sanitize proxy env so the spawned Codex CLI reaches
    // OpenAI directly instead of inheriting ReClaude's Anthropic-only gateway
    // proxy (which 502s on chatgpt.com). See buildCodexEnv().
    codex = new Codex({
      env: buildCodexEnv(),
      ...(resolvedServiceTier ? { config: { service_tier: resolvedServiceTier } } : {})
    });

    // Thread options with sandbox and approval settings
    const threadOptions = {
      workingDirectory,
      skipGitRepoCheck: true,
      sandboxMode,
      approvalPolicy,
      model: resolvedModel,
      ...(resolvedReasoningEffort ? { modelReasoningEffort: resolvedReasoningEffort } : {})
    };

    // Start or resume thread. For forked Codex sessions, copy the parent JSONL
    // up to the fork anchor, assign a new thread ID, and resume from the copy.
    if (isForkSession && parentJsonlPath) {
      const newThreadId = randomUUID();
      await forkCodexSessionFile(parentJsonlPath, forkTurnId || null, newThreadId);
      capturedSessionId = newThreadId;
      thread = codex.resumeThread(newThreadId, threadOptions);
      // Immediately register the new provider session ID so the run registry
      // maps this fork's app session to the new thread ID.
      if (ws.setSessionId && typeof ws.setSessionId === 'function') {
        ws.setSessionId(newThreadId);
      }
    } else if (sessionId) {
      thread = codex.resumeThread(sessionId, threadOptions);
    } else {
      thread = codex.startThread(threadOptions);
    }

    const registerSession = (id) => {
      if (!id) {
        return;
      }
      activeCodexSessions.set(id, {
        thread,
        codex,
        status: 'running',
        abortController,
        startedAt: new Date().toISOString()
      });
    };

    // Existing sessions can be tracked immediately; new sessions are tracked after thread.started.
    if (capturedSessionId) {
      registerSession(capturedSessionId);
    }

    // Execute with streaming
    const streamedTurn = await thread.runStreamed(command, {
      signal: abortController.signal
    });

    for await (const event of streamedTurn.events) {
      // Capture thread/session id lazily from the stream (Codex emits this asynchronously).
      if (event.type === 'thread.started') {
        const discoveredSessionId = event.thread_id || event.id || null;
        if (discoveredSessionId && !capturedSessionId) {
          capturedSessionId = discoveredSessionId;
          registerSession(capturedSessionId);

          if (ws.setSessionId && typeof ws.setSessionId === 'function') {
            ws.setSessionId(capturedSessionId);
          }

          if (!sessionId && !sessionCreatedSent) {
            sessionCreatedSent = true;
            sendMessage(ws, createNormalizedMessage({ kind: 'session_created', newSessionId: capturedSessionId, sessionId: capturedSessionId, provider: 'codex' }));
          }
        }
      }

      // Check if session was aborted
      if (abortController.signal.aborted) {
        break;
      }
      if (capturedSessionId) {
        const session = activeCodexSessions.get(capturedSessionId);
        if (session?.status === 'aborted') {
          break;
        }
      }

      if (event.type === 'item.started' || event.type === 'item.updated') {
        continue;
      }

      const transformed = transformCodexEvent(event);

      // Normalize the transformed event into NormalizedMessage(s) via adapter
      const normalizedMsgs = sessionsService.normalizeMessage('codex', transformed, capturedSessionId || sessionId || null);
      for (const msg of normalizedMsgs) {
        sendMessage(ws, msg);
      }

      if (event.type === 'turn.failed' && !terminalFailure) {
        terminalFailure = event.error || new Error('Turn failed');
        notifyRunFailed({
          userId: ws?.userId || null,
          provider: 'codex',
          sessionId: capturedSessionId || sessionId || null,
          sessionName: sessionSummary,
          error: terminalFailure
        });
      }

      // Extract and send token usage if available (normalized to match Claude format)
      if (event.type === 'turn.completed') {
        const tokenBudget = extractCodexTokenBudget(event);
        if (tokenBudget) {
          sendMessage(ws, createNormalizedMessage({ kind: 'status', text: 'token_budget', tokenBudget, sessionId: capturedSessionId || sessionId || null, provider: 'codex' }));
        }
      }
    }

    // Send the terminal completion event — skipped for aborted runs, whose
    // terminal `complete` (aborted: true) was already sent by abort-session.
    const runSession = capturedSessionId ? activeCodexSessions.get(capturedSessionId) : null;
    const runAborted = runSession?.status === 'aborted' || abortController.signal.aborted;
    if (!runAborted) {
      sendMessage(ws, createCompleteMessage({
        provider: 'codex',
        sessionId: capturedSessionId || sessionId || null,
        actualSessionId: capturedSessionId || thread.id || sessionId || null,
        exitCode: terminalFailure ? 1 : 0,
      }));
      if (!terminalFailure) {
        notifyRunStopped({
          userId: ws?.userId || null,
          provider: 'codex',
          sessionId: capturedSessionId || sessionId || null,
          sessionName: sessionSummary,
          stopReason: 'completed'
        });
      }
    }

  } catch (error) {
    const session = capturedSessionId ? activeCodexSessions.get(capturedSessionId) : null;
    const wasAborted =
      session?.status === 'aborted' ||
      error?.name === 'AbortError' ||
      String(error?.message || '').toLowerCase().includes('aborted');

    if (!wasAborted) {
      console.error('[Codex] Error:', error);

      // Check if Codex SDK is available for a clearer error message
      const installed = await providerAuthService.isProviderInstalled('codex');
      const errorContent = !installed
        ? 'Codex CLI is not configured. Please set up authentication first.'
        : error.message;

      sendMessage(ws, createNormalizedMessage({ kind: 'error', content: errorContent, sessionId: capturedSessionId || sessionId || null, provider: 'codex' }));
      sendMessage(ws, createCompleteMessage({
        provider: 'codex',
        sessionId: capturedSessionId || sessionId || null,
        exitCode: 1,
      }));
      if (!terminalFailure) {
        notifyRunFailed({
          userId: ws?.userId || null,
          provider: 'codex',
          sessionId: capturedSessionId || sessionId || null,
          sessionName: sessionSummary,
          error
        });
      }
    }

  } finally {
    // Update session status
    if (capturedSessionId) {
      const session = activeCodexSessions.get(capturedSessionId);
      if (session) {
        session.status = session.status === 'aborted' ? 'aborted' : 'completed';
      }
    }
  }
}

/**
 * Abort an active Codex session
 * @param {string} sessionId - Session ID to abort
 * @returns {boolean} - Whether abort was successful
 */
export function abortCodexSession(sessionId) {
  const session = activeCodexSessions.get(sessionId);

  if (!session) {
    return false;
  }

  session.status = 'aborted';
  try {
    session.abortController?.abort();
  } catch (error) {
    console.warn(`[Codex] Failed to abort session ${sessionId}:`, error);
  }

  return true;
}

/**
 * Check if a session is active
 * @param {string} sessionId - Session ID to check
 * @returns {boolean} - Whether session is active
 */
export function isCodexSessionActive(sessionId) {
  const session = activeCodexSessions.get(sessionId);
  return session?.status === 'running';
}

/**
 * Get all active sessions
 * @returns {Array} - Array of active session info
 */
export function getActiveCodexSessions() {
  const sessions = [];

  for (const [id, session] of activeCodexSessions.entries()) {
    if (session.status === 'running') {
      sessions.push({
        id,
        status: session.status,
        startedAt: session.startedAt
      });
    }
  }

  return sessions;
}

/**
 * Helper to send message via WebSocket or writer
 * @param {WebSocket|object} ws - WebSocket or response writer
 * @param {object} data - Data to send
 */
function sendMessage(ws, data) {
  try {
    if (ws.isSSEStreamWriter || ws.isWebSocketWriter) {
      // Writer handles stringification (SSEStreamWriter or WebSocketWriter)
      ws.send(data);
    } else if (typeof ws.send === 'function') {
      // Raw WebSocket - stringify here
      ws.send(JSON.stringify(data));
    }
  } catch (error) {
    console.error('[Codex] Error sending message:', error);
  }
}

// Clean up old completed sessions periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [id, session] of activeCodexSessions.entries()) {
    if (session.status !== 'running') {
      const startedAt = new Date(session.startedAt).getTime();
      if (now - startedAt > maxAge) {
        activeCodexSessions.delete(id);
      }
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes
