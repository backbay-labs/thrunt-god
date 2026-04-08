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
const {
  compareDetections,
  suggestDetections,
  getThreatProfile,
  listThreatProfiles,
} = require('./coverage.cjs');
const {
  searchEntities,
  getRelations,
  logDecision,
  getDecisions,
  logLearning,
  getLearnings,
} = require('./knowledge.cjs');

const TIMEOUT_MS = parseInt(process.env.THRUNT_MCP_TIMEOUT, 10) || 30000;

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

async function handleLookupTechnique(db, args) {
  const { technique_id } = args;
  const row = lookupTechnique(db, technique_id);

  if (!row) {
    return {
      content: [{ type: 'text', text: `Technique ${technique_id} not found` }],
      isError: true,
    };
  }

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

async function handleSearchTechniques(db, args) {
  const { query, tactic, platform, limit = 20 } = args;
  const results = searchTechniques(db, query, { tactic, platform, limit });
  return {
    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
  };
}

async function handleLookupGroup(db, args) {
  const { group_id } = args;

  let group = lookupGroup(db, group_id);

  if (!group && !/^G\d+$/i.test(group_id)) {
    const escaped = group_id.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const nameMatch = db.prepare(
      "SELECT * FROM groups WHERE name LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\' LIMIT 1"
    ).get(`%${escaped}%`, `%${escaped}%`);
    if (nameMatch) group = nameMatch;
  }

  if (!group) {
    return {
      content: [{ type: 'text', text: `Group ${group_id} not found` }],
      isError: true,
    };
  }

  const techniques = getGroupTechniques(db, group.id);
  const software = getGroupSoftware(db, group.id);

  const result = { ...group, techniques, software };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

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
      const allTechs = db.prepare('SELECT id FROM techniques').all();

      let detectedSet = new Set();
      try {
        const rows = db.prepare('SELECT technique_ids FROM detections').all();
        for (const r of rows) {
          if (r.technique_ids) r.technique_ids.split(',').forEach(t => detectedSet.add(t.trim()));
        }
      } catch { /* no detections table */ }

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
      const techIds = getGroupTechniques(db, group_id);

      let coveredSet = new Set();
      try {
        if (techIds.length > 0) {
          const rows = db.prepare('SELECT technique_ids FROM detections').all();
          const allDetected = new Set();
          for (const r of rows) {
            if (r.technique_ids) r.technique_ids.split(',').forEach(t => allDetected.add(t.trim()));
          }
          for (const id of techIds) {
            if (allDetected.has(id)) coveredSet.add(id);
          }
        }
      } catch { /* no detections table */ }

      techniqueEntries = techIds.map(id => ({
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

async function handleCompareDetections(db, args) {
  const { technique_id, query } = args;
  const input = technique_id || query;
  if (!input) {
    return {
      content: [{ type: 'text', text: 'Either technique_id or query required' }],
      isError: true,
    };
  }
  const result = compareDetections(db, input);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSuggestDetections(db, args) {
  const { technique_id } = args;
  const tech = lookupTechnique(db, technique_id);
  if (!tech) {
    return {
      content: [{ type: 'text', text: `Technique ${technique_id} not found` }],
      isError: true,
    };
  }
  const result = suggestDetections(db, technique_id);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleAnalyzeCoverage(db, args) {
  const { group_id, profile, include_techniques = true } = args;

  let techIds;
  let resultMeta;

  if (group_id) {
    const group = lookupGroup(db, group_id);
    if (!group) {
      return {
        content: [{ type: 'text', text: `Group ${group_id} not found` }],
        isError: true,
      };
    }
    techIds = getGroupTechniques(db, group_id);
    resultMeta = { group_id: group.id, group_name: group.name };
  } else if (profile) {
    const profileTechIds = getThreatProfile(profile);
    if (!profileTechIds) {
      return {
        content: [{ type: 'text', text: `Unknown threat profile: ${profile}. Available: ${listThreatProfiles().join(', ')}` }],
        isError: true,
      };
    }
    techIds = profileTechIds;
    resultMeta = { profile_name: profile.toLowerCase() };
  } else {
    return {
      content: [{ type: 'text', text: `Either group_id or profile required. Available profiles: ${listThreatProfiles().join(', ')}` }],
      isError: true,
    };
  }

  let detectedSet = new Set();
  try {
    if (techIds.length > 0) {
      const rows = db.prepare('SELECT technique_ids FROM detections').all();
      const allDetected = new Set();
      for (const r of rows) {
        if (r.technique_ids) r.technique_ids.split(',').forEach(t => allDetected.add(t.trim()));
      }
      for (const id of techIds) {
        if (allDetected.has(id)) detectedSet.add(id);
      }
    }
  } catch { /* no detections table */ }

  const tacticBreakdown = {};
  const tacticMap = new Map();
  if (techIds.length > 0) {
    const ph = techIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, tactics FROM techniques WHERE id IN (${ph})`).all(...techIds);
    for (const r of rows) tacticMap.set(r.id, r.tactics);
  }

  for (const tid of techIds) {
    const tactics_str = tacticMap.get(tid);
    if (!tactics_str) continue;

    const tactics = tactics_str.split(',').map(s => s.trim()).filter(Boolean);
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

  const totalTechniques = techIds.length;
  const covered = detectedSet.size;
  const uncovered = totalTechniques - covered;

  const result = {
    ...resultMeta,
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

async function handleQueryKnowledge(db, args) {
  const { query, type, limit = 10 } = args;
  const entities = searchEntities(db, query, { type, limit });

  if (entities.length === 0) {
    return {
      content: [{ type: 'text', text: 'No knowledge graph entities match query' }],
    };
  }

  const enriched = entities.map(entity => {
    const relations = getRelations(db, entity.id, { limit: 5 });
    return { ...entity, relations };
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
  };
}

async function handleLogDecision(db, args) {
  const { case_slug, technique_id, decision, reasoning, context } = args;
  logDecision(db, { case_slug, technique_id, decision, reasoning, context });

  const related_decisions = getDecisions(db, { technique_id, limit: 5 });

  return {
    content: [{ type: 'text', text: JSON.stringify({ logged: true, technique_id, related_decisions }, null, 2) }],
  };
}

async function handleLogLearning(db, args) {
  const { topic, pattern, detail, technique_ids, case_slug } = args;
  logLearning(db, { topic, pattern, detail, technique_ids, case_slug });

  const related_learnings = getLearnings(db, { topic, limit: 5 });

  return {
    content: [{ type: 'text', text: JSON.stringify({ logged: true, topic, related_learnings }, null, 2) }],
  };
}

function registerTools(server, db) {
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

  server.tool(
    'lookup_group',
    'Look up an ATT&CK threat group by ID or name. Returns group details with associated techniques and software/malware.',
    {
      group_id: z.string().describe('ATT&CK group ID (e.g., G0007) or group name (e.g., "APT28")'),
    },
    withTimeout(async (args) => handleLookupGroup(db, args))
  );

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

  server.tool(
    'analyze_coverage',
    'Analyze detection coverage for a threat group or named threat profile. Returns per-tactic breakdown showing which techniques have detections and which are gaps.',
    {
      group_id: z.string().optional().describe('ATT&CK group ID (e.g., G0007)'),
      profile: z.string().optional().describe('Named threat profile: ransomware, apt, initial-access, persistence, credential-access, defense-evasion'),
      include_techniques: z.boolean().default(true).describe('Include technique-level detail in each tactic'),
    },
    withTimeout(async (args) => handleAnalyzeCoverage(db, args))
  );

  server.tool(
    'compare_detections',
    'Compare detection coverage across sources (Sigma, ESCU, Elastic, KQL) for a technique or topic.',
    {
      technique_id: z.string().optional().describe('ATT&CK technique ID (e.g., T1059)'),
      query: z.string().optional().describe('Free-text search query'),
    },
    withTimeout(async (args) => handleCompareDetections(db, args))
  );

  server.tool(
    'suggest_detections',
    'Suggest detections for an uncovered technique based on rules from the same tactic family.',
    {
      technique_id: z.string().regex(/^T\d{4}(?:\.\d{3})?$/i).describe('ATT&CK technique ID'),
    },
    withTimeout(async (args) => handleSuggestDetections(db, args))
  );

  server.tool(
    'query_knowledge',
    'Search the hunt knowledge graph for entities (threat actors, techniques, tools, campaigns, vulnerabilities, data sources) and their relationships. Returns matching entities with related connections.',
    {
      query: z.string().min(1),
      type: z.enum(['threat_actor', 'technique', 'detection', 'campaign', 'tool', 'vulnerability', 'data_source']).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
    withTimeout(async (args) => handleQueryKnowledge(db, args))
  );

  server.tool(
    'log_decision',
    'Log a hunt decision with reasoning for future reference. Decisions are tagged by technique and case, enabling institutional memory across hunt sessions.',
    {
      case_slug: z.string(),
      technique_id: z.string(),
      decision: z.string(),
      reasoning: z.string().optional(),
      context: z.string().optional(),
    },
    withTimeout(async (args) => handleLogDecision(db, args))
  );

  server.tool(
    'log_learning',
    'Log a hunt learning or pattern for future reference. Learnings are tagged by topic and technique, surfacing when future hunts touch the same areas.',
    {
      topic: z.string(),
      pattern: z.string(),
      detail: z.string().optional(),
      technique_ids: z.string().optional().describe('Comma-separated ATT&CK technique IDs'),
      case_slug: z.string().optional(),
    },
    withTimeout(async (args) => handleLogLearning(db, args))
  );
}

module.exports = {
  registerTools,
  handleLookupTechnique,
  handleSearchTechniques,
  handleLookupGroup,
  handleGenerateLayer,
  handleAnalyzeCoverage,
  handleCompareDetections,
  handleSuggestDetections,
  handleQueryKnowledge,
  handleLogDecision,
  handleLogLearning,
  withTimeout,
};
