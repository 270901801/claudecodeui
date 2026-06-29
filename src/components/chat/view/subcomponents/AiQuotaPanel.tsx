import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Gauge, RefreshCw, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { api } from '../../../../utils/api';
import { Badge, Dialog, DialogContent, DialogTitle } from '../../../../shared/view/ui';

type QuotaWindow = {
  type: string;
  label: string;
  used_pct: number | null;
  used: number | null;
  limit: number | null;
  unit: string | null;
  resets_at: string | null;
  resets_in_seconds: number | null;
  note: string | null;
};

type QuotaBalance = { amount: number; unit: string; label: string | null };

type QuotaSnapshot = {
  platform: string;
  display_name: string;
  status: 'ok' | 'error' | 'stale' | 'disabled';
  error: string | null;
  fetched_at: string;
  windows: QuotaWindow[];
  plan_days_left: number | null;
  balance: QuotaBalance | null;
  plan_label: string | null;
};

type QuotaResponse = {
  configured: boolean;
  message?: string;
  error?: string;
  snapshots?: QuotaSnapshot[];
  from_cache?: boolean;
  generated_at?: string;
};

const POLL_INTERVAL_MS = 60_000;

function windowPct(w: QuotaWindow): number | null {
  if (w.used_pct != null) return w.used_pct;
  if (w.used != null && w.limit) return (w.used / w.limit) * 100;
  return null;
}

// Matches personalOS severity thresholds: >=90 critical, >=70 warning.
function barColor(pct: number | null): string {
  if (pct == null) return 'bg-muted-foreground/40';
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// "3d 5h" / "2h 15m" / "13m" / null. The "resets now" case is localized by caller.
function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds <= 0) return '';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusBadgeClass(status: QuotaSnapshot['status']): string {
  switch (status) {
    case 'ok':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    case 'stale':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    case 'disabled':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-red-500/15 text-red-600 dark:text-red-400';
  }
}

function QuotaWindowBar({ window: w, resetsNowLabel }: { window: QuotaWindow; resetsNowLabel: string }) {
  const pct = windowPct(w);
  const reset = formatDuration(w.resets_in_seconds);
  const resetText = reset === '' ? resetsNowLabel : reset;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate font-medium text-foreground">{w.label}</span>
        <span className="ml-2 shrink-0 font-mono text-muted-foreground">
          {pct != null ? `${Math.round(pct)}%` : '—'}
          {resetText ? ` · ${resetText}` : ''}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor(pct)}`}
          style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

function SnapshotCard({ snap, resetsNowLabel }: { snap: QuotaSnapshot; resetsNowLabel: string }) {
  const { t } = useTranslation('chat');
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{snap.display_name}</span>
        <Badge className={`shrink-0 rounded-full border-0 text-[10px] ${statusBadgeClass(snap.status)}`}>
          {snap.status}
        </Badge>
      </div>

      {snap.error ? (
        <p className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {snap.error}
        </p>
      ) : (
        <div className="space-y-2.5">
          {snap.windows.map((w) => (
            <QuotaWindowBar key={`${w.type}-${w.label}`} window={w} resetsNowLabel={resetsNowLabel} />
          ))}
          {snap.windows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('aiQuota.noWindows', { defaultValue: 'No usage windows reported.' })}
            </p>
          )}
        </div>
      )}

      {(snap.balance || snap.plan_label || snap.plan_days_left != null) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
          {snap.balance && (
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              {snap.balance.label ? `${snap.balance.label}: ` : ''}
              {snap.balance.amount}
              {snap.balance.unit ? ` ${snap.balance.unit}` : ''}
            </span>
          )}
          {(snap.plan_label || snap.plan_days_left != null) && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              {snap.plan_label ? `${snap.plan_label}` : ''}
              {snap.plan_days_left != null
                ? ` ${t('aiQuota.daysLeft', { defaultValue: '{{n}}d left', n: snap.plan_days_left })}`
                : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AiQuotaPanel() {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetsNowLabel = t('aiQuota.resetsNow', { defaultValue: 'resetting' });

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const response = await api.aiQuota(refresh);
      const payload = (await response.json()) as QuotaResponse;
      if (!response.ok) {
        setError(payload?.error || t('aiQuota.error', { defaultValue: 'Failed to load AI quota.' }));
        setData(payload ?? null);
      } else {
        setData(payload);
      }
    } catch {
      setError(t('aiQuota.error', { defaultValue: 'Failed to load AI quota.' }));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  // Fetch on open and poll while open so the snapshot stays current.
  useEffect(() => {
    if (!isOpen) return;
    void load(false);
    const timer = setInterval(() => void load(false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOpen, load]);

  const snapshots = data?.snapshots ?? [];
  const notConfigured = data != null && data.configured === false;

  return (
    <>
      {/* Floating launcher (top-right of the chat area) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t('aiQuota.title', { defaultValue: 'AI quota' })}
        title={t('aiQuota.title', { defaultValue: 'AI quota' })}
        className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent/70 hover:text-foreground"
      >
        <Gauge className="h-4 w-4" />
      </button>

      <Dialog open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
        <DialogContent className="flex max-h-[min(85dvh,40rem)] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              {t('aiQuota.title', { defaultValue: 'AI quota' })}
            </DialogTitle>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={isRefreshing || notConfigured}
              aria-label={t('aiQuota.refresh', { defaultValue: 'Refresh' })}
              title={t('aiQuota.refresh', { defaultValue: 'Refresh' })}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {notConfigured ? (
              <p className="text-xs text-muted-foreground">
                {t('aiQuota.notConfigured', {
                  defaultValue: 'AI quota is not configured. Set PERSONALOS_API_KEY in the server .env.',
                })}
              </p>
            ) : error && snapshots.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            ) : isLoading && snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('aiQuota.loading', { defaultValue: 'Loading…' })}</p>
            ) : snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('aiQuota.empty', { defaultValue: 'No quota data.' })}</p>
            ) : (
              snapshots.map((snap) => (
                <SnapshotCard key={snap.platform} snap={snap} resetsNowLabel={resetsNowLabel} />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
