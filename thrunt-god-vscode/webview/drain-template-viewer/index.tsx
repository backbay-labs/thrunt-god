import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  DrainViewerBootData,
  DrainViewerViewModel,
  DrainWebviewToHostMessage,
  HostToDrainWebviewMessage,
} from '../../shared/drain-viewer';
import { useTheme } from '../shared/hooks';
import { App } from './app';
import '../shared/tokens.css';
import './styles.css';

interface PersistedDrainViewerState {
  queryId: string | null;
  selectedTemplateId: string | null;
  scrollY: number;
}

interface VsCodeApi<State> {
  getState(): State | undefined;
  setState(state: State): void;
  postMessage(message: DrainWebviewToHostMessage): void;
}

declare global {
  interface Window {
    __THRUNT_DRAIN_BOOT__?: DrainViewerBootData;
    acquireVsCodeApi?: <State>() => VsCodeApi<State>;
  }
}

const bootData = window.__THRUNT_DRAIN_BOOT__ ?? { queryId: null };
const fallbackApi: VsCodeApi<PersistedDrainViewerState> = {
  getState: () => undefined,
  setState: () => undefined,
  postMessage: () => undefined,
};
const vscode = typeof window.acquireVsCodeApi === 'function'
  ? window.acquireVsCodeApi<PersistedDrainViewerState>()
  : fallbackApi;

function persistState(queryId: string | null, selectedTemplateId: string | null): void {
  vscode.setState({
    queryId,
    selectedTemplateId,
    scrollY: window.scrollY,
  });
}

function Root() {
  const initialState = vscode.getState();
  const [viewModel, setViewModel] = useState<DrainViewerViewModel | null>(null);
  const { isDark, setIsDark } = useTheme();
  const [isStale, setIsStale] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialState?.selectedTemplateId ?? null
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent<HostToDrainWebviewMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'init':
          setViewModel(message.viewModel);
          setIsDark(message.isDark);
          setIsStale(false);
          return;
        case 'update':
          setViewModel(message.viewModel);
          setIsStale(false);
          return;
        case 'theme':
          setIsDark(message.isDark);
          return;
        case 'stale':
          if (message.affectedIds.includes(viewModel?.query.queryId ?? '')) {
            setIsStale(true);
          }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        vscode.postMessage({ type: 'blur' });
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleKeyDown);
    vscode.postMessage({ type: 'webview:ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewModel?.query.queryId]);

  useEffect(() => {
    if (!viewModel) {
      return;
    }

    const persisted = vscode.getState();
    const hasCurrentSelection = viewModel.clusters.some(
      (cluster) => cluster.templateId === selectedTemplateId
    );

    if (hasCurrentSelection) {
      return;
    }

    if (
      persisted?.queryId === viewModel.query.queryId &&
      persisted.selectedTemplateId &&
      viewModel.clusters.some((cluster) => cluster.templateId === persisted.selectedTemplateId)
    ) {
      setSelectedTemplateId(persisted.selectedTemplateId);
      return;
    }

    setSelectedTemplateId(viewModel.clusters[0]?.templateId ?? null);
  }, [selectedTemplateId, viewModel]);

  useEffect(() => {
    const queryId = viewModel?.query.queryId ?? bootData.queryId ?? null;
    persistState(queryId, selectedTemplateId);
  }, [selectedTemplateId, viewModel?.query.queryId]);

  useEffect(() => {
    const handleScroll = () => {
      const queryId = viewModel?.query.queryId ?? bootData.queryId ?? null;
      persistState(queryId, selectedTemplateId);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [selectedTemplateId, viewModel?.query.queryId]);

  useEffect(() => {
    if (!viewModel) {
      return;
    }

    const persisted = vscode.getState();
    const targetScroll =
      persisted?.queryId === viewModel.query.queryId ? persisted.scrollY : 0;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetScroll ?? 0 });
    });
  }, [viewModel?.query.queryId]);

  return (
    <App
      viewModel={viewModel}
      isDark={isDark}
      isStale={isStale}
      selectedTemplateId={selectedTemplateId}
      onNavigate={(queryId, templateId) => {
        vscode.postMessage({ type: 'navigate', queryId, templateId: templateId ?? null });
      }}
      onSelectTemplate={(templateId) => {
        setSelectedTemplateId(templateId);
      }}
      onTogglePin={(queryId, templateId, isPinned) => {
        vscode.postMessage({
          type: isPinned ? 'template:unpin' : 'template:pin',
          queryId,
          templateId,
        });
      }}
    />
  );
}

const root = document.getElementById('root');
if (root) {
  render(<Root />, root);
}
