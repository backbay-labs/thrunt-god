'use strict';

const { z } = require('zod');
const {
  lookupTechnique,
  searchTechniques,
  lookupGroup,
  getGroupTechniques,
  getGroupSoftware,
  getTechniquesByTactic,
  getAllTactics,
} = require('./intel.cjs');
const { buildNavigatorLayer } = require('./layers.cjs');

// ─── Timeout wrapper ───────────────────────────────────────────────────────

const TIMEOUT_MS = parseInt(process.env.THRUNT_MCP_TIMEOUT, 10) || 30000;

/**
 * Wrap a tool handler with an abort-on-timeout.
 * The handler receives (args, signal) where signal is an AbortSignal.
 * If the handler does not complete within TIMEOUT_MS, the AbortController
 * is triggered and the tool returns an error response.
 *
 * @param {Function} fn - async (args, signal) => MCP response
 * @returns {Function} async (args) => MCP response
 */
function withTimeout(fn) {
  return async (args) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fn(args, controller.signal);
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          content: [{ type: 'text', text: `Tool timed out after ${TIMEOUT_MS}ms` }],
          isError: true,
        };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

// ─── Tool Handlers (exported for testing) ──────────────────────────────────

/**
 * Handle lookup_technique tool call.
 * @param {import('better-sqlite3').Database} db
 * @param {{ technique_id: string }} args
 * @returns {object} MCP tool response
 */
async function handleLookupTechnique(db, args) {
  const { technique_id } = args;
  const row = lookupTechnique(db, technique_id);

  if (!row) {
    return {
      content: [{ type: 'text', text: `Technique ${technique_id} not found` }],
      isError: true,
    };
  }

  // If this is a parent technique, include sub-techniques
  if (!technique_id.toUpperCase().includes('.')) {
    const parentId = technique_id.toUpperCase().trim();
    const subs = db.prepare(
      'SELECT id, name FROM techniques WHERE id LIKE ?'
    ).all(`${parentId}.%`);
    row.sub_techniques = subs;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(row, null, 2) }],
  };
}

/**
 * Handle search_techniques tool call.
 * @param {import('better-sqlite3').Database} db
 * @param {{ query: string, tactic?: string, platform?: string, limit?: number }} args
 * @returns {object} MCP tool response
 */
async function handleSearchTechniques(db, args) {
  const { query, tactic, platform, limit = 20 } = args;
  const results = searchTechniques(db, query, { tactic, platform, limit });
  return {
    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
  };
}

/**
 * Handle lookup_group tool call.
 * Supports lookup by ID (G0007) or by name/alias (APT28).
 * @param {import('better-sqlite3').Database} db
 * @param {{ group_id: string }} args
 * @returns {object} MCP tool response
 */
async function handleLookupGroup(db, args) {
  const { group_id } = args;

  // First try exact ID lookup
  let group = lookupGroup(db, group_id);

  // If not found and doesn't match G-pattern, try name/alias search
  if (!group && !/^G\d+$/i.test(group_id)) {
    const nameMatch = db.prepare(
      'SELECT * FROM groups WHERE name LIKE ? OR aliases LIKE ? LIMIT 1'
    ).get(`%${group_id}%`, `%${group_id}%`);
    if (nameMatch) group = nameMatch;
  }

  if (!group) {
    return {
      content: [{ type: 'text', text: `Group ${group_id} not found` }],
      isError: true,
    };
  }

  // Enrich with techniques and software
  const techniques = getGroupTechniques(db, group.id);
  const software = getGroupSoftware(db, group.id);

  const result = { ...group, techniques, software };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Handle generate_layer tool call.
 * Modes: custom, group, coverage, gap.
 * @param {import('better-sqlite3').Database} db
 * @param {{ mode: string, name: string, technique_ids?: string[], group_id?: string, description?: string }} args
 * @returns {object} MCP tool response
 */
async function handleGenerateLayer(db, args) {
  const { mode, name, technique_ids, group_id, description } = args;

  let techniqueEntries = [];

  switch (mode) {
    case 'custom': {
      if (!technique_ids || technique_ids.length === 0) {
        return {
          content: [{ type: 'text', text: 'technique_ids required for custom mode' }],
          isError: true,
        };
      }
      techniqueEntries = technique_ids.map(id => ({
        id,
        score: 100,
        color: '#0033cc',
      }));
      break;
    }

    case 'group': {
      if (!group_id) {
        return {
          content: [{ type: 'text', text: 'group_id required for group mode' }],
          isError: true,
        };
      }
      const techIds = getGroupTechniques(db, group_id);
      techniqueEntries = techIds.map(id => ({
        id,
        score: 50,
        color: '#66b1ff',
      }));
      break;
    }

    case 'coverage': {
      // Get all techniques
      const allTechs = db.prepare('SELECT id FROM techniques').all();

      // Try to check detections table (Phase 54 graceful degradation)
      let detectedSet = new Set();
      try {
        const rows = db.prepare('SELECT technique_ids FROM detections').all();
        for (const r of rows) {
          if (r.technique_ids) r.technique_ids.split(',').forEach(t => detectedSet.add(t.trim()));
        }
      } catch {
        // detections table doesn't exist yet -- all scores = 0
      }

      techniqueEntries = allTechs.map(t => ({
        id: t.id,
        score: detectedSet.has(t.id) ? 100 : 0,
        color: detectedSet.has(t.id) ? '#00cc00' : '#ff0000',
      }));
      break;
    }

    case 'gap': {
      if (!group_id) {
        return {
          content: [{ type: 'text', text: 'group_id required for gap mode' }],
          isError: true,
        };
      }
      const groupTechIds = getGroupTechniques(db, group_id);

      // Check which have detections (Phase 54 graceful degradation)
      let coveredSet = new Set();
      try {
        if (groupTechIds.length > 0) {
          const rows = db.prepare('SELECT technique_ids FROM detections').all();
          const allDetected = new Set();
          for (const r of rows) {
            if (r.technique_ids) r.technique_ids.split(',').forEach(t => allDetected.add(t.trim()));
          }
          for (const id of groupTechIds) {
            if (allDetected.has(id)) coveredSet.add(id);
          }
        }
      } catch {
        // detections table doesn't exist yet
      }

      techniqueEntries = groupTechIds.map(id => ({
        id,
        score: coveredSet.has(id) ? 0 : 100,
        color: coveredSet.has(id) ? '#00cc00' : '#ff6666',
      }));
      break;
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown mode: ${mode}` }],
        isError: true,
      };
  }

  const layer = buildNavigatorLayer(name, techniqueEntries, { description });

  return {
    content: [{ type: 'text', text: JSON.stringify(layer, null, 2) }],
  };
}

/**
 * Handle analyze_coverage tool call.
 * @param {import('better-sqlite3').Database} db
 * @param {{ group_id: string, include_techniques?: boolean }} args
 * @returns {object} MCP tool response
 */
async function handleAnalyzeCoverage(db, args) {
  const { group_id, include_techniques = true } = args;

  // Get group info
  const group = lookupGroup(db, group_id);
  if (!group) {
    return {
      content: [{ type: 'text', text: `Group ${group_id} not found` }],
      isError: true,
    };
  }

  const groupTechIds = getGroupTechniques(db, group_id);

  // Check detections table (Phase 54 graceful degradation)
  let detectedSet = new Set();
  try {
    if (groupTechIds.length > 0) {
      const rows = db.prepare('SELECT technique_ids FROM detections').all();
      const allDetected = new Set();
      for (const r of rows) {
        if (r.technique_ids) r.technique_ids.split(',').forEach(t => allDetected.add(t.trim()));
      }
      for (const id of groupTechIds) {
        if (allDetected.has(id)) detectedSet.add(id);
      }
    }
  } catch {
    // detections table doesn't exist yet -- covered = 0
  }

  // Build per-tactic breakdown
  const tacticBreakdown = {};

  for (const tid of groupTechIds) {
    const tech = db.prepare('SELECT tactics FROM techniques WHERE id = ?').get(tid);
    if (!tech || !tech.tactics) continue;

    const tactics = tech.tactics.split(',').map(s => s.trim()).filter(Boolean);
    for (const tactic of tactics) {
      if (!tacticBreakdown[tactic]) {
        tacticBreakdown[tactic] = { total: 0, covered: 0, uncovered: 0, techniques: [] };
      }
      tacticBreakdown[tactic].total++;
      const isCovered = detectedSet.has(tid);
      if (isCovered) {
        tacticBreakdown[tactic].covered++;
      } else {
        tacticBreakdown[tactic].uncovered++;
      }
      if (include_techniques) {
        tacticBreakdown[tactic].techniques.push({ id: tid, covered: isCovered });
      }
    }
  }

  const totalTechniques = groupTechIds.length;
  const covered = detectedSet.size;
  const uncovered = totalTechniques - covered;

  const result = {
    group_id: group.id,
    group_name: group.name,
    total_techniques: totalTechniques,
    covered,
    uncovered,
    gap_percent: totalTechniques > 0 ? Math.round((uncovered / totalTechniques) * 100) : 0,
    by_tactic: Object.entries(tacticBreakdown).map(([tactic, data]) => ({
      tactic,
      total: data.total,
      covered: data.covered,
      uncovered: data.uncovered,
      gap_percent: data.total > 0 ? Math.round((data.uncovered / data.total) * 100) : 0,
      ...(include_techniques ? { techniques: data.techniques } : {}),
    })),
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

// ─── Tool Registration ─────────────────────────────────────────────────────

/**
 * Register all 5 MCP tools on a given McpServer instance.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('better-sqlite3').Database} db
 */
function registerTools(server, db) {
  // Tool 1: lookup_technique
  server.tool(
    'lookup_technique',
    'Look up an ATT&CK technique by ID (e.g., T1059.001). Returns technique name, description, tactics, platforms, data sources, and MITRE URL.',
    {
      technique_id: z.string()
        .regex(/^T\d{4}(?:\.\d{3})?$/i)
        .describe('ATT&CK technique ID (e.g., T1059.001, T1078)'),
    },
    withTimeout(async (args) => handleLookupTechnique(db, args))
  );

  // Tool 2: search_techniques
  server.tool(
    'search_techniques',
    'Full-text search across ATT&CK technique names and descriptions. Supports filtering by tactic and platform.',
    {
      query: z.string().min(1).describe('Search query (keywords, technique name fragment, etc.)'),
      tactic: z.string().optional().describe('Filter by tactic name (e.g., "Initial Access", "Persistence")'),
      platform: z.string().optional().describe('Filter by platform (e.g., "Windows", "Linux", "Cloud")'),
      limit: z.number().int().min(1).max(100).default(20).describe('Maximum results to return'),
    },
    withTimeout(async (args) => handleSearchTechniques(db, args))
  );

  // Tool 3: lookup_group
  server.tool(
    'lookup_group',
    'Look up an ATT&CK threat group by ID or name. Returns group details with associated techniques and software/malware.',
    {
      group_id: z.string().describe('ATT&CK group ID (e.g., G0007) or group name (e.g., "APT28")'),
    },
    withTimeout(async (args) => handleLookupGroup(db, args))
  );

  // Tool 4: generate_layer
  server.tool(
    'generate_layer',
    'Generate an ATT&CK Navigator v4.5 layer JSON. Supports custom technique sets, group-based layers, coverage snapshots, and gap analysis.',
    {
      mode: z.enum(['custom', 'group', 'coverage', 'gap']).describe('Layer type: custom (specific techniques), group (all techniques for a group), coverage (detection coverage snapshot), gap (uncovered techniques for a group)'),
      name: z.string().describe('Layer name'),
      technique_ids: z.array(z.string()).optional().describe('Technique IDs for custom mode'),
      group_id: z.string().optional().describe('Group ID for group/gap mode (e.g., G0007)'),
      description: z.string().optional().describe('Layer description'),
    },
    withTimeout(async (args) => handleGenerateLayer(db, args))
  );

  // Tool 5: analyze_coverage
  server.tool(
    'analyze_coverage',
    'Analyze detection coverage for a threat group. Returns per-tactic breakdown showing which techniques have detections and which are gaps.',
    {
      group_id: z.string().describe('ATT&CK group ID (e.g., G0007)'),
      include_techniques: z.boolean().default(true).describe('Include technique-level detail in each tactic'),
    },
    withTimeout(async (args) => handleAnalyzeCoverage(db, args))
  );
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  registerTools,
  // Exported for testing
  handleLookupTechnique,
  handleSearchTechniques,
  handleLookupGroup,
  handleGenerateLayer,
  handleAnalyzeCoverage,
  withTimeout,
};
