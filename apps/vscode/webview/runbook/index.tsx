import { render } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import type {
  HostToRunbookMessage,
  RunbookToHostMessage,
  RunbookDef,
  StepResult,
  RunbookRunRecord,
} from '../../shared/runbook';
import { GhostButton, Badge } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

const vscode = createVsCodeApi<unknown, RunbookToHostMessage>();

function RunbookApp() {
  const { setIsDark } = useTheme();
  const [runbook, setRunbook] = useState<RunbookDef | null>(null);
  const [runbookPath, setRunbookPath] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [currentStep, setCurrentStep] = useState<{ index: number; description: string } | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [runRecord, setRunRecord] = useState<RunbookRunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToRunbookMessage>(
    useCallback((message) => {
      switch (message.type) {
        case 'init':
          setRunbook(message.runbook);
          setRunbookPath(message.runbookPath);
          setIsDark(message.isDark);
          setError(null);
          setRunRecord(null);
          setStepResults([]);
          setCurrentStep(null);
          setConfirmPending(false);
          setRunning(false);
          // Initialize inputs from defaults
          {
            const defaults: Record<string, string> = {};
            for (const inp of message.runbook.inputs) {
              defaults[inp.name] = inp.default ?? '';
            }
            setInputs(defaults);
          }
          break;
        case 'stepStart':
          setCurrentStep({ index: message.stepIndex, description: message.description });
          break;
        case 'stepComplete':
          setStepResults(prev => {
            const next = [...prev];
            next[message.result.stepIndex] = message.result;
            return next;
          });
          setCurrentStep(null);
          break;
        case 'runComplete':
          setRunRecord(message.record);
          setRunning(false);
          setCurrentStep(null);
          setConfirmPending(false);
          break;
        case 'confirmPrompt':
          setConfirmPending(true);
          setCurrentStep({ index: message.stepIndex, description: message.description });
          break;
        case 'error':
          setError(message.message);
          setRunning(false);
          break;
        case 'theme':
          setIsDark(message.isDark);
          break;
      }
    }, [setIsDark])
  );

  const handleRun = useCallback(() => {
    setRunning(true);
    setStepResults([]);
    setRunRecord(null);
    setError(null);
    setCurrentStep(null);
    setConfirmPending(false);
    vscode.postMessage({ type: 'run:start', inputs, dryRun });
  }, [inputs, dryRun]);

  const handleConfirmContinue = useCallback(() => {
    setConfirmPending(false);
    vscode.postMessage({ type: 'confirm:continue' });
  }, []);

  const handleConfirmAbort = useCallback(() => {
    setConfirmPending(false);
    vscode.postMessage({ type: 'confirm:abort' });
  }, []);

  if (!runbook) {
    return (
      <main class="rb-root">
        <div class="rb-connecting">
          <span class="rb-connecting__dot" />
          Loading runbook...
        </div>
      </main>
    );
  }

  const hasResults = stepResults.length > 0 || running;

  return (
    <main class="rb-root">
      {/* Header */}
      <header class="rb-header">
        <h1 class="rb-title">{runbook.name}</h1>
        {runbook.description && (
          <p class="rb-description">{runbook.description}</p>
        )}
        <div class="rb-controls">
          <label class="rb-dry-run-toggle">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun((e.target as HTMLInputElement).checked)}
              disabled={running}
            />
            {' '}Dry run
          </label>
          <GhostButton
            onClick={handleRun}
            ariaLabel="Run runbook"
            disabled={running}
          >
            {running ? 'Running...' : 'Run'}
          </GhostButton>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div class="rb-error">
          <span class="rb-error__icon">!</span>
          {error}
        </div>
      )}

      {/* Input Form */}
      {!running && !runRecord && runbook.inputs.length > 0 && (
        <section class="rb-form">
          <h2 class="rb-section-title">Inputs</h2>
          {runbook.inputs.map((inp) => (
            <div key={inp.name} class="rb-input-group">
              <label class="rb-input-label">
                {inp.name}
                {inp.required && <span class="rb-required"> *</span>}
              </label>
              {inp.description && (
                <span class="rb-input-desc">{inp.description}</span>
              )}
              {inp.type === 'select' && inp.options ? (
                <select
                  class="rb-select"
                  value={inputs[inp.name] || ''}
                  onChange={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      [inp.name]: (e.target as HTMLSelectElement).value,
                    }))
                  }
                >
                  {inp.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  class="rb-input"
                  type="text"
                  placeholder={inp.description}
                  value={inputs[inp.name] || ''}
                  onInput={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      [inp.name]: (e.target as HTMLInputElement).value,
                    }))
                  }
                />
              )}
            </div>
          ))}
        </section>
      )}

      {/* Confirm Dialog */}
      {confirmPending && currentStep && (
        <div class="rb-confirm-bar">
          <span class="rb-confirm-msg">
            Confirm: {currentStep.description}
          </span>
          <div class="rb-confirm-actions">
            <button class="rb-btn rb-btn--continue" onClick={handleConfirmContinue}>
              Continue
            </button>
            <button class="rb-btn rb-btn--abort" onClick={handleConfirmAbort}>
              Abort
            </button>
          </div>
        </div>
      )}

      {/* Step Progress */}
      {hasResults && (
        <section class="rb-step-list">
          <h2 class="rb-section-title">Steps</h2>
          <ol class="rb-steps">
            {runbook.steps.map((step, i) => {
              const result = stepResults[i];
              const isCurrent = currentStep?.index === i && !confirmPending;
              const isPending = !result && !isCurrent;

              return (
                <li
                  key={i}
                  class={`rb-step-item${result ? ` rb-step-item--${result.status}` : ''}${isCurrent ? ' rb-step-item--active' : ''}${isPending ? ' rb-step-item--pending' : ''}`}
                >
                  <div class="rb-step-header">
                    <span class="rb-step-icon">
                      {result
                        ? result.status === 'success'
                          ? '\u2713'
                          : result.status === 'dry-run'
                            ? '\u23F3'
                            : '\u2717'
                        : isCurrent
                          ? '\u25CB'
                          : '\u2022'}
                    </span>
                    <span class="rb-step-desc">
                      {step.description || `Step ${i + 1}: ${step.action}`}
                    </span>
                    <Badge variant={step.mutating ? 'warning' : 'success'}>
                      {step.mutating ? 'mutating' : 'read-only'}
                    </Badge>
                    {result && (
                      <span class="rb-step-duration">
                        {result.durationMs}ms
                      </span>
                    )}
                  </div>
                  {result && result.output && (
                    <pre class="rb-step-output">{result.output}</pre>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Run Result */}
      {runRecord && (
        <section class="rb-result-card">
          <h2 class="rb-section-title">Result</h2>
          <div class={`rb-result-badge rb-result-badge--${runRecord.status}`}>
            {runRecord.status.toUpperCase()}
          </div>
          <div class="rb-result-meta">
            <span>Duration: {runRecord.durationMs}ms</span>
            <span>Steps: {runRecord.stepResults.length}/{runbook.steps.length}</span>
            {runRecord.dryRun && <span class="rb-result-dryrun">Dry Run</span>}
          </div>
        </section>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Styles - follows command-deck/mcp-control pattern with rb- prefix
// ---------------------------------------------------------------------------

const styles = `
.rb-root {
  padding: 16px;
  max-width: 960px;
  margin: 0 auto;
}
.rb-header { margin-bottom: 16px; }
.rb-title {
  font-size: 1.4em;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--vscode-editor-foreground);
}
.rb-description {
  font-size: 0.95em;
  color: var(--vscode-descriptionForeground);
  margin: 0 0 12px 0;
}
.rb-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rb-dry-run-toggle {
  font-size: 0.9em;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  user-select: none;
}
.rb-section-title {
  font-size: 1.1em;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--vscode-editor-foreground);
}
.rb-error {
  background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
  border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 12px;
  color: var(--vscode-errorForeground);
  display: flex;
  align-items: center;
  gap: 8px;
}
.rb-error__icon {
  font-weight: 700;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--vscode-errorForeground);
  color: var(--vscode-editor-background);
  font-size: 0.8em;
  flex-shrink: 0;
}

/* Input Form */
.rb-form {
  margin-bottom: 16px;
}
.rb-input-group {
  margin-bottom: 10px;
}
.rb-input-label {
  display: block;
  font-weight: 500;
  color: var(--vscode-editor-foreground);
  margin-bottom: 2px;
  font-size: 0.9em;
}
.rb-required {
  color: var(--vscode-errorForeground);
}
.rb-input-desc {
  display: block;
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}
.rb-input,
.rb-select {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 0.9em;
  border: 1px solid var(--vscode-input-border, #555);
  background: var(--vscode-input-background, #1e1e1e);
  color: var(--vscode-input-foreground, #ccc);
  border-radius: 4px;
  font-family: var(--vscode-font-family);
}
.rb-input:focus,
.rb-select:focus {
  outline: 1px solid var(--vscode-focusBorder, #007fd4);
  border-color: var(--vscode-focusBorder, #007fd4);
}

/* Confirm bar */
.rb-confirm-bar {
  background: var(--vscode-editor-background);
  border: 2px solid var(--vscode-focusBorder, #007fd4);
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rb-confirm-msg {
  font-weight: 500;
  color: var(--vscode-editor-foreground);
}
.rb-confirm-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.rb-btn {
  padding: 4px 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 0.9em;
  font-family: var(--vscode-font-family);
}
.rb-btn--continue {
  background: var(--vscode-charts-green, #388a34);
  color: #fff;
}
.rb-btn--continue:hover {
  opacity: 0.9;
}
.rb-btn--abort {
  background: var(--vscode-errorForeground, #f14c4c);
  color: #fff;
}
.rb-btn--abort:hover {
  opacity: 0.9;
}

/* Step list */
.rb-step-list {
  margin-bottom: 16px;
}
.rb-steps {
  list-style: none;
  padding: 0;
  margin: 0;
}
.rb-step-item {
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 4px;
  border-left: 3px solid var(--vscode-panel-border, #444);
}
.rb-step-item--success {
  border-left-color: var(--vscode-charts-green, #388a34);
}
.rb-step-item--failure {
  border-left-color: var(--vscode-errorForeground, #f14c4c);
}
.rb-step-item--dry-run {
  border-left-color: var(--vscode-descriptionForeground, #888);
}
.rb-step-item--active {
  border-left-color: var(--vscode-focusBorder, #007fd4);
  background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
}
.rb-step-item--pending {
  opacity: 0.5;
}
.rb-step-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rb-step-icon {
  font-size: 1em;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}
.rb-step-desc {
  flex: 1;
  font-size: 0.9em;
  color: var(--vscode-editor-foreground);
}
.rb-step-duration {
  font-size: 0.8em;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}
.rb-step-header .hunt-badge {
  flex-shrink: 0;
  font-size: 0.75em;
}
.rb-step-output {
  margin: 6px 0 0 26px;
  padding: 6px 8px;
  font-size: 0.85em;
  background: var(--vscode-textCodeBlock-background, #1e1e1e);
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-editor-fontFamily, monospace);
}

/* Result card */
.rb-result-card {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border, #444);
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.rb-result-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 600;
  margin-bottom: 8px;
}
.rb-result-badge--success {
  background: var(--vscode-charts-green, #388a34);
  color: #fff;
}
.rb-result-badge--failure {
  background: var(--vscode-errorForeground, #f14c4c);
  color: #fff;
}
.rb-result-badge--aborted {
  background: var(--vscode-descriptionForeground, #888);
  color: #fff;
}
.rb-result-meta {
  display: flex;
  gap: 16px;
  font-size: 0.9em;
  color: var(--vscode-descriptionForeground);
}
.rb-result-dryrun {
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}

/* Loading */
.rb-connecting {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 32px;
  justify-content: center;
  color: var(--vscode-descriptionForeground);
}
.rb-connecting__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vscode-charts-blue, #007fd4);
  animation: rb-pulse 1.4s ease-in-out infinite;
}
@keyframes rb-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
`;

const styleEl = document.createElement('style');
styleEl.textContent = styles;
document.head.appendChild(styleEl);

const root = document.getElementById('root');
if (root) {
  render(<RunbookApp />, root);
}
