/**
 * UI preferences repository.
 *
 * Stores the per-user Quick Settings / UI toggles as JSON so they persist
 * across reloads and sync across devices (localStorage alone is per-device and
 * gets evicted by PWAs/Safari).
 *
 * Keys mirror the frontend `useUiPreferences` DEFAULTS.
 */

import { getConnection } from '@/modules/database/connection.js';

type UiPreferences = {
  autoExpandTools: boolean;
  showRawParameters: boolean;
  showThinking: boolean;
  autoScrollToBottom: boolean;
  sendByCtrlEnter: boolean;
  sidebarVisible: boolean;
  voiceEnabled: boolean;
  /** Max recent (idle) sessions shown in the bottom-right capsule. */
  maxRecentSessions: number;
};

const DEFAULT_UI_PREFERENCES: UiPreferences = {
  autoExpandTools: false,
  showRawParameters: false,
  showThinking: true,
  autoScrollToBottom: true,
  sendByCtrlEnter: false,
  sidebarVisible: true,
  voiceEnabled: false,
  maxRecentSessions: 8,
};

// Boolean toggles share one coercion path; numeric keys are clamped separately.
const BOOLEAN_KEYS = (Object.keys(DEFAULT_UI_PREFERENCES) as (keyof UiPreferences)[])
  .filter((key) => typeof DEFAULT_UI_PREFERENCES[key] === 'boolean');

const MIN_MAX_RECENT = 1;
const MAX_MAX_RECENT = 50;

const clampMaxRecent = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(MAX_MAX_RECENT, Math.max(MIN_MAX_RECENT, Math.round(value)));
};

function normalizeUiPreferences(value: unknown): UiPreferences {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  const result = { ...DEFAULT_UI_PREFERENCES };
  for (const key of BOOLEAN_KEYS) {
    const raw = source[key];
    // Only accept real booleans; otherwise fall back to the default for that key.
    result[key] = (typeof raw === 'boolean' ? raw : DEFAULT_UI_PREFERENCES[key]) as never;
  }
  result.maxRecentSessions = clampMaxRecent(source.maxRecentSessions) ?? DEFAULT_UI_PREFERENCES.maxRecentSessions;
  return result;
}

export const uiPreferencesDb = {
  /** Returns the normalized UI preferences for a user, creating defaults on first read. */
  getUiPreferences(userId: number): UiPreferences {
    const db = getConnection();
    const row = db
      .prepare('SELECT preferences_json FROM user_ui_preferences WHERE user_id = ?')
      .get(userId) as { preferences_json: string } | undefined;

    if (!row) {
      const defaults = normalizeUiPreferences(DEFAULT_UI_PREFERENCES);
      db.prepare(
        'INSERT INTO user_ui_preferences (user_id, preferences_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
      ).run(userId, JSON.stringify(defaults));
      return defaults;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.preferences_json);
    } catch {
      parsed = DEFAULT_UI_PREFERENCES;
    }
    return normalizeUiPreferences(parsed);
  },

  /**
   * Merges a partial update into the stored preferences and returns the result.
   * Partial merge keeps unknown/omitted keys intact so a single toggle never
   * wipes the rest.
   */
  updateUiPreferences(userId: number, partial: unknown): UiPreferences {
    const current = uiPreferencesDb.getUiPreferences(userId);
    const incoming = partial && typeof partial === 'object' ? (partial as Record<string, unknown>) : {};

    const merged = { ...current };
    for (const key of BOOLEAN_KEYS) {
      if (typeof incoming[key] === 'boolean') {
        merged[key] = incoming[key] as never;
      }
    }
    const nextMaxRecent = clampMaxRecent(incoming.maxRecentSessions);
    if (nextMaxRecent !== null) {
      merged.maxRecentSessions = nextMaxRecent;
    }

    const db = getConnection();
    db.prepare(
      `INSERT INTO user_ui_preferences (user_id, preferences_json, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         preferences_json = excluded.preferences_json,
         updated_at = CURRENT_TIMESTAMP`
    ).run(userId, JSON.stringify(merged));

    return merged;
  },
};
