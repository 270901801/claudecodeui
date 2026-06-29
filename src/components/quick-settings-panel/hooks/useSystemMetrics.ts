import { useEffect, useRef, useState } from 'react';

import { api } from '../../../utils/api';

export type DiskMetric = {
  fs: string;
  mount: string;
  type: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usePercent: number;
};

export type SystemMetrics = {
  timestamp: number;
  cpu: { loadPercent: number; cores: number; brand: string };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; usePercent: number };
  disks: DiskMetric[];
  uptime: { systemSeconds: number; processSeconds: number };
};

type UseSystemMetricsResult = {
  metrics: SystemMetrics | null;
  error: boolean;
  isLoading: boolean;
};

const POLL_INTERVAL_MS = 2000;

/**
 * Polls the host metrics endpoint while `active` is true and stops when the
 * panel closes, so the dashboard only requests data while the user can see it.
 */
export function useSystemMetrics(active: boolean): UseSystemMetricsResult {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Guards against setting state after unmount / poll-stop and against
  // overlapping requests when one fetch outlives the interval.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await api.systemMetrics();
        if (cancelled || !isMountedRef.current) {
          return;
        }
        if (!response.ok) {
          setError(true);
        } else {
          const payload = (await response.json()) as { data?: SystemMetrics };
          if (!cancelled && isMountedRef.current && payload.data) {
            setMetrics(payload.data);
            setError(false);
          }
        }
      } catch {
        if (!cancelled && isMountedRef.current) {
          setError(true);
        }
      } finally {
        if (!cancelled && isMountedRef.current) {
          setIsLoading(false);
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    setIsLoading(true);
    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active]);

  return { metrics, error, isLoading };
}
