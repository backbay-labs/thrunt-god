import { useMemo } from 'preact/hooks';
import type {
  QueryAnalysisViewModel,
  ComparisonData,
  ComparisonTemplate,
  HeatmapData,
  ReceiptInspectorData,
  ReceiptInspectorItem,
} from '../../shared/query-analysis';
import { Panel, GhostButton } from '../shared/components';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score <= 1) return 'low';
  if (score <= 3) return 'medium';
  return 'high';
}

function scoreLevelLabel(score: number): string {
  if (score <= 1) return 'Low';
  if (score <= 3) return 'Medium';
  return 'High';
}

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
// ReceiptDetail
// ---------------------------------------------------------------------------

function ReceiptDetail(props: { receipt: ReceiptInspectorItem }) {
  const r = props.receipt;

  return (
    <div class="hunt-qa-receipt-detail">
      {/* Header */}
      <div class="hunt-qa-receipt-detail__header">
        <h3>{r.receiptId}</h3>
        <span class={`hunt-qa-verdict-badge hunt-qa-verdict-badge--${r.claimStatus}`}>
          {r.claimStatus}
        </span>
        <span class="hunt-qa-receipt-detail__confidence">
          Confidence: {r.confidence}
        </span>
      </div>

      {/* Claim */}
      <div class="hunt-qa-receipt-detail__claim">
        <span class="hunt-qa-label">Claim</span>
        <p>{r.claim}</p>
      </div>

      {/* Anomaly Framing Section */}
      {r.hasAnomalyFrame ? (
        <>
          {/* Score Card -- large 0-6 number + color badge + category */}
          <div class="hunt-qa-score-card">
            <div class="hunt-qa-score-card__value">
              <span class={`hunt-qa-score-number hunt-qa-score-number--${scoreColor(r.deviationScore ?? 0)}`}>
                {r.deviationScore !== null ? r.deviationScore.toFixed(1) : '?'}
              </span>
              <span class={`hunt-qa-score-badge hunt-qa-score-badge--${scoreColor(r.deviationScore ?? 0)}`}>
                {scoreLevelLabel(r.deviationScore ?? 0)}
              </span>
            </div>
            <span class="hunt-qa-score-card__category">
              {r.deviationCategory ?? 'Unknown'}
            </span>
          </div>

          {/* Factor Table -- category, base score, modifier contributions */}
          <div class="hunt-qa-factor-table-wrapper">
            <span class="hunt-qa-label">Score Breakdown</span>
            <table class="hunt-qa-factor-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Value</th>
                  <th>Contribution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Base score ({r.deviationCategory ?? '?'})</td>
                  <td>--</td>
                  <td class="hunt-qa-factor-table__num">
                    {r.baseScore !== null ? r.baseScore.toFixed(1) : '?'}
                  </td>
                </tr>
                {r.modifiers.map((mod) => (
                  <tr key={mod.factor}>
                    <td>{mod.factor}</td>
                    <td>{mod.value}</td>
                    <td class="hunt-qa-factor-table__num">
                      {mod.contribution >= 0 ? '+' : ''}{mod.contribution.toFixed(1)}
                    </td>
                  </tr>
                ))}
                <tr class="hunt-qa-factor-table__total">
                  <td colSpan={2}>Total</td>
                  <td class="hunt-qa-factor-table__num">
                    {r.deviationScore !== null ? r.deviationScore.toFixed(1) : '?'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Baseline / Prediction / Observation */}
          <div class="hunt-qa-framing-section">
            <div class="hunt-qa-framing-block">
              <span class="hunt-qa-label">Baseline</span>
              <p>{r.baseline ?? 'Not available'}</p>
            </div>
            <div class="hunt-qa-framing-block">
              <span class="hunt-qa-label">Prediction</span>
              <p>{r.prediction ?? 'Not available'}</p>
            </div>
            <div class="hunt-qa-framing-block">
              <span class="hunt-qa-label">Observation</span>
              <p>{r.observation ?? 'Not available'}</p>
            </div>
          </div>

          {/* ATT&CK Mapping */}
          {r.attackMapping.length > 0 && (
            <div class="hunt-qa-attack-mapping">
              <span class="hunt-qa-label">ATT&CK Techniques</span>
              <div class="hunt-qa-attack-tags">
                {r.attackMapping.map((technique) => (
                  <span key={technique} class="hunt-qa-attack-tag">{technique}</span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div class="hunt-qa-no-framing">
          <p>No anomaly framing available for this receipt.</p>
          <p class="hunt-qa-text-muted">
            Anomaly framing is generated when the receipt includes a Deviation Score section.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptInspectorView
// ---------------------------------------------------------------------------

function ReceiptInspectorView(props: {
  data: ReceiptInspectorData;
  onReceiptSelect: (receiptId: string) => void;
  onClose: () => void;
}) {
  const selected = props.data.receipts.find(
    (r) => r.receiptId === props.data.selectedReceiptId
  ) ?? props.data.receipts[0] ?? null;

  return (
    <section class="hunt-qa-inspector">
      <div class="hunt-qa-inspector-header">
        <h2>Receipt QA Inspector</h2>
        <button class="hunt-ghost-button" onClick={props.onClose} type="button">
          Close Inspector
        </button>
      </div>
      <div class="hunt-qa-inspector-split">
        {/* Left: receipt list */}
        <div class="hunt-qa-inspector-list" role="list" aria-label="Receipts">
          {props.data.receipts.map((receipt) => (
            <button
              key={receipt.receiptId}
              class={`hunt-qa-inspector-item ${
                receipt.receiptId === (selected?.receiptId ?? '') ? 'hunt-qa-inspector-item--selected' : ''
              }`}
              role="listitem"
              onClick={() => props.onReceiptSelect(receipt.receiptId)}
              type="button"
            >
              <span class="hunt-qa-inspector-item__id">{receipt.receiptId}</span>
              <span class={`hunt-qa-verdict-badge hunt-qa-verdict-badge--${receipt.claimStatus}`}>
                {receipt.claimStatus}
              </span>
              {receipt.hasAnomalyFrame && receipt.deviationScore !== null && (
                <span class="hunt-qa-inspector-item__score">
                  {receipt.deviationScore.toFixed(1)}
                </span>
              )}
              <span class="hunt-qa-inspector-item__claim">
                {receipt.claim.length > 60 ? receipt.claim.slice(0, 60) + '...' : receipt.claim}
              </span>
            </button>
          ))}
          {props.data.receipts.length === 0 && (
            <p class="hunt-qa-inspector-empty">No receipts available.</p>
          )}
        </div>

        {/* Right: detail panel */}
        <div class="hunt-qa-inspector-detail">
          {selected ? (
            <ReceiptDetail receipt={selected} />
          ) : (
            <p class="hunt-qa-inspector-empty">Select a receipt to inspect.</p>
          )}
        </div>
      </div>
    </section>
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

      {viewModel.receiptInspector ? (
        <ReceiptInspectorView
          data={viewModel.receiptInspector}
          onReceiptSelect={props.onReceiptSelect}
          onClose={props.onInspectorClose}
        />
      ) : (
        <>
          {viewModel.comparison && <ComparisonView data={viewModel.comparison} />}

          {viewModel.heatmap && <HeatmapView data={viewModel.heatmap} />}

          <div style={{ marginTop: '24px' }}>
            <GhostButton onClick={() => props.onInspectorOpen()}>
              Open Receipt QA Inspector
            </GhostButton>
          </div>
        </>
      )}
    </main>
  );
}
