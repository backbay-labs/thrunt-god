import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import type {
  HostToQueryAnalysisMessage,
  QueryAnalysisToHostMessage,
} from '../../shared/query-analysis';
import { Panel } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, QueryAnalysisToHostMessage>();

function App() {
  const { setIsDark } = useTheme();

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToQueryAnalysisMessage>((message) => {
    switch (message.type) {
      case 'init':
      case 'theme':
        setIsDark(message.isDark);
        break;
    }
  });

  return (
    <main class="hunt-surface" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 18px', color: 'var(--hunt-text)' }}>
      <Panel>
        <p style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--hunt-text-muted)', margin: '0 0 8px' }}>
          Query Analysis
        </p>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 2.5vw, 2.4rem)', lineHeight: 1.1 }}>
          Template Comparison
        </h1>
        <p style={{ color: 'var(--hunt-text-muted)', marginTop: '10px' }}>
          Stub surface. Implementation in Phase 15.
        </p>
      </Panel>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
