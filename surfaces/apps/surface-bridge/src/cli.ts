#!/usr/bin/env bun
/**
 * Surface Bridge CLI — starts the local HTTP + WebSocket server.
 */

import { startBridge } from './server.ts';

const port = Number(process.env.THRUNT_BRIDGE_PORT) || 7483;
const host = process.env.THRUNT_BRIDGE_HOST || '127.0.0.1';
const projectRoot = process.env.THRUNT_PROJECT_ROOT || process.cwd();
const mockMode = process.env.THRUNT_MOCK_MODE === 'true';
const toolsPath = process.env.THRUNT_TOOLS_PATH || null;
const allowedExtensionIds = (process.env.THRUNT_ALLOWED_EXTENSION_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

startBridge({ port, host, projectRoot, mockMode, toolsPath, allowedExtensionIds });
