#!/usr/bin/env bun

import * as path from 'node:path';

import { startBridge } from '../apps/surface-bridge/src/server.ts';

const projectRoot = path.resolve(
  readFlag('project-root')
    || process.env.THRUNT_PROJECT_ROOT
    || path.resolve(import.meta.dir, '../../thrunt-god/examples/oauth-session-hijack'),
);
const toolsPath = path.resolve(
  readFlag('tools-path')
    || process.env.THRUNT_TOOLS_PATH
    || path.resolve(import.meta.dir, '../../thrunt-god/bin/thrunt-tools.cjs'),
);
const port = Number(readFlag('port') || process.env.THRUNT_BRIDGE_PORT || '7483');
const host = readFlag('host') || process.env.THRUNT_BRIDGE_HOST || '127.0.0.1';
const mockMode = readFlag('mock-mode') === 'true' || process.env.THRUNT_MOCK_MODE === 'true';

startBridge({
  projectRoot,
  toolsPath,
  port,
  host,
  mockMode,
});

function readFlag(name: string): string | null {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}
