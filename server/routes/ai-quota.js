import express from "express";

import { fetchQuotaUpstream, isQuotaConfigured } from "../services/quota.service.js";

const router = express.Router();

/**
 * GET /api/ai-quota
 *
 * Proxies personalOS's AI quota snapshot. Returns `{ configured: false }` (200)
 * when the integration isn't set up yet, so the panel shows a friendly hint
 * instead of an error.
 */
router.get("/", async (req, res) => {
  if (!isQuotaConfigured()) {
    res.json({
      configured: false,
      message: "PERSONALOS_API_KEY is not set. Add it to the server .env to enable the AI quota panel.",
    });
    return;
  }

  const refresh = req.query.refresh === "true";

  try {
    const upstream = await fetchQuotaUpstream(refresh);
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
