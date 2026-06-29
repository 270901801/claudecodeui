import { useEffect, useState } from 'react';
import { ListTree, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { api } from '../../../../utils/api';
import { useDeviceSettings } from '../../../../hooks/useDeviceSettings';

export type OutlineEntry = {
  id: string;
  index: number;
  timestamp: string;
  preview: string;
};

type ConversationOutlinePanelProps = {
  sessionId: string | null;
  // Bumps whenever the loaded message set changes (e.g. a new message is sent),
  // so the outline refetches while open to stay current.
  refreshKey: number;
  onNavigate: (entry: { id: string; index: number; timestamp: string; total: number }) => void;
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConversationOutlinePanel({
  sessionId,
  refreshKey,
  onNavigate,
}: ConversationOutlinePanelProps) {
  const { t } = useTranslation('chat');
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<OutlineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  // Fetch the outline whenever the panel is open for the current session, and
  // refresh it when the session or message count changes underneath it.
  useEffect(() => {
    if (!isOpen || !sessionId) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(false);

    api
      .sessionOutline(sessionId)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setError(true);
          return;
        }
        const body = await response.json();
        const data = body?.data ?? body;
        if (!cancelled) {
          setEntries(Array.isArray(data?.entries) ? data.entries : []);
          setTotal(typeof data?.total === 'number' ? data.total : 0);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, sessionId, refreshKey]);

  const handleEntryClick = (entry: OutlineEntry) => {
    onNavigate({ id: entry.id, index: entry.index, timestamp: entry.timestamp, total });
    if (isMobile) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Floating toggle button (top-left of the chat area) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={t('outline.title', { defaultValue: 'Conversation outline' })}
          title={t('outline.title', { defaultValue: 'Conversation outline' })}
          className="absolute left-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent/70 hover:text-foreground"
        >
          <ListTree className="h-4 w-4" />
        </button>
      )}

      {/* Slide-in panel from the left, scoped to the chat area */}
      <div
        className={`absolute left-0 top-0 z-40 h-full transform border-r border-border bg-background shadow-xl transition-transform duration-150 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isMobile ? 'w-full' : 'w-72'}`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListTree className="h-4 w-4 text-muted-foreground" />
              {t('outline.title', { defaultValue: 'Conversation outline' })}
            </h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={t('outline.close', { defaultValue: 'Close' })}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
            {error ? (
              <p className="px-2 py-3 text-xs text-red-500 dark:text-red-400">
                {t('outline.error', { defaultValue: 'Failed to load the outline.' })}
              </p>
            ) : isLoading && entries.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {t('outline.loading', { defaultValue: 'Loading…' })}
              </p>
            ) : entries.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {t('outline.empty', { defaultValue: 'No messages from you yet.' })}
              </p>
            ) : (
              <ul className="space-y-1">
                {entries.map((entry, position) => {
                  const time = formatTime(entry.timestamp);
                  return (
                    <li key={entry.id || `${entry.index}-${entry.timestamp}`}>
                      <button
                        type="button"
                        onClick={() => handleEntryClick(entry)}
                        className="group flex w-full items-start gap-2 rounded-md border border-transparent p-2 text-left transition-colors hover:border-border/60 hover:bg-accent/50"
                      >
                        <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {t('outline.question', { defaultValue: '#{{n}}', n: position + 1 })}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-foreground">
                            {entry.preview || t('outline.untitled', { defaultValue: '(no text)' })}
                          </span>
                          {time && (
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">{time}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="absolute inset-0 z-30 bg-background/60 backdrop-blur-sm transition-opacity duration-150 ease-out"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
