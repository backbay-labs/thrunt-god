import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type {
  HostToQueryAnalysisMessage,
  QueryAnalysisToHostMessage,
  QueryAnalysisViewModel,
} from '../../shared/query-analysis';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import { App } from './app';
import '../shared/tokens.css';

interface PersistedQueryAnalysisState {
  scrollY: number;
}

const vscode = createVsCodeApi<
  PersistedQueryAnalysisState,
  QueryAnalysisToHostMessage
>();

function Root() {
  const initialState = vscode.getState();
  const { isDark, setIsDark } = useTheme();
  const [viewModel, setViewModel] = useState<QueryAnalysisViewModel | null>(null);
  const [hasRestoredScroll, setHasRestoredScroll] = useState(false);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      vscode.setState({ scrollY: window.scrollY });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (viewModel === null || hasRestoredScroll) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: initialState?.scrollY ?? 0 });
    });
    setHasRestoredScroll(true);
  }, [hasRestoredScroll, initialState?.scrollY, viewModel]);

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
    }
  });

  return (
    <App
      viewModel={viewModel}
      isDark={isDark}
      onQuerySet={(slot, queryId) => vscode.postMessage({ type: 'query:set', slot, queryId })}
      onSortChange={(sortBy) => vscode.postMessage({ type: 'sort:change', sortBy })}
      onModeChange={(mode) => vscode.postMessage({ type: 'mode:change', mode })}
      onReceiptSelect={(receiptId) => vscode.postMessage({ type: 'receipt:select', receiptId })}
      onInspectorOpen={(receiptId) => vscode.postMessage({ type: 'inspector:open', receiptId })}
      onInspectorClose={() => vscode.postMessage({ type: 'inspector:close' })}
      onNavigate={(target, artifactId) => vscode.postMessage({ type: 'navigate', target, artifactId })}
      onBlur={() => vscode.postMessage({ type: 'blur' })}
    />
  );
}

const root = document.getElementById('root');
if (root) {
  render(<Root />, root);
}
