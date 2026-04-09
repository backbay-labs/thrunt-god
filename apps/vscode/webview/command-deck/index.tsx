import { render } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import type {
  HostToCommandDeckMessage,
  CommandDeckToHostMessage,
  CommandDef,
  RecentCommandEntry,
  CommandDeckContext,
} from '../../shared/command-deck';
import { Badge, GhostButton } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, CommandDeckToHostMessage>();

function CommandDeckApp() {
  const { setIsDark } = useTheme();
  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentCommandEntry[]>([]);
  const [context, setContext] = useState<CommandDeckContext | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToCommandDeckMessage>(
    useCallback((message) => {
      switch (message.type) {
        case 'init':
          setCommands(message.commands);
          setPinned(message.pinned);
          setRecent(message.recent);
          setContext(message.context);
          setIsDark(message.isDark);
          break;
        case 'commands':
          setCommands(message.commands);
          setPinned(message.pinned);
          setRecent(message.recent);
          break;
        case 'context':
          setContext(message.context);
          break;
        case 'theme':
          setIsDark(message.isDark);
          break;
      }
    }, [setIsDark])
  );

  if (commands.length === 0) {
    return (
      <main class="cd-root">
        <div class="cd-connecting">
          <span class="cd-connecting__dot" />
          Loading command deck...
        </div>
      </main>
    );
  }

  // Group commands by category
  const categories = ['Investigation', 'Execution', 'Intelligence', 'Maintenance'] as const;
  const pinnedCommands = commands.filter(c => pinned.includes(c.id));

  return (
    <main class="cd-root">
      <header class="cd-header">
        <h1 class="cd-title">Command Deck</h1>
      </header>

      {pinnedCommands.length > 0 && (
        <section class="cd-section">
          <h2 class="cd-section-title">Pinned</h2>
          <div class="cd-grid">
            {pinnedCommands.map(cmd => (
              <CommandCard
                key={cmd.id}
                cmd={cmd}
                isPinned={true}
                isContextRelevant={false}
                onExec={() => vscode.postMessage({ type: 'command:exec', commandId: cmd.id })}
                onTogglePin={() => vscode.postMessage({ type: 'command:unpin', commandId: cmd.id })}
              />
            ))}
          </div>
        </section>
      )}

      {categories.map(cat => {
        const catCommands = commands.filter(c => c.category === cat);
        if (catCommands.length === 0) return null;
        return (
          <section key={cat} class="cd-section">
            <h2 class="cd-section-title">{cat}</h2>
            <div class="cd-grid">
              {catCommands.map(cmd => (
                <CommandCard
                  key={cmd.id}
                  cmd={cmd}
                  isPinned={pinned.includes(cmd.id)}
                  isContextRelevant={false}
                  onExec={() => vscode.postMessage({ type: 'command:exec', commandId: cmd.id })}
                  onTogglePin={() =>
                    vscode.postMessage(
                      pinned.includes(cmd.id)
                        ? { type: 'command:unpin', commandId: cmd.id }
                        : { type: 'command:pin', commandId: cmd.id }
                    )
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      {recent.length > 0 && (
        <section class="cd-section">
          <h2 class="cd-section-title">Recent</h2>
          <div class="cd-recent-list">
            {recent.map((entry, i) => (
              <div key={i} class="cd-recent-entry">
                <Badge variant={entry.success ? 'success' : 'default'}>
                  {entry.success ? 'OK' : 'FAIL'}
                </Badge>
                <span class="cd-recent-label">{entry.label}</span>
                <span class="cd-recent-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function CommandCard({
  cmd,
  isPinned,
  isContextRelevant,
  onExec,
  onTogglePin,
}: {
  cmd: CommandDef;
  isPinned: boolean;
  isContextRelevant: boolean;
  onExec: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div class={`cd-card${isContextRelevant ? ' cd-card--highlight' : ''}`}>
      <div class="cd-card__header">
        <span class="cd-card__label">{cmd.label}</span>
        <Badge variant={cmd.mutating ? 'warning' : 'success'}>
          {cmd.mutating ? 'mutating' : 'read-only'}
        </Badge>
      </div>
      <p class="cd-card__desc">{cmd.description}</p>
      <div class="cd-card__actions">
        <GhostButton onClick={onExec} ariaLabel={`Run ${cmd.label}`}>
          Run
        </GhostButton>
        <GhostButton onClick={onTogglePin} ariaLabel={isPinned ? `Unpin ${cmd.label}` : `Pin ${cmd.label}`}>
          {isPinned ? 'Unpin' : 'Pin'}
        </GhostButton>
      </div>
    </div>
  );
}

// Styles - follows mcp-control-panel pattern with cd- prefix
const styles = `
.cd-root {
  padding: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.cd-header { margin-bottom: 16px; }
.cd-title {
  font-size: 1.4em;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--vscode-editor-foreground);
}
.cd-section { margin-bottom: 20px; }
.cd-section-title {
  font-size: 1.1em;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--vscode-editor-foreground);
}
.cd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
@media (max-width: 600px) {
  .cd-grid { grid-template-columns: 1fr; }
}
.cd-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, #444));
  border-radius: 6px;
  padding: 12px 16px;
}
.cd-card--highlight {
  border-color: var(--vscode-focusBorder, #007fd4);
  box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007fd4);
}
.cd-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.cd-card__label {
  font-weight: 600;
  color: var(--vscode-editor-foreground);
}
.cd-card__desc {
  font-size: 0.9em;
  color: var(--vscode-descriptionForeground);
  margin: 0 0 8px 0;
}
.cd-card__actions {
  display: flex;
  gap: 8px;
}
.cd-recent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cd-recent-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
}
.cd-recent-label {
  flex: 1;
  color: var(--vscode-editor-foreground);
}
.cd-recent-time {
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
}
.cd-connecting {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 32px;
  justify-content: center;
  color: var(--vscode-descriptionForeground);
}
.cd-connecting__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vscode-charts-blue, #007fd4);
  animation: cd-pulse 1.4s ease-in-out infinite;
}
@keyframes cd-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;

const styleEl = document.createElement('style');
styleEl.textContent = styles;
document.head.appendChild(styleEl);

const root = document.getElementById('root');
if (root) {
  render(<CommandDeckApp />, root);
}
