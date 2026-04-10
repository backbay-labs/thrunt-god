import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import type { McpToolInfo } from '../shared/mcp-control';

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

  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly mcpServerPath: string
  ) {}

  getServerPath(): string {
    return this.mcpServerPath;
  }

  getStatus(): MCPStatus {
    return { ...this.status, lastHealthCheck: this.status.lastHealthCheck ? { ...this.status.lastHealthCheck } : null };
  }

  async runHealthCheck(): Promise<MCPHealthResult> {
    this.status.connection = 'checking';
    this._onDidChange.fire(this.getStatus());
    this.outputChannel.appendLine('[MCP] Running health check...');

    return new Promise<MCPHealthResult>((resolve) => {
      let stdout = '';
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const child = spawn(process.execPath, [this.mcpServerPath, '--health'], {
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
    return new Promise<McpToolInfo[]>((resolve) => {
      let stdout = '';
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const child = spawn(process.execPath, [this.mcpServerPath, '--list-tools'], {
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
    if (this.serverProcess) return;

    this.outputChannel.appendLine('[MCP] Starting server...');
    const child = spawn(process.execPath, [this.mcpServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.serverProcess = child;

    child.stderr.on('data', (data: Buffer) => {
      this.outputChannel.appendLine(`[MCP] ${data.toString().trimEnd()}`);
    });

    child.on('spawn', () => {
      this.status.connection = 'connected';
      this.status.hasError = false;
      this._onDidChange.fire(this.getStatus());
      this.outputChannel.appendLine('[MCP] Server started');
    });

    child.on('close', (code) => {
      if (this.serverProcess === child) {
        this.serverProcess = null;
      }
      this.status.connection = 'disconnected';
      this.status.hasError = true;
      this._onDidChange.fire(this.getStatus());
      this.outputChannel.appendLine(`[MCP] Server exited (code ${code})`);
    });

    child.on('error', (err) => {
      if (this.serverProcess === child) {
        this.serverProcess = null;
      }
      this.status.connection = 'disconnected';
      this.status.hasError = true;
      this._onDidChange.fire(this.getStatus());
      this.outputChannel.appendLine(`[MCP] Server error: ${err.message}`);
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async stop(): Promise<void> {
    if (!this.serverProcess) return;

    this.outputChannel.appendLine('[MCP] Stopping server...');
    const proc = this.serverProcess;
    this.serverProcess = null;

    return new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
        resolve();
      }, KILL_GRACE_MS);

      proc.once('close', () => {
        clearTimeout(killTimer);
        resolve();
      });

      proc.kill('SIGTERM');

      this.status.connection = 'disconnected';
      this._onDidChange.fire(this.getStatus());
    });
  }

  dispose(): void {
    void this.stop();
    this._onDidChange.dispose();
  }

  private applyHealthResult(result: MCPHealthResult): void {
    this.status.lastHealthCheck = result;
    this.status.connection = result.status === 'healthy' ? 'connected' : 'disconnected';
    this.status.hasError = result.status !== 'healthy';
    this.outputChannel.appendLine(`[MCP] Health check: ${result.status} (tools: ${result.toolCount}, db: ${result.dbSizeBytes} bytes)`);
    this._onDidChange.fire(this.getStatus());
  }
}
