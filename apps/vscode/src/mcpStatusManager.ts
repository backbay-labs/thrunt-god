import * as fs from 'fs';
import * as path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import type { McpToolInfo } from '../shared/mcp-control';
import { resolveNodeExecutable, type NodeExecutableResolver } from './nodeRuntime';

export interface MCPHealthResult {
  status: 'healthy' | 'unhealthy' | 'timeout';
  toolCount: number;
  dbSizeBytes: number;
  dbTableCount: number;
  uptimeMs: number;
  timestamp: number;
  error?: string;
}

export type MCPConnectionStatus = 'connected' | 'disconnected' | 'checking';

export interface MCPStatus {
  connection: MCPConnectionStatus;
  profile: string | null;
  lastHealthCheck: MCPHealthResult | null;
  hasError: boolean;
}

const HEALTH_CHECK_TIMEOUT_MS = 10_000;
const KILL_GRACE_MS = 2_000;
const READY_LOG_MARKER = 'MCP server started on stdio';
type MCPServerPathResolver = string | (() => string);

export class MCPStatusManager implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<MCPStatus>();
  readonly onDidChange: vscode.Event<MCPStatus> = this._onDidChange.event;

  private status: MCPStatus = {
    connection: 'disconnected',
    profile: null,
    lastHealthCheck: null,
    hasError: false,
  };

  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private expectedExitProcess: ChildProcessWithoutNullStreams | null = null;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;

  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly mcpServerPath: MCPServerPathResolver,
    private readonly mcpNodeExecutable: NodeExecutableResolver = 'node'
  ) {}

  getServerPath(): string {
    return typeof this.mcpServerPath === 'function'
      ? this.mcpServerPath()
      : this.mcpServerPath;
  }

  getNodeExecutable(): string {
    return resolveNodeExecutable(this.mcpNodeExecutable);
  }

  getStatus(): MCPStatus {
    return { ...this.status, lastHealthCheck: this.status.lastHealthCheck ? { ...this.status.lastHealthCheck } : null };
  }

  async runHealthCheck(): Promise<MCPHealthResult> {
    let serverPath: string;
    let nodeExecutable: string;
    try {
      serverPath = this.resolveServerPath();
      nodeExecutable = this.getNodeExecutable();
    } catch (err) {
      const result = this.buildInvalidPathHealthResult(err);
      this.applyHealthResult(result);
      return result;
    }

    this.status.connection = 'checking';
    this._onDidChange.fire(this.getStatus());
    this.outputChannel.appendLine('[MCP] Running health check...');

    return new Promise<MCPHealthResult>((resolve) => {
      let stdout = '';
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const child = spawn(nodeExecutable, [serverPath, '--health'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }, KILL_GRACE_MS);

        const result: MCPHealthResult = {
          status: 'timeout',
          toolCount: 0,
          dbSizeBytes: 0,
          dbTableCount: 0,
          uptimeMs: HEALTH_CHECK_TIMEOUT_MS,
          timestamp: Date.now(),
          error: 'Health check timed out after 10s',
        };
        this.applyHealthResult(result);
        resolve(result);
      }, HEALTH_CHECK_TIMEOUT_MS);

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        this.outputChannel.appendLine(`[MCP stderr] ${data.toString().trimEnd()}`);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;

        try {
          const parsed = JSON.parse(stdout.trim());
          const result: MCPHealthResult = {
            status: parsed.status === 'healthy' ? 'healthy' : 'unhealthy',
            toolCount: parsed.toolCount ?? 0,
            dbSizeBytes: parsed.dbSizeBytes ?? 0,
            dbTableCount: parsed.dbTableCount ?? 0,
            uptimeMs: parsed.uptimeMs ?? 0,
            timestamp: Date.now(),
            error: parsed.error,
          };
          this.applyHealthResult(result);
          resolve(result);
        } catch {
          const result: MCPHealthResult = {
            status: 'unhealthy',
            toolCount: 0,
            dbSizeBytes: 0,
            dbTableCount: 0,
            uptimeMs: 0,
            timestamp: Date.now(),
            error: `Health check failed (exit code ${code}): ${stdout.trim() || 'no output'}`,
          };
          this.applyHealthResult(result);
          resolve(result);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;

        const result: MCPHealthResult = {
          status: 'unhealthy',
          toolCount: 0,
          dbSizeBytes: 0,
          dbTableCount: 0,
          uptimeMs: 0,
          timestamp: Date.now(),
          error: `Spawn error: ${err.message}`,
        };
        this.applyHealthResult(result);
        resolve(result);
      });
    });
  }

  async listTools(): Promise<McpToolInfo[]> {
    let serverPath: string;
    let nodeExecutable: string;
    try {
      serverPath = this.resolveServerPath();
      nodeExecutable = this.getNodeExecutable();
    } catch (err) {
      this.outputChannel.appendLine(
        `[MCP] List tools failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }

    return new Promise<McpToolInfo[]>((resolve) => {
      let stdout = '';
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const child = spawn(nodeExecutable, [serverPath, '--list-tools'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }, KILL_GRACE_MS);
        this.outputChannel.appendLine('[MCP] List tools timed out after 10s');
        resolve([]);
      }, HEALTH_CHECK_TIMEOUT_MS);

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        this.outputChannel.appendLine(`[MCP stderr] ${data.toString().trimEnd()}`);
      });

      child.on('close', () => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;

        try {
          const tools = JSON.parse(stdout.trim()) as McpToolInfo[];
          resolve(Array.isArray(tools) ? tools : []);
        } catch {
          this.outputChannel.appendLine('[MCP] Failed to parse list-tools output');
          resolve([]);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;
        this.outputChannel.appendLine(`[MCP] List tools spawn error: ${err.message}`);
        resolve([]);
      });
    });
  }

  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.serverProcess) return;
    if (this.stopPromise) {
      await this.stopPromise;
    }

    const serverPath = this.resolveServerPath();
    const nodeExecutable = this.getNodeExecutable();
    this.outputChannel.appendLine(`[MCP] Starting server from ${serverPath} with ${nodeExecutable}...`);
    this.status.connection = 'checking';
    this.status.hasError = false;
    this._onDidChange.fire(this.getStatus());

    const child = spawn(nodeExecutable, [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.serverProcess = child;
    this.expectedExitProcess = null;

    this.startPromise = new Promise<void>((resolve, reject) => {
      let ready = false;
      let settled = false;
      let startupLog = '';
      let startupFailureMessage: string | null = null;

      const finishError = (message: string, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimer);
        startupFailureMessage = message;
        if (this.serverProcess === child) {
          this.serverProcess = null;
        }
        this.status.connection = 'disconnected';
        this.status.hasError = true;
        this._onDidChange.fire(this.getStatus());
        this.outputChannel.appendLine(`[MCP] ${message}`);
        reject(error ?? new Error(message));
      };

      const startupTimer = setTimeout(() => {
        startupFailureMessage = `MCP server did not report ready within ${HEALTH_CHECK_TIMEOUT_MS}ms`;
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore; close/error handlers will settle
        }
      }, HEALTH_CHECK_TIMEOUT_MS);

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        startupLog += text;
        const trimmed = text.trimEnd();
        if (trimmed) {
          this.outputChannel.appendLine(`[MCP] ${trimmed}`);
        }

        if (!ready && startupLog.includes(READY_LOG_MARKER)) {
          ready = true;
          settled = true;
          clearTimeout(startupTimer);
          this.status.connection = 'connected';
          this.status.hasError = false;
          this._onDidChange.fire(this.getStatus());
          this.outputChannel.appendLine('[MCP] Server started');
          resolve();
        }
      });

      child.on('close', (code, signal) => {
        clearTimeout(startupTimer);
        const intentional = this.expectedExitProcess === child;
        if (this.serverProcess === child) {
          this.serverProcess = null;
        }
        if (intentional) {
          this.expectedExitProcess = null;
        }
        this.status.connection = 'disconnected';
        this.status.hasError = startupFailureMessage ? true : !intentional;
        this._onDidChange.fire(this.getStatus());
        this.outputChannel.appendLine(
          `[MCP] Server exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`
        );

        if (!settled) {
          if (intentional) {
            settled = true;
            resolve();
            return;
          }

          finishError(
            this.formatStartupFailure(code, signal, startupFailureMessage, startupLog)
          );
        }
      });

      child.on('error', (err) => {
        clearTimeout(startupTimer);
        finishError(`Server error: ${err.message}`, err);
      });
    }).finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async stop(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }
    if (!this.serverProcess) return;

    this.outputChannel.appendLine('[MCP] Stopping server...');
    const proc = this.serverProcess;
    this.expectedExitProcess = proc;

    this.stopPromise = new Promise<void>((resolve) => {
      const finish = () => {
        this.stopPromise = null;
        resolve();
      };

      proc.once('close', () => {
        clearTimeout(killTimer);
        finish();
      });

      const killTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          finish();
        }
      }, KILL_GRACE_MS);

      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(killTimer);
        finish();
      }

      this.status.connection = 'disconnected';
      this._onDidChange.fire(this.getStatus());
    });

    return this.stopPromise;
  }

  dispose(): void {
    void this.stop();
    this._onDidChange.dispose();
  }

  private applyHealthResult(result: MCPHealthResult): void {
    this.status.lastHealthCheck = result;
    this.status.connection = this.serverProcess ? 'connected' : 'disconnected';
    this.status.hasError = result.status !== 'healthy';
    this.outputChannel.appendLine(`[MCP] Health check: ${result.status} (tools: ${result.toolCount}, db: ${result.dbSizeBytes} bytes)`);
    this._onDidChange.fire(this.getStatus());
  }

  private resolveServerPath(): string {
    const configured = this.getServerPath().trim();
    if (!configured) {
      throw new Error('MCP server path is not configured');
    }

    const resolved = path.resolve(configured);
    if (!fs.existsSync(resolved)) {
      throw new Error(`MCP server not found: ${resolved}`);
    }

    return resolved;
  }

  private buildInvalidPathHealthResult(err: unknown): MCPHealthResult {
    return {
      status: 'unhealthy',
      toolCount: 0,
      dbSizeBytes: 0,
      dbTableCount: 0,
      uptimeMs: 0,
      timestamp: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  private formatStartupFailure(
    code: number | null,
    signal: NodeJS.Signals | null,
    startupFailureMessage: string | null,
    startupLog: string
  ): string {
    const details = startupLog
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(' | ');

    const base =
      startupFailureMessage
      ?? `MCP server exited before reporting ready (code ${code ?? 'null'}, signal ${signal ?? 'none'})`;

    return details ? `${base}: ${details}` : base;
  }
}
