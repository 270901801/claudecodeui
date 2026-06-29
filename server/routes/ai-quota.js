import express from "express";

const router = express.Router();

// personalOS exposes the AI quota API at `${base}/ai-quota` and authenticates
// with an `X-API-Key` header (the key needs the "ai" scope). Both are read from
// the environment so the secret stays server-side and the frontend only ever
// talks to this proxy.
const RAW_BASE = process.env.PERSONALOS_API_BASE || "http://127.0.0.1:8000/api/v1";
const PERSONALOS_API_BASE = RAW_BASE.replace(/\/+$/, "");
const PERSONALOS_API_KEY = process.env.PERSONALOS_API_KEY || "";

// Plain GETs are cheap (cached), but `?refresh=true` makes personalOS scrape
// the providers live, which can take a while — give that a longer deadline.
const READ_TIMEOUT_MS = 15_000;
const REFRESH_TIMEOUT_MS = 45_000;

async function fetchUpstream(refresh) {
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

/**
 * GET /api/ai-quota
 *
 * Proxies personalOS's AI quota snapshot. Returns `{ configured: false }` (200)
 * when the integration isn't set up yet, so the panel shows a friendly hint
 * instead of an error.
 */
router.get("/", async (req, res) => {
  if (!PERSONALOS_API_KEY) {
    res.json({
      configured: false,
      message: "PERSONALOS_API_KEY is not set. Add it to the server .env to enable the AI quota panel.",
    });
    return;
  }

  const refresh = req.query.refresh === "true";

  try {
    const upstream = await fetchUpstream(refresh);
    if (!upstream.ok) {
      res.status(502).json({
        configured: true,
        error: `personalOS responded with ${upstream.status}.`,
        detail: upstream.data ?? upstream.text ?? null,
      });
      return;
    }
    res.json({ configured: true, ...(upstream.data ?? {}) });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    console.error("[AiQuota] Failed to reach personalOS:", error?.message || error);
    res.status(502).json({
      configured: true,
      error: aborted
        ? "personalOS did not respond in time."
        : "Could not reach personalOS. Is it running on the configured base URL?",
    });
  }
});

export default router;
