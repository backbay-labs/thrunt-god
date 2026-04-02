import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  HostToEvidenceBoardMessage,
  EvidenceBoardToHostMessage,
} from '../../shared/evidence-board';
import { Panel, GhostButton } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, EvidenceBoardToHostMessage>();

function App() {
  const { setIsDark } = useTheme();
  const [mode, setMode] = useState<'graph' | 'matrix'>('graph');

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToEvidenceBoardMessage>((message) => {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--hunt-text-muted)', margin: '0 0 8px' }}>
              Evidence Board
            </p>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 2.5vw, 2.4rem)', lineHeight: 1.1 }}>
              {mode === 'graph' ? 'Lineage Graph' : 'Coverage Matrix'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <GhostButton onClick={() => setMode('graph')} ariaLabel="Switch to graph view">Graph</GhostButton>
            <GhostButton onClick={() => setMode('matrix')} ariaLabel="Switch to matrix view">Matrix</GhostButton>
          </div>
        </div>
        <p style={{ color: 'var(--hunt-text-muted)', marginTop: '10px' }}>
          Stub surface. Implementation in Phase 14.
        </p>
      </Panel>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
