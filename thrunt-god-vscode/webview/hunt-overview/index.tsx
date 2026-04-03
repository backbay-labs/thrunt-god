import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  HostToHuntOverviewMessage,
  HuntOverviewToHostMessage,
  HuntOverviewViewModel,
  ActivityFeedEntry,
} from '../../shared/hunt-overview';
import { Panel, StatCard, GhostButton } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

interface PersistedHuntOverviewState {
  showAllActivity: boolean;
  scrollY: number;
  focusedArtifactId: string | null;
}

const vscode = createVsCodeApi<
  PersistedHuntOverviewState,
  HuntOverviewToHostMessage
>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceToPercent(confidence: string): number {
  switch (confidence) {
    case 'High':
      return 85;
    case 'Medium':
      return 55;
    case 'Low':
      return 25;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MissionCard({ mission }: { mission: HuntOverviewViewModel['mission'] }) {
  if (mission === null) {
    return (
      <Panel>
        <p style={{ color: 'var(--hunt-text-muted)', margin: 0 }}>No mission data available.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <p class="hunt-section-heading">Mission</p>
      <h1
        style={{
          fontSize: 'clamp(1.3rem, 2.2vw, 2rem)',
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {mission.signal}
      </h1>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          marginTop: '14px',
        }}
      >
        <span>
          <span style={{ display: 'block', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hunt-text-muted)' }}>
            Owner
          </span>
          <span style={{ display: 'block', marginTop: '2px' }}>{mission.owner}</span>
        </span>
        <span>
          <span style={{ display: 'block', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hunt-text-muted)' }}>
            Opened
          </span>
          <span style={{ display: 'block', marginTop: '2px' }}>{mission.opened}</span>
        </span>
        <span>
          <span style={{ display: 'block', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hunt-text-muted)' }}>
            Mode
          </span>
          <span style={{ display: 'block', marginTop: '2px' }}>{mission.mode}</span>
        </span>
        <span>
          <span style={{ display: 'block', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hunt-text-muted)' }}>
            Focus
          </span>
          <span style={{ display: 'block', marginTop: '2px' }}>{mission.focus}</span>
        </span>
      </div>
    </Panel>
  );
}

function PhaseRail({
  phases,
  currentPhase: _currentPhase,
}: {
  phases: HuntOverviewViewModel['phases'];
  currentPhase: number;
}) {
  if (phases.length === 0) {
    return null;
  }

  return (
    <div>
      <p class="hunt-section-heading">Phases</p>
      <div class="hunt-phase-rail">
        {phases.map((phase) => (
          <button
            key={phase.number}
            class={`hunt-phase-rail__segment hunt-phase-rail__segment--${phase.status}`}
            aria-label={`Phase ${phase.number}: ${phase.name} (${phase.status})`}
            onClick={() =>
              vscode.postMessage({ type: 'navigate', target: 'sidebar' })
            }
          >
            {phase.number}
          </button>
        ))}
      </div>
    </div>
  );
}

function VerdictCards({
  verdicts,
}: {
  verdicts: HuntOverviewViewModel['verdicts'];
}) {
  const navigateToHypotheses = () =>
    vscode.postMessage({ type: 'navigate', target: 'sidebar:hypotheses' });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') navigateToHypotheses();
  };

  return (
    <div>
      <p class="hunt-section-heading">Hypothesis Verdicts</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
        }}
      >
        <div
          class="hunt-verdict-card"
          role="button"
          tabIndex={0}
          onClick={navigateToHypotheses}
          onKeyDown={onKeyDown}
        >
          <StatCard
            label="Supported"
            value={String(verdicts.supported)}
            className="hunt-verdict--supported"
          />
        </div>
        <div
          class="hunt-verdict-card"
          role="button"
          tabIndex={0}
          onClick={navigateToHypotheses}
          onKeyDown={onKeyDown}
        >
          <StatCard
            label="Disproved"
            value={String(verdicts.disproved)}
            className="hunt-verdict--disproved"
          />
        </div>
        <div
          class="hunt-verdict-card"
          role="button"
          tabIndex={0}
          onClick={navigateToHypotheses}
          onKeyDown={onKeyDown}
        >
          <StatCard
            label="Inconclusive"
            value={String(verdicts.inconclusive)}
            className="hunt-verdict--inconclusive"
          />
        </div>
        <div
          class="hunt-verdict-card"
          role="button"
          tabIndex={0}
          onClick={navigateToHypotheses}
          onKeyDown={onKeyDown}
        >
          <StatCard
            label="Open"
            value={String(verdicts.open)}
            className="hunt-verdict--open"
          />
        </div>
      </div>
    </div>
  );
}

function ConfidenceMeter({ confidence }: { confidence: string }) {
  return (
    <div>
      <p class="hunt-section-heading">Confidence</p>
      <div class="hunt-confidence-meter">
        <div
          class="hunt-confidence-meter__fill"
          style={{ width: `${confidenceToPercent(confidence)}%` }}
        />
      </div>
      <div class="hunt-confidence-meter__ticks">
        <span>Low</span>
        <span>Medium</span>
        <span>High</span>
      </div>
    </div>
  );
}

function EvidenceStats({
  evidence,
}: {
  evidence: HuntOverviewViewModel['evidence'];
}) {
  return (
    <div>
      <p class="hunt-section-heading">Evidence</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
        }}
      >
        <StatCard label="Receipts" value={String(evidence.receipts)} />
        <StatCard label="Queries" value={String(evidence.queries)} />
        <StatCard label="Templates" value={String(evidence.templates)} />
      </div>
    </div>
  );
}

function BlockerStack({
  blockers,
}: {
  blockers: HuntOverviewViewModel['blockers'];
}) {
  const [expanded, setExpanded] = useState(true);

  if (blockers.length === 0) {
    return null;
  }

  const sorted = [...blockers].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div>
      <button
        class="hunt-blocker-toggle"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span
          class={`hunt-blocker-toggle__chevron ${expanded ? 'hunt-blocker-toggle__chevron--open' : ''}`}
        >
          &#9654;
        </span>
        Blockers ({blockers.length})
      </button>
      {expanded && (
        <div class="hunt-blocker-stack">
          {sorted.map((blocker, index) => (
            <div class="hunt-blocker-card" key={index}>
              <div>{blocker.text}</div>
              <div class="hunt-blocker-card__timestamp">{blocker.timestamp}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthCard({
  health,
}: {
  health: HuntOverviewViewModel['diagnosticsHealth'];
}) {
  const variant =
    health.errors > 0 ? 'errors' : health.warnings > 0 ? 'warnings' : 'clean';

  const navigateToProblems = () =>
    vscode.postMessage({ type: 'navigate', target: 'problems' });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') navigateToProblems();
  };

  return (
    <div
      class={`hunt-health-card hunt-health-card--${variant}`}
      role="button"
      tabIndex={0}
      aria-label="Evidence integrity - click to open Problems panel"
      onClick={navigateToProblems}
      onKeyDown={onKeyDown}
    >
      <span class="hunt-health-card__label">Evidence Integrity</span>
      <div class="hunt-health-card__stats">
        <StatCard label="Errors" value={String(health.errors)} className="hunt-health--errors" />
        <StatCard label="Warnings" value={String(health.warnings)} className="hunt-health--warnings" />
      </div>
    </div>
  );
}

function ActivityFeed({
  entries,
  sessionDiff,
  showAll,
  focusedArtifactId,
  onToggleShowAll,
  onArtifactSelect,
}: {
  entries: ActivityFeedEntry[];
  sessionDiff: HuntOverviewViewModel['sessionDiff'];
  showAll: boolean;
  focusedArtifactId: string | null;
  onToggleShowAll: () => void;
  onArtifactSelect: (artifactId: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <p style={{ color: 'var(--hunt-text-muted)', fontSize: '13px' }}>
        No recent activity.
      </p>
    );
  }

  const sessionEntryIds = sessionDiff
    ? new Set(
        sessionDiff.entries.map(
          (e) => `${e.artifactType}:${e.artifactId}:${e.diffKind}`,
        ),
      )
    : null;

  const displayEntries = showAll || !sessionEntryIds
    ? entries
    : entries.filter((e) =>
        sessionEntryIds.has(`${e.artifactType}:${e.artifactId}:${e.diffKind}`),
      );

  return (
    <div>
      <p class="hunt-section-heading">Activity</p>
      {sessionDiff && (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--hunt-text-muted)',
            margin: '0 0 8px',
          }}
        >
          {sessionDiff.summary}
        </p>
      )}
      <GhostButton
        onClick={onToggleShowAll}
        ariaLabel={showAll ? 'Show session changes only' : 'Show all activity'}
      >
        {showAll ? 'Since Last Session' : 'Show All'}
      </GhostButton>
      <div class="hunt-activity-feed" style={{ marginTop: '10px' }}>
        {displayEntries.map((entry, index) => (
          <button
            type="button"
            class={`hunt-activity-entry${
              focusedArtifactId === entry.artifactId
                ? ' hunt-activity-entry--selected'
                : ''
            }`}
            key={index}
            data-artifact-id={entry.artifactId}
            onClick={() => onArtifactSelect(entry.artifactId)}
          >
            <span class={`hunt-diff-badge hunt-diff-badge--${entry.diffKind}`}>
              {entry.diffKind}
            </span>
            <span>
              {entry.artifactType}: {entry.artifactId}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionContinuityCard({
  sessionContinuity,
}: {
  sessionContinuity: HuntOverviewViewModel['sessionContinuity'];
}) {
  if (!sessionContinuity) {
    return null;
  }

  return (
    <Panel>
      <p class="hunt-section-heading">Session Continuity</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        <div>
          <div class="hunt-qa-meta">Where You Left Off</div>
          <strong>{sessionContinuity.whereLeftOff}</strong>
        </div>
        <div>
          <div class="hunt-qa-meta">Last Activity</div>
          <strong>{sessionContinuity.lastActivity}</strong>
        </div>
        <div>
          <div class="hunt-qa-meta">Recent Changes</div>
          <strong>{sessionContinuity.recentChanges}</strong>
        </div>
        <div>
          <div class="hunt-qa-meta">Next Step</div>
          <strong>{sessionContinuity.nextStep}</strong>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function App() {
  const initialState = vscode.getState();
  const { setIsDark } = useTheme();
  const [viewModel, setViewModel] = useState<HuntOverviewViewModel | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(
    initialState?.showAllActivity ?? false
  );
  const [focusedArtifactId, setFocusedArtifactId] = useState<string | null>(
    initialState?.focusedArtifactId ?? null
  );
  const [hasRestoredScroll, setHasRestoredScroll] = useState(false);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useEffect(() => {
    const persistState = () => {
      vscode.setState({
        showAllActivity,
        scrollY: window.scrollY,
        focusedArtifactId,
      });
    };

    persistState();

    const handleScroll = () => {
      persistState();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [focusedArtifactId, showAllActivity]);

  useEffect(() => {
    if (!viewModel || hasRestoredScroll) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: initialState?.scrollY ?? 0 });
    });
    setHasRestoredScroll(true);
  }, [hasRestoredScroll, initialState?.scrollY, viewModel]);

  useEffect(() => {
    if (!focusedArtifactId) {
      return;
    }

    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-artifact-id="${focusedArtifactId}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }, [focusedArtifactId, viewModel]);

  useHostMessage<HostToHuntOverviewMessage>((message) => {
    switch (message.type) {
      case 'init':
        setViewModel(message.viewModel);
        setIsDark(message.isDark);
        break;
      case 'update':
        setViewModel(message.viewModel);
        break;
      case 'theme':
        setIsDark(message.isDark);
        break;
      case 'focus':
        setFocusedArtifactId(message.artifactId);
        break;
    }
  });

  return (
    <main
      class="hunt-surface"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px 18px',
        color: 'var(--hunt-text)',
      }}
    >
      {viewModel === null ? (
        <Panel>
          <p style={{ color: 'var(--hunt-text-muted)', margin: 0 }}>
            Connecting to extension host...
          </p>
        </Panel>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <MissionCard mission={viewModel.mission} />
          <SessionContinuityCard
            sessionContinuity={viewModel.sessionContinuity}
          />
          <PhaseRail
            phases={viewModel.phases}
            currentPhase={viewModel.currentPhase}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <VerdictCards verdicts={viewModel.verdicts} />
              <ConfidenceMeter confidence={viewModel.confidence} />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <EvidenceStats evidence={viewModel.evidence} />
              <HealthCard health={viewModel.diagnosticsHealth} />
            </div>
          </div>
          <BlockerStack blockers={viewModel.blockers} />
          <ActivityFeed
            entries={viewModel.activityFeed}
            sessionDiff={viewModel.sessionDiff}
            showAll={showAllActivity}
            focusedArtifactId={focusedArtifactId}
            onToggleShowAll={() => setShowAllActivity((value) => !value)}
            onArtifactSelect={(artifactId) => {
              setFocusedArtifactId(artifactId);
              vscode.postMessage({ type: 'artifact:select', artifactId });
            }}
          />
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
