const USER_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,
    git_name TEXT,
    git_email TEXT,
    has_completed_onboarding BOOLEAN DEFAULT 0
);
`;

export const API_KEYS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const USER_CREDENTIALS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    credential_name TEXT NOT NULL,
    credential_type TEXT NOT NULL, -- 'github_token', 'gitlab_token', 'bitbucket_token', etc.
    credential_value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const USER_NOTIFICATION_PREFERENCES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    user_id INTEGER PRIMARY KEY,
    preferences_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const USER_UI_PREFERENCES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_ui_preferences (
    user_id INTEGER PRIMARY KEY,
    preferences_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const VAPID_KEYS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS vapid_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export const PUSH_SUBSCRIPTIONS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const PROJECTS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY NOT NULL,
    project_path TEXT NOT NULL UNIQUE,
    custom_project_name TEXT DEFAULT NULL,
    isStarred BOOLEAN DEFAULT 0,
    isArchived BOOLEAN DEFAULT 0
);
`;

export const SESSIONS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'claude',
    -- The session id used by the provider CLI/SDK on disk (JSONL file name,
    -- store.db folder, sqlite row id, ...). \`session_id\` is the stable
    -- app-facing id that the frontend uses for the whole session lifetime;
    -- \`provider_session_id\` is filled in once the provider announces its own
    -- id mid-run, or equals \`session_id\` for sessions discovered on disk.
    provider_session_id TEXT,
    custom_name TEXT,
    project_path TEXT,
    jsonl_path TEXT,
    isArchived BOOLEAN DEFAULT 0,
    -- Sidebar pinning: pinned sessions sort above the rest within their project.
    isPinned BOOLEAN DEFAULT 0,
    -- Fork lineage: app session_id this session was forked from (NULL if original).
    parent_session_id TEXT,
    -- Node-level fork anchor: the parent transcript message UUID to branch from
    -- (passed to the SDK as \`resumeSessionAt\` on the fork's first message). NULL
    -- means fork from the parent's full transcript (latest state).
    fork_up_to_message_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id),
    FOREIGN KEY (project_path) REFERENCES projects(project_path)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);
`;

export const LAST_SCANNED_AT_SQL = `
CREATE TABLE IF NOT EXISTS scan_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_scanned_at TIMESTAMP NULL
);
`;

export const APP_CONFIG_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

// Long-horizon scheduler: a queued/scheduled task that runs unattended and
// auto-suspends when model quota is exhausted, resuming at the next reset.
// All timestamps are epoch milliseconds (INTEGER) for easy JS interop.
// `next_run_at` is the single scheduling cursor: when the tick loop should next
// consider this task — used by delay (not-before), cron (next fire) and
// quota_blocked (resets_at) alike.
export const SCHEDULED_TASKS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL,
    project_path TEXT NOT NULL,
    title TEXT NOT NULL,
    -- 'single_prompt' (one unit) | 'taskmaster' (multi unit, later slice)
    mode TEXT NOT NULL DEFAULT 'single_prompt',
    prompt TEXT,
    -- 'asap' | 'delay' | 'cron'
    trigger_type TEXT NOT NULL DEFAULT 'asap',
    cron_expr TEXT,
    -- 'whitelist' (default, programmatic policy) | 'read_only' | 'bypass'
    auth_policy TEXT NOT NULL DEFAULT 'whitelist',
    model TEXT,
    max_retries INTEGER NOT NULL DEFAULT 3,
    -- pending | running | quota_blocked | waiting_interactive | done | failed | cancelled
    status TEXT NOT NULL DEFAULT 'pending',
    next_run_at INTEGER,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

// A resumable execution unit of a scheduled task. single_prompt tasks have
// exactly one unit; taskmaster tasks have one per subtask. Quota断了从下一个
// pending unit 续跑, completed units never re-run.
export const SCHEDULED_TASK_UNITS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scheduled_task_units (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    payload TEXT NOT NULL,
    -- Captured Claude session ids: provider-native (for --resume) and the
    -- app-facing id the UI uses to show this unit's transcript.
    provider_session_id TEXT,
    app_session_id TEXT,
    -- pending | running | done | failed | skipped
    status TEXT NOT NULL DEFAULT 'pending',
    result_summary TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);
`;

export const INIT_SCHEMA_SQL = `
-- Initialize authentication database
PRAGMA foreign_keys = ON;

${USER_TABLE_SCHEMA_SQL}
-- Indexes for performance for user lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

${API_KEYS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

${USER_CREDENTIALS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_type ON user_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_active ON user_credentials(is_active);

${USER_NOTIFICATION_PREFERENCES_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON user_notification_preferences(user_id);

${USER_UI_PREFERENCES_TABLE_SCHEMA_SQL}

${VAPID_KEYS_TABLE_SCHEMA_SQL}

${PUSH_SUBSCRIPTIONS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

${PROJECTS_TABLE_SCHEMA_SQL}
-- NOTE: These indexes are created in migrations after legacy table-shape repairs.
-- Creating them here can fail on upgraded installs where projects lacks those columns.

${SESSIONS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_session_ids_lookup ON sessions(session_id);
-- NOTE: This index is created in migrations after sessions is rebuilt to include project_path.
-- Creating it here can fail on upgraded installs where the legacy sessions table has no project_path.

${LAST_SCANNED_AT_SQL}

${APP_CONFIG_TABLE_SCHEMA_SQL}

${SCHEDULED_TASKS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due ON scheduled_tasks(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id);

${SCHEDULED_TASK_UNITS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_scheduled_task_units_task ON scheduled_task_units(task_id, seq);
`;
