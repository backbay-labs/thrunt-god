import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import type { StepAction, RunbookDef, RunbookInput, RunbookStep, StepResult, RunbookRunRecord } from '../shared/runbook';
import { resolveNodeExecutable, type NodeExecutableResolver } from './nodeRuntime';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RUNBOOK_PANEL_VIEW_TYPE = 'thruntGod.runbookPanel';

export const VALID_STEP_ACTIONS: StepAction[] = ['cli', 'mcp', 'open', 'note', 'confirm'];
const VALID_CAPTURE_MODES = ['all', 'errors', 'none'] as const;
const VALID_INPUT_TYPES = ['string', 'number', 'boolean', 'select'] as const;

// ---------------------------------------------------------------------------
// Runtime validation (no Zod dependency)
// ---------------------------------------------------------------------------

export function validateRunbook(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Runbook must be a non-null object'] };
  }

  const d = data as Record<string, unknown>;

  // name: required string, non-empty
  if (typeof d.name !== 'string' || d.name.trim().length === 0) {
    errors.push('name: required non-empty string');
  }

  // description: required string
  if (typeof d.description !== 'string') {
    errors.push('description: required string');
  }

  // inputs: optional array
  if (d.inputs !== undefined) {
    if (!Array.isArray(d.inputs)) {
      errors.push('inputs: must be an array');
    } else {
      for (let i = 0; i < d.inputs.length; i++) {
        const input = d.inputs[i] as Record<string, unknown>;
        if (!input || typeof input !== 'object') {
          errors.push(`inputs[${i}]: must be an object`);
          continue;
        }
        if (typeof input.name !== 'string' || input.name.trim().length === 0) {
          errors.push(`inputs[${i}].name: required non-empty string`);
        }
        if (typeof input.type !== 'string' || !(VALID_INPUT_TYPES as readonly string[]).includes(input.type)) {
          errors.push(`inputs[${i}].type: must be one of ${VALID_INPUT_TYPES.join(', ')}`);
        }
        if (typeof input.description !== 'string') {
          errors.push(`inputs[${i}].description: required string`);
        }
        if (input.default !== undefined && typeof input.default !== 'string') {
          errors.push(`inputs[${i}].default: must be a string`);
        }
        if (input.required !== undefined && typeof input.required !== 'boolean') {
          errors.push(`inputs[${i}].required: must be a boolean`);
        }
        if (input.type === 'select') {
          if (!Array.isArray(input.options) || input.options.length === 0) {
            errors.push(`inputs[${i}].options: required non-empty string array for type 'select'`);
          } else {
            for (let j = 0; j < input.options.length; j++) {
              if (typeof input.options[j] !== 'string') {
                errors.push(`inputs[${i}].options[${j}]: must be a string`);
              }
            }
          }
        }
      }
    }
  }

  // steps: required non-empty array
  if (!Array.isArray(d.steps)) {
    errors.push('steps: required array');
  } else if (d.steps.length === 0) {
    errors.push('steps: must not be empty');
  } else {
    for (let i = 0; i < d.steps.length; i++) {
      const step = d.steps[i] as Record<string, unknown>;
      if (!step || typeof step !== 'object') {
        errors.push(`steps[${i}]: must be an object`);
        continue;
      }
      if (typeof step.action !== 'string' || !VALID_STEP_ACTIONS.includes(step.action as StepAction)) {
        errors.push(`steps[${i}].action: must be one of ${VALID_STEP_ACTIONS.join(', ')}`);
      }
      if (step.description !== undefined && typeof step.description !== 'string') {
        errors.push(`steps[${i}].description: must be a string`);
      }
      if (!step.params || typeof step.params !== 'object' || Array.isArray(step.params)) {
        errors.push(`steps[${i}].params: required object`);
      }
      if (step.mutating !== undefined && typeof step.mutating !== 'boolean') {
        errors.push(`steps[${i}].mutating: must be a boolean`);
      }
    }
  }

  // dry_run: optional boolean
  if (d.dry_run !== undefined && typeof d.dry_run !== 'boolean') {
    errors.push('dry_run: must be a boolean');
  }

  // output_capture: optional string
  if (d.output_capture !== undefined) {
    if (typeof d.output_capture !== 'string' || !(VALID_CAPTURE_MODES as readonly string[]).includes(d.output_capture)) {
      errors.push(`output_capture: must be one of ${VALID_CAPTURE_MODES.join(', ')}`);
    }
  }

  // success_conditions: optional string array
  if (d.success_conditions !== undefined) {
    if (!Array.isArray(d.success_conditions)) {
      errors.push('success_conditions: must be an array');
    } else {
      for (let i = 0; i < d.success_conditions.length; i++) {
        if (typeof d.success_conditions[i] !== 'string') {
          errors.push(`success_conditions[${i}]: must be a string`);
        }
      }
    }
  }

  // failure_conditions: optional string array
  if (d.failure_conditions !== undefined) {
    if (!Array.isArray(d.failure_conditions)) {
      errors.push('failure_conditions: must be an array');
    } else {
      for (let i = 0; i < d.failure_conditions.length; i++) {
        if (typeof d.failure_conditions[i] !== 'string') {
          errors.push(`failure_conditions[${i}]: must be a string`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// YAML parser
// ---------------------------------------------------------------------------

export function parseRunbook(yamlContent: string): { runbook: RunbookDef | null; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { runbook: null, errors: [`YAML parse error: ${message}`] };
  }

  const validation = validateRunbook(parsed);
  if (!validation.valid) {
    return { runbook: null, errors: validation.errors };
  }

  const d = parsed as Record<string, unknown>;

  const inputs: RunbookInput[] = Array.isArray(d.inputs)
    ? (d.inputs as Record<string, unknown>[]).map((inp) => ({
        name: inp.name as string,
        type: inp.type as RunbookInput['type'],
        description: inp.description as string,
        ...(inp.default !== undefined ? { default: inp.default as string } : {}),
        ...(inp.required !== undefined ? { required: inp.required as boolean } : {}),
        ...(Array.isArray(inp.options) ? { options: inp.options as string[] } : {}),
      }))
    : [];

  const steps: RunbookStep[] = (d.steps as Record<string, unknown>[]).map((s) => {
    const params: Record<string, string> = {};
    if (s.params && typeof s.params === 'object') {
      for (const [k, v] of Object.entries(s.params as Record<string, unknown>)) {
        params[k] = (v === null || v === undefined) ? '' :
          (typeof v === 'object') ? JSON.stringify(v) : String(v);
      }
    }
    return {
      action: s.action as StepAction,
      ...(s.description !== undefined ? { description: s.description as string } : {}),
      params,
      mutating: typeof s.mutating === 'boolean' ? s.mutating : (s.action === 'cli' || s.action === 'mcp'),
    };
  });

  const runbook: RunbookDef = {
    name: d.name as string,
    description: d.description as string,
    inputs,
    steps,
    dry_run: typeof d.dry_run === 'boolean' ? d.dry_run : false,
    output_capture: (VALID_CAPTURE_MODES as readonly string[]).includes(d.output_capture as string)
      ? (d.output_capture as RunbookDef['output_capture'])
      : 'all',
    success_conditions: Array.isArray(d.success_conditions) ? (d.success_conditions as string[]) : [],
    failure_conditions: Array.isArray(d.failure_conditions) ? (d.failure_conditions as string[]) : [],
  };

  return { runbook, errors: [] };
}

export function tokenizeRunbookCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let escaping = false;
  let tokenStarted = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      tokenStarted = true;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      if (quote === '\'') {
        current += char;
        tokenStarted = true;
      } else {
        escaping = true;
      }
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
        tokenStarted = true;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escaping) {
    current += '\\';
    tokenStarted = true;
  }

  if (tokenStarted) {
    tokens.push(current);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// RunbookRegistry — discovers and caches runbook files from .planning/runbooks/
// ---------------------------------------------------------------------------

interface RegistryEntry {
  def: RunbookDef | null;
  path: string;
  errors: string[];
}

export class RunbookRegistry {
  private runbooks: Map<string, RegistryEntry> = new Map();

  constructor(private readonly workspaceRoot: string) {}

  async discover(): Promise<void> {
    const runbookDir = path.join(this.workspaceRoot, '.planning', 'runbooks');

    let entries: string[];
    try {
      entries = fs.readdirSync(runbookDir);
    } catch {
      // Directory does not exist or is not readable
      return;
    }

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (ext !== '.yaml' && ext !== '.yml') {
        continue;
      }

      const filePath = path.join(runbookDir, entry);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        this.runbooks.set(filePath, { def: null, path: filePath, errors: ['Failed to read file'] });
        continue;
      }

      const result = parseRunbook(content);
      this.runbooks.set(filePath, {
        def: result.runbook,
        path: filePath,
        errors: result.errors,
      });
    }
  }

  getRunbooks(): Array<{ name: string; description: string; path: string; valid: boolean; errors: string[] }> {
    const result: Array<{ name: string; description: string; path: string; valid: boolean; errors: string[] }> = [];
    for (const [, entry] of this.runbooks) {
      result.push({
        name: entry.def?.name ?? path.basename(entry.path, path.extname(entry.path)),
        description: entry.def?.description ?? '',
        path: entry.path,
        valid: entry.def !== null && entry.errors.length === 0,
        errors: entry.errors,
      });
    }
    return result;
  }

  getRunbook(filePath: string): RunbookDef | null {
    const entry = this.runbooks.get(filePath);
    return entry?.def ?? null;
  }

  getErrors(filePath: string): string[] {
    const entry = this.runbooks.get(filePath);
    return entry?.errors ?? [];
  }

  async refresh(): Promise<void> {
    this.runbooks.clear();
    await this.discover();
  }

  get count(): number {
    return this.runbooks.size;
  }
}

// ---------------------------------------------------------------------------
// Input placeholder resolution
// ---------------------------------------------------------------------------

export function resolveParams(
  params: Record<string, string>,
  inputs: Record<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    resolved[key] = value.replace(
      /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
      (_, name) => inputs[name] ?? '',
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// RunbookEngine — executes runbook steps sequentially with output capture
// ---------------------------------------------------------------------------

const CLI_TIMEOUT_MS = 60_000;
const MCP_TIMEOUT_MS = 30_000;
const MCP_KILL_GRACE_MS = 2_000;

export class RunbookEngine {
  constructor(
    private readonly workspaceRoot: string,
    private readonly mcpServerPath: string | (() => string),
    private readonly mcpNodeExecutable: NodeExecutableResolver = 'node',
  ) {}

  async *executeRunbook(
    runbook: RunbookDef,
    runbookPath: string,
    inputs: Record<string, string>,
    options: { dryRun: boolean; onConfirm: () => Promise<boolean> },
  ): AsyncGenerator<StepResult, RunbookRunRecord> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let aborted = false;

    for (let i = 0; i < runbook.steps.length; i++) {
      const step = runbook.steps[i];
      const resolvedParams = resolveParams(step.params, inputs);
      const description = step.description || `Step ${i + 1}: ${step.action}`;
      const stepStart = Date.now();

      // Dry-run mode: describe planned action without executing
      if (options.dryRun) {
        let output: string;
        switch (step.action) {
          case 'cli':
            output = `[DRY RUN] Would execute: ${resolvedParams.command}`;
            break;
          case 'mcp':
            output = `[DRY RUN] Would call MCP tool: ${resolvedParams.tool}`;
            break;
          case 'open':
            output = `[DRY RUN] Would open: ${resolvedParams.file}`;
            break;
          case 'note':
            output = `[DRY RUN] Would append to: ${resolvedParams.file}`;
            break;
          case 'confirm':
            output = `[DRY RUN] Would ask: ${resolvedParams.message || 'Continue?'}`;
            break;
          default:
            output = `[DRY RUN] Unknown action: ${step.action}`;
        }

        const result: StepResult = {
          stepIndex: i,
          action: step.action,
          description,
          status: 'dry-run',
          output,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        yield result;
        continue;
      }

      // Live execution
      let result: StepResult;

      switch (step.action) {
        case 'cli': {
          const cliResult = await this.executeCli(resolvedParams.command);
          result = {
            stepIndex: i,
            action: 'cli',
            description,
            status: cliResult.exitCode === 0 ? 'success' : 'failure',
            output: cliResult.output,
            durationMs: Date.now() - stepStart,
          };
          break;
        }
        case 'mcp': {
          const mcpResult = await this.executeMcp(
            resolvedParams.tool,
            resolvedParams.input || '{}',
          );
          result = {
            stepIndex: i,
            action: 'mcp',
            description,
            status: mcpResult.success ? 'success' : 'failure',
            output: mcpResult.output,
            durationMs: Date.now() - stepStart,
          };
          break;
        }
        case 'open': {
          const openResult = await this.executeOpen(resolvedParams.file);
          result = {
            stepIndex: i,
            action: 'open',
            description,
            status: openResult.success ? 'success' : 'failure',
            output: openResult.output,
            durationMs: Date.now() - stepStart,
          };
          break;
        }
        case 'note': {
          const noteResult = await this.executeNote(
            resolvedParams.file,
            resolvedParams.content,
          );
          result = {
            stepIndex: i,
            action: 'note',
            description,
            status: noteResult.success ? 'success' : 'failure',
            output: noteResult.output,
            durationMs: Date.now() - stepStart,
          };
          break;
        }
        case 'confirm': {
          const confirmed = await options.onConfirm();
          if (confirmed) {
            result = {
              stepIndex: i,
              action: 'confirm',
              description,
              status: 'success',
              output: 'User confirmed: continue',
              durationMs: Date.now() - stepStart,
            };
          } else {
            result = {
              stepIndex: i,
              action: 'confirm',
              description,
              status: 'failure',
              output: 'User aborted',
              durationMs: Date.now() - stepStart,
            };
            aborted = true;
          }
          break;
        }
        default: {
          result = {
            stepIndex: i,
            action: step.action,
            description,
            status: 'failure',
            output: `Unknown action: ${step.action}`,
            durationMs: Date.now() - stepStart,
          };
        }
      }

      stepResults.push(result);
      yield result;

      // Halt on failure (non-confirm) or abort
      if (aborted || (result.status === 'failure' && step.action !== 'confirm')) {
        break;
      }
    }

    const endTime = Date.now();
    return {
      id: `RUN-${Date.now()}`,
      runbookName: runbook.name,
      runbookPath,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      status: aborted
        ? 'aborted'
        : stepResults.every((r) => r.status === 'success' || r.status === 'dry-run')
          ? 'success'
          : 'failure',
      stepResults,
      inputs,
      dryRun: options.dryRun,
    };
  }

  // ---------------------------------------------------------------------------
  // Step executors
  // ---------------------------------------------------------------------------

  private executeCli(command: string): Promise<{ output: string; exitCode: number }> {
    const args = tokenizeRunbookCommand(command);
    const cliPath =
      vscode.workspace.getConfiguration('thruntGod').get<string>('cli.path') ||
      path.join(this.workspaceRoot, 'dist', 'thrunt-god', 'bin', 'thrunt-tools.cjs');

    return new Promise((resolve) => {
      let output = '';
      let settled = false;

      const child = spawn(process.execPath, [cliPath, ...args], {
        cwd: this.workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        resolve({ output: output + '\n[Timed out after 60s]', exitCode: 1 });
      }, CLI_TIMEOUT_MS);

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      child.stderr.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({ output, exitCode: code ?? 1 });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({ output: err.message, exitCode: 1 });
      });
    });
  }

  private executeMcp(
    toolName: string,
    input: string,
  ): Promise<{ output: string; success: boolean }> {
    const configuredPath = typeof this.mcpServerPath === 'function'
      ? this.mcpServerPath()
      : this.mcpServerPath;
    const serverPath = configuredPath.trim()
      ? path.resolve(configuredPath)
      : '';
    if (!serverPath) {
      return Promise.resolve({
        output: 'MCP server path is not configured',
        success: false,
      });
    }
    if (!fs.existsSync(serverPath)) {
      return Promise.resolve({
        output: `MCP server not found: ${serverPath}`,
        success: false,
      });
    }

    return new Promise((resolve) => {
      let stdout = '';
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;
      let nodeExecutable: string;

      try {
        nodeExecutable = resolveNodeExecutable(this.mcpNodeExecutable);
      } catch (err) {
        resolve({
          output: err instanceof Error ? err.message : String(err),
          success: false,
        });
        return;
      }

      const child = spawn(
        nodeExecutable,
        [serverPath, '--run-tool', toolName, '--input', input],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            /* already dead */
          }
        }, MCP_KILL_GRACE_MS);
        resolve({ output: `MCP tool timed out after ${MCP_TIMEOUT_MS}ms`, success: false });
      }, MCP_TIMEOUT_MS);

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;
        resolve({ output: stdout, success: code === 0 });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;
        resolve({ output: err.message, success: false });
      });
    });
  }

  private async executeOpen(filePath: string): Promise<{ success: boolean; output: string }> {
    try {
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.workspaceRoot, filePath);
      const normalizedResolved = path.resolve(resolved);
      const normalizedRoot = path.resolve(this.workspaceRoot);
      if (!normalizedResolved.startsWith(normalizedRoot + path.sep) && normalizedResolved !== normalizedRoot) {
        return { success: false, output: `Path traversal blocked: ${filePath} resolves outside workspace` };
      }
      const uri = vscode.Uri.file(normalizedResolved);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      return { success: true, output: `Opened: ${filePath}` };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async executeNote(
    filePath: string,
    content: string,
  ): Promise<{ success: boolean; output: string }> {
    try {
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.workspaceRoot, filePath);
      const normalizedResolved = path.resolve(resolved);
      const normalizedRoot = path.resolve(this.workspaceRoot);
      if (!normalizedResolved.startsWith(normalizedRoot + path.sep) && normalizedResolved !== normalizedRoot) {
        return { success: false, output: `Path traversal blocked: ${filePath} resolves outside workspace` };
      }
      fs.appendFileSync(normalizedResolved, '\n' + content + '\n');
      return { success: true, output: 'Appended to ' + filePath };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
