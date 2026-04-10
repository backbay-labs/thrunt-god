// Shared types for Command Deck webview <-> host messages

// Command categories
export type CommandCategory = 'Investigation' | 'Execution' | 'Intelligence' | 'Maintenance';

// Single command definition
export interface CommandDef {
  id: string;           // unique slug, e.g. 'runtime-doctor'
  label: string;        // display name
  icon: string;         // codicon id, e.g. 'heart'
  description: string;  // one-liner
  category: CommandCategory;
  mutating: boolean;    // true = changes state, false = read-only
  // Execution target: exactly one of these
  commandId?: string;   // vscode command to execute
  cliArgs?: string[];   // CLI args for CLIBridge
}

// Recent command execution entry
export interface RecentCommandEntry {
  commandId: string;    // CommandDef.id
  label: string;
  timestamp: number;    // Date.now()
  success: boolean;
}

// Parameterized template (deferred to Plan 03)
export interface CommandTemplate {
  id: string;
  label: string;
  description: string;
  category: CommandCategory;
  mutating: boolean;
  commandId?: string;
  cliArgs?: string[];
  placeholders: string[];  // extracted from {placeholder} syntax
}

// Boot data
export interface CommandDeckBootData {
  surfaceId: 'command-deck';
}

// Context from investigation tree selection
export interface CommandDeckContext {
  nodeType: string;     // 'phase', 'case', 'query', etc.
  dataId?: string;
}

// Host -> Webview messages
export type HostToCommandDeckMessage =
  | { type: 'init'; commands: CommandDef[]; templates: CommandTemplate[]; pinned: string[]; recent: RecentCommandEntry[]; context: CommandDeckContext | null; isDark: boolean }
  | { type: 'commands'; commands: CommandDef[]; pinned: string[]; recent: RecentCommandEntry[] }
  | { type: 'context'; context: CommandDeckContext | null }
  | { type: 'execResult'; commandId: string; success: boolean; message: string }
  | { type: 'templates'; templates: CommandTemplate[] }
  | { type: 'templatePrompt'; templateId: string; placeholders: string[] }
  | { type: 'theme'; isDark: boolean };

// Webview -> Host messages
export type CommandDeckToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'command:exec'; commandId: string }
  | { type: 'command:pin'; commandId: string }
  | { type: 'command:unpin'; commandId: string }
  | { type: 'template:save'; template: CommandTemplate }
  | { type: 'template:delete'; templateId: string }
  | { type: 'template:exec'; templateId: string; values: Record<string, string> }
  | { type: 'refresh' };
