import * as fs from 'fs';
import * as path from 'path';

export const THRUNT_MCP_SERVER_NAME = 'thruntGod';

export interface VSCodeMcpStdioServerConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface VSCodeMcpConfiguration {
  servers?: Record<string, unknown>;
  inputs?: unknown[];
  [key: string]: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildThruntWorkspaceMcpServerConfig(
  nodeExecutable: string,
  serverPath: string,
  env?: Record<string, string>
): VSCodeMcpStdioServerConfig {
  const config: VSCodeMcpStdioServerConfig = {
    type: 'stdio',
    command: nodeExecutable,
    args: [serverPath],
  };

  if (env && Object.keys(env).length > 0) {
    config.env = { ...env };
  }

  return config;
}

export function mergeWorkspaceMcpConfiguration(
  currentConfig: unknown,
  serverConfig: VSCodeMcpStdioServerConfig,
  serverName = THRUNT_MCP_SERVER_NAME
): VSCodeMcpConfiguration {
  const base = isObject(currentConfig) ? { ...currentConfig } : {};
  const servers = isObject(base.servers) ? { ...base.servers } : {};
  servers[serverName] = serverConfig;
  return {
    ...base,
    servers,
  };
}

export function upsertWorkspaceMcpConfiguration(
  workspaceRoot: string,
  serverConfig: VSCodeMcpStdioServerConfig,
  serverName = THRUNT_MCP_SERVER_NAME
): { configPath: string; changed: boolean } {
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const configPath = path.join(vscodeDir, 'mcp.json');

  let currentConfig: unknown = {};
  let previousText = '';
  if (fs.existsSync(configPath)) {
    previousText = fs.readFileSync(configPath, 'utf8');
    try {
      currentConfig = JSON.parse(previousText);
    } catch {
      throw new Error(`Workspace MCP configuration is not valid JSON: ${configPath}`);
    }
  }

  const nextConfig = mergeWorkspaceMcpConfiguration(currentConfig, serverConfig, serverName);
  const nextText = `${JSON.stringify(nextConfig, null, 2)}\n`;

  if (nextText === previousText) {
    return { configPath, changed: false };
  }

  fs.mkdirSync(vscodeDir, { recursive: true });
  fs.writeFileSync(configPath, nextText, 'utf8');
  return { configPath, changed: true };
}
