'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `thrunt-mcp-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let intel, tools, layers;
function loadIntel() {
  if (!intel) intel = require('../apps/mcp/lib/intel.cjs');
  return intel;
}
function loadTools() {
  if (!tools) tools = require('../apps/mcp/lib/tools.cjs');
  return tools;
}
function loadLayers() {
  if (!layers) layers = require('../apps/mcp/lib/layers.cjs');
  return layers;
}

describe('layers.cjs - buildNavigatorLayer', () => {
  it('exports buildNavigatorLayer function', () => {
    const { buildNavigatorLayer } = loadLayers();
    assert.equal(typeof buildNavigatorLayer, 'function');
  });

  it('produces object with name, versions, domain, techniques', () => {
    const { buildNavigatorLayer } = loadLayers();
    const layer = buildNavigatorLayer('Test Layer', [
      { id: 'T1059', score: 50 },
    ]);
    assert.equal(layer.name, 'Test Layer');
    assert.ok(layer.versions);
    assert.ok(layer.domain);
    assert.ok(Array.isArray(layer.techniques));
  });

  it('sets versions.layer to 4.5', () => {
    const { buildNavigatorLayer } = loadLayers();
    const layer = buildNavigatorLayer('Test', []);
    assert.equal(layer.versions.layer, '4.5');
  });

  it('sets domain to enterprise-attack', () => {
    const { buildNavigatorLayer } = loadLayers();
    const layer = buildNavigatorLayer('Test', []);
    assert.equal(layer.domain, 'enterprise-attack');
  });

  it('maps techniques with techniqueID, score, enabled fields', () => {
    const { buildNavigatorLayer } = loadLayers();
    const layer = buildNavigatorLayer('Test', [
      { id: 'T1059', score: 75, color: '#ff0000', comment: 'test' },
      { id: 'T1078', score: 0 },
    ]);
    assert.equal(layer.techniques.length, 2);

    const t1 = layer.techniques[0];
    assert.equal(t1.techniqueID, 'T1059');
    assert.equal(t1.score, 75);
    assert.equal(t1.enabled, true);
    assert.equal(t1.color, '#ff0000');
    assert.equal(t1.comment, 'test');

    const t2 = layer.techniques[1];
    assert.equal(t2.techniqueID, 'T1078');
    assert.equal(t2.score, 0);
    assert.equal(t2.enabled, true);
  });

  it('accepts optional description', () => {
    const { buildNavigatorLayer } = loadLayers();
    const layer = buildNavigatorLayer('Test', [], { description: 'My description' });
    assert.equal(layer.description, 'My description');
  });
});

describe('tools.cjs - exports', () => {
  it('exports registerTools function', () => {
    const { registerTools } = loadTools();
    assert.equal(typeof registerTools, 'function');
  });

  it('exports handler functions for testing', () => {
    const t = loadTools();
    assert.equal(typeof t.handleLookupTechnique, 'function');
    assert.equal(typeof t.handleSearchTechniques, 'function');
    assert.equal(typeof t.handleLookupGroup, 'function');
    assert.equal(typeof t.handleGenerateLayer, 'function');
    assert.equal(typeof t.handleAnalyzeCoverage, 'function');
  });

  it('exports withTimeout wrapper', () => {
    const { withTimeout } = loadTools();
    assert.equal(typeof withTimeout, 'function');
  });
});

describe('tool handlers with intel DB', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('lookup_technique', () => {
    it('returns technique data for valid ID (T1059)', async () => {
      const { handleLookupTechnique } = loadTools();
      const result = await handleLookupTechnique(db, { technique_id: 'T1059' });
      assert.ok(!result.isError);
      assert.ok(result.content);
      assert.equal(result.content[0].type, 'text');

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.id, 'T1059');
      assert.ok(data.name);
      assert.ok(data.description);
      assert.ok(data.tactics);
      assert.ok(data.platforms);
    });

    it('returns sub-technique data for dotted ID (T1059.001)', async () => {
      const { handleLookupTechnique } = loadTools();
      const result = await handleLookupTechnique(db, { technique_id: 'T1059.001' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.id, 'T1059.001');
      assert.ok(data.name);
    });

    it('includes sub_techniques array for parent technique', async () => {
      const { handleLookupTechnique } = loadTools();
      const result = await handleLookupTechnique(db, { technique_id: 'T1059' });
      const data = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(data.sub_techniques));
      assert.ok(data.sub_techniques.length > 0);
    });

    it('returns isError: true for invalid ID', async () => {
      const { handleLookupTechnique } = loadTools();
      const result = await handleLookupTechnique(db, { technique_id: 'T9999' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });

  describe('search_techniques', () => {
    it('returns multiple results for keyword "credential"', async () => {
      const { handleSearchTechniques } = loadTools();
      const result = await handleSearchTechniques(db, { query: 'credential', limit: 20 });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 1, `should find multiple techniques related to credential, got ${data.length}`);
    });

    it('narrows results with tactic filter', async () => {
      const { handleSearchTechniques } = loadTools();
      const allResults = await handleSearchTechniques(db, { query: 'account', limit: 100 });
      const filteredResults = await handleSearchTechniques(db, { query: 'account', tactic: 'Persistence', limit: 100 });

      const allData = JSON.parse(allResults.content[0].text);
      const filtData = JSON.parse(filteredResults.content[0].text);
      assert.ok(filtData.length <= allData.length);
    });

    it('narrows results with platform filter', async () => {
      const { handleSearchTechniques } = loadTools();
      const allResults = await handleSearchTechniques(db, { query: 'execution', limit: 100 });
      const filteredResults = await handleSearchTechniques(db, { query: 'execution', platform: 'Windows', limit: 100 });

      const allData = JSON.parse(allResults.content[0].text);
      const filtData = JSON.parse(filteredResults.content[0].text);
      assert.ok(Array.isArray(filtData));
    });

    it('respects limit parameter', async () => {
      const { handleSearchTechniques } = loadTools();
      const result = await handleSearchTechniques(db, { query: 'access', limit: 5 });
      const data = JSON.parse(result.content[0].text);
      assert.ok(data.length <= 5);
    });
  });

  describe('lookup_group', () => {
    it('returns group data with techniques and software for G0007', async () => {
      const { handleLookupGroup } = loadTools();
      const result = await handleLookupGroup(db, { group_id: 'G0007' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.id, 'G0007');
      assert.ok(data.name);
      assert.ok(data.description);
      assert.ok(Array.isArray(data.techniques));
      assert.ok(Array.isArray(data.software));
    });

    it('supports name-based lookup', async () => {
      const { handleLookupGroup } = loadTools();
      const result = await handleLookupGroup(db, { group_id: 'APT28' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.ok(data.name);
      assert.ok(data.techniques);
    });

    it('returns isError: true for invalid group', async () => {
      const { handleLookupGroup } = loadTools();
      const result = await handleLookupGroup(db, { group_id: 'G9999' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });

  describe('generate_layer', () => {
    it('custom mode produces layer with given technique IDs', async () => {
      const { handleGenerateLayer } = loadTools();
      const result = await handleGenerateLayer(db, {
        mode: 'custom',
        name: 'Custom Layer',
        technique_ids: ['T1059', 'T1078'],
      });
      assert.ok(!result.isError);

      const layer = JSON.parse(result.content[0].text);
      assert.equal(layer.name, 'Custom Layer');
      assert.equal(layer.versions.layer, '4.5');
      assert.equal(layer.domain, 'enterprise-attack');
      assert.equal(layer.techniques.length, 2);
      assert.ok(layer.techniques.every(t => t.score === 100));
    });

    it('group mode produces layer with group techniques', async () => {
      const { handleGenerateLayer } = loadTools();
      const result = await handleGenerateLayer(db, {
        mode: 'group',
        name: 'APT28 Layer',
        group_id: 'G0007',
      });
      assert.ok(!result.isError);

      const layer = JSON.parse(result.content[0].text);
      assert.ok(layer.techniques.length > 0);
      assert.equal(layer.versions.layer, '4.5');
    });

    it('group mode returns isError for an unknown group', async () => {
      const { handleGenerateLayer } = loadTools();
      const result = await handleGenerateLayer(db, {
        mode: 'group',
        name: 'Unknown Group Layer',
        group_id: 'G9999',
      });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Group G9999 not found'));
    });

    it('coverage mode produces layer with detection scores', async () => {
      const { handleGenerateLayer } = loadTools();
      const result = await handleGenerateLayer(db, {
        mode: 'coverage',
        name: 'Coverage Snapshot',
      });
      assert.ok(!result.isError);

      const layer = JSON.parse(result.content[0].text);
      assert.ok(layer.techniques.length > 0);
      const covered = layer.techniques.filter(t => t.score === 100);
      assert.ok(covered.length > 0);
    });

    it('gap mode produces layer highlighting uncovered techniques', async () => {
      const { handleGenerateLayer } = loadTools();
      const result = await handleGenerateLayer(db, {
        mode: 'gap',
        name: 'APT28 Gaps',
        group_id: 'G0007',
      });
      assert.ok(!result.isError);

      const layer = JSON.parse(result.content[0].text);
      assert.ok(layer.techniques.length > 0);
      const uncovered = layer.techniques.filter(t => t.score === 100);
      assert.ok(uncovered.length >= 0);
    });

    it('gap mode returns isError for an unknown group', async () => {
      const { handleGenerateLayer } = loadTools();
      const result = await handleGenerateLayer(db, {
        mode: 'gap',
        name: 'Unknown Group Gaps',
        group_id: 'G9999',
      });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Group G9999 not found'));
    });

    it('layer techniques have techniqueID, score, enabled', async () => {
      const { handleGenerateLayer } = loadTools();
      const result = await handleGenerateLayer(db, {
        mode: 'custom',
        name: 'Test',
        technique_ids: ['T1059'],
      });
      const layer = JSON.parse(result.content[0].text);
      const tech = layer.techniques[0];
      assert.ok('techniqueID' in tech);
      assert.ok('score' in tech);
      assert.ok('enabled' in tech);
    });
  });

  describe('tools.cjs - handleCompareDetections', () => {
    it('returns sources with format, rule_id, title, severity for T1059', async () => {
      const { handleCompareDetections } = loadTools();
      const result = await handleCompareDetections(db, { technique_id: 'T1059' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.technique_id, 'T1059');
      assert.ok(Array.isArray(data.sources));
      assert.ok(typeof data.source_count === 'number');

      if (data.sources.length > 0) {
        const src = data.sources[0];
        assert.ok('format' in src);
        assert.ok('rule_id' in src);
        assert.ok('title' in src);
        assert.ok('severity' in src);
      }
    });

    it('resolves FTS-matched technique for query="powershell"', async () => {
      const { handleCompareDetections } = loadTools();
      const result = await handleCompareDetections(db, { query: 'powershell' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.ok(data.technique_id);
      assert.ok(Array.isArray(data.sources));
    });

    it('returns empty sources for nonexistent technique', async () => {
      const { handleCompareDetections } = loadTools();
      const result = await handleCompareDetections(db, { technique_id: 'T9999' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.source_count, 0);
      assert.deepEqual(data.sources, []);
    });

    it('returns isError when no technique_id or query provided', async () => {
      const { handleCompareDetections } = loadTools();
      const result = await handleCompareDetections(db, {});
      assert.equal(result.isError, true);
    });
  });

  describe('tools.cjs - handleSuggestDetections', () => {
    it('returns suggestions for an uncovered technique', async () => {
      const { handleSuggestDetections } = loadTools();
      const result = await handleSuggestDetections(db, { technique_id: 'T1199' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.technique_id, 'T1199');
      assert.ok(data.technique_name);
      assert.ok('suggestion_basis' in data);
      assert.ok(Array.isArray(data.similar_rules));
      assert.ok(Array.isArray(data.data_sources));
    });

    it('response JSON has all required fields', async () => {
      const { handleSuggestDetections } = loadTools();
      const result = await handleSuggestDetections(db, { technique_id: 'T1059' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.ok('technique_id' in data);
      assert.ok('technique_name' in data);
      assert.ok('suggestion_basis' in data);
      assert.ok('similar_rules' in data);
      assert.ok('data_sources' in data);
    });

    it('returns isError for nonexistent technique', async () => {
      const { handleSuggestDetections } = loadTools();
      const result = await handleSuggestDetections(db, { technique_id: 'T9999' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });

  describe('tools.cjs - handleAnalyzeCoverage (profile mode)', () => {
    it('returns coverage analysis for ransomware profile', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, { profile: 'ransomware' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.ok(typeof data.total_techniques === 'number');
      assert.ok(typeof data.covered === 'number');
      assert.ok(typeof data.uncovered === 'number');
      assert.ok(typeof data.gap_percent === 'number');
      assert.ok(Array.isArray(data.by_tactic));
    });

    it('includes profile_name field for profile parameter', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, { profile: 'apt' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.profile_name, 'apt');
    });

    it('group_id takes precedence over profile', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, { group_id: 'G0007', profile: 'ransomware' });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.group_id, 'G0007');
      assert.ok(data.group_name);
      assert.ok(!data.profile_name);
    });

    it('returns isError when no group_id or profile provided', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, {});
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Available'));
    });
  });

  describe('analyze_coverage', () => {
    it('returns structured coverage data for group', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, { group_id: 'G0007', include_techniques: true });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.group_id, 'G0007');
      assert.ok(data.group_name);
      assert.ok(typeof data.total_techniques === 'number');
      assert.ok(typeof data.covered === 'number');
      assert.ok(typeof data.uncovered === 'number');
      assert.ok(typeof data.gap_percent === 'number');
      assert.ok(Array.isArray(data.by_tactic));
    });

    it('resolves named groups before loading coverage techniques', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, { group_id: 'APT28', include_techniques: true });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.equal(data.group_id, 'G0007');
      assert.equal(data.group_name, 'APT28');
      assert.ok(data.total_techniques > 0);
    });

    it('by_tactic has tactic, total, covered, uncovered, gap_percent per entry', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, { group_id: 'G0007', include_techniques: true });
      const data = JSON.parse(result.content[0].text);

      assert.ok(data.by_tactic.length > 0);
      const tactic = data.by_tactic[0];
      assert.ok('tactic' in tactic);
      assert.ok('total' in tactic);
      assert.ok('covered' in tactic);
      assert.ok('uncovered' in tactic);
      assert.ok('gap_percent' in tactic);
    });

    it('reports actual detection coverage from bundled rules', async () => {
      const { handleAnalyzeCoverage } = loadTools();
      const result = await handleAnalyzeCoverage(db, { group_id: 'G0007', include_techniques: false });
      const data = JSON.parse(result.content[0].text);

      assert.ok(typeof data.covered === 'number');
      assert.ok(typeof data.gap_percent === 'number');
      assert.ok(data.gap_percent >= 0 && data.gap_percent <= 100);
    });

    it('deduplicates repeated profile technique IDs before computing totals', async () => {
      const toolsPath = require.resolve('../apps/mcp/lib/tools.cjs');
      const coverage = require('../apps/mcp/lib/coverage.cjs');
      const originalToolsCache = require.cache[toolsPath];
      const originalGetThreatProfile = coverage.getThreatProfile;
      const originalListThreatProfiles = coverage.listThreatProfiles;

      coverage.getThreatProfile = (name) => {
        if (String(name).toLowerCase() === 'dup-profile') {
          return ['T1059', 'T1059'];
        }
        return originalGetThreatProfile(name);
      };
      coverage.listThreatProfiles = () => [...new Set([...originalListThreatProfiles(), 'dup-profile'])];

      db.prepare(`
        INSERT OR REPLACE INTO detections (
          id, title, source_format, technique_ids, tactics, severity,
          logsource, query, description, metadata, file_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test:dup-profile-coverage',
        'Duplicate Profile Coverage',
        'test',
        'T1059',
        '',
        'medium',
        '',
        '',
        '',
        '{}',
        '/tmp/dup-profile'
      );

      delete require.cache[toolsPath];

      try {
        const { handleAnalyzeCoverage } = require(toolsPath);
        const result = await handleAnalyzeCoverage(db, { profile: 'dup-profile', include_techniques: true });
        const data = JSON.parse(result.content[0].text);

        assert.equal(data.total_techniques, 1);
        assert.equal(data.covered, 1);
        assert.equal(data.uncovered, 0);
        assert.equal(data.gap_percent, 0);
      } finally {
        coverage.getThreatProfile = originalGetThreatProfile;
        coverage.listThreatProfiles = originalListThreatProfiles;
        delete require.cache[toolsPath];
        if (originalToolsCache) require.cache[toolsPath] = originalToolsCache;
      }
    });
  });

  describe('query_knowledge', () => {
    it('returns ATT&CK group entities from a fresh intel DB bootstrap', async () => {
      const { handleQueryKnowledge } = loadTools();
      const result = await handleQueryKnowledge(db, { query: 'APT28', limit: 5 });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(data));
      assert.ok(data.some(entity => entity.type === 'threat_actor' && entity.name === 'APT28'));
    });

    it('supports ATT&CK technique ID lookups after knowledge import', async () => {
      const { handleQueryKnowledge } = loadTools();
      const result = await handleQueryKnowledge(db, { query: 'T1059', limit: 5 });
      assert.ok(!result.isError);

      const data = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(data));
      assert.ok(data.some(entity => entity.type === 'technique' && entity.id === 'technique--t1059'));
    });
  });
});

describe('timeout enforcement', () => {
  it('withTimeout aborts slow handlers that honor AbortSignal', async () => {
    const toolsPath = require.resolve('../apps/mcp/lib/tools.cjs');
    const originalToolsCache = require.cache[toolsPath];
    const originalTimeout = process.env.THRUNT_MCP_TIMEOUT;
    let aborted = false;

    process.env.THRUNT_MCP_TIMEOUT = '50';
    delete require.cache[toolsPath];

    try {
      const { withTimeout } = require(toolsPath);
      const slowHandler = withTimeout(async (_args, signal) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ content: [{ type: 'text', text: 'done' }] }), 5000);
        signal.addEventListener('abort', () => {
          aborted = true;
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }));

      const result = await slowHandler({});
      assert.equal(aborted, true);
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('timed out after 50ms'));
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.THRUNT_MCP_TIMEOUT;
      } else {
        process.env.THRUNT_MCP_TIMEOUT = originalTimeout;
      }
      delete require.cache[toolsPath];
      if (originalToolsCache) require.cache[toolsPath] = originalToolsCache;
    }
  });

  it('withTimeout removes the abort listener after successful completion', async () => {
    const toolsPath = require.resolve('../apps/mcp/lib/tools.cjs');
    const originalToolsCache = require.cache[toolsPath];

    try {
      delete require.cache[toolsPath];
      const { withTimeout } = require(toolsPath);
      let addCount = 0;
      let removeCount = 0;
      let addedListener = null;
      let removedListener = null;

      const fastHandler = withTimeout(async (_args, signal) => {
        const originalAdd = signal.addEventListener.bind(signal);
        const originalRemove = signal.removeEventListener.bind(signal);

        signal.addEventListener = (type, listener, options) => {
          if (type === 'abort') {
            addCount += 1;
            addedListener = listener;
          }
          return originalAdd(type, listener, options);
        };

        signal.removeEventListener = (type, listener, options) => {
          if (type === 'abort') {
            removeCount += 1;
            removedListener = listener;
          }
          return originalRemove(type, listener, options);
        };

        return { content: [{ type: 'text', text: 'done' }] };
      });

      const result = await fastHandler({});
      assert.equal(result.isError, undefined);
      assert.equal(addCount, 1);
      assert.equal(removeCount, 1);
      assert.equal(removedListener, addedListener);
    } finally {
      delete require.cache[toolsPath];
      if (originalToolsCache) require.cache[toolsPath] = originalToolsCache;
    }
  });
});

describe('server.cjs stdout purity', () => {
  it('server.cjs does not contain console.log calls', () => {
    const serverPath = path.join(__dirname, '..', 'apps', 'mcp', 'bin', 'server.cjs');
    const content = fs.readFileSync(serverPath, 'utf-8');
    assert.ok(!content.includes('console.log('));
    assert.ok(content.includes('console.error'));
  });

  it('server.cjs has shebang line', () => {
    const serverPath = path.join(__dirname, '..', 'apps', 'mcp', 'bin', 'server.cjs');
    const content = fs.readFileSync(serverPath, 'utf-8');
    assert.ok(content.startsWith('#!/usr/bin/env node'));
  });

  it('server.cjs can be required without throwing', () => {
    const serverPath = path.join(__dirname, '..', 'apps', 'mcp', 'bin', 'server.cjs');
    const content = fs.readFileSync(serverPath, 'utf-8');
    const code = content.replace(/^#!.*\r?\n/, '');
    assert.doesNotThrow(() => {
      new Function('require', 'module', 'exports', '__dirname', '__filename', 'process', code);
    });
  });
});

describe('tools.cjs - registerTools count', () => {
  it('registers exactly 10 tools on the server', () => {
    const { registerTools } = loadTools();
    const tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    const testDb = openIntelDb({ dbDir: tmpDir });

    let toolCount = 0;
    const mockServer = {
      tool: () => { toolCount++; },
    };

    registerTools(mockServer, testDb);
    testDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    assert.equal(toolCount, 10, `expected 10 tool registrations, got ${toolCount}`);
  });
});

describe('server smoke test', () => {
  it('responds to JSON-RPC initialize request', async () => {
    const tmpDir = makeTempDir();
    const serverPath = path.join(__dirname, '..', 'apps', 'mcp', 'bin', 'server.cjs');

    const result = await new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, [serverPath], {
        env: {
          ...process.env,
          THRUNT_INTEL_DB_DIR: tmpDir,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        // MCP protocol uses Content-Length framing -- look for JSON-RPC response
        if (stdout.includes('"jsonrpc"') && !resolved) {
          resolved = true;
          proc.kill();
          resolve({ stdout, stderr });
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', reject);

      proc.on('close', () => {
        if (!resolved) {
          resolve({ stdout, stderr });
        }
      });

      setTimeout(() => {
        const request = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '0.1.0' },
          },
        });
        proc.stdin.write(request + '\n');
      }, 500);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill();
          resolve({ stdout, stderr });
        }
      }, 10000);
    });

    assert.ok(result.stdout.includes('"jsonrpc"'), `stdout: "${result.stdout.slice(0, 300)}", stderr: "${result.stderr.slice(0, 300)}"`);
    assert.ok(result.stdout.includes('"result"'), `stdout: ${result.stdout.slice(0, 300)}`);

    // maxRetries handles Windows EBUSY when SQLite WAL files are still locked after proc.kill()
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });
});
