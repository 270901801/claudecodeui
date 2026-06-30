import { useEffect, useState } from 'react';

import { api } from '../../utils/api';
import { IS_PLATFORM } from '../../constants/config';

const STORAGE_KEY = 'active-sessions:max-recent';
const CHANGE_EVENT = 'activeSessionsMaxRecentChanged';
// Mirrored into the per-user UI-preferences blob so the choice follows the user
// across browsers/devices (localStorage alone is per-device).
const SERVER_ENDPOINT = '/settings/ui-preferences';

/** Default number of recent (idle) sessions shown in the bottom-right capsule. */
export const DEFAULT_MAX_RECENT = 8;
const MIN_MAX_RECENT = 1;

// No upper bound by design — the user types whatever cap they want; we only
// guard against zero/negative which would make the capsule meaningless.
const clamp = (value: number): number =>
  Math.max(MIN_MAX_RECENT, Math.round(value));

const clampMaybe = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return clamp(value);
};

const hasAuth = (): boolean => {
  if (IS_PLATFORM) {
    return true; // cookie-based auth on platform
  }
  try {
    return Boolean(localStorage.getItem('auth-token'));
  } catch {
    return false;
  }
};

export const getMaxRecentSessions = (): number => {
  if (typeof window === 'undefined') {
    return DEFAULT_MAX_RECENT;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return DEFAULT_MAX_RECENT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_MAX_RECENT;
};

const writeLocal = (value: number): void => {
  window.localStorage.setItem(STORAGE_KEY, String(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const setMaxRecentSessions = (value: number): void => {
  if (typeof window === 'undefined') {
    return;
  }
  const next = clamp(value);
  writeLocal(next);
  // Persist server-side (partial merge) so the value syncs across devices.
  if (hasAuth()) {
    api.put(SERVER_ENDPOINT, { maxRecentSessions: next }).catch(() => {
      // Offline / unauthenticated — localStorage still holds the value.
    });
  }
};

// Load the server value once per page; the server is the source of truth and its
// value (or default) wins over the local cache, mirroring `useUiPreferences`.
let serverLoadStarted = false;
const loadFromServer = (): void => {
  if (typeof window === 'undefined' || serverLoadStarted || !hasAuth()) {
    return;
  }
  serverLoadStarted = true;
  api
    .get(SERVER_ENDPOINT)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const value = clampMaybe(data?.preferences?.maxRecentSessions);
      if (value !== null && value !== getMaxRecentSessions()) {
        writeLocal(value);
      }
    })
    .catch(() => {
      serverLoadStarted = false; // allow a retry on the next mount
    });
};

/**
 * Reactive accessor for the capsule's recent-session cap. Re-renders when the
 * value changes in this tab (custom event) or another tab (storage event), and
 * hydrates from the server once on mount so the choice follows the user across
 * browsers/devices.
 */
export function useMaxRecentSessions(): number {
  const [value, setValue] = useState<number>(() => getMaxRecentSessions());

  useEffect(() => {
    loadFromServer();
    const sync = () => setValue(getMaxRecentSessions());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return value;
}
