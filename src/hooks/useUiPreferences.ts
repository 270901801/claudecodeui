import { useEffect, useReducer, useRef } from 'react';

import { api } from '../utils/api';
import { IS_PLATFORM } from '../constants/config';

type UiPreferences = {
  autoExpandTools: boolean;
  showRawParameters: boolean;
  showThinking: boolean;
  autoScrollToBottom: boolean;
  sendByCtrlEnter: boolean;
  sidebarVisible: boolean;
  voiceEnabled: boolean;
};

type UiPreferenceKey = keyof UiPreferences;

type SetPreferenceAction = {
  type: 'set';
  key: UiPreferenceKey;
  value: unknown;
};

type SetManyPreferencesAction = {
  type: 'set_many';
  value?: Partial<Record<UiPreferenceKey, unknown>>;
};

type ResetPreferencesAction = {
  type: 'reset';
  value?: Partial<UiPreferences>;
};

type UiPreferencesAction =
  | SetPreferenceAction
  | SetManyPreferencesAction
  | ResetPreferencesAction;

const DEFAULTS: UiPreferences = {
  autoExpandTools: false,
  showRawParameters: false,
  showThinking: true,
  autoScrollToBottom: true,
  sendByCtrlEnter: false,
  sidebarVisible: true,
  voiceEnabled: false,
};

const PREFERENCE_KEYS = Object.keys(DEFAULTS) as UiPreferenceKey[];
const VALID_KEYS = new Set<UiPreferenceKey>(PREFERENCE_KEYS); // prevents unknown keys from being written
const SYNC_EVENT = 'ui-preferences:sync';

// ── Server-side persistence ──────────────────────────────────────
// localStorage is per-device and gets evicted by PWAs/Safari, so we also mirror
// the preferences to the backend (per user) so they survive reloads and sync
// across devices. Only the default `uiPreferences` store is backed by the server.
const SERVER_STORAGE_KEY = 'uiPreferences';
const SERVER_ENDPOINT = '/settings/ui-preferences';
const SAVE_DEBOUNCE_MS = 400;

// Module-level coordinator so the multiple useUiPreferences() instances on a page
// fetch once and debounce-save once, instead of N times each.
const serverSync = {
  loaded: new Set<string>(),
  lastJson: new Map<string, string>(),
  timers: new Map<string, ReturnType<typeof setTimeout>>(),
};

const hasAuth = (): boolean => {
  if (IS_PLATFORM) return true; // cookie-based auth on platform
  try {
    return Boolean(localStorage.getItem('auth-token'));
  } catch {
    return false;
  }
};

// Canonical serialization (stable key order) so we can cheaply diff against the
// last value known to match the server and skip redundant writes.
const serializePreferences = (source: Partial<Record<UiPreferenceKey, unknown>>): string => {
  const ordered = PREFERENCE_KEYS.reduce((acc, key) => {
    acc[key] = parseBoolean(source[key], DEFAULTS[key]);
    return acc;
  }, {} as Record<UiPreferenceKey, boolean>);
  return JSON.stringify(ordered);
};

type SyncEventDetail = {
  storageKey: string;
  sourceId: string;
  value: Partial<Record<UiPreferenceKey, unknown>>;
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  return fallback;
};

const readLegacyPreference = (key: UiPreferenceKey, fallback: boolean): boolean => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;

    // Supports values written by both JSON.stringify and plain strings.
    const parsed = JSON.parse(raw);
    return parseBoolean(parsed, fallback);
  } catch {
    return fallback;
  }
};

const readInitialPreferences = (storageKey: string): UiPreferences => {
  if (typeof window === 'undefined') {
    return DEFAULTS;
  }

  try {
    const raw = localStorage.getItem(storageKey);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parsedRecord = parsed as Record<string, unknown>;

        return PREFERENCE_KEYS.reduce((acc, key) => {
          acc[key] = parseBoolean(parsedRecord[key], DEFAULTS[key]);
          return acc;
        }, { ...DEFAULTS });
      }
    }
  } catch {
    // Fall back to legacy keys when unified key is missing or invalid.
  }

  return PREFERENCE_KEYS.reduce((acc, key) => {
    acc[key] = readLegacyPreference(key, DEFAULTS[key]);
    return acc;
  }, { ...DEFAULTS });
};

function reducer(state: UiPreferences, action: UiPreferencesAction): UiPreferences {
  switch (action.type) {
    case 'set': {
      const { key, value } = action;
      if (!VALID_KEYS.has(key)) {
        return state;
      }

      const nextValue = parseBoolean(value, state[key]);
      if (state[key] === nextValue) {
        return state;
      }

      return { ...state, [key]: nextValue };
    }
    case 'set_many': {
      const updates = action.value || {};
      let changed = false;
      const nextState = { ...state };

      for (const key of PREFERENCE_KEYS) {
        if (!(key in updates)) continue;

        const value = updates[key];
        const nextValue = parseBoolean(value, state[key]);
        if (nextState[key] !== nextValue) {
          nextState[key] = nextValue;
          changed = true;
        }
      }

      return changed ? nextState : state;
    }
    case 'reset':
      return { ...DEFAULTS, ...(action.value || {}) };
    default:
      return state;
  }
}

export function useUiPreferences(storageKey = 'uiPreferences') {
  const instanceIdRef = useRef(`ui-preferences-${Math.random().toString(36).slice(2)}`);
  const [state, dispatch] = useReducer(
    reducer,
    storageKey,
    readInitialPreferences
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(state));

    window.dispatchEvent(
      new CustomEvent<SyncEventDetail>(SYNC_EVENT, {
        detail: {
          storageKey,
          sourceId: instanceIdRef.current,
          value: state,
        },
      })
    );
  }, [state, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const applyExternalUpdate = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return;
      }
      dispatch({ type: 'set_many', value: value as Partial<Record<UiPreferenceKey, unknown>> });
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue);
        applyExternalUpdate(parsed);
      } catch {
        // Ignore malformed storage updates.
      }
    };

    const handleSyncEvent = (event: Event) => {
      const syncEvent = event as CustomEvent<SyncEventDetail>;
      const detail = syncEvent.detail;
      if (!detail || detail.storageKey !== storageKey || detail.sourceId === instanceIdRef.current) {
        return;
      }

      applyExternalUpdate(detail.value);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(SYNC_EVENT, handleSyncEvent as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(SYNC_EVENT, handleSyncEvent as EventListener);
    };
  }, [storageKey]);

  // Load persisted preferences from the server once, then merge them in. The
  // resulting state change propagates to every other hook instance via the
  // localStorage write + SYNC_EVENT in the effect above.
  useEffect(() => {
    if (typeof window === 'undefined' || storageKey !== SERVER_STORAGE_KEY) {
      return;
    }
    if (serverSync.loaded.has(storageKey) || !hasAuth()) {
      return;
    }
    serverSync.loaded.add(storageKey);

    let cancelled = false;
    api
      .get(SERVER_ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const prefs = data?.preferences;
        if (cancelled || !prefs || typeof prefs !== 'object') {
          return;
        }
        // Record the server value so the save effect below doesn't echo it back.
        serverSync.lastJson.set(storageKey, serializePreferences(prefs));
        dispatch({ type: 'set_many', value: prefs });
      })
      .catch(() => {
        // Offline / unauthenticated — keep whatever localStorage gave us and
        // allow a retry on the next mount.
        serverSync.loaded.delete(storageKey);
      });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Debounced, de-duplicated save to the server whenever preferences change.
  useEffect(() => {
    if (typeof window === 'undefined' || storageKey !== SERVER_STORAGE_KEY || !hasAuth()) {
      return;
    }

    const json = serializePreferences(state);
    if (serverSync.lastJson.get(storageKey) === json) {
      return; // unchanged vs. last persisted value
    }

    const pending = serverSync.timers.get(storageKey);
    if (pending) {
      clearTimeout(pending);
    }
    const timer = setTimeout(() => {
      serverSync.timers.delete(storageKey);
      api
        .put(SERVER_ENDPOINT, state)
        .then((res) => {
          if (res.ok) {
            serverSync.lastJson.set(storageKey, json);
          }
        })
        .catch(() => {
          // Will retry on the next change.
        });
    }, SAVE_DEBOUNCE_MS);
    serverSync.timers.set(storageKey, timer);
    // Note: the timer is shared across instances by storageKey, so we don't clear
    // it on a single instance unmounting — that would drop a pending save.
  }, [state, storageKey]);

  const setPreference = (key: UiPreferenceKey, value: unknown) => {
    dispatch({ type: 'set', key, value });
  };

  const setPreferences = (value: Partial<Record<UiPreferenceKey, unknown>>) => {
    dispatch({ type: 'set_many', value });
  };

  const resetPreferences = (value?: Partial<UiPreferences>) => {
    dispatch({ type: 'reset', value });
  };

  return {
    preferences: state,
    setPreference,
    setPreferences,
    resetPreferences,
    dispatch,
  };
}
