import { useMemo } from 'preact/hooks';
import type {
  QueryAnalysisViewModel,
  ComparisonData,
  ComparisonTemplate,
  HeatmapData,
  QueryAnalysisMode,
  ReceiptInspectorItem,
} from '../../shared/query-analysis';
import { Badge, GhostButton, Panel, StatCard } from '../shared/components';

interface AppProps {
  viewModel: QueryAnalysisViewModel | null;
  isDark: boolean;
  onQuerySet: (slot: 'left' | 'right', queryId: string) => void;
  onSortChange: (sortBy: 'count' | 'deviation' | 'novelty' | 'recency') => void;
  onModeChange: (mode: QueryAnalysisMode) => void;
  onReceiptSelect: (receiptId: string) => void;
  onInspectorOpen: (receiptId?: string) => void;
  onInspectorClose: () => void;
  onNavigate: (target: 'query' | 'receipt', artifactId: string) => void;
  onBlur: () => void;
}

const SORT_LABELS: Record<string, string> = {
  count: 'Count',
  deviation: 'Deviation',
  novelty: 'Novelty',
  recency: 'Recency',
};

function ModeTabs({
  mode,
  onModeChange,
}: {
  mode: QueryAnalysisMode;
  onModeChange: (mode: QueryAnalysisMode) => void;
}) {
  const tabs: Array<{ key: QueryAnalysisMode; label: string }> = [
    { key: 'comparison', label: 'Comparison' },
    { key: 'heatmap', label: 'Heatmap' },
    { key: 'inspector', label: 'Inspector' },
  ];

  return (
    <div class="hunt-qa-tabs" role="tablist" aria-label="Query Analysis modes">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={mode === tab.key}
          class={`hunt-qa-tabs__btn${mode === tab.key ? ' hunt-qa-tabs__btn--active' : ''}`}
          onClick={() => onModeChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

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
            title={sort.tooltip}
            onClick={() => onSortChange(sort.key as AppProps['viewModel'] extends never ? never : 'count' | 'deviation' | 'novelty' | 'recency')}
          >
            {SORT_LABELS[sort.key] ?? sort.key}
          </button>
        );
      })}
    </div>
  );
}

function QueryPairSelectors({
  viewModel,
  onQuerySet,
}: {
  viewModel: QueryAnalysisViewModel;
  onQuerySet: (slot: 'left' | 'right', queryId: string) => void;
}) {
  const leftQueryId = viewModel.selectedQueryIds[0] ?? '';
  const rightQueryId = viewModel.selectedQueryIds[1] ?? '';

  return (
    <div class="hunt-qa-selector">
      <label class="hunt-qa-field">
        <span class="hunt-qa-field__label">Query A</span>
        <select
          value={leftQueryId}
          onChange={(event) =>
            onQuerySet('left', (event.target as HTMLSelectElement).value)
          }
        >
          {viewModel.queries.map((query) => (
            <option key={query.queryId} value={query.queryId}>
              {query.title} ({query.eventCount} events)
            </option>
          ))}
        </select>
      </label>
      <label class="hunt-qa-field">
        <span class="hunt-qa-field__label">Query B</span>
        <select
          value={rightQueryId}
          onChange={(event) =>
            onQuerySet('right', (event.target as HTMLSelectElement).value)
          }
        >
          {viewModel.queries.map((query) => (
            <option key={query.queryId} value={query.queryId}>
              {query.title} ({query.eventCount} events)
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ComparisonView({ data }: { data: ComparisonData }) {
  const maxEventCount = Math.max(data.queryA.eventCount, data.queryB.eventCount, 1);
  const sharedCount = data.templates.filter((template) => template.presence === 'both').length;
  const aOnlyCount = data.templates.filter((template) => template.presence === 'a-only').length;
  const bOnlyCount = data.templates.filter((template) => template.presence === 'b-only').length;

  return (
    <div class="hunt-qa-stack">
      <div class="hunt-qa-comparison-grid">
        <div class="hunt-qa-comparison-header">
          <div>{data.queryA.title}</div>
          <div class="hunt-qa-meta">{data.queryA.eventCount} events</div>
        </div>
        <div class="hunt-qa-comparison-header">
          <div>{data.queryB.title}</div>
          <div class="hunt-qa-meta">{data.queryB.eventCount} events</div>
        </div>

        {data.templates.map((template: ComparisonTemplate) => (
          <div class="hunt-qa-comparison-row" key={template.templateId}>
            <div class="hunt-qa-comparison-label" title={template.template}>
              {template.templateId} · {template.template}
            </div>
            <div
              class={`hunt-qa-comparison-cell${template.presence === 'a-only' ? ' hunt-qa-comparison-cell--a-only' : ''}`}
            >
              {template.countA > 0 ? (
                <>
                  <span class="hunt-qa-value">{template.countA}</span>
                  <div
                    class="hunt-qa-count-bar"
                    style={{ width: `${(template.countA / maxEventCount) * 100}%` }}
                  />
                  <span class="hunt-qa-meta">{template.percentageA.toFixed(1)}%</span>
                </>
              ) : (
                <span class="hunt-qa-meta">Absent</span>
              )}
            </div>
            <div
              class={`hunt-qa-comparison-cell${template.presence === 'b-only' ? ' hunt-qa-comparison-cell--b-only' : ''}`}
            >
              {template.countB > 0 ? (
                <>
                  <span class="hunt-qa-value">{template.countB}</span>
                  <div
                    class="hunt-qa-count-bar"
                    style={{ width: `${(template.countB / maxEventCount) * 100}%` }}
                  />
                  <span class="hunt-qa-meta">{template.percentageB.toFixed(1)}%</span>
                </>
              ) : (
                <span class="hunt-qa-meta">Absent</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div class="hunt-qa-summary-grid">
        <StatCard label="Shared" value={String(sharedCount)} />
        <StatCard label="A-only" value={String(aOnlyCount)} />
        <StatCard label="B-only" value={String(bOnlyCount)} />
      </div>
    </div>
  );
}

function HeatmapView({ data }: { data: HeatmapData }) {
  const maxCount = useMemo(() => {
    let max = 1;
    for (const row of data.rows) {
      for (const cell of row.cells) {
        if (cell.count > max) {
          max = cell.count;
        }
      }
    }
    return max;
  }, [data.rows]);

  return (
    <div class="hunt-qa-stack">
      <div class="hunt-qa-heatmap-meta">
        Comparing {data.queryIds.length} queries across {data.rows.length} templates.
      </div>
      <table class="hunt-qa-heatmap">
        <thead>
          <tr>
            <th class="hunt-qa-heatmap-row-label">Template</th>
            {data.queryTitles.map((title, index) => (
              <th key={data.queryIds[index]} title={title}>
                {title.length > 18 ? `${title.slice(0, 18)}...` : title}
              </th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.templateId}>
              <td class="hunt-qa-heatmap-row-label" title={row.template}>
                {row.templateId} ·{' '}
                {row.template.length > 52 ? `${row.template.slice(0, 52)}...` : row.template}
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
                      {isZero ? '--' : cell.count}
                    </div>
                  </td>
                );
              })}
              <td>
                <div class="hunt-qa-heatmap-cell hunt-qa-heatmap-cell--total">
                  {row.totalCount}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptList({
  receipts,
  selectedReceiptId,
  onReceiptSelect,
}: {
  receipts: ReceiptInspectorItem[];
  selectedReceiptId: string | null;
  onReceiptSelect: (receiptId: string) => void;
}) {
  return (
    <div class="hunt-qa-inspector__list" role="list" aria-label="Receipts">
      {receipts.map((receipt) => {
        const isSelected = receipt.receiptId === selectedReceiptId;
        return (
          <button
            key={receipt.receiptId}
            type="button"
            role="listitem"
            class={`hunt-qa-receipt-row${isSelected ? ' hunt-qa-receipt-row--active' : ''}`}
            onClick={() => onReceiptSelect(receipt.receiptId)}
          >
            <div class="hunt-qa-receipt-row__top">
              <span class="hunt-qa-receipt-row__id">{receipt.receiptId}</span>
              <Badge variant={receipt.diagnosticCounts.errors > 0 ? 'danger' : receipt.diagnosticCounts.warnings > 0 ? 'warning' : 'neutral'}>
                {receipt.deviationScore ?? 'No score'}
              </Badge>
            </div>
            <div class="hunt-qa-meta">{receipt.claimStatus} · {receipt.confidence}</div>
            <div class="hunt-qa-receipt-row__claim">
              {receipt.claim.length > 92 ? `${receipt.claim.slice(0, 92)}...` : receipt.claim}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DiagnosticsSummary({ receipt }: { receipt: ReceiptInspectorItem }) {
  const flagged = receipt.diagnostics.filter((check) => check.status === 'flagged');
  return (
    <Panel>
      <p class="hunt-section-heading">Diagnostics</p>
      {flagged.length === 0 ? (
        <p class="hunt-qa-meta" style={{ margin: 0 }}>
          No receipt QA issues detected.
        </p>
      ) : (
        <div class="hunt-qa-diagnostics">
          {flagged.map((check) => (
            <div class={`hunt-qa-diagnostic hunt-qa-diagnostic--${check.severity}`} key={check.id}>
              <strong>{check.label}</strong>
              <span>{check.message}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ReceiptInspectorDetail({
  receipt,
  onNavigate,
}: {
  receipt: ReceiptInspectorItem | null;
  onNavigate: (target: 'query' | 'receipt', artifactId: string) => void;
}) {
  if (!receipt) {
    return (
      <Panel>
        <p class="hunt-qa-meta" style={{ margin: 0 }}>
          Select a receipt to inspect its anomaly framing.
        </p>
      </Panel>
    );
  }

  const modifierTotal = receipt.modifiers.reduce(
    (sum, modifier) => sum + modifier.contribution,
    0
  );
  const expectedTotal =
    receipt.baseScore === null ? null : receipt.baseScore + modifierTotal;
  const hasScoreMismatch =
    receipt.deviationScore !== null &&
    expectedTotal !== null &&
    receipt.deviationScore !== expectedTotal;

  return (
    <div class="hunt-qa-stack">
      <Panel>
        <div class="hunt-qa-inspector__header">
          <div>
            <p class="hunt-section-heading">Receipt</p>
            <h2 class="hunt-qa-inspector__title">{receipt.receiptId}</h2>
            <p class="hunt-qa-meta">{receipt.claimStatus} · {receipt.confidence}</p>
          </div>
          <GhostButton onClick={() => onNavigate('receipt', receipt.receiptId)}>
            Open Receipt
          </GhostButton>
        </div>
        <p class="hunt-qa-inspector__claim">{receipt.claim}</p>
      </Panel>

      {receipt.hasAnomalyFrame ? (
        <>
          <div class="hunt-qa-summary-grid">
            <StatCard label="Deviation" value={String(receipt.deviationScore ?? '0')} />
            <StatCard label="Base Score" value={String(receipt.baseScore ?? '0')} />
            <StatCard label="Modifiers" value={String(receipt.modifiers.length)} />
          </div>

          <Panel>
            <p class="hunt-section-heading">Score Breakdown</p>
            <div class="hunt-qa-score-card">
              <div class="hunt-qa-score-card__value">{receipt.deviationScore ?? 0}</div>
              <div>
                <div class="hunt-qa-meta">Category</div>
                <strong>{receipt.deviationCategory ?? 'Unscored'}</strong>
              </div>
            </div>
            {hasScoreMismatch ? (
              <div class="hunt-qa-warning-banner">
                Expected total {expectedTotal}, but receipt reports {receipt.deviationScore}.
              </div>
            ) : null}
            <table class="hunt-qa-score-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Value</th>
                  <th>Contribution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Base</td>
                  <td>{receipt.deviationCategory ?? 'N/A'}</td>
                  <td>{receipt.baseScore ?? 0}</td>
                </tr>
                {receipt.modifiers.map((modifier) => (
                  <tr key={`${modifier.factor}:${modifier.value}`}>
                    <td>{modifier.factor}</td>
                    <td>{modifier.value}</td>
                    <td>{modifier.contribution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div class="hunt-qa-detail-grid">
            <Panel>
              <p class="hunt-section-heading">Prediction</p>
              <div class="hunt-qa-copy-block">
                {receipt.prediction ?? 'No prediction documented.'}
              </div>
            </Panel>
            <Panel>
              <p class="hunt-section-heading">Observation</p>
              <div class="hunt-qa-copy-block">
                {receipt.observation ?? 'No observation documented.'}
              </div>
            </Panel>
          </div>

          <Panel>
            <p class="hunt-section-heading">Baseline</p>
            <div class="hunt-qa-copy-block">
              {receipt.baseline ??
                'No baseline documented. Deviation score is being evaluated without a stated reference point.'}
            </div>
          </Panel>
        </>
      ) : (
        <Panel>
          <p class="hunt-section-heading">Anomaly Framing</p>
          <p class="hunt-qa-meta" style={{ margin: 0 }}>
            This receipt has no anomaly framing section. Open the receipt artifact to add
            baseline, prediction, and deviation scoring.
          </p>
        </Panel>
      )}

      <DiagnosticsSummary receipt={receipt} />

      <Panel>
        <p class="hunt-section-heading">Linked Evidence</p>
        <div class="hunt-qa-linked-evidence">
          <div>
            <strong>Hypotheses</strong>
            <div class="hunt-qa-chip-row">
              {receipt.relatedHypotheses.length > 0 ? (
                receipt.relatedHypotheses.map((hypothesisId) => (
                  <Badge key={hypothesisId} variant="neutral">
                    {hypothesisId}
                  </Badge>
                ))
              ) : (
                <span class="hunt-qa-meta">None linked</span>
              )}
            </div>
          </div>
          <div>
            <strong>Queries</strong>
            <div class="hunt-qa-chip-row">
              {receipt.relatedQueries.length > 0 ? (
                receipt.relatedQueries.map((queryId) => (
                  <button
                    key={queryId}
                    type="button"
                    class="hunt-qa-link-btn"
                    onClick={() => onNavigate('query', queryId)}
                  >
                    {queryId}
                  </button>
                ))
              ) : (
                <span class="hunt-qa-meta">None linked</span>
              )}
            </div>
          </div>
          {receipt.attackMapping.length > 0 ? (
            <div>
              <strong>ATT&amp;CK</strong>
              <div class="hunt-qa-chip-row">
                {receipt.attackMapping.map((technique) => (
                  <Badge key={technique} variant="accent">
                    {technique}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function ReceiptInspectorView({
  viewModel,
  onReceiptSelect,
  onNavigate,
}: {
  viewModel: QueryAnalysisViewModel;
  onReceiptSelect: (receiptId: string) => void;
  onNavigate: (target: 'query' | 'receipt', artifactId: string) => void;
}) {
  const inspector = viewModel.receiptInspector;
  if (!inspector || inspector.receipts.length === 0) {
    return (
      <Panel>
        <p class="hunt-qa-meta" style={{ margin: 0 }}>
          No receipts are available for QA inspection in this hunt.
        </p>
      </Panel>
    );
  }

  const selectedReceipt =
    inspector.receipts.find((receipt) => receipt.receiptId === inspector.selectedReceiptId) ??
    inspector.receipts[0] ??
    null;

  return (
    <div class="hunt-qa-inspector">
      <ReceiptList
        receipts={inspector.receipts}
        selectedReceiptId={selectedReceipt?.receiptId ?? null}
        onReceiptSelect={onReceiptSelect}
      />
      <ReceiptInspectorDetail receipt={selectedReceipt} onNavigate={onNavigate} />
    </div>
  );
}

function LoadingState() {
  return (
    <main class="hunt-surface" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 18px' }}>
      <Panel>
        <p style={{ color: 'var(--hunt-text-muted)', margin: 0 }}>Waiting for data...</p>
      </Panel>
    </main>
  );
}

export function App(props: AppProps) {
  const { viewModel } = props;

  if (!viewModel) {
    return <LoadingState />;
  }

  return (
    <main class="hunt-surface" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 18px' }}>
      <div class="hunt-qa-stack">
        <Panel>
          <div class="hunt-qa-header">
            <div>
              <p class="hunt-qa-eyebrow">Query Analysis</p>
              <h1 class="hunt-qa-title">
                {viewModel.mode === 'comparison'
                  ? 'Template Comparison'
                  : viewModel.mode === 'heatmap'
                    ? 'Presence Heatmap'
                    : 'Receipt QA Inspector'}
              </h1>
              <p class="hunt-qa-meta">
                Compare query structure, inspect template distribution, and audit receipt scoring.
              </p>
            </div>
            <GhostButton onClick={props.onBlur}>Back to Editor</GhostButton>
          </div>
        </Panel>

        <ModeTabs mode={viewModel.mode} onModeChange={props.onModeChange} />

        {viewModel.mode !== 'inspector' ? (
          <>
            <SortControls viewModel={viewModel} onSortChange={props.onSortChange} />
            {viewModel.mode === 'comparison' ? (
              <>
                <QueryPairSelectors viewModel={viewModel} onQuerySet={props.onQuerySet} />
                {viewModel.comparison ? (
                  <ComparisonView data={viewModel.comparison} />
                ) : (
                  <Panel>
                    <p class="hunt-qa-meta" style={{ margin: 0 }}>
                      Select two queries with template data to compare their distributions.
                    </p>
                  </Panel>
                )}
              </>
            ) : viewModel.heatmap ? (
              <HeatmapView data={viewModel.heatmap} />
            ) : (
              <Panel>
                <p class="hunt-qa-meta" style={{ margin: 0 }}>
                  At least three queries with template data are needed for the heatmap view.
                </p>
              </Panel>
            )}
            <div>
              <GhostButton onClick={() => props.onInspectorOpen()}>
                Open Receipt QA Inspector
              </GhostButton>
            </div>
          </>
        ) : (
          <ReceiptInspectorView
            viewModel={viewModel}
            onReceiptSelect={props.onReceiptSelect}
            onNavigate={props.onNavigate}
          />
        )}
      </div>
    </main>
  );
}
