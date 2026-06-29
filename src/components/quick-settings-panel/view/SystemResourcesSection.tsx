import { useTranslation } from 'react-i18next';
import { Cpu, HardDrive, MemoryStick } from 'lucide-react';

import { useSystemMetrics } from '../hooks/useSystemMetrics';
import type { SystemMetrics } from '../hooks/useSystemMetrics';

import QuickSettingsSection from './QuickSettingsSection';

type SystemResourcesSectionProps = {
  // True while the panel is open; gates polling so we don't fetch when hidden.
  isActive: boolean;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

// Green under moderate load, amber when busy, red when nearly saturated.
function barColor(percent: number): string {
  if (percent >= 90) {
    return 'bg-red-500';
  }
  if (percent >= 70) {
    return 'bg-amber-500';
  }
  return 'bg-emerald-500';
}

function UsageBar({
  icon,
  label,
  percent,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  percent: number;
  detail: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
          {icon}
          {label}
        </span>
        <span className="font-mono text-gray-600 dark:text-gray-400">{clamped.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function ResourcesBody({ metrics }: { metrics: SystemMetrics }) {
  const { t } = useTranslation('settings');
  // Show the busiest few mounts so a machine with many volumes stays readable.
  const disks = metrics.disks.slice(0, 3);

  return (
    <div className="space-y-3">
      <UsageBar
        icon={<Cpu className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />}
        label={t('quickSettings.systemResources.cpu', { defaultValue: 'CPU' })}
        percent={metrics.cpu.loadPercent}
        detail={`${metrics.cpu.cores} ${t('quickSettings.systemResources.cores', { defaultValue: 'cores' })}`}
      />

      <UsageBar
        icon={<MemoryStick className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />}
        label={t('quickSettings.systemResources.memory', { defaultValue: 'Memory' })}
        percent={metrics.memory.usePercent}
        detail={`${formatBytes(metrics.memory.usedBytes)} / ${formatBytes(metrics.memory.totalBytes)}`}
      />

      {disks.map((disk) => (
        <UsageBar
          key={disk.fs + disk.mount}
          icon={<HardDrive className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />}
          label={`${t('quickSettings.systemResources.disk', { defaultValue: 'Disk' })} ${disk.mount}`}
          percent={disk.usePercent}
          detail={`${formatBytes(disk.usedBytes)} / ${formatBytes(disk.sizeBytes)}`}
        />
      ))}
    </div>
  );
}

export default function SystemResourcesSection({ isActive }: SystemResourcesSectionProps) {
  const { t } = useTranslation('settings');
  const { metrics, error, isLoading } = useSystemMetrics(isActive);

  return (
    <QuickSettingsSection title={t('quickSettings.sections.systemResources', { defaultValue: 'System Resources' })}>
      {error && !metrics ? (
        <p className="text-xs text-red-500 dark:text-red-400">
          {t('quickSettings.systemResources.error', { defaultValue: 'Unable to load system metrics.' })}
        </p>
      ) : !metrics ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isLoading
            ? t('quickSettings.systemResources.loading', { defaultValue: 'Loading metrics…' })
            : t('quickSettings.systemResources.idle', { defaultValue: 'Open to view live metrics.' })}
        </p>
      ) : (
        <ResourcesBody metrics={metrics} />
      )}
    </QuickSettingsSection>
  );
}
