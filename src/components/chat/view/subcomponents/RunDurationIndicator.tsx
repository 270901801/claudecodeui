import { useTranslation } from 'react-i18next';

type RunDurationIndicatorProps = {
  /** Total elapsed time of the most recently completed run, in ms. */
  elapsedMs: number | null;
};

/**
 * Static counterpart to {@link ActivityIndicator}: once a run finishes the live
 * ticking timer is removed, so this leaves behind a quiet "took {{time}}" line
 * in the same spot to report the total turn duration. Rendered only while the
 * viewed session is idle and a freshly-completed run's duration is known.
 */
export default function RunDurationIndicator({ elapsedMs }: RunDurationIndicatorProps) {
  const { t } = useTranslation('chat');
  if (elapsedMs === null || elapsedMs < 0) return null;

  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const time = minutes < 1
    ? t('claudeStatus.elapsed.seconds', { count: seconds, defaultValue: '{{count}}s' })
    : t('claudeStatus.elapsed.minutesSeconds', { minutes, seconds, defaultValue: '{{minutes}}m {{seconds}}s' });

  return (
    <div className="animate-in fade-in mb-2 w-full duration-300">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-1">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {t('claudeStatus.completed', { time, defaultValue: 'Took {{time}}' })}
        </span>
      </div>
    </div>
  );
}
