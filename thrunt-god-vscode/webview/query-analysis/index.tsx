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

const vscode = createVsCodeApi<unknown, QueryAnalysisToHostMessage>();

function Root() {
  const { isDark, setIsDark } = useTheme();
  const [viewModel, setViewModel] = useState<QueryAnalysisViewModel | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

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
      onQuerySelect={(queryId) => vscode.postMessage({ type: 'query:select', queryId })}
      onSortChange={(sortBy) => vscode.postMessage({ type: 'sort:change', sortBy })}
      onModeChange={(mode) => vscode.postMessage({ type: 'mode:change', mode })}
      onReceiptSelect={(receiptId) => vscode.postMessage({ type: 'receipt:select', receiptId })}
      onInspectorOpen={(receiptId) => vscode.postMessage({ type: 'inspector:open', receiptId })}
      onInspectorClose={() => vscode.postMessage({ type: 'inspector:close' })}
      onBlur={() => vscode.postMessage({ type: 'blur' })}
    />
  );
}

const root = document.getElementById('root');
if (root) {
  render(<Root />, root);
}
