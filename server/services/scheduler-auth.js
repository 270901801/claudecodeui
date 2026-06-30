/**
 * Scheduler tool-authorization policies.
 *
 * Builds the `autoApprove(toolName, input) -> { allow, message }` decision used
 * by unattended scheduled runs (consumed by queryClaudeSDK's canUseTool). There
 * is no human in the loop, so the policy must be self-contained.
 *
 * Policies:
 *   - read_only : only side-effect-free read tools; everything else denied.
 *   - whitelist : read tools + writes scoped to the project dir + Bash filtered
 *                 by a deny-scan and an allow-prefix list (default-deny).
 *   - bypass    : not handled here (the SDK runs in bypassPermissions mode).
 *
 * SECURITY NOTE: command-prefix allow-listing is bypassable in theory (shell
 * tricks). The full-command deny-scan is the real backstop, and writes are
 * confined to the project directory — but "whitelist" is best-effort safe, not
 * a sandbox. High-risk autonomous work should opt into 'bypass' deliberately.
 */

import path from 'path';

// Side-effect-free tools: always safe to auto-approve.
const READ_ONLY_TOOLS = new Set([
  'Read',
  'Grep',
  'Glob',
  'LS',
  'NotebookRead',
  'TodoWrite', // internal scratchpad, no external effect
  'WebSearch',
  'WebFetch',
]);

// Tools that mutate files — allowed only when every target path is inside the
// project directory.
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Dangerous substrings/patterns scanned against the WHOLE Bash command. Any hit
// denies regardless of the leading command.
const BASH_DENY_PATTERNS = [
  /\brm\s+-[a-z]*[rf]/i, // rm -rf / -r / -f
  /\b(sudo|doas)\b/i,
  /\bmkfs/i,
  /\bdd\b[^|]*\bof=/i,
  /:\s*\(\s*\)\s*\{/, // fork bomb :(){
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bchmod\s+-?\d*0*777/i,
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh/i, // curl ... | sh
  /\|\s*(ba)?sh\b/i, // anything | sh
  /\beval\b/i,
  /\$\(\s*(curl|wget)/i, // $(curl ...)
  /`[^`]*(curl|wget)[^`]*`/i, // `curl ...`
  /\bgit\s+push\b/i,
  /push\s+(-f\b|--force)/i,
  /\b(npm|yarn|pnpm)\s+publish\b/i,
  /\b(kill|killall|pkill)\b/i,
  /[>]\s*\/(etc|usr|bin|sbin|boot|sys|dev|var)\b/i, // redirect into system paths
  /(\.ssh\b|\.aws\b|\.gnupg\b|id_rsa|\.npmrc\b)/i, // credential material
  /\.env(\.[a-z]+)?\b/i, // .env files
];

// Allowed leading commands for each Bash segment (default-deny otherwise).
const BASH_ALLOW_COMMANDS = new Set([
  'ls', 'cat', 'pwd', 'echo', 'grep', 'rg', 'find', 'head', 'tail', 'wc',
  'which', 'env', 'date', 'sort', 'uniq', 'diff', 'tree', 'sed', 'awk',
  'mkdir', 'touch', 'cp', 'mv',
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun',
  'python', 'python3', 'pip', 'pip3', 'pytest', 'ruff',
  'tsc', 'eslint', 'prettier', 'jest', 'vitest',
  'make', 'go', 'cargo', 'rustc',
]);

// git subcommands allowed (push and friends are blocked by the deny-scan).
const GIT_ALLOW_SUBCOMMANDS = new Set([
  'status', 'diff', 'log', 'add', 'commit', 'branch', 'checkout', 'restore',
  'stash', 'show', 'fetch', 'merge', 'rev-parse', 'ls-files', 'config',
]);

function deny(message) {
  return { allow: false, message };
}
const ALLOW = { allow: true };

/** True if `target` resolves to a path inside `root`. */
function isInside(root, target) {
  if (!target) return false;
  const abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
  const base = path.resolve(root);
  return abs === base || abs.startsWith(base + path.sep);
}

/** Collects the file paths a write tool would touch. */
function writeTargets(toolName, input) {
  if (!input || typeof input !== 'object') return [];
  if (toolName === 'NotebookEdit') return [input.notebook_path].filter(Boolean);
  if (toolName === 'MultiEdit') return [input.file_path].filter(Boolean);
  return [input.file_path].filter(Boolean); // Write / Edit
}

function checkBash(input) {
  const command = typeof input === 'string' ? input : input?.command;
  if (!command || typeof command !== 'string') return deny('Empty Bash command');

  for (const pattern of BASH_DENY_PATTERNS) {
    if (pattern.test(command)) return deny(`Blocked dangerous command pattern: ${pattern}`);
  }

  // Every segment (split on shell separators) must start with an allowed command.
  const segments = command.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const tokens = segment.split(/\s+/);
    let cmd = tokens[0];
    // Strip env-var assignments prefixing the command (FOO=bar cmd ...).
    let idx = 0;
    while (cmd && /^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd)) {
      idx += 1;
      cmd = tokens[idx];
    }
    if (!cmd) return deny('Unparseable Bash segment');
    cmd = cmd.replace(/^.*\//, ''); // basename of e.g. /usr/bin/node

    if (cmd === 'git') {
      const sub = tokens[idx + 1];
      if (!GIT_ALLOW_SUBCOMMANDS.has(sub)) return deny(`git ${sub || ''} not allowed`);
      continue;
    }
    if (!BASH_ALLOW_COMMANDS.has(cmd)) {
      return deny(`Command not in allow-list: ${cmd}`);
    }
  }
  return ALLOW;
}

/**
 * Builds the autoApprove decision function for a task.
 * @param {'whitelist'|'read_only'|'bypass'} policy
 * @param {string} projectPath - run cwd; write tools are confined here.
 */
export function makeAutoApprove(policy, projectPath) {
  return function autoApprove(toolName, input) {
    if (READ_ONLY_TOOLS.has(toolName)) return ALLOW;

    if (policy === 'read_only') {
      return deny(`read_only policy: ${toolName} not permitted`);
    }

    // whitelist policy from here on.
    if (WRITE_TOOLS.has(toolName)) {
      const targets = writeTargets(toolName, input);
      if (targets.length === 0) return deny(`${toolName}: no target path to validate`);
      for (const t of targets) {
        if (!isInside(projectPath, t)) {
          return deny(`${toolName} outside project dir denied: ${t}`);
        }
      }
      return ALLOW;
    }

    if (toolName === 'Bash') {
      return checkBash(input);
    }

    // Unknown / high-risk tools (Task subagents, MCP tools, etc.): default-deny.
    return deny(`Tool not allowed under whitelist policy: ${toolName}`);
  };
}
