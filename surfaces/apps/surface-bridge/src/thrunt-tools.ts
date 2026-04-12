import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from './logger.ts';

export interface ThruntToolsResolution {
  toolsPath: string | null;
  argvPrefix: string[];
  diagnostics: string[];
}

export interface ThruntCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string[];
  toolsPath: string | null;
  diagnostics: string[];
  timedOut: boolean;
}

export interface ThruntCommandOptions {
  timeoutMs?: number;
  logger?: Logger;
}

export function resolveThruntTools(projectRoot: string, configuredPath?: string | null): ThruntToolsResolution {
  const diagnostics: string[] = [];
  const candidates: string[] = [];

  const explicit = configuredPath?.trim() || process.env.THRUNT_TOOLS_PATH?.trim() || null;
  if (explicit) {
    const resolved = path.isAbsolute(explicit) ? explicit : path.resolve(projectRoot, explicit);
    diagnostics.push(`configured:${resolved}`);
    if (fs.existsSync(resolved)) {
      return {
        toolsPath: resolved,
        argvPrefix: buildArgvPrefix(resolved),
        diagnostics,
      };
    }
    diagnostics.push(`missing:${resolved}`);
  }

  candidates.push(path.join(projectRoot, 'node_modules', '.bin', 'thrunt-tools'));
  candidates.push(path.join(projectRoot, 'node_modules', 'thrunt-god', 'bin', 'thrunt-tools.cjs'));
  candidates.push(path.join(projectRoot, 'thrunt-god', 'bin', 'thrunt-tools.cjs'));
  candidates.push(path.join(projectRoot, 'bin', 'thrunt-tools.cjs'));

  let dir = path.resolve(projectRoot);
  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(dir, 'thrunt-god', 'bin', 'thrunt-tools.cjs'));
    candidates.push(path.join(dir, 'bin', 'thrunt-tools.cjs'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    diagnostics.push(`candidate:${candidate}`);
    if (!fs.existsSync(candidate)) continue;

    return {
      toolsPath: candidate,
      argvPrefix: buildArgvPrefix(candidate),
      diagnostics,
    };
  }

  diagnostics.push('resolution:failed');
  return {
    toolsPath: null,
    argvPrefix: [],
    diagnostics,
  };
}

export async function runThruntCommand(
  projectRoot: string,
  args: string[],
  configuredPath?: string | null,
  options?: ThruntCommandOptions,
): Promise<ThruntCommandResult> {
  const resolved = resolveThruntTools(projectRoot, configuredPath);
  if (!resolved.toolsPath) {
    return {
      ok: false,
      stdout: '',
      stderr: 'Unable to resolve thrunt-tools.cjs',
      exitCode: 1,
      command: [],
      toolsPath: null,
      diagnostics: resolved.diagnostics,
      timedOut: false,
    };
  }

  const command = [...resolved.argvPrefix, ...args];
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const GRACE_MS = 5_000;
  const start = Date.now();
  let timedOut = false;

  const proc = Bun.spawn(command, {
    cwd: projectRoot,
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill('SIGTERM');
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* process may already be dead */ }
    }, GRACE_MS);
  }, timeoutMs);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  clearTimeout(timer);

  const durationMs = Date.now() - start;

  if (options?.logger) {
    options.logger.info('subprocess', 'exec', {
      command: command.join(' '),
      exitCode,
      timedOut,
      durationMs,
    });
  }

  if (timedOut) {
    return {
      ok: false,
      stdout,
      stderr: `Process timed out after ${timeoutMs}ms`,
      exitCode,
      command,
      toolsPath: resolved.toolsPath,
      diagnostics: resolved.diagnostics,
      timedOut: true,
    };
  }

  return {
    ok: exitCode === 0,
    stdout,
    stderr,
    exitCode,
    command,
    toolsPath: resolved.toolsPath,
    diagnostics: resolved.diagnostics,
    timedOut: false,
  };
}

function buildArgvPrefix(toolsPath: string): string[] {
  return toolsPath.endsWith('.cjs') || toolsPath.endsWith('.js')
    ? [process.execPath, toolsPath]
    : [toolsPath];
}
