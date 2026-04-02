import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  HostToHuntOverviewMessage,
  HuntOverviewToHostMessage,
} from '../../shared/hunt-overview';
import { Panel, StatCard } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, HuntOverviewToHostMessage>();

function App() {
  const { setIsDark } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToHuntOverviewMessage>((message) => {
    switch (message.type) {
      case 'init':
        setIsDark(message.isDark);
        setReady(true);
        break;
      case 'theme':
        setIsDark(message.isDark);
        break;
    }
  });

  return (
    <main class="hunt-surface" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 18px', color: 'var(--hunt-text)' }}>
      <Panel>
        <p style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--hunt-text-muted)', margin: '0 0 8px' }}>
          Hunt Overview
        </p>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 2.5vw, 2.4rem)', lineHeight: 1.1 }}>
          Mission Dashboard
        </h1>
        <p style={{ color: 'var(--hunt-text-muted)', marginTop: '10px' }}>
          {ready ? 'Connected to extension host. Awaiting implementation in Phase 13.' : 'Connecting to extension host...'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginTop: '22px' }}>
          <StatCard label="Receipts" value="--" />
          <StatCard label="Queries" value="--" />
          <StatCard label="Templates" value="--" />
        </div>
      </Panel>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
