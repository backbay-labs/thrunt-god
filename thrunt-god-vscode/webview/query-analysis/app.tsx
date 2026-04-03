import type { QueryAnalysisViewModel } from '../../shared/query-analysis';
import { Panel } from '../shared/components';

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

export function App(props: AppProps) {
  if (!props.viewModel) {
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
    </main>
  );
}
