/**
 * AI quota service.
 *
 * Single source of truth for talking to personalOS's `/ai-quota` endpoint.
 * Both the `/api/ai-quota` proxy route (for the panel) and the long-horizon
 * scheduler's pre-flight check go through here so the base URL / API key /
 * timeout handling lives in one place.
 *
 * personalOS authenticates with an `X-API-Key` header (the key needs the "ai"
 * scope) and is configured via PERSONALOS_API_BASE / PERSONALOS_API_KEY.
 */

const RAW_BASE = process.env.PERSONALOS_API_BASE || "http://127.0.0.1:8000/api/v1";
const PERSONALOS_API_BASE = RAW_BASE.replace(/\/+$/, "");
const PERSONALOS_API_KEY = process.env.PERSONALOS_API_KEY || "";

// Plain GETs are cheap (cached); `?refresh=true` makes personalOS scrape the
// providers live, which can take a while — give that a longer deadline.
const READ_TIMEOUT_MS = 15_000;
const REFRESH_TIMEOUT_MS = 45_000;

export function isQuotaConfigured() {
  return Boolean(PERSONALOS_API_KEY);
}

/**
 * Low-level fetch of the personalOS quota snapshot.
 * @param {boolean} refresh - force a live scrape upstream.
 * @returns {Promise<{ ok: boolean, status: number, data: any, text: string }>}
 */
export async function fetchQuotaUpstream(refresh) {
  const url = `${PERSONALOS_API_BASE}/ai-quota${refresh ? "?refresh=true" : ""}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    refresh ? REFRESH_TIMEOUT_MS : READ_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": PERSONALOS_API_KEY,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data, text };
  } finally {
    clearTimeout(timeout);
  }
}

function windowPct(w) {
  if (w == null) return null;
  if (w.used_pct != null) return w.used_pct;
  if (w.used != null && w.limit) return (w.used / w.limit) * 100;
  return null;
}

function parseResetMs(isoString) {
  if (!isoString) return null;
  const ms = Date.parse(isoString);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Pre-flight quota check for the scheduler. Looks at the snapshot for the given
 * platform (default "reclaude" = Claude 拼车) and decides whether there is
 * enough headroom to start a run.
 *
 * This is an OPTIMIZATION to avoid wasting a startup — the authoritative guard
 * is the runtime rate-limit catch in claude-sdk.js. When the upstream is not
 * configured or unreachable we report ok:false (reason 'no_data') so the
 * scheduler stays conservative rather than blindly burning quota.
 *
 * @returns {Promise<{ ok: boolean, reason?: string, resetsAt?: number|null }>}
 */
export async function hasQuotaToRun({ platform = "reclaude", threshold = 95 } = {}) {
  if (!isQuotaConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  let upstream;
  try {
    upstream = await fetchQuotaUpstream(true);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (!upstream.ok || !upstream.data) {
    return { ok: false, reason: "no_data" };
  }

  const snapshots = Array.isArray(upstream.data.snapshots) ? upstream.data.snapshots : [];
  const snap = snapshots.find((s) => s.platform === platform);
  if (!snap || snap.status === "error" || snap.status === "disabled") {
    return { ok: false, reason: "no_data" };
  }

  // A depleted pay-as-you-go balance does not auto-recover — stop and surface it.
  if (snap.balance && typeof snap.balance.amount === "number" && snap.balance.amount <= 0) {
    return { ok: false, reason: "no_balance", resetsAt: null };
  }

  const windows = Array.isArray(snap.windows) ? snap.windows : [];
  const blocked = windows
    .map((w) => ({ pct: windowPct(w), resetsAt: parseResetMs(w.resets_at) }))
    .filter((w) => w.pct != null && w.pct >= threshold);

  if (blocked.length > 0) {
    // Wait for the earliest window to free up.
    const resets = blocked.map((b) => b.resetsAt).filter((v) => v != null);
    const resetsAt = resets.length ? Math.min(...resets) : null;
    return { ok: false, reason: "exhausted", resetsAt };
  }

  return { ok: true };
}
