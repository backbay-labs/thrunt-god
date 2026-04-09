/**
 * Heatmap — Cross-tenant MITRE ATT&CK technique heatmap generation
 *
 * Maps tenants (rows) to ATT&CK techniques (columns) with severity-graded
 * cells, producing both JSON and Markdown artifacts for visual analysis.
 *
 * Consumed by cmdRuntimeHeatmap via thrunt-tools.cjs routing.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { planningRoot } = require('./core.cjs');

// Lazy require to avoid load-time circular dependency
function getMitreData() { return require('./mitre-data.cjs'); }

const ATTACK_ID_PATTERN = /^T\d{4}(?:\.\d{3})?$/i;
const TECHNIQUE_TAG_PATTERN = /^technique:(T\d{4}(?:\.\d{3})?)$/i;

// ─── Technique keyword map ─────────────────────────────────────────────────

/**
 * Static map for event content heuristic matching.
 * Keys are lowercase keywords; values are ATT&CK technique IDs.
 */
const TECHNIQUE_KEYWORD_MAP = {
  'lsass': 'T1003.001',
  'powershell': 'T1059.001',
  'mimikatz': 'T1003',
  'cmd.exe': 'T1059.003',
  'certutil': 'T1140',
  'whoami': 'T1033',
  'net.exe': 'T1087',
  'wmic': 'T1047',
  'psexec': 'T1570',
  'rundll32': 'T1218.011',
  'regsvr32': 'T1218.010',
  'mshta': 'T1218.005',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.slice() : [value];
}

function generateHeatmapId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').replace(/\.\d{3}Z$/, '');
  const rand = Array.from({ length: 8 }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
  ).join('');
  return `HM-${ts}-${rand}`;
}

/**
 * Check whether an event matches a technique via keyword heuristic.
 * Scans string fields (title, action, process_name, command_line, and any
 * other top-level string value) for keyword presence.
 */
function eventMatchesTechnique(event, techniqueId) {
  // Check explicit tags first
  const tags = event.tags || [];
  for (const tag of tags) {
    const m = TECHNIQUE_TAG_PATTERN.exec(tag);
    if (m && m[1].toUpperCase() === techniqueId.toUpperCase()) return true;
  }

  // Check keyword heuristic: find which keywords map to this technique
  const targetKeywords = [];
  for (const [keyword, techId] of Object.entries(TECHNIQUE_KEYWORD_MAP)) {
    if (techId.toUpperCase() === techniqueId.toUpperCase()) {
      targetKeywords.push(keyword);
    }
  }

  if (targetKeywords.length === 0) return false;

  // Scan string fields of the event
  const fieldsToScan = ['title', 'action', 'process_name', 'command_line'];
  for (const field of fieldsToScan) {
    const value = event[field];
    if (typeof value !== 'string') continue;
    const lower = value.toLowerCase();
    for (const keyword of targetKeywords) {
      if (lower.includes(keyword)) return true;
    }
  }

  return false;
}

// ─── inferTechniques ───────────────────────────────────────────────────────

/**
 * Combine techniques from three sources:
 * 1. Pack metadata (pack_attack field)
 * 2. Event heuristics (keyword matching against TECHNIQUE_KEYWORD_MAP)
 * 3. Explicit tags (technique:T#### pattern on events)
 *
 * @param {object} options
 * @param {string[]|null} options.pack_attack - ATT&CK IDs from pack metadata
 * @param {Array} options.tenant_results - tenant_results from MultiTenantResult
 * @returns {string[]} Deduplicated array of technique ID strings
 */
function inferTechniques(options = {}) {
  const techniquesSet = new Set();

  // Source 1: Pack metadata
  const packAttack = toArray(options.pack_attack);
  for (const id of packAttack) {
    if (ATTACK_ID_PATTERN.test(id)) {
      techniquesSet.add(id.toUpperCase());
    }
  }

  // Source 2 & 3: Scan events across all tenant results
  const tenantResults = options.tenant_results || [];
  for (const tr of tenantResults) {
    if (tr.status === 'error' || tr.status === 'timeout') continue;
    if (tr.envelope == null) continue;

    const events = tr.envelope.events || [];
    for (const event of events) {
      // Source 2: Event keyword heuristics
      const fieldsToScan = ['title', 'action', 'process_name', 'command_line'];
      for (const field of fieldsToScan) {
        const value = event[field];
        if (typeof value !== 'string') continue;
        const lower = value.toLowerCase();
        for (const [keyword, techId] of Object.entries(TECHNIQUE_KEYWORD_MAP)) {
          if (lower.includes(keyword)) {
            techniquesSet.add(techId.toUpperCase());
          }
        }
      }

      // Source 3: Explicit tags
      const tags = event.tags || [];
      for (const tag of tags) {
        const m = TECHNIQUE_TAG_PATTERN.exec(tag);
        if (m) {
          techniquesSet.add(m[1].toUpperCase());
        }
      }
    }
  }

  // Normalize back to canonical form (preserve dot notation)
  return Array.from(techniquesSet).map(id => {
    // Re-format to standard: T1003 or T1003.001
    if (id.includes('.')) {
      const parts = id.split('.');
      return parts[0] + '.' + parts[1];
    }
    return id;
  });
}

// ─── buildHeatmapFromResults ───────────────────────────────────────────────

/**
 * Build a heatmap data model from multi-tenant dispatch results.
 *
 * @param {object} multiTenantResult - The full MultiTenantResult
 * @param {string[]} techniques - Array of technique IDs to map
 * @param {object} [options] - Optional configuration
 * @returns {object} Complete heatmap object
 */
function buildHeatmapFromResults(multiTenantResult, techniques, options = {}) {
  const mitreData = getMitreData();
  const heatmapId = generateHeatmapId();
  const generatedAt = new Date().toISOString();

  const tenantResults = multiTenantResult.tenant_results || [];

  // Build axes.tenants
  const axisTenants = tenantResults
    .filter(tr => tr.status !== 'error' && tr.status !== 'timeout')
    .map(tr => ({
      id: tr.tenant_id,
      display_name: tr.display_name || tr.tenant_id,
      tags: tr.tags || [],
    }));

  // Build axes.techniques — look up each via mitre-data.cjs
  const axisTechniques = techniques.map(techId => {
    const info = mitreData.getTechniqueById(techId);
    if (info) {
      return { id: info.id, name: info.name, tactic: info.tactic || null };
    }
    return { id: techId, name: techId, tactic: null };
  });

  // Build sparse cells
  const cells = [];
  const techniqueToTenants = new Map(); // for summary

  for (const tr of tenantResults) {
    if (tr.status === 'error' || tr.status === 'timeout') continue;
    if (tr.envelope == null) continue;

    const events = tr.envelope.events || [];
    const entities = tr.envelope.entities || [];

    for (const techId of techniques) {
      // Filter events matching this technique
      const matchingEvents = events.filter(e => eventMatchesTechnique(e, techId));
      const eventCount = matchingEvents.length;

      // Skip clear cells (sparse representation)
      if (eventCount === 0) continue;

      // Count unique entities from matching events
      const entityCount = entities.length;

      // Severity grading
      const severity = eventCount > 10 ? 'high' : eventCount > 0 ? 'medium' : null;
      const status = eventCount > 0 ? 'detected' : 'clear';

      // Sample event IDs (max 5)
      const sampleEventIds = matchingEvents.slice(0, 5).map(e => e.id);

      // First/last seen
      let firstSeen = null;
      let lastSeen = null;
      if (matchingEvents.length > 0) {
        const timestamps = matchingEvents
          .filter(e => e.timestamp)
          .map(e => e.timestamp);
        if (timestamps.length > 0) {
          timestamps.sort();
          firstSeen = timestamps[0];
          lastSeen = timestamps[timestamps.length - 1];
        }
      }

      cells.push({
        tenant_id: tr.tenant_id,
        technique_id: techId,
        event_count: eventCount,
        entity_count: entityCount,
        severity,
        status,
        sample_event_ids: sampleEventIds,
        first_seen: firstSeen,
        last_seen: lastSeen,
      });

      // Track for summary
      if (!techniqueToTenants.has(techId)) {
        techniqueToTenants.set(techId, new Set());
      }
      techniqueToTenants.get(techId).add(tr.tenant_id);
    }
  }

  // Build summary
  const techniquesDetected = techniqueToTenants.size;

  const tenantsWithFindings = new Set();
  for (const cell of cells) {
    if (cell.event_count > 0) {
      tenantsWithFindings.add(cell.tenant_id);
    }
  }

  const allTenantIds = new Set(axisTenants.map(t => t.id));
  const tenantsClear = allTenantIds.size - tenantsWithFindings.size;

  // Highest severity
  let highestSeverity = null;
  for (const cell of cells) {
    if (cell.severity === 'high') { highestSeverity = 'high'; break; }
    if (cell.severity === 'medium' && highestSeverity !== 'high') { highestSeverity = 'medium'; }
  }

  // Most widespread technique
  let mostWidespread = null;
  let maxTenantCount = 0;
  for (const [techId, tenantSet] of techniqueToTenants) {
    if (tenantSet.size > maxTenantCount) {
      maxTenantCount = tenantSet.size;
      mostWidespread = { id: techId, tenant_count: tenantSet.size };
    }
  }

  return {
    heatmap_id: heatmapId,
    generated_at: generatedAt,
    dispatch_id: multiTenantResult.dispatch_id || null,
    axes: {
      tenants: axisTenants,
      techniques: axisTechniques,
    },
    cells,
    summary: {
      techniques_detected: techniquesDetected,
      tenants_with_findings: tenantsWithFindings.size,
      tenants_clear: tenantsClear,
      highest_severity: highestSeverity,
      most_widespread_technique: mostWidespread,
    },
  };
}

// ─── renderHeatmapTable ────────────────────────────────────────────────────

/**
 * Produce a Markdown table string from a heatmap data model.
 *
 * @param {object} heatmapData - Heatmap object from buildHeatmapFromResults
 * @returns {string} Markdown table
 */
function renderHeatmapTable(heatmapData) {
  const tenants = heatmapData.axes.tenants || [];
  const techniques = heatmapData.axes.techniques || [];
  const cells = heatmapData.cells || [];

  // Build cell lookup: "tenantId:techniqueId" -> cell
  const cellMap = new Map();
  for (const cell of cells) {
    cellMap.set(`${cell.tenant_id}:${cell.technique_id}`, cell);
  }

  // Header row
  const techHeaders = techniques.map(t => `${t.id} ${t.name}`);
  const headerRow = `| Tenant | ${techHeaders.join(' | ')} |`;

  // Separator row
  const separators = techniques.map(() => ':-----:');
  const separatorRow = `|--------|${separators.join('|')}|`;

  // Data rows
  const dataRows = tenants.map(tenant => {
    const cellValues = techniques.map(tech => {
      const cell = cellMap.get(`${tenant.id}:${tech.id}`);
      if (!cell || cell.event_count === 0) return '--';
      if (cell.severity === 'high') return `**${cell.event_count}** (high)`;
      if (cell.severity === 'medium') return `${cell.event_count} (medium)`;
      return `${cell.event_count}`;
    });
    return `| ${tenant.display_name} | ${cellValues.join(' | ')} |`;
  });

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

// ─── writeHeatmapArtifacts ─────────────────────────────────────────────────

/**
 * Write heatmap as JSON and Markdown files to .planning/HEATMAPS/.
 *
 * @param {string} cwd - Working directory
 * @param {object} heatmapData - Heatmap object from buildHeatmapFromResults
 * @param {object} [options] - Optional configuration
 * @returns {{ json_path: string, md_path: string }}
 */
function writeHeatmapArtifacts(cwd, heatmapData, options = {}) {
  const heatmapsDir = path.join(planningRoot(cwd), 'HEATMAPS');
  fs.mkdirSync(heatmapsDir, { recursive: true });

  const id = heatmapData.heatmap_id;
  const jsonPath = path.join(heatmapsDir, `${id}.json`);
  const mdPath = path.join(heatmapsDir, `${id}.md`);

  // Write JSON
  fs.writeFileSync(jsonPath, JSON.stringify(heatmapData, null, 2), 'utf8');

  // Write Markdown
  const table = renderHeatmapTable(heatmapData);
  const summary = heatmapData.summary || {};
  const mdContent = [
    `# Cross-Tenant Heatmap: ${id}`,
    '',
    '## Metadata',
    '',
    `- **Dispatch ID:** ${heatmapData.dispatch_id || 'N/A'}`,
    `- **Generated:** ${heatmapData.generated_at}`,
    `- **Techniques Detected:** ${summary.techniques_detected || 0}`,
    `- **Tenants with Findings:** ${summary.tenants_with_findings || 0}`,
    `- **Tenants Clear:** ${summary.tenants_clear || 0}`,
    `- **Highest Severity:** ${summary.highest_severity || 'none'}`,
    summary.most_widespread_technique
      ? `- **Most Widespread Technique:** ${summary.most_widespread_technique.id} (${summary.most_widespread_technique.tenant_count} tenants)`
      : '',
    '',
    '## Heatmap',
    '',
    table,
    '',
  ].filter(line => line !== undefined).join('\n');

  fs.writeFileSync(mdPath, mdContent, 'utf8');

  return { json_path: jsonPath, md_path: mdPath };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  TECHNIQUE_KEYWORD_MAP,
  inferTechniques,
  buildHeatmapFromResults,
  renderHeatmapTable,
  writeHeatmapArtifacts,
};
