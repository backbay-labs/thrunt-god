import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type {
  HostToQueryAnalysisMessage,
  QueryAnalysisToHostMessage,
  QueryAnalysisViewModel,
} from '../../shared/query-analysis';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import { App } from './app';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, QueryAnalysisToHostMessage>();

function Root() {
  const { isDark, setIsDark } = useTheme();
  const [viewModel, setViewModel] = useState<QueryAnalysisViewModel | null>(null);
  const [highlightedArtifactId, setHighlightedArtifactId] = useState<string | null>(null);
  const [isPulsing, setIsPulsing] = useState(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useEffect(() => {
    if (highlightedArtifactId !== null) {
      setIsPulsing(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setIsPulsing(false), 200);
    }
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [highlightedArtifactId]);

  useHostMessage<HostToQueryAnalysisMessage>((message) => {
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
      case 'selection:highlight':
        setHighlightedArtifactId(message.artifactId);
        break;
    }
  });

  return (
    <App
      viewModel={viewModel}
      isDark={isDark}
      highlightedArtifactId={highlightedArtifactId}
      isPulsing={isPulsing}
      onQuerySet={(slot, queryId) =>
        vscode.postMessage({ type: 'query:set', slot, queryId })
      }
      onSortChange={(sortBy) => vscode.postMessage({ type: 'sort:change', sortBy })}
      onModeChange={(mode) => vscode.postMessage({ type: 'mode:change', mode })}
      onReceiptSelect={(receiptId) => vscode.postMessage({ type: 'receipt:select', receiptId })}
      onInspectorOpen={(receiptId) => vscode.postMessage({ type: 'inspector:open', receiptId })}
      onInspectorClose={() => vscode.postMessage({ type: 'inspector:close' })}
      onNavigate={(target, artifactId) =>
        vscode.postMessage({ type: 'navigate', target, artifactId })
      }
      onBlur={() => vscode.postMessage({ type: 'blur' })}
    />
  );
}

const root = document.getElementById('root');
if (root) {
  render(<Root />, root);
}
