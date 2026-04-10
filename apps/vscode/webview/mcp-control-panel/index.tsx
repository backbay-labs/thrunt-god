import { render } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import type {
  HostToMcpControlMessage,
  McpControlToHostMessage,
  McpServerStatus,
  McpToolInfo,
} from '../../shared/mcp-control';
import { Badge, StatCard, GhostButton } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, McpControlToHostMessage>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function connectionVariant(connection: McpServerStatus['connection']): 'success' | 'default' | 'warning' {
  switch (connection) {
    case 'connected':
      return 'success';
    case 'disconnected':
      return 'default';
    case 'checking':
      return 'warning';
  }
}

function connectionLabel(connection: McpServerStatus['connection']): string {
  switch (connection) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'checking':
      return 'Checking...';
  }
}

function generateInputSkeleton(schema: Record<string, unknown>): string {
  const skeleton: Record<string, unknown> = {};
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (properties && typeof properties === 'object') {
    for (const [key, prop] of Object.entries(properties)) {
      const type = typeof prop === 'object' && prop !== null ? prop.type : undefined;
      switch (type) {
        case 'number':
        case 'integer':
          skeleton[key] = 0;
          break;
        case 'boolean':
          skeleton[key] = false;
          break;
        case 'array':
          skeleton[key] = [];
          break;
        case 'object':
          skeleton[key] = {};
          break;
        default:
          skeleton[key] = '';
          break;
      }
    }
  } else {
    for (const [key, val] of Object.entries(schema)) {
      if (typeof val === 'string' && val.includes('?')) {
        continue; // Skip optional fields in skeleton
      }
      skeleton[key] = '';
    }
  }
  return JSON.stringify(skeleton, null, 2);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ServerStatusCard({
  status,
}: {
  status: McpServerStatus;
}) {
  return (
    <section class="mcp-status-card">
      <div class="mcp-status-card__header">
        <h2 class="mcp-section-title">Server Status</h2>
        <Badge variant={connectionVariant(status.connection)}>
          {connectionLabel(status.connection)}
        </Badge>
      </div>

      <div class="mcp-stat-row">
        <StatCard label="Tools" value={String(status.toolCount)} />
        <StatCard label="DB Size" value={formatBytes(status.dbSizeBytes)} />
        <StatCard label="DB Tables" value={String(status.dbTableCount)} />
        <StatCard label="Uptime" value={formatUptime(status.uptimeMs)} />
      </div>

      {status.profile && (
        <div class="mcp-status-detail">
          <span class="mcp-detail-label">Profile:</span>
          <span class="mcp-detail-value">{status.profile}</span>
        </div>
      )}

      {status.lastHealthCheck && (
        <div class="mcp-status-detail">
          <span class="mcp-detail-label">Last Health Check:</span>
          <span class="mcp-detail-value">
            {new Date(status.lastHealthCheck).toLocaleTimeString()}
          </span>
        </div>
      )}

      {status.hasError && status.errorMessage && (
        <div class="mcp-error-banner">
          {status.errorMessage}
        </div>
      )}

      <div class="mcp-action-row">
        <GhostButton onClick={() => vscode.postMessage({ type: 'action:start' })} ariaLabel="Start MCP server">
          Start
        </GhostButton>
        <GhostButton onClick={() => vscode.postMessage({ type: 'action:restart' })} ariaLabel="Restart MCP server">
          Restart
        </GhostButton>
        <GhostButton onClick={() => vscode.postMessage({ type: 'action:healthCheck' })} ariaLabel="Run health check">
          Health Check
        </GhostButton>
        <GhostButton onClick={() => vscode.postMessage({ type: 'refresh' })} ariaLabel="Refresh all data">
          Refresh
        </GhostButton>
      </div>
    </section>
  );
}

function ProfileSelector({
  status,
}: {
  status: McpServerStatus;
}) {
  const [customProfile, setCustomProfile] = useState('');
  const [switching, setSwitching] = useState(false);
  const currentProfile = status.profile || 'default';

  const handleSwitch = useCallback(() => {
    const target = customProfile.trim();
    if (!target || target === currentProfile) return;
    setSwitching(true);
    vscode.postMessage({ type: 'profile:switch', profile: target });
  }, [customProfile, currentProfile]);

  // Reset switching state when we receive a new status
  useEffect(() => {
    setSwitching(false);
  }, [status.connection, status.profile]);

  return (
    <section class="mcp-profile-selector">
      <h2 class="mcp-section-title">Profile / Environment</h2>
      <div class="mcp-profile-current">
        <span class="mcp-detail-label">Active Profile:</span>
        <Badge variant="success">{switching ? 'Switching...' : currentProfile}</Badge>
      </div>
      <div class="mcp-profile-switch-row">
        <input
          type="text"
          class="mcp-profile-input"
          placeholder="Profile name..."
          value={customProfile}
          onInput={(e) => setCustomProfile((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSwitch();
          }}
        />
        <GhostButton
          onClick={handleSwitch}
          ariaLabel="Switch to entered profile"
        >
          Switch
        </GhostButton>
      </div>
    </section>
  );
}

function ToolInventoryTable({
  tools,
  onSelectTool,
}: {
  tools: McpToolInfo[];
  onSelectTool: (tool: McpToolInfo) => void;
}) {
  if (tools.length === 0) {
    return (
      <section class="mcp-tool-inventory">
        <h2 class="mcp-section-title">Tool Inventory</h2>
        <p class="mcp-empty-text">No tools available. Run a health check to refresh.</p>
      </section>
    );
  }

  return (
    <section class="mcp-tool-inventory">
      <h2 class="mcp-section-title">Tool Inventory ({tools.length} tools)</h2>
      <div class="mcp-table-wrap">
        <table class="mcp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Input Schema</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => (
              <tr key={tool.name}>
                <td class="mcp-tool-name">{tool.name}</td>
                <td class="mcp-tool-desc">
                  {tool.description.length > 80
                    ? tool.description.slice(0, 80) + '...'
                    : tool.description}
                </td>
                <td class="mcp-tool-schema">
                  <code>{JSON.stringify(tool.inputSchema)}</code>
                </td>
                <td>
                  <GhostButton
                    onClick={() => onSelectTool(tool)}
                    ariaLabel={`Test ${tool.name}`}
                  >
                    Test
                  </GhostButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ToolTestForm({
  tool,
  onClose,
}: {
  tool: McpToolInfo;
  onClose: () => void;
}) {
  const [input, setInput] = useState(() => generateInputSkeleton(tool.inputSchema));
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null);
  const [running, setRunning] = useState(false);

  // Listen for tool results
  useHostMessage<HostToMcpControlMessage>(
    useCallback(
      (message) => {
        if (message.type === 'toolResult' && message.toolName === tool.name) {
          setResult({ text: message.result, isError: message.isError });
          setRunning(false);
        }
      },
      [tool.name]
    )
  );

  const handleExecute = useCallback(() => {
    setRunning(true);
    setResult(null);
    vscode.postMessage({ type: 'tool:test', toolName: tool.name, input });
  }, [tool.name, input]);

  // Reset state when tool changes
  useEffect(() => {
    setInput(generateInputSkeleton(tool.inputSchema));
    setResult(null);
    setRunning(false);
  }, [tool.name]);

  return (
    <section class="mcp-test-form">
      <div class="mcp-test-form__header">
        <h2 class="mcp-section-title">Test Tool: {tool.name}</h2>
        <GhostButton onClick={onClose} ariaLabel="Close test form">
          Close
        </GhostButton>
      </div>

      <div class="mcp-test-schema-ref">
        <span class="mcp-detail-label">Input Schema:</span>
        <code class="mcp-schema-code">{JSON.stringify(tool.inputSchema, null, 2)}</code>
      </div>

      <div class="mcp-test-input-area">
        <label class="mcp-detail-label" for="mcp-tool-input">JSON Input:</label>
        <textarea
          id="mcp-tool-input"
          class="mcp-test-textarea"
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          rows={6}
          spellcheck={false}
        />
      </div>

      <div class="mcp-action-row">
        <GhostButton
          onClick={handleExecute}
          ariaLabel={`Execute ${tool.name}`}
        >
          {running ? 'Running...' : 'Execute'}
        </GhostButton>
      </div>

      {result && (
        <div class={`mcp-test-result ${result.isError ? 'mcp-test-result--error' : ''}`}>
          <pre class="mcp-test-result__pre"><code>{result.text}</code></pre>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function McpControlPanelApp() {
  const { setIsDark } = useTheme();
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [selectedTool, setSelectedTool] = useState<McpToolInfo | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToMcpControlMessage>(
    useCallback((message) => {
      switch (message.type) {
        case 'init':
          setStatus(message.status);
          setTools(message.tools);
          setIsDark(message.isDark);
          break;
        case 'status':
          setStatus(message.status);
          break;
        case 'tools':
          setTools(message.tools);
          break;
        case 'theme':
          setIsDark(message.isDark);
          break;
        // toolResult is handled in ToolTestForm directly
      }
    }, [setIsDark])
  );

  if (status === null) {
    return (
      <main class="mcp-root">
        <div class="mcp-connecting">
          <span class="mcp-connecting__dot" />
          Connecting to extension host...
        </div>
      </main>
    );
  }

  return (
    <main class="mcp-root">
      <header class="mcp-header">
        <h1 class="mcp-title">MCP Control Panel</h1>
      </header>

      <ServerStatusCard status={status} />
      <ProfileSelector status={status} />
      <ToolInventoryTable tools={tools} onSelectTool={setSelectedTool} />

      {selectedTool && (
        <ToolTestForm
          tool={selectedTool}
          onClose={() => setSelectedTool(null)}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = `
.mcp-root {
  padding: 16px;
  max-width: 960px;
  margin: 0 auto;
}

.mcp-header {
  margin-bottom: 16px;
}

.mcp-title {
  font-size: 1.4em;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--vscode-editor-foreground);
}

.mcp-section-title {
  font-size: 1.1em;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--vscode-editor-foreground);
}

.mcp-status-card,
.mcp-profile-selector,
.mcp-tool-inventory,
.mcp-test-form {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, #444));
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.mcp-status-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.mcp-stat-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.mcp-status-detail {
  margin-bottom: 4px;
  font-size: 0.9em;
}

.mcp-detail-label {
  font-weight: 500;
  color: var(--vscode-descriptionForeground);
  margin-right: 6px;
}

.mcp-detail-value {
  color: var(--vscode-editor-foreground);
}

.mcp-error-banner {
  background: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
  border: 1px solid var(--vscode-inputValidation-errorBorder, #f44);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 8px 0;
  font-size: 0.9em;
  color: var(--vscode-errorForeground, #f44);
}

.mcp-action-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.mcp-profile-current {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mcp-profile-switch-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mcp-profile-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 0.9em;
  border: 1px solid var(--vscode-input-border, #555);
  background: var(--vscode-input-background, #1e1e1e);
  color: var(--vscode-input-foreground, #ccc);
  border-radius: 4px;
  font-family: var(--vscode-font-family);
}

.mcp-profile-input:focus {
  outline: 1px solid var(--vscode-focusBorder, #007fd4);
  border-color: var(--vscode-focusBorder, #007fd4);
}

.mcp-empty-text {
  color: var(--vscode-descriptionForeground);
  font-style: italic;
  margin: 8px 0;
}

.mcp-table-wrap {
  overflow-x: auto;
}

.mcp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}

.mcp-table th,
.mcp-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, #333));
}

.mcp-table th {
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.mcp-tool-name {
  font-weight: 600;
  white-space: nowrap;
}

.mcp-tool-desc {
  max-width: 300px;
  color: var(--vscode-descriptionForeground);
}

.mcp-tool-schema code {
  font-size: 0.8em;
  color: var(--vscode-textPreformat-foreground, #ce9178);
  word-break: break-all;
}

.mcp-test-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.mcp-test-schema-ref {
  margin-bottom: 8px;
}

.mcp-schema-code {
  display: block;
  margin-top: 4px;
  padding: 8px;
  font-size: 0.85em;
  background: var(--vscode-textCodeBlock-background, #1e1e1e);
  border-radius: 4px;
  white-space: pre-wrap;
  color: var(--vscode-textPreformat-foreground, #ce9178);
}

.mcp-test-input-area {
  margin-bottom: 8px;
}

.mcp-test-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  font-family: var(--vscode-editor-fontFamily, monospace);
  font-size: 0.9em;
  border: 1px solid var(--vscode-input-border, #555);
  background: var(--vscode-input-background, #1e1e1e);
  color: var(--vscode-input-foreground, #ccc);
  border-radius: 4px;
  resize: vertical;
}

.mcp-test-textarea:focus {
  outline: 1px solid var(--vscode-focusBorder, #007fd4);
  border-color: var(--vscode-focusBorder, #007fd4);
}

.mcp-test-result {
  margin-top: 12px;
  border: 1px solid var(--vscode-panel-border, #444);
  border-radius: 4px;
  overflow: hidden;
}

.mcp-test-result--error {
  border-color: var(--vscode-inputValidation-errorBorder, #f44);
}

.mcp-test-result__pre {
  margin: 0;
  padding: 12px;
  font-size: 0.85em;
  background: var(--vscode-textCodeBlock-background, #1e1e1e);
  color: var(--vscode-editor-foreground);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
}

.mcp-test-result--error .mcp-test-result__pre {
  color: var(--vscode-errorForeground, #f44);
}

.mcp-connecting {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 32px;
  justify-content: center;
  color: var(--vscode-descriptionForeground);
}

.mcp-connecting__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vscode-charts-blue, #007fd4);
  animation: mcp-pulse 1.4s ease-in-out infinite;
}

@keyframes mcp-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

// Inject styles
const styleEl = document.createElement('style');
styleEl.textContent = styles;
document.head.appendChild(styleEl);

const root = document.getElementById('root');
if (root) {
  render(<McpControlPanelApp />, root);
}
