import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { StepAction, RunbookDef, RunbookInput, RunbookStep } from '../shared/runbook';

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

  const steps: RunbookStep[] = (d.steps as Record<string, unknown>[]).map((s) => ({
    action: s.action as StepAction,
    ...(s.description !== undefined ? { description: s.description as string } : {}),
    params: s.params as Record<string, string>,
  }));

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

  getRunbooks(): Array<{ name: string; path: string; valid: boolean; errors: string[] }> {
    const result: Array<{ name: string; path: string; valid: boolean; errors: string[] }> = [];
    for (const [, entry] of this.runbooks) {
      result.push({
        name: entry.def?.name ?? path.basename(entry.path),
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
