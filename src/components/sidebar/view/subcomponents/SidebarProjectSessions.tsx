import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';
import type { SessionActivityMap } from '../../../../hooks/useSessionProtection';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';

import SidebarSessionItem from './SidebarSessionItem';

type SidebarProjectSessionsProps = {
  project: Project;
  isExpanded: boolean;
  sessions: SessionWithProvider[];
  selectedSession: ProjectSession | null;
  initialSessionsLoaded: boolean;
  hasMoreSessions: boolean;
  isLoadingMoreSessions: boolean;
  activeSessions: SessionActivityMap;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  onTogglePinSession: (sessionId: string) => void;
  onForkSession: (sessionId: string, projectId: string, provider: LLMProvider) => void;
  onLoadMoreSessions: (projectId: string) => void;
  onNewSession: (project: Project) => void;
  t: TFunction;
};

const COLLAPSED_SESSION_COUNT = 5;

function SessionListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-md p-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-3 w-3 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${60 + index * 15}%` }} />
              <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function SidebarProjectSessions({
  project,
  isExpanded,
  sessions,
  selectedSession,
  initialSessionsLoaded,
  hasMoreSessions,
  isLoadingMoreSessions,
  activeSessions,
  currentTime,
  editingSession,
  editingSessionName,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onTogglePinSession,
  onForkSession,
  onLoadMoreSessions,
  onNewSession,
  t,
}: SidebarProjectSessionsProps) {
  // Client-side display cap: when a project is first expanded, only the first
  // few sessions render so the sidebar isn't flooded. This resets on collapse
  // because the component unmounts while `!isExpanded`.
  const [showAllSessions, setShowAllSessions] = useState(false);

  if (!isExpanded) {
    return null;
  }

  const hasSessions = sessions.length > 0;
  const isCapped = sessions.length > COLLAPSED_SESSION_COUNT;
  const visibleSessions = showAllSessions ? sessions : sessions.slice(0, COLLAPSED_SESSION_COUNT);
  const hiddenCount = sessions.length - COLLAPSED_SESSION_COUNT;

  return (
    <div className="ml-3 space-y-1 border-l border-border pl-3">
      <div className="px-3 pb-1 pt-1 md:hidden">
        <button
          className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
          onClick={() => {
            onProjectSelect(project);
            onNewSession(project);
          }}
        >
          <Plus className="h-3 w-3" />
          {t('sessions.newSession')}
        </button>
      </div>

      <Button
        variant="default"
        size="sm"
        className="hidden h-8 w-full justify-start gap-2 bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:flex"
        onClick={() => onNewSession(project)}
      >
        <Plus className="h-3 w-3" />
        {t('sessions.newSession')}
      </Button>

      {!initialSessionsLoaded ? (
        <SessionListSkeleton />
      ) : !hasSessions ? (
        <div className="px-3 py-2 text-left">
          <p className="text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
        </div>
      ) : (
        <>
          {visibleSessions.map((session) => (
            <SidebarSessionItem
              key={session.id}
              project={project}
              session={session}
              selectedSession={selectedSession}
              isProcessing={activeSessions.has(session.id)}
              currentTime={currentTime}
              editingSession={editingSession}
              editingSessionName={editingSessionName}
              onEditingSessionNameChange={onEditingSessionNameChange}
              onStartEditingSession={onStartEditingSession}
              onCancelEditingSession={onCancelEditingSession}
              onSaveEditingSession={onSaveEditingSession}
              onProjectSelect={onProjectSelect}
              onSessionSelect={onSessionSelect}
              onDeleteSession={onDeleteSession}
              onTogglePinSession={onTogglePinSession}
              onForkSession={onForkSession}
              t={t}
            />
          ))}

          {isCapped && !showAllSessions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAllSessions(true)}
            >
              <ChevronDown className="h-3 w-3" />
              {t('sessions.showMoreCount', { count: hiddenCount })}
            </Button>
          )}

          {showAllSessions && hasMoreSessions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onLoadMoreSessions(project.projectId)}
              disabled={isLoadingMoreSessions}
            >
              {isLoadingMoreSessions ? t('sessions.loadingSessions') : t('sessions.showMore')}
            </Button>
          )}

          {isCapped && showAllSessions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAllSessions(false)}
            >
              <ChevronUp className="h-3 w-3" />
              {t('sessions.collapse')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
