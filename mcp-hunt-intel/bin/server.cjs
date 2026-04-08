#!/usr/bin/env node
'use strict';

// All logging to stderr (JSON-RPC only on stdout)
const log = (...args) => console.error('[mcp-hunt-intel]', ...args);

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { openIntelDb } = require('../lib/intel.cjs');
const { registerTools } = require('../lib/tools.cjs');
const { registerPrompts } = require('../lib/prompts.cjs');

const server = new McpServer({
  name: 'mcp-hunt-intel',
  version: '0.1.0',
});

const dbOpts = {};
if (process.env.THRUNT_INTEL_DB_DIR) {
  dbOpts.dbDir = process.env.THRUNT_INTEL_DB_DIR;
}
log('Opening intel database...');
const db = openIntelDb(dbOpts);
log('Intel database ready');

registerTools(server, db);
log('Tools registered');

registerPrompts(server, db);
log('Prompts registered');

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  log('MCP server started on stdio');
}).catch(err => {
  log('Failed to start:', err.message);
  process.exit(1);
});

let closed = false;
function shutdown() { if (!closed) { closed = true; db.close(); } process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
