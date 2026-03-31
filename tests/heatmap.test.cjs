/**
 * THRUNT Tools Tests - Cross-Tenant Heatmap
 *
 * Unit tests for technique inference, heatmap construction, Markdown rendering,
 * and artifact writing.
 *
 * Suites:
 *   1. inferTechniques — technique ID extraction from pack, events, tags
 *   2. buildHeatmapFromResults — sparse cell construction with severity grading
 *   3. renderHeatmapTable — Markdown table rendering
 *   4. writeHeatmapArtifacts — JSON + Markdown file output
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createTempProject, cleanup, runThruntTools } = require('./helpers.cjs');

// ─── Time helpers ───────────────────────────────────────────────────────────

const NOW = new Date();
const ONE_HOUR_AGO = new Date(NOW.getTime() - 3600_000).toISOString();
const TWO_HOURS_AGO = new Date(NOW.getTime() - 7200_000).toISOString();
const NOW_ISO = NOW.toISOString();

// ─── Shared fixtures ────────────────────────────────────────────────────────

function makeEnvelope(events = [], entities = [], overrides = {}) {
  return {
    events,
    entities,
    connector: { id: overrides.connectorId || 'sentinel' },
    status: overrides.status || 'ok',
    counts: {
      events: events.length,
      entities: entities.length,
      warnings: 0,
      errors: 0,
    },
    timing: {
      started_at: ONE_HOUR_AGO,
      completed_at: NOW_ISO,
      duration_ms: 1200,
    },
    warnings: [],
    errors: [],
    pagination: { pages_fetched: 1 },
    ...(overrides.extra || {}),
  };
}

function makeTenantResult(tenantId, events = [], entities = [], overrides = {}) {
  return {
    tenant_id: tenantId,
    display_name: overrides.display_name || tenantId,
    status: overrides.status || 'ok',
    envelope: overrides.status === 'error' || overrides.nullEnvelope
      ? null
      : makeEnvelope(events, entities, overrides),
    artifacts: null,
    timing: {
      started_at: ONE_HOUR_AGO,
      completed_at: NOW_ISO,
      duration_ms: 1200,
    },
  };
}

function makeMultiTenantResult(tenantResults) {
  let totalEvents = 0;
  let totalEntities = 0;
  let succeeded = 0;
  let failed = 0;
  for (const tr of tenantResults) {
    if (tr.status === 'ok' || tr.status === 'partial') {
      succeeded++;
      if (tr.envelope) {
        totalEvents += (tr.envelope.events || []).length;
        totalEntities += (tr.envelope.entities || []).length;
      }
    } else {
      failed++;
    }
  }
  return {
    version: '1.0',
    dispatch_id: 'MTD-20260330143022-A1B2C3D4',
    summary: {
      tenants_targeted: tenantResults.length,
      tenants_succeeded: succeeded,
      tenants_partial: 0,
      tenants_failed: failed,
      tenants_timeout: 0,
      total_events: totalEvents,
      total_entities: totalEntities,
      wall_clock_ms: 2500,
    },
    tenant_results: tenantResults,
    errors: [],
  };
}

function makeEvent(id, overrides = {}) {
  return {
    id,
    timestamp: overrides.timestamp || NOW_ISO,
    title: overrides.title || 'Security Event',
    action: overrides.action || null,
    process_name: overrides.process_name || null,
    command_line: overrides.command_line || null,
    tags: overrides.tags || [],
    severity: overrides.severity || 'medium',
    ...(overrides.extra || {}),
  };
}

function makeEntity(kind, value) {
  return { kind, value, id: `ent-${kind}-${value}` };
}

// ─── Module under test ─────────────────────────────────────────────────────

const heatmap = require('../thrunt-god/bin/lib/heatmap.cjs');

// ─── 1. inferTechniques ────────────────────────────────────────────────────

describe('inferTechniques', () => {
  test('extracts technique IDs from pack_attack metadata', () => {
    const result = heatmap.inferTechniques({
      pack_attack: ['T1003', 'T1059.001'],
      tenant_results: [],
    });
    assert.ok(result.includes('T1003'));
    assert.ok(result.includes('T1059.001'));
  });

  test('filters invalid technique IDs from pack_attack', () => {
    const result = heatmap.inferTechniques({
      pack_attack: ['T1003', 'not-a-technique', 'T9999', 'INVALID'],
      tenant_results: [],
    });
    assert.ok(result.includes('T1003'));
    assert.ok(result.includes('T9999'));
    assert.ok(!result.includes('not-a-technique'));
    assert.ok(!result.includes('INVALID'));
  });

  test('infers techniques from event keyword heuristics - LSASS', () => {
    const events = [makeEvent('evt-1', { process_name: 'LSASS.exe' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1003.001'), 'LSASS should map to T1003.001');
  });

  test('infers techniques from event keyword heuristics - PowerShell', () => {
    const events = [makeEvent('evt-1', { title: 'PowerShell execution detected' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1059.001'), 'PowerShell should map to T1059.001');
  });

  test('infers techniques from event keyword heuristics - mimikatz', () => {
    const events = [makeEvent('evt-1', { command_line: 'mimikatz.exe sekurlsa::logonpasswords' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1003'), 'mimikatz should map to T1003');
  });

  test('infers techniques from event keyword heuristics - cmd.exe', () => {
    const events = [makeEvent('evt-1', { process_name: 'cmd.exe' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1059.003'), 'cmd.exe should map to T1059.003');
  });

  test('infers techniques from event keyword heuristics - certutil', () => {
    const events = [makeEvent('evt-1', { command_line: 'certutil -decode payload.b64' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1140'), 'certutil should map to T1140');
  });

  test('infers techniques from event keyword heuristics - whoami', () => {
    const events = [makeEvent('evt-1', { command_line: 'whoami /all' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1033'), 'whoami should map to T1033');
  });

  test('infers techniques from event keyword heuristics - net.exe', () => {
    const events = [makeEvent('evt-1', { process_name: 'net.exe' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1087'), 'net.exe should map to T1087');
  });

  test('extracts techniques from explicit event tags', () => {
    const events = [makeEvent('evt-1', { tags: ['technique:T1548', 'other:tag'] })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1548'), 'technique:T1548 tag should extract T1548');
  });

  test('deduplicates techniques from all three sources', () => {
    const events = [
      makeEvent('evt-1', { process_name: 'LSASS.exe', tags: ['technique:T1003.001'] }),
    ];
    const result = heatmap.inferTechniques({
      pack_attack: ['T1003.001'],
      tenant_results: [makeTenantResult('acme', events)],
    });
    // T1003.001 appears from pack, event heuristic, and explicit tag
    const count = result.filter(id => id === 'T1003.001').length;
    assert.strictEqual(count, 1, 'Should deduplicate T1003.001');
  });

  test('handles null/empty pack_attack gracefully', () => {
    const result = heatmap.inferTechniques({
      pack_attack: null,
      tenant_results: [],
    });
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  test('case-insensitive keyword matching', () => {
    const events = [makeEvent('evt-1', { title: 'POWERSHELL script block logging' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events)],
    });
    assert.ok(result.includes('T1059.001'));
  });

  test('skips error/timeout tenant results', () => {
    const events = [makeEvent('evt-1', { process_name: 'LSASS.exe' })];
    const result = heatmap.inferTechniques({
      tenant_results: [makeTenantResult('acme', events, [], { status: 'error' })],
    });
    assert.ok(!result.includes('T1003.001'), 'Should not process error tenant results');
  });
});

// ─── 2. buildHeatmapFromResults ────────────────────────────────────────────

describe('buildHeatmapFromResults', () => {
  test('builds heatmap with correct structure', () => {
    const events = [
      makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: ONE_HOUR_AGO }),
    ];
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', events, [makeEntity('ip', '10.0.0.1')]),
    ]);
    const techniques = ['T1003.001'];
    const result = heatmap.buildHeatmapFromResults(mtr, techniques);

    assert.ok(result.heatmap_id, 'Should have heatmap_id');
    assert.ok(result.generated_at, 'Should have generated_at');
    assert.ok(result.dispatch_id, 'Should have dispatch_id');
    assert.ok(result.axes, 'Should have axes');
    assert.ok(result.axes.tenants, 'Should have axes.tenants');
    assert.ok(result.axes.techniques, 'Should have axes.techniques');
    assert.ok(Array.isArray(result.cells), 'Should have cells array');
    assert.ok(result.summary, 'Should have summary');
  });

  test('heatmap_id matches pattern HM-YYYYMMDDHHMMSS-RANDOM8', () => {
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', [makeEvent('evt-1', { timestamp: NOW_ISO })]),
    ]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003']);
    assert.match(result.heatmap_id, /^HM-\d{14}-[A-Z0-9]{8}$/);
  });

  test('severity high when event_count > 10', () => {
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push(makeEvent(`evt-${i}`, { process_name: 'LSASS.exe', timestamp: NOW_ISO }));
    }
    const mtr = makeMultiTenantResult([makeTenantResult('acme', events)]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001']);
    const cell = result.cells.find(c => c.tenant_id === 'acme' && c.technique_id === 'T1003.001');
    assert.ok(cell, 'Should have cell for acme + T1003.001');
    assert.strictEqual(cell.severity, 'high');
    assert.strictEqual(cell.status, 'detected');
    assert.strictEqual(cell.event_count, 12);
  });

  test('severity medium when 1-10 events', () => {
    const events = [
      makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: NOW_ISO }),
      makeEvent('evt-2', { process_name: 'LSASS.exe', timestamp: NOW_ISO }),
    ];
    const mtr = makeMultiTenantResult([makeTenantResult('acme', events)]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001']);
    const cell = result.cells.find(c => c.tenant_id === 'acme' && c.technique_id === 'T1003.001');
    assert.ok(cell);
    assert.strictEqual(cell.severity, 'medium');
    assert.strictEqual(cell.status, 'detected');
    assert.strictEqual(cell.event_count, 2);
  });

  test('clear cells (0 events, no dispatch) are omitted from sparse cells', () => {
    // acme has LSASS events, globex has no events at all
    const events = [makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: NOW_ISO })];
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', events),
      makeTenantResult('globex', []),
    ]);
    // T1003.001: acme has events, globex does not
    // T1059.001: neither has events
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001', 'T1059.001']);
    // Only acme+T1003.001 should exist as a cell
    assert.strictEqual(result.cells.length, 1);
    assert.strictEqual(result.cells[0].tenant_id, 'acme');
    assert.strictEqual(result.cells[0].technique_id, 'T1003.001');
  });

  test('sample_event_ids limited to 5', () => {
    const events = [];
    for (let i = 0; i < 15; i++) {
      events.push(makeEvent(`evt-${i}`, { process_name: 'LSASS.exe', timestamp: NOW_ISO }));
    }
    const mtr = makeMultiTenantResult([makeTenantResult('acme', events)]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001']);
    const cell = result.cells[0];
    assert.ok(cell.sample_event_ids.length <= 5, 'sample_event_ids should be max 5');
  });

  test('first_seen and last_seen from event timestamps', () => {
    const events = [
      makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: TWO_HOURS_AGO }),
      makeEvent('evt-2', { process_name: 'LSASS.exe', timestamp: ONE_HOUR_AGO }),
      makeEvent('evt-3', { process_name: 'LSASS.exe', timestamp: NOW_ISO }),
    ];
    const mtr = makeMultiTenantResult([makeTenantResult('acme', events)]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001']);
    const cell = result.cells[0];
    assert.strictEqual(cell.first_seen, TWO_HOURS_AGO);
    assert.strictEqual(cell.last_seen, NOW_ISO);
  });

  test('entity_count reflects unique entities from matching events', () => {
    const events = [
      makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: NOW_ISO }),
      makeEvent('evt-2', { process_name: 'LSASS.exe', timestamp: NOW_ISO }),
    ];
    const entities = [
      makeEntity('ip', '10.0.0.1'),
      makeEntity('ip', '10.0.0.2'),
    ];
    const mtr = makeMultiTenantResult([makeTenantResult('acme', events, entities)]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001']);
    const cell = result.cells[0];
    assert.strictEqual(cell.entity_count, 2);
  });

  test('summary techniques_detected counts techniques with >0 events', () => {
    const events = [
      makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: NOW_ISO }),
    ];
    const mtr = makeMultiTenantResult([makeTenantResult('acme', events)]);
    // Pass T1003.001 (has events) and T1059.001 (no events)
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001', 'T1059.001']);
    assert.strictEqual(result.summary.techniques_detected, 1);
  });

  test('summary most_widespread_technique picks technique in most tenants', () => {
    const acmeEvents = [makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: NOW_ISO })];
    const globexEvents = [makeEvent('evt-2', { process_name: 'LSASS.exe', timestamp: NOW_ISO })];
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', acmeEvents),
      makeTenantResult('globex', globexEvents),
    ]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001']);
    assert.strictEqual(result.summary.most_widespread_technique.id, 'T1003.001');
    assert.strictEqual(result.summary.most_widespread_technique.tenant_count, 2);
  });

  test('summary tenants_with_findings counts tenants with at least one event', () => {
    const events = [makeEvent('evt-1', { process_name: 'LSASS.exe', timestamp: NOW_ISO })];
    const mtr = makeMultiTenantResult([
      makeTenantResult('acme', events),
      makeTenantResult('globex', []),
    ]);
    const result = heatmap.buildHeatmapFromResults(mtr, ['T1003.001']);
    assert.strictEqual(result.summary.tenants_with_findings, 1);
    assert.strictEqual(result.summary.tenants_clear, 1);
  });
});

// ─── 3. renderHeatmapTable ─────────────────────────────────────────────────

describe('renderHeatmapTable', () => {
  test('produces valid Markdown table with header, separator, and data rows', () => {
    const heatmapData = {
      axes: {
        tenants: [{ id: 'acme', display_name: 'Acme Corp' }],
        techniques: [{ id: 'T1003.001', name: 'LSASS Memory' }],
      },
      cells: [
        { tenant_id: 'acme', technique_id: 'T1003.001', event_count: 14, severity: 'high', status: 'detected' },
      ],
    };
    const md = heatmap.renderHeatmapTable(heatmapData);
    assert.ok(md.includes('| Tenant |'), 'Should have header row');
    assert.ok(md.includes('T1003.001'), 'Should include technique ID');
    assert.ok(md.includes('LSASS Memory'), 'Should include technique name');
    assert.ok(md.includes('**14** (high)'), 'Should format high severity');
    assert.ok(md.includes('Acme Corp'), 'Should include tenant display name');
  });

  test('formats medium severity correctly', () => {
    const heatmapData = {
      axes: {
        tenants: [{ id: 'acme', display_name: 'Acme Corp' }],
        techniques: [{ id: 'T1059.001', name: 'PowerShell' }],
      },
      cells: [
        { tenant_id: 'acme', technique_id: 'T1059.001', event_count: 2, severity: 'medium', status: 'detected' },
      ],
    };
    const md = heatmap.renderHeatmapTable(heatmapData);
    assert.ok(md.includes('2 (medium)'), 'Should format medium severity');
  });

  test('shows -- for clear/missing cells', () => {
    const heatmapData = {
      axes: {
        tenants: [{ id: 'acme', display_name: 'Acme Corp' }],
        techniques: [{ id: 'T1059.001', name: 'PowerShell' }],
      },
      cells: [],
    };
    const md = heatmap.renderHeatmapTable(heatmapData);
    assert.ok(md.includes('--'), 'Should show -- for missing cells');
  });

  test('handles multiple tenants and techniques', () => {
    const heatmapData = {
      axes: {
        tenants: [
          { id: 'acme', display_name: 'Acme Corp' },
          { id: 'globex', display_name: 'Globex Inc' },
        ],
        techniques: [
          { id: 'T1003.001', name: 'LSASS Memory' },
          { id: 'T1059.001', name: 'PowerShell' },
        ],
      },
      cells: [
        { tenant_id: 'acme', technique_id: 'T1003.001', event_count: 14, severity: 'high', status: 'detected' },
        { tenant_id: 'globex', technique_id: 'T1059.001', event_count: 3, severity: 'medium', status: 'detected' },
      ],
    };
    const md = heatmap.renderHeatmapTable(heatmapData);
    const lines = md.trim().split('\n');
    assert.ok(lines.length >= 4, 'Should have header + separator + 2 data rows');
  });
});

// ─── 4. writeHeatmapArtifacts ──────────────────────────────────────────────

describe('writeHeatmapArtifacts', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates HEATMAPS directory if not exists', () => {
    const heatmapData = {
      heatmap_id: 'HM-20260330143022-A1B2C3D4',
      generated_at: NOW_ISO,
      dispatch_id: 'MTD-test',
      axes: { tenants: [], techniques: [] },
      cells: [],
      summary: { techniques_detected: 0, tenants_with_findings: 0, tenants_clear: 0, highest_severity: null, most_widespread_technique: null },
    };
    const result = heatmap.writeHeatmapArtifacts(tmpDir, heatmapData);
    const heatmapsDir = path.join(tmpDir, '.planning', 'HEATMAPS');
    assert.ok(fs.existsSync(heatmapsDir), 'HEATMAPS directory should exist');
    assert.ok(result.json_path, 'Should return json_path');
    assert.ok(result.md_path, 'Should return md_path');
  });

  test('writes JSON artifact with correct content', () => {
    const heatmapData = {
      heatmap_id: 'HM-20260330143022-A1B2C3D4',
      generated_at: NOW_ISO,
      dispatch_id: 'MTD-test',
      axes: {
        tenants: [{ id: 'acme', display_name: 'Acme Corp' }],
        techniques: [{ id: 'T1003.001', name: 'LSASS Memory', tactic: 'Credential Access' }],
      },
      cells: [
        { tenant_id: 'acme', technique_id: 'T1003.001', event_count: 5, severity: 'medium', status: 'detected', sample_event_ids: ['evt-1'], first_seen: ONE_HOUR_AGO, last_seen: NOW_ISO },
      ],
      summary: { techniques_detected: 1, tenants_with_findings: 1, tenants_clear: 0, highest_severity: 'medium', most_widespread_technique: { id: 'T1003.001', tenant_count: 1 } },
    };
    const result = heatmap.writeHeatmapArtifacts(tmpDir, heatmapData);
    assert.ok(fs.existsSync(result.json_path));
    const parsed = JSON.parse(fs.readFileSync(result.json_path, 'utf8'));
    assert.strictEqual(parsed.heatmap_id, 'HM-20260330143022-A1B2C3D4');
    assert.strictEqual(parsed.cells.length, 1);
  });

  test('writes Markdown artifact with table content', () => {
    const heatmapData = {
      heatmap_id: 'HM-20260330143022-A1B2C3D4',
      generated_at: NOW_ISO,
      dispatch_id: 'MTD-test',
      axes: {
        tenants: [{ id: 'acme', display_name: 'Acme Corp' }],
        techniques: [{ id: 'T1003.001', name: 'LSASS Memory', tactic: 'Credential Access' }],
      },
      cells: [
        { tenant_id: 'acme', technique_id: 'T1003.001', event_count: 14, severity: 'high', status: 'detected', sample_event_ids: ['evt-1'], first_seen: ONE_HOUR_AGO, last_seen: NOW_ISO },
      ],
      summary: { techniques_detected: 1, tenants_with_findings: 1, tenants_clear: 0, highest_severity: 'high', most_widespread_technique: { id: 'T1003.001', tenant_count: 1 } },
    };
    const result = heatmap.writeHeatmapArtifacts(tmpDir, heatmapData);
    assert.ok(fs.existsSync(result.md_path));
    const md = fs.readFileSync(result.md_path, 'utf8');
    assert.ok(md.includes('Cross-Tenant Heatmap'), 'Markdown should have title');
    assert.ok(md.includes('T1003.001'), 'Markdown should include technique ID');
    assert.ok(md.includes('MTD-test'), 'Markdown should include dispatch_id');
  });

  test('artifact paths follow naming convention', () => {
    const heatmapData = {
      heatmap_id: 'HM-20260330143022-TESTTEST',
      generated_at: NOW_ISO,
      dispatch_id: 'MTD-test',
      axes: { tenants: [], techniques: [] },
      cells: [],
      summary: { techniques_detected: 0, tenants_with_findings: 0, tenants_clear: 0, highest_severity: null, most_widespread_technique: null },
    };
    const result = heatmap.writeHeatmapArtifacts(tmpDir, heatmapData);
    assert.ok(result.json_path.endsWith('HM-20260330143022-TESTTEST.json'));
    assert.ok(result.md_path.endsWith('HM-20260330143022-TESTTEST.md'));
  });
});

// ─── 5. runtime.cjs re-exports ─────────────────────────────────────────────

describe('runtime.cjs re-exports', () => {
  const runtime = require('../thrunt-god/bin/lib/runtime.cjs');

  test('aggregateResults is re-exported as function', () => {
    assert.strictEqual(typeof runtime.aggregateResults, 'function');
  });

  test('deduplicateEntities is re-exported as function', () => {
    assert.strictEqual(typeof runtime.deduplicateEntities, 'function');
  });

  test('tagEventsWithTenant is re-exported as function', () => {
    assert.strictEqual(typeof runtime.tagEventsWithTenant, 'function');
  });

  test('correlateFindings is re-exported as function', () => {
    assert.strictEqual(typeof runtime.correlateFindings, 'function');
  });

  test('buildHeatmapFromResults is re-exported as function', () => {
    assert.strictEqual(typeof runtime.buildHeatmapFromResults, 'function');
  });

  test('renderHeatmapTable is re-exported as function', () => {
    assert.strictEqual(typeof runtime.renderHeatmapTable, 'function');
  });

  test('writeHeatmapArtifacts is re-exported as function', () => {
    assert.strictEqual(typeof runtime.writeHeatmapArtifacts, 'function');
  });

  test('inferTechniques is re-exported as function', () => {
    assert.strictEqual(typeof runtime.inferTechniques, 'function');
  });
});

// ─── 6. commands.cjs exports ───────────────────────────────────────────────

describe('commands.cjs exports', () => {
  const commands = require('../thrunt-god/bin/lib/commands.cjs');

  test('cmdRuntimeAggregate is exported as function', () => {
    assert.strictEqual(typeof commands.cmdRuntimeAggregate, 'function');
  });

  test('cmdRuntimeHeatmap is exported as function', () => {
    assert.strictEqual(typeof commands.cmdRuntimeHeatmap, 'function');
  });
});

// ─── 7. CLI routing ────────────────────────────────────────────────────────

describe('CLI routing', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('runtime aggregate subcommand is recognized (fails due to missing args, not unknown command)', () => {
    const result = runThruntTools(['runtime', 'aggregate'], tmpDir);
    // Should fail because no --tenants/--tags/--all, not because of unknown subcommand
    assert.strictEqual(result.success, false);
    assert.ok(
      !result.error.includes('Unknown runtime subcommand'),
      'Should not be "Unknown subcommand" error'
    );
  });

  test('runtime heatmap subcommand is recognized (fails due to missing args, not unknown command)', () => {
    const result = runThruntTools(['runtime', 'heatmap'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(
      !result.error.includes('Unknown runtime subcommand'),
      'Should not be "Unknown subcommand" error'
    );
  });

  test('unknown runtime subcommand shows aggregate and heatmap in available list', () => {
    const result = runThruntTools(['runtime', 'nonexistent'], tmpDir);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('aggregate'), 'Error should mention aggregate');
    assert.ok(result.error.includes('heatmap'), 'Error should mention heatmap');
  });
});
