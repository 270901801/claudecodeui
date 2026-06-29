import os from 'node:os';

import si from 'systeminformation';

/**
 * System resource metrics shared by the dashboard panel (live polling) and the
 * `/status` command (one-shot). `systeminformation` is the primary source; if a
 * probe fails we fall back to Node's built-in `os` module so the endpoint never
 * throws and the panel degrades gracefully instead of going blank.
 */

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
  cpu: {
    loadPercent: number;
    cores: number;
    brand: string;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usePercent: number;
  };
  disks: DiskMetric[];
  uptime: {
    systemSeconds: number;
    processSeconds: number;
  };
};

function roundPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value * 10) / 10;
}

async function collectCpu(): Promise<SystemMetrics['cpu']> {
  const cores = os.cpus()?.length ?? 0;
  try {
    const [load, info] = await Promise.all([si.currentLoad(), si.cpu()]);
    return {
      loadPercent: roundPercent(load.currentLoad),
      cores: info.cores || cores,
      brand: info.brand?.trim() || os.cpus()?.[0]?.model?.trim() || 'Unknown CPU',
    };
  } catch {
    // Fallback: derive a coarse load from os.loadavg() (1-minute average over cores).
    const oneMinuteLoad = os.loadavg()?.[0] ?? 0;
    const loadPercent = cores > 0 ? roundPercent((oneMinuteLoad / cores) * 100) : 0;
    return {
      loadPercent,
      cores,
      brand: os.cpus()?.[0]?.model?.trim() || 'Unknown CPU',
    };
  }
}

async function collectMemory(): Promise<SystemMetrics['memory']> {
  try {
    const mem = await si.mem();
    const total = mem.total || os.totalmem();
    // `active` excludes reclaimable cache/buffers, matching what users expect
    // from "used" memory in Activity Monitor / htop.
    const used = mem.active || mem.used || total - mem.available;
    const free = total - used;
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usePercent: total > 0 ? roundPercent((used / total) * 100) : 0,
    };
  } catch {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usePercent: total > 0 ? roundPercent((used / total) * 100) : 0,
    };
  }
}

async function collectDisks(): Promise<DiskMetric[]> {
  try {
    const sizes = await si.fsSize();
    return sizes
      // Keep only real, non-empty filesystems and drop duplicate/virtual mounts.
      .filter((entry) => entry.size > 0 && entry.mount)
      .map((entry) => ({
        fs: entry.fs,
        mount: entry.mount,
        type: entry.type,
        sizeBytes: entry.size,
        usedBytes: entry.used,
        availableBytes: entry.available,
        usePercent: roundPercent(entry.use),
      }))
      // Largest filesystems first; the panel typically shows the top few.
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
  } catch {
    return [];
  }
}

/**
 * Full metrics snapshot for the dashboard panel.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [cpu, memory, disks] = await Promise.all([collectCpu(), collectMemory(), collectDisks()]);

  return {
    timestamp: Date.now(),
    cpu,
    memory,
    disks,
    uptime: {
      systemSeconds: Math.floor(os.uptime()),
      processSeconds: Math.floor(process.uptime()),
    },
  };
}

/**
 * Condensed view embedded in the `/status` command response. Reuses the full
 * collector and trims disks to the largest mount to keep the payload small.
 */
export async function getSystemMetricsSummary(): Promise<{
  cpuLoadPercent: number;
  cpuCores: number;
  memoryTotalMb: number;
  memoryUsedMb: number;
  memoryUsePercent: number;
  primaryDisk: { mount: string; usePercent: number; totalGb: number; usedGb: number } | null;
}> {
  const metrics = await getSystemMetrics();
  const primaryDisk = metrics.disks[0] ?? null;

  return {
    cpuLoadPercent: metrics.cpu.loadPercent,
    cpuCores: metrics.cpu.cores,
    memoryTotalMb: Math.round(metrics.memory.totalBytes / 1024 / 1024),
    memoryUsedMb: Math.round(metrics.memory.usedBytes / 1024 / 1024),
    memoryUsePercent: metrics.memory.usePercent,
    primaryDisk: primaryDisk
      ? {
          mount: primaryDisk.mount,
          usePercent: primaryDisk.usePercent,
          totalGb: Math.round((primaryDisk.sizeBytes / 1024 / 1024 / 1024) * 10) / 10,
          usedGb: Math.round((primaryDisk.usedBytes / 1024 / 1024 / 1024) * 10) / 10,
        }
      : null,
  };
}
