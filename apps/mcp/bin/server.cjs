#!/usr/bin/env node
'use strict';

// All logging to stderr (JSON-RPC only on stdout)
const log = (...args) => console.error('[thrunt-mcp]', ...args);

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { openIntelDb } = require('../lib/intel.cjs');
const { createShutdownHandler } = require('../lib/lifecycle.cjs');
const { registerTools } = require('../lib/tools.cjs');
const { registerPrompts } = require('../lib/prompts.cjs');

const dbOpts = {};
if (process.env.THRUNT_INTEL_DB_DIR) {
  dbOpts.dbDir = process.env.THRUNT_INTEL_DB_DIR;
}

// --- Health check mode (no MCP server, no transport) ---
if (process.argv.includes('--health')) {
  const startTime = Date.now();
  try {
    const db = openIntelDb(dbOpts);
    const tables = db.prepare(
      "SELECT count(*) as c FROM sqlite_master WHERE type='table'"
    ).get();
    const dbPath = require('path').join(
      process.env.THRUNT_INTEL_DB_DIR || require('path').join(require('os').homedir(), '.thrunt'),
      'intel.db'
    );
    const dbSize = require('fs').existsSync(dbPath)
      ? require('fs').statSync(dbPath).size
      : 0;

    const result = {
      status: 'healthy',
      toolCount: 10,
      dbSizeBytes: dbSize,
      dbTableCount: tables.c,
      uptimeMs: Date.now() - startTime,
      serverVersion: '0.1.0',
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    db.close();
    process.exit(0);
  } catch (err) {
    const result = {
      status: 'unhealthy',
      toolCount: 0,
      dbSizeBytes: 0,
      dbTableCount: 0,
      uptimeMs: Date.now() - startTime,
      error: err.message,
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(1);
  }
}

// --- List tools mode (output tool metadata as JSON, no transport) ---
if (process.argv.includes('--list-tools')) {
  const tools = [
    { name: 'lookup_technique', description: 'Look up an ATT&CK technique by ID (e.g., T1059.001). Returns technique name, description, tactics, platforms, data sources, and MITRE URL.', inputSchema: { technique_id: 'string (ATT&CK technique ID, e.g. T1059.001)' } },
    { name: 'search_techniques', description: 'Full-text search across ATT&CK technique names and descriptions. Supports filtering by tactic and platform.', inputSchema: { query: 'string', tactic: 'string?', platform: 'string?', limit: 'number (1-100, default 20)' } },
    { name: 'lookup_group', description: 'Look up an ATT&CK threat group by ID or name. Returns group details with associated techniques and software/malware.', inputSchema: { group_id: 'string (group ID e.g. G0007 or name)' } },
    { name: 'generate_layer', description: 'Generate an ATT&CK Navigator v4.5 layer JSON. Supports custom technique sets, group-based layers, coverage snapshots, and gap analysis.', inputSchema: { mode: 'custom|group|coverage|gap', name: 'string', technique_ids: 'string[]?', group_id: 'string?', description: 'string?' } },
    { name: 'analyze_coverage', description: 'Analyze detection coverage for a threat group or named threat profile. Returns per-tactic breakdown.', inputSchema: { group_id: 'string?', profile: 'string?', include_techniques: 'boolean (default true)' } },
    { name: 'compare_detections', description: 'Compare detection coverage across sources (Sigma, ESCU, Elastic, KQL) for a technique or topic.', inputSchema: { technique_id: 'string?', query: 'string?' } },
    { name: 'suggest_detections', description: 'Suggest detections for an uncovered technique based on rules from the same tactic family.', inputSchema: { technique_id: 'string (ATT&CK technique ID)' } },
    { name: 'query_knowledge', description: 'Search the hunt knowledge graph for entities and their relationships.', inputSchema: { query: 'string', type: 'threat_actor|technique|detection|campaign|tool|vulnerability|data_source?', limit: 'number (1-50, default 10)' } },
    { name: 'log_decision', description: 'Log a hunt decision with reasoning for future reference.', inputSchema: { case_slug: 'string', technique_id: 'string', decision: 'string', reasoning: 'string?', context: 'string?' } },
    { name: 'log_learning', description: 'Log a hunt learning or pattern for future reference.', inputSchema: { topic: 'string', pattern: 'string', detail: 'string?', technique_ids: 'string?', case_slug: 'string?' } },
  ];
  process.stdout.write(JSON.stringify(tools) + '\n');
  process.exit(0);
}

// --- Run tool mode (one-shot tool execution, no transport) ---
const runToolIdx = process.argv.indexOf('--run-tool');
if (runToolIdx !== -1) {
  const toolName = process.argv[runToolIdx + 1];
  const inputIdx = process.argv.indexOf('--input');
  const inputJson = inputIdx !== -1 ? process.argv[inputIdx + 1] : '{}';

  if (!toolName) {
    process.stdout.write(JSON.stringify({ error: 'Missing tool name after --run-tool' }) + '\n');
    process.exit(1);
  }

  const handlers = require('../lib/tools.cjs');
  const handlerMap = {
    lookup_technique: handlers.handleLookupTechnique,
    search_techniques: handlers.handleSearchTechniques,
    lookup_group: handlers.handleLookupGroup,
    generate_layer: handlers.handleGenerateLayer,
    analyze_coverage: handlers.handleAnalyzeCoverage,
    compare_detections: handlers.handleCompareDetections,
    suggest_detections: handlers.handleSuggestDetections,
    query_knowledge: handlers.handleQueryKnowledge,
    log_decision: handlers.handleLogDecision,
    log_learning: handlers.handleLogLearning,
  };

  const handler = handlerMap[toolName];
  if (!handler) {
    process.stdout.write(JSON.stringify({ error: `Unknown tool: ${toolName}` }) + '\n');
    process.exit(1);
  }

  try {
    const db = openIntelDb(dbOpts);
    const args = JSON.parse(inputJson);
    const result = handler(db, args);
    // Handle both sync and async results
    Promise.resolve(result).then((res) => {
      process.stdout.write(JSON.stringify(res) + '\n');
      db.close();
      process.exit(0);
    }).catch((err) => {
      process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
      db.close();
      process.exit(1);
    });
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  }
}

const server = new McpServer({
  name: 'thrunt-mcp',
  version: '0.1.0',
});

log('Opening intel database...');
const db = openIntelDb(dbOpts);
log('Intel database ready');

const shutdown = createShutdownHandler({ server, db, log });

registerTools(server, db);
log('Tools registered');

registerPrompts(server, db);
log('Prompts registered');

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  log('MCP server started on stdio');
}).catch(err => {
  log('Failed to start:', err.message);
  void shutdown(1);
});

process.on('SIGINT', () => { void shutdown(0); });
process.on('SIGTERM', () => { void shutdown(0); });
