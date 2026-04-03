import { useMemo } from 'preact/hooks';
import type {
  QueryAnalysisViewModel,
  ComparisonData,
  ComparisonTemplate,
  HeatmapData,
} from '../../shared/query-analysis';
import { Panel, GhostButton } from '../shared/components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppProps {
  viewModel: QueryAnalysisViewModel | null;
  isDark: boolean;
  onQuerySelect: (queryId: string) => void;
  onSortChange: (sortBy: 'count' | 'deviation' | 'novelty' | 'recency') => void;
  onModeChange: (mode: 'side-by-side' | 'matrix') => void;
  onReceiptSelect: (receiptId: string) => void;
  onInspectorOpen: (receiptId?: string) => void;
  onInspectorClose: () => void;
  onBlur: () => void;
}

// ---------------------------------------------------------------------------
// QuerySelector
// ---------------------------------------------------------------------------

function QuerySelector({
  viewModel,
  onQuerySelect,
  onModeChange,
}: {
  viewModel: QueryAnalysisViewModel;
  onQuerySelect: (queryId: string) => void;
  onModeChange: (mode: 'side-by-side' | 'matrix') => void;
}) {
  const selectedA = viewModel.selectedQueryIds[0] ?? '';
  const selectedB = viewModel.selectedQueryIds[1] ?? '';

  return (
    <div class="hunt-qa-selector">
      <select
        value={selectedA}
        onChange={(e) => onQuerySelect((e.target as HTMLSelectElement).value)}
        aria-label="Query A"
      >
        {viewModel.queries.map((q) => (
          <option key={q.queryId} value={q.queryId}>
            {q.title} ({q.eventCount} events)
          </option>
        ))}
      </select>

      <span style={{ color: 'var(--hunt-text-muted)', fontSize: '12px' }}>vs</span>

      <select
        value={selectedB}
        onChange={(e) => onQuerySelect((e.target as HTMLSelectElement).value)}
        aria-label="Query B"
      >
        {viewModel.queries.map((q) => (
          <option key={q.queryId} value={q.queryId}>
            {q.title} ({q.eventCount} events)
          </option>
        ))}
      </select>

      {viewModel.queries.length >= 3 && (
        <div class="hunt-qa-mode-toggle">
          <button
            type="button"
            class={viewModel.comparisonMode === 'side-by-side' ? 'active' : ''}
            onClick={() => onModeChange('side-by-side')}
          >
            Side-by-side
          </button>
          <button
            type="button"
            class={viewModel.comparisonMode === 'matrix' ? 'active' : ''}
            onClick={() => onModeChange('matrix')}
          >
            Matrix
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortControls
// ---------------------------------------------------------------------------

const SORT_LABELS: Record<string, string> = {
  count: 'Count',
  deviation: 'Deviation',
  novelty: 'Novelty',
  recency: 'Recency',
};

function SortControls({
  viewModel,
  onSortChange,
}: {
  viewModel: QueryAnalysisViewModel;
  onSortChange: (sortBy: 'count' | 'deviation' | 'novelty' | 'recency') => void;
}) {
  return (
    <div class="hunt-qa-sort-pills" role="radiogroup" aria-label="Sort templates by">
      {viewModel.availableSorts.map((sort) => {
        const isActive = viewModel.sortBy === sort.key;
        let className = 'hunt-qa-sort-pill';
        if (isActive) className += ' hunt-qa-sort-pill--active';
        if (!sort.available) className += ' hunt-qa-sort-pill--disabled';

        return (
          <button
            key={sort.key}
            type="button"
            class={className}
            role="radio"
            aria-checked={isActive}
            disabled={!sort.available}
            title={!sort.available ? sort.tooltip : undefined}
            onClick={() => onSortChange(sort.key as 'count' | 'deviation' | 'novelty' | 'recency')}
          >
            {SORT_LABELS[sort.key] ?? sort.key}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ComparisonView
// ---------------------------------------------------------------------------

function ComparisonView({ data }: { data: ComparisonData }) {
  const maxEventCount = Math.max(data.queryA.eventCount, data.queryB.eventCount, 1);

  return (
    <div class="hunt-qa-comparison-grid">
      {/* Column headers */}
      <div class="hunt-qa-comparison-header">
        <div>{data.queryA.title}</div>
        <div style={{ fontSize: '11px', color: 'var(--hunt-text-muted)', marginTop: '2px' }}>
          {data.queryA.eventCount} events
        </div>
      </div>
      <div class="hunt-qa-comparison-header">
        <div>{data.queryB.title}</div>
        <div style={{ fontSize: '11px', color: 'var(--hunt-text-muted)', marginTop: '2px' }}>
          {data.queryB.eventCount} events
        </div>
      </div>

      {/* Template rows */}
      {data.templates.map((tpl: ComparisonTemplate) => (
        <div class="hunt-qa-comparison-row" key={tpl.templateId}>
          {/* Template label spanning both columns */}
          <div class="hunt-qa-comparison-label" title={tpl.template}>
            {tpl.template}
          </div>

          {/* Cell A */}
          <div
            class={`hunt-qa-comparison-cell${tpl.presence === 'a-only' ? ' hunt-qa-comparison-cell--a-only' : ''}`}
          >
            {tpl.countA > 0 ? (
              <>
                <span style={{ minWidth: '36px', fontVariantNumeric: 'tabular-nums' }}>
                  {tpl.countA}
                </span>
                <div
                  class="hunt-qa-count-bar"
                  style={{ width: `${(tpl.countA / maxEventCount) * 100}%` }}
                />
                <span style={{ fontSize: '11px', color: 'var(--hunt-text-muted)' }}>
                  {tpl.percentageA.toFixed(1)}%
                </span>
              </>
            ) : null}
          </div>

          {/* Cell B */}
          <div
            class={`hunt-qa-comparison-cell${tpl.presence === 'b-only' ? ' hunt-qa-comparison-cell--b-only' : ''}`}
          >
            {tpl.countB > 0 ? (
              <>
                <span style={{ minWidth: '36px', fontVariantNumeric: 'tabular-nums' }}>
                  {tpl.countB}
                </span>
                <div
                  class="hunt-qa-count-bar"
                  style={{ width: `${(tpl.countB / maxEventCount) * 100}%` }}
                />
                <span style={{ fontSize: '11px', color: 'var(--hunt-text-muted)' }}>
                  {tpl.percentageB.toFixed(1)}%
                </span>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeatmapView
// ---------------------------------------------------------------------------

function HeatmapView({ data }: { data: HeatmapData }) {
  const maxCount = useMemo(() => {
    let max = 1;
    for (const row of data.rows) {
      for (const cell of row.cells) {
        if (cell.count > max) max = cell.count;
      }
    }
    return max;
  }, [data.rows]);

  return (
    <table class="hunt-qa-heatmap">
      <thead>
        <tr>
          <th class="hunt-qa-heatmap-row-label">Template</th>
          {data.queryTitles.map((title, i) => (
            <th key={data.queryIds[i]} title={title}>
              {title.length > 18 ? title.slice(0, 18) + '...' : title}
            </th>
          ))}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr key={row.templateId}>
            <td class="hunt-qa-heatmap-row-label" title={row.template}>
              {row.template.length > 60 ? row.template.slice(0, 60) + '...' : row.template}
            </td>
            {row.cells.map((cell) => {
              const isZero = cell.count === 0;
              const opacity = isZero ? 0 : 0.15 + (cell.count / maxCount) * 0.85;

              return (
                <td key={cell.queryId}>
                  <div
                    class={`hunt-qa-heatmap-cell${isZero ? ' hunt-qa-heatmap-cell--zero' : ''}`}
                    style={
                      !isZero
                        ? { background: 'var(--hunt-accent-strong)', opacity }
                        : undefined
                    }
                  >
                    {cell.count}
                  </div>
                </td>
              );
            })}
            <td>
              <div class="hunt-qa-heatmap-cell" style={{ fontWeight: 600 }}>
                {row.totalCount}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// App (main export)
// ---------------------------------------------------------------------------

export function App(props: AppProps) {
  const { viewModel } = props;

  if (!viewModel) {
    return (
      <main class="hunt-surface" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 18px' }}>
        <Panel>
          <p style={{ color: 'var(--hunt-text-muted)', margin: 0 }}>Waiting for data...</p>
        </Panel>
      </main>
    );
  }

  return (
    <main class="hunt-surface" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 18px' }}>
      <Panel>
        <p class="hunt-qa-eyebrow">Query Analysis</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 2.5vw, 2.4rem)', lineHeight: 1.1 }}>
          Template Comparison
        </h1>
      </Panel>

      <QuerySelector
        viewModel={viewModel}
        onQuerySelect={props.onQuerySelect}
        onModeChange={props.onModeChange}
      />

      <SortControls viewModel={viewModel} onSortChange={props.onSortChange} />

      {viewModel.comparison && <ComparisonView data={viewModel.comparison} />}

      {viewModel.heatmap && <HeatmapView data={viewModel.heatmap} />}

      <div style={{ marginTop: '24px' }}>
        <GhostButton onClick={() => props.onInspectorOpen()}>
          Open Receipt QA Inspector
        </GhostButton>
      </div>
    </main>
  );
}
