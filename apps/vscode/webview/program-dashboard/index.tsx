import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  HostToProgramDashboardMessage,
  ProgramDashboardToHostMessage,
  ProgramDashboardViewModel,
  CaseCard as CaseCardType,
} from '../../shared/program-dashboard';
import { Badge, GhostButton } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, ProgramDashboardToHostMessage>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(status: CaseCardType['status']): 'success' | 'default' | 'warning' {
  switch (status) {
    case 'active':
      return 'success';
    case 'closed':
      return 'default';
    case 'stale':
      return 'warning';
  }
}

function statusLabel(status: CaseCardType['status']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'closed':
      return 'Closed';
    case 'stale':
      return 'Stale';
  }
}

function formatDate(raw: string): string {
  if (!raw) return '\u2014';
  // Accept ISO dates or date strings; show compact form
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatStrip({ aggregates }: { aggregates: ProgramDashboardViewModel['aggregates'] }) {
  return (
    <div class="pd-stats">
      <article class="pd-stat">
        <span class="pd-stat__value">{aggregates.total}</span>
        <span class="pd-stat__label">Total Cases</span>
      </article>
      <article class="pd-stat pd-stat--active">
        <span class="pd-stat__value">{aggregates.active}</span>
        <span class="pd-stat__label">Active</span>
      </article>
      <article class="pd-stat pd-stat--closed">
        <span class="pd-stat__value">{aggregates.closed}</span>
        <span class="pd-stat__label">Closed</span>
      </article>
      <article class="pd-stat pd-stat--stale">
        <span class="pd-stat__value">{aggregates.stale}</span>
        <span class="pd-stat__label">Stale</span>
      </article>
      <article class="pd-stat pd-stat--techniques">
        <span class="pd-stat__value">{aggregates.uniqueTechniques}</span>
        <span class="pd-stat__label">Techniques</span>
      </article>
    </div>
  );
}

function PhaseProgress({ card }: { card: CaseCardType }) {
  if (card.totalPhases <= 0) return null;

  const pct = Math.min(100, Math.round((card.currentPhase / card.totalPhases) * 100));

  return (
    <div class="pd-phase-bar-wrap">
      <div class="pd-phase-label">
        <span class="pd-phase-label__name">
          {card.phaseName || `Phase ${card.currentPhase}`}
        </span>
        <span class="pd-phase-label__frac">
          {card.currentPhase}/{card.totalPhases}
        </span>
      </div>
      <div class="pd-phase-track">
        <div class="pd-phase-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CaseCard({ card }: { card: CaseCardType }) {
  return (
    <article class={`pd-case pd-case--${card.status}`}>
      <div class="pd-case__head">
        <span class="pd-case__name">{card.name}</span>
        <Badge variant={statusVariant(card.status)}>{statusLabel(card.status)}</Badge>
      </div>

      <div class="pd-case__signal">{card.signal}</div>

      <PhaseProgress card={card} />

      <div class="pd-case__metrics">
        <span>
          <span class="pd-metric__label">Opened</span>
          <span class="pd-metric__value">{formatDate(card.openedAt)}</span>
        </span>
        <span>
          <span class="pd-metric__label">Techniques</span>
          <span class="pd-metric__value">{card.techniqueCount}</span>
        </span>
        <span>
          <span class="pd-metric__label">Last Activity</span>
          <span class="pd-metric__value">{formatDate(card.lastActivity)}</span>
        </span>
      </div>

      <div class="pd-case__foot">
        <span class="pd-case__kind">
          {card.kind}
          {card.findingsPublished && (
            <span class="pd-findings-chip" style={{ marginLeft: '8px' }}>
              Published
            </span>
          )}
        </span>
        <GhostButton
          onClick={() => vscode.postMessage({ type: 'case:open', slug: card.slug })}
          ariaLabel={`Open case ${card.name}`}
        >
          Open Case
        </GhostButton>
      </div>
    </article>
  );
}

function TimelineSection({ timeline }: { timeline: ProgramDashboardViewModel['timeline'] }) {
  if (timeline.length === 0) return null;

  return (
    <div>
      <p class="pd-section-label">Timeline</p>
      <div class="pd-timeline">
        {timeline.map((entry, i) => (
          <div key={i} class="pd-timeline__entry">
            <div class="pd-timeline__dot" />
            <div class="pd-timeline__date">{formatDate(entry.date)}</div>
            <div class="pd-timeline__event">{entry.event}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div class="pd-empty">
      <p class="pd-empty__heading">No cases yet</p>
      <p class="pd-empty__sub">
        Create your first case to begin tracking hunt activity across your program.
      </p>
      <code class="pd-empty__cmd">thrunt case new &lt;name&gt;</code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function ProgramDashboard() {
  const { setIsDark } = useTheme();
  const [viewModel, setViewModel] = useState<ProgramDashboardViewModel | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToProgramDashboardMessage>((message) => {
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
    }
  });

  if (viewModel === null) {
    return (
      <main class="pd-root">
        <div class="pd-connecting">
          <span class="pd-connecting__dot" />
          Connecting to extension host&hellip;
        </div>
      </main>
    );
  }

  return (
    <main class="pd-root">
      {/* Header */}
      <header class="pd-header">
        <p class="pd-eyebrow">Hunt Program</p>
        <h1 class="pd-title">{viewModel.programName}</h1>
        {viewModel.missionSnippet && (
          <p class="pd-mission">{viewModel.missionSnippet}</p>
        )}
      </header>

      {/* Stats strip */}
      <StatStrip aggregates={viewModel.aggregates} />

      {/* Cases */}
      <p class="pd-section-label">Cases</p>
      {viewModel.cases.length === 0 ? (
        <EmptyState />
      ) : (
        <div class="pd-cases-grid">
          {viewModel.cases.map((card) => (
            <CaseCard key={card.slug} card={card} />
          ))}
        </div>
      )}

      {/* Timeline */}
      <TimelineSection timeline={viewModel.timeline} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('root');
if (root) {
  render(<ProgramDashboard />, root);
}
