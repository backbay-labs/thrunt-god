// Shared types for Runbook webview <-> host messages

// Step action types
export type StepAction = 'cli' | 'mcp' | 'open' | 'note' | 'confirm';

// Runbook input parameter definition
export interface RunbookInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  description: string;
  default?: string;
  required?: boolean;
  options?: string[];  // for type: 'select'
}

// Single runbook step
export interface RunbookStep {
  action: StepAction;
  description?: string;
  params: Record<string, string>;
  mutating?: boolean;
}

// Full runbook definition (parsed from YAML)
export interface RunbookDef {
  name: string;
  description: string;
  inputs: RunbookInput[];
  steps: RunbookStep[];
  dry_run: boolean;
  output_capture: 'all' | 'errors' | 'none';
  success_conditions: string[];
  failure_conditions: string[];
}

// Result of executing a single step
export interface StepResult {
  stepIndex: number;
  action: StepAction;
  description: string;
  status: 'success' | 'failure' | 'skipped' | 'dry-run';
  output: string;
  durationMs: number;
}

// Completed run record (for history)
export interface RunbookRunRecord {
  id: string;           // RUN-{timestamp}
  runbookName: string;
  runbookPath: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  status: 'success' | 'failure' | 'aborted';
  stepResults: StepResult[];
  inputs: Record<string, string>;
  dryRun: boolean;
}

// Boot data for webview
export interface RunbookBootData {
  surfaceId: 'runbook';
}

// Host -> Webview messages
export type HostToRunbookMessage =
  | { type: 'init'; runbook: RunbookDef; runbookPath: string; isDark: boolean }
  | { type: 'stepStart'; stepIndex: number; description: string }
  | { type: 'stepComplete'; result: StepResult }
  | { type: 'runComplete'; record: RunbookRunRecord }
  | { type: 'confirmPrompt'; stepIndex: number; description: string }
  | { type: 'error'; message: string }
  | { type: 'theme'; isDark: boolean };

// Webview -> Host messages
export type RunbookToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'run:start'; inputs: Record<string, string>; dryRun: boolean }
  | { type: 'confirm:continue' }
  | { type: 'confirm:abort' }
  | { type: 'refresh' };
