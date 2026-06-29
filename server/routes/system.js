import express from "express";

import { getSystemMetrics } from "../services/system-metrics.service.js";

const router = express.Router();

/**
 * GET /api/system/metrics
 *
 * Returns a live snapshot of host CPU / memory / disk usage for the dashboard
 * panel, which polls this endpoint on a short interval. The collector never
 * throws (it falls back to Node's `os` module per-probe), so a failure here is
 * an unexpected server error rather than a missing-metric case.
 */
router.get("/metrics", async (_req, res) => {
  try {
    const metrics = await getSystemMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error("[System] Failed to collect metrics:", error);
    res.status(500).json({ success: false, error: "Failed to collect system metrics." });
  }
});

export default router;
