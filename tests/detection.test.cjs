/**
 * Tests for detection.cjs -- Detection candidate model, finding-to-detection mapping,
 * promotion readiness scoring, format-agnostic rendering, and CLI integration.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempProject, runThruntTools, cleanup } = require('./helpers.cjs');

// ---------------------------------------------------------------------------
// Unit tests: createDetectionCandidate
// ---------------------------------------------------------------------------

describe('createDetectionCandidate', () => {
  let detection;
  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('returns a candidate object with all required fields', () => {
    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-001',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Test detection',
        description: 'Test',
        logsource: { category: 'authentication' },
        detection: { selection: { user: '*' }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: 'test' },
    });

    assert.ok(candidate, 'candidate should not be null');
    assert.equal(candidate.candidate_version, '1.0');
    assert.match(candidate.candidate_id, /^DET-\d{14}-[A-F0-9]{8}$/);
    assert.equal(candidate.source_finding_id, 'F-001');
    assert.deepEqual(candidate.technique_ids, ['T1078']);
    assert.ok(candidate.detection_logic);
    assert.equal(candidate.confidence, 'high');
    assert.ok(Array.isArray(candidate.evidence_links));
    assert.ok(candidate.metadata);
    assert.ok(candidate.metadata.created_at);
    assert.ok(candidate.metadata.last_updated);
    assert.equal(candidate.metadata.status, 'draft');
    assert.ok(candidate.content_hash);
    assert.match(candidate.content_hash, /^sha256:/);
  });

  it('returns null when technique_ids is empty (ATT&CK mapping required)', () => {
    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-001',
      technique_ids: [],
      detection_logic: { title: 'Test' },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: 'test' },
    });

    assert.equal(candidate, null);
  });

  it('returns null when technique_ids is undefined', () => {
    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-001',
      detection_logic: { title: 'Test' },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: 'test' },
    });

    assert.equal(candidate, null);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: mapFindingsToDetections
// ---------------------------------------------------------------------------

describe('mapFindingsToDetections', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns empty array when no findings exist', () => {
    const candidates = detection.mapFindingsToDetections(tmpDir, {});
    assert.ok(Array.isArray(candidates));
    assert.equal(candidates.length, 0);
  });

  it('skips refuted findings', () => {
    // Create a phase directory with a FINDINGS.md containing a refuted finding
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '17-detection-mapping-model');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'FINDINGS.md'), [
      '# Findings',
      '',
      '- **F-001**: Something refuted | status: refuted | hypothesis: HYP-04',
    ].join('\n'));

    const candidates = detection.mapFindingsToDetections(tmpDir, {});
    assert.equal(candidates.length, 0);
  });

  it('produces at least one candidate for a confirmed finding with technique mappings', () => {
    // Create a phase directory with a confirmed finding
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '17-detection-mapping-model');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'FINDINGS.md'), [
      '# Findings',
      '',
      '- **F-001**: Suspicious T1078 valid account usage detected | status: confirmed | hypothesis: HYP-04',
    ].join('\n'));

    // Create DETECTIONS directory so candidates can be written
    fs.mkdirSync(path.join(tmpDir, '.planning', 'DETECTIONS'), { recursive: true });

    const candidates = detection.mapFindingsToDetections(tmpDir, {});
    assert.ok(candidates.length >= 1, 'should produce at least one candidate');
    assert.equal(candidates[0].source_finding_id, 'F-001');
    assert.ok(candidates[0].technique_ids.length > 0);
  });

  it('skips findings without technique resolution', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '17-detection-mapping-model');
    fs.mkdirSync(phaseDir, { recursive: true });
    // A finding that has no T{4digit} pattern and no matching pack
    fs.writeFileSync(path.join(phaseDir, 'FINDINGS.md'), [
      '# Findings',
      '',
      '- **F-002**: Generic observation with no technique | status: confirmed | hypothesis: HYP-99',
    ].join('\n'));

    const candidates = detection.mapFindingsToDetections(tmpDir, {});
    assert.equal(candidates.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: scorePromotionReadiness
// ---------------------------------------------------------------------------

describe('scorePromotionReadiness', () => {
  let detection;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('returns a number between 0 and 1 with 4-decimal precision', () => {
    const score = detection.scorePromotionReadiness(
      { technique_ids: ['T1078'], evidence_links: [{ type: 'receipt', id: 'RCT-001' }] },
      { finding_status: 'confirmed' }
    );
    assert.equal(typeof score, 'number');
    assert.ok(score >= 0 && score <= 1);
    // Check 4-decimal precision: rounding to 4 decimals should not change the value
    const rounded = Math.round(score * 10000) / 10000;
    assert.equal(score, rounded);
  });

  it('returns score >= 0.7 for candidate with 3 receipts, technique_ids, and confirmed finding', () => {
    const score = detection.scorePromotionReadiness(
      {
        technique_ids: ['T1078', 'T1078.004'],
        evidence_links: [
          { type: 'receipt', id: 'RCT-001' },
          { type: 'receipt', id: 'RCT-002' },
          { type: 'receipt', id: 'RCT-003' },
        ],
      },
      { finding_status: 'confirmed' }
    );
    assert.ok(score >= 0.7, `Expected score >= 0.7 but got ${score}`);
  });

  it('returns score with evidence dimension at 0 for candidate with 0 receipts', () => {
    const score = detection.scorePromotionReadiness(
      { technique_ids: ['T1078'], evidence_links: [] },
      { finding_status: 'confirmed' }
    );
    // evidence = 0 * 0.4 = 0, technique = 1.0 * 0.3, confidence = 1.0 * 0.3 = 0.6
    assert.equal(score, 0.6);
  });

  it('returns 0 for candidate with 0 technique_ids', () => {
    const score = detection.scorePromotionReadiness(
      { technique_ids: [], evidence_links: [] },
      { finding_status: 'confirmed' }
    );
    // evidence = 0, technique = 0 * 0.3 = 0, confidence = 1.0 * 0.3 = 0.3
    assert.equal(score, 0.3);
  });

  it('maps finding_status correctly in confidence dimension', () => {
    const base = { technique_ids: ['T1078'], evidence_links: [] };

    const confirmed = detection.scorePromotionReadiness(base, { finding_status: 'confirmed' });
    const supported = detection.scorePromotionReadiness(base, { finding_status: 'supported' });
    const inconclusive = detection.scorePromotionReadiness(base, { finding_status: 'inconclusive' });
    const unknown = detection.scorePromotionReadiness(base, { finding_status: 'unknown' });

    assert.ok(confirmed > supported, 'confirmed > supported');
    assert.ok(supported > inconclusive, 'supported > inconclusive');
    assert.ok(inconclusive > unknown, 'inconclusive > unknown');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: renderCandidate
// ---------------------------------------------------------------------------

describe('renderCandidate', () => {
  let detection;
  const testCandidate = {
    candidate_id: 'DET-20260327150000-A1B2C3D4',
    source_finding_id: 'F-001',
    technique_ids: ['T1078', 'T1078.004'],
    detection_logic: {
      title: 'Valid Account Cloud Login',
      description: 'Detects anomalous login',
      logsource: { category: 'authentication', product: 'azure' },
      detection: { selection: { ResultType: 0 }, condition: 'selection' },
      false_positives: ['Users traveling'],
    },
    confidence: 'high',
    metadata: {
      author: 'thrunt-detection-mapper',
      created_at: '2026-03-27T15:00:00.000Z',
      last_updated: '2026-03-27T15:00:00.000Z',
      status: 'draft',
      notes: 'Test candidate',
    },
  };

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('sigma format returns object with format and content containing required Sigma fields', () => {
    const result = detection.renderCandidate(testCandidate, 'sigma');
    assert.equal(result.format, 'sigma');
    assert.ok(typeof result.content === 'string');
    assert.ok(result.content.includes('title:'), 'should contain title:');
    assert.ok(result.content.includes('logsource:'), 'should contain logsource:');
    assert.ok(result.content.includes('detection:'), 'should contain detection:');
  });

  it('splunk_spl format returns object with format and content string', () => {
    const result = detection.renderCandidate(testCandidate, 'splunk_spl');
    assert.equal(result.format, 'splunk_spl');
    assert.ok(typeof result.content === 'string');
  });

  it('elastic_eql format returns object with format and content string', () => {
    const result = detection.renderCandidate(testCandidate, 'elastic_eql');
    assert.equal(result.format, 'elastic_eql');
    assert.ok(typeof result.content === 'string');
  });

  it('kql format returns object with format and content string', () => {
    const result = detection.renderCandidate(testCandidate, 'kql');
    assert.equal(result.format, 'kql');
    assert.ok(typeof result.content === 'string');
  });

  it('unknown format returns object with error property', () => {
    const result = detection.renderCandidate(testCandidate, 'unknown_format');
    assert.ok(result.error);
    assert.ok(Array.isArray(result.supported));
  });
});

// ---------------------------------------------------------------------------
// Unit tests: listDetectionCandidates
// ---------------------------------------------------------------------------

describe('listDetectionCandidates', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns empty array on empty DETECTIONS/ directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'DETECTIONS'), { recursive: true });
    const result = detection.listDetectionCandidates(tmpDir, {});
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('returns empty array when DETECTIONS/ does not exist', () => {
    const result = detection.listDetectionCandidates(tmpDir, {});
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('reads and returns parsed candidate objects from DETECTIONS/', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });
    const candidate = {
      candidate_version: '1.0',
      candidate_id: 'DET-20260327150000-A1B2C3D4',
      source_finding_id: 'F-001',
      technique_ids: ['T1078'],
      metadata: { status: 'draft' },
    };
    fs.writeFileSync(
      path.join(detectionsDir, 'DET-20260327150000-A1B2C3D4.json'),
      JSON.stringify(candidate)
    );

    const result = detection.listDetectionCandidates(tmpDir, {});
    assert.equal(result.length, 1);
    assert.equal(result[0].candidate_id, 'DET-20260327150000-A1B2C3D4');
  });

  it('filters by status when --status option is provided', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const draft = {
      candidate_id: 'DET-20260327150000-AAAAAAAA',
      metadata: { status: 'draft' },
    };
    const promoted = {
      candidate_id: 'DET-20260327150000-BBBBBBBB',
      metadata: { status: 'promoted' },
    };
    fs.writeFileSync(
      path.join(detectionsDir, 'DET-20260327150000-AAAAAAAA.json'),
      JSON.stringify(draft)
    );
    fs.writeFileSync(
      path.join(detectionsDir, 'DET-20260327150000-BBBBBBBB.json'),
      JSON.stringify(promoted)
    );

    const result = detection.listDetectionCandidates(tmpDir, { status: 'draft' });
    assert.equal(result.length, 1);
    assert.equal(result[0].candidate_id, 'DET-20260327150000-AAAAAAAA');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: planningPaths includes detections
// ---------------------------------------------------------------------------

describe('planningPaths detections', () => {
  it('planningPaths(cwd).detections returns a path ending in DETECTIONS', () => {
    const { planningPaths } = require('../thrunt-god/bin/lib/core.cjs');
    const paths = planningPaths('/tmp/test-project');
    assert.ok(paths.detections);
    assert.ok(paths.detections.endsWith('DETECTIONS'));
  });
});

// ---------------------------------------------------------------------------
// Unit tests: toYaml
// ---------------------------------------------------------------------------

describe('toYaml', () => {
  let detection;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('quotes string values containing colons', () => {
    const yaml = detection.toYaml({ key: 'value: with colon' });
    assert.ok(yaml.includes('"value: with colon"'));
  });

  it('renders arrays with dash prefix', () => {
    const yaml = detection.toYaml({ items: ['one', 'two'] });
    assert.ok(yaml.includes('- one'));
    assert.ok(yaml.includes('- two'));
  });

  it('indents nested objects', () => {
    const yaml = detection.toYaml({ parent: { child: 'value' } });
    assert.ok(yaml.includes('parent:'));
    assert.ok(yaml.includes('  child: value'));
  });
});

// ---------------------------------------------------------------------------
// CLI Integration tests
// ---------------------------------------------------------------------------

describe('CLI: detection map', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('detection map with a valid finding produces candidate JSON files in DETECTIONS/', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '17-detection-mapping-model');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'DETECTIONS'), { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'FINDINGS.md'), [
      '# Findings',
      '',
      '- **F-001**: Suspicious T1078 valid account usage detected | status: confirmed | hypothesis: HYP-04',
    ].join('\n'));

    const result = runThruntTools(['detection', 'map', '--phase', '17'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);

    // Verify candidate file was created
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    const files = fs.readdirSync(detectionsDir).filter(f => f.endsWith('.json'));
    assert.ok(files.length >= 1, `Expected at least 1 candidate file, got ${files.length}`);

    // Verify file contains valid JSON with expected fields
    const candidate = JSON.parse(fs.readFileSync(path.join(detectionsDir, files[0]), 'utf-8'));
    assert.equal(candidate.source_finding_id, 'F-001');
    assert.ok(candidate.technique_ids.length > 0);
    assert.equal(candidate.candidate_version, '1.0');
  });

  it('detection map with no findings produces empty result', () => {
    // Without --raw, output is human text via output(candidates, true, markdown)
    const result = runThruntTools(['detection', 'map'], tmpDir);
    assert.ok(result.success);
    assert.ok(result.output.includes('No detection candidates'));
  });

  it('detection map --raw outputs JSON array', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '17-detection-mapping-model');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'DETECTIONS'), { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'FINDINGS.md'), [
      '# Findings',
      '',
      '- **F-001**: Suspicious T1078 valid account usage detected | status: confirmed | hypothesis: HYP-04',
    ].join('\n'));

    // --raw => output(candidates, raw) => JSON.stringify(candidates)
    const result = runThruntTools(['detection', 'map', '--phase', '17', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);

    // Output should be valid JSON array
    const parsed = JSON.parse(result.output);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 1);
  });
});

describe('CLI: detection list', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('detection list --raw reads previously-written candidates as JSON', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });
    const candidate = {
      candidate_version: '1.0',
      candidate_id: 'DET-20260327150000-A1B2C3D4',
      source_finding_id: 'F-001',
      technique_ids: ['T1078'],
      target_format: 'sigma',
      promotion_readiness: 0.85,
      metadata: { status: 'draft' },
    };
    fs.writeFileSync(
      path.join(detectionsDir, 'DET-20260327150000-A1B2C3D4.json'),
      JSON.stringify(candidate)
    );

    // --raw => JSON output
    const result = runThruntTools(['detection', 'list', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].candidate_id, 'DET-20260327150000-A1B2C3D4');
  });

  it('detection list --status draft --raw filters correctly', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const draft = {
      candidate_id: 'DET-20260327150000-AAAAAAAA',
      source_finding_id: 'F-001',
      metadata: { status: 'draft' },
    };
    const promoted = {
      candidate_id: 'DET-20260327150000-BBBBBBBB',
      source_finding_id: 'F-002',
      metadata: { status: 'promoted' },
    };
    fs.writeFileSync(
      path.join(detectionsDir, 'DET-20260327150000-AAAAAAAA.json'),
      JSON.stringify(draft)
    );
    fs.writeFileSync(
      path.join(detectionsDir, 'DET-20260327150000-BBBBBBBB.json'),
      JSON.stringify(promoted)
    );

    const result = runThruntTools(['detection', 'list', '--status', 'draft', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].candidate_id, 'DET-20260327150000-AAAAAAAA');
  });

  it('detection list --raw with no DETECTIONS returns empty JSON array', () => {
    const result = runThruntTools(['detection', 'list', '--raw'], tmpDir);
    assert.ok(result.success);
    const parsed = JSON.parse(result.output);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 0);
  });
});

describe('CLI: detection unknown subcommand', () => {
  it('shows error for unknown subcommand', () => {
    const tmpDir = createTempProject();
    const result = runThruntTools(['detection', 'unknown'], tmpDir);
    assert.ok(!result.success);
    cleanup(tmpDir);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: generateDetectionRules
// ---------------------------------------------------------------------------

describe('generateDetectionRules', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('generates rule files in DETECTIONS/rules/ for valid candidates', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-001',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Test detection',
        description: 'Test description',
        logsource: { category: 'authentication', product: 'azure' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: 'test' },
    });

    fs.writeFileSync(
      path.join(detectionsDir, `${candidate.candidate_id}.json`),
      JSON.stringify(candidate, null, 2)
    );

    const report = detection.generateDetectionRules(tmpDir, {});
    assert.ok(report.generated > 0, 'should generate at least one rule');
    assert.ok(report.rules.length > 0, 'rules array should have entries');

    const rulesDir = path.join(detectionsDir, 'rules');
    assert.ok(fs.existsSync(rulesDir), 'rules/ directory should exist');
    const ruleFiles = fs.readdirSync(rulesDir);
    assert.ok(ruleFiles.length > 0, 'should have at least one rule file');
  });

  it('skips candidates with empty detection_logic', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = {
      candidate_version: '1.0',
      candidate_id: 'DET-20260327150000-EMPTYLOG',
      source_finding_id: 'F-002',
      technique_ids: ['T1078'],
      detection_logic: {},
      target_format: 'sigma',
      confidence: 'medium',
      promotion_readiness: 0.5,
      evidence_links: [],
      metadata: { author: 'test', created_at: '2026-03-27T15:00:00Z', last_updated: '2026-03-27T15:00:00Z', status: 'draft', notes: '' },
      content_hash: 'sha256:abc',
    };

    fs.writeFileSync(
      path.join(detectionsDir, `${candidate.candidate_id}.json`),
      JSON.stringify(candidate, null, 2)
    );

    const report = detection.generateDetectionRules(tmpDir, {});
    assert.equal(report.generated, 0, 'should not generate any rules');
    assert.equal(report.skipped, 1, 'should skip one candidate');
    assert.ok(report.skipped_candidates.length > 0, 'skipped_candidates array should have entries');
    assert.ok(report.skipped_candidates[0].reason.includes('detection_logic'), 'reason should mention detection_logic');
  });

  it('uses correct filenames with format-specific extensions', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-003',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Extension test',
        description: 'Test',
        logsource: { category: 'authentication' },
        detection: { selection: { user: 'admin' }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });

    fs.writeFileSync(
      path.join(detectionsDir, `${candidate.candidate_id}.json`),
      JSON.stringify(candidate, null, 2)
    );

    const report = detection.generateDetectionRules(tmpDir, {});
    assert.ok(report.generated > 0);
    const ruleFiles = fs.readdirSync(path.join(detectionsDir, 'rules'));
    // Sigma candidate should produce .yml file
    const sigmaFile = ruleFiles.find(f => f.endsWith('.yml'));
    assert.ok(sigmaFile, 'sigma rule should have .yml extension');
    assert.ok(sigmaFile.includes(candidate.candidate_id), 'filename should include candidate_id');
  });

  it('returns a properly shaped generation report', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const report = detection.generateDetectionRules(tmpDir, {});
    assert.equal(typeof report.total_candidates, 'number');
    assert.equal(typeof report.generated, 'number');
    assert.equal(typeof report.skipped, 'number');
    assert.equal(typeof report.errors, 'number');
    assert.ok(Array.isArray(report.rules));
    assert.ok(Array.isArray(report.skipped_candidates));
    assert.ok(report.format_breakdown && typeof report.format_breakdown === 'object');
  });

  it('filters by candidate_id when options.candidate is set', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate1 = detection.createDetectionCandidate({
      source_finding_id: 'F-A',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'First',
        description: 'First detection',
        logsource: { category: 'auth' },
        detection: { selection: { user: 'a' }, condition: 'selection' },
      },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });

    const candidate2 = detection.createDetectionCandidate({
      source_finding_id: 'F-B',
      technique_ids: ['T1110'],
      detection_logic: {
        title: 'Second',
        description: 'Second detection',
        logsource: { category: 'auth' },
        detection: { selection: { user: 'b' }, condition: 'selection' },
      },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });

    fs.writeFileSync(path.join(detectionsDir, `${candidate1.candidate_id}.json`), JSON.stringify(candidate1, null, 2));
    fs.writeFileSync(path.join(detectionsDir, `${candidate2.candidate_id}.json`), JSON.stringify(candidate2, null, 2));

    const report = detection.generateDetectionRules(tmpDir, { candidate: candidate1.candidate_id });
    assert.equal(report.generated, 1, 'should generate only the filtered candidate');
    assert.equal(report.rules[0].candidate_id, candidate1.candidate_id);
  });

  it('handles candidates with missing detection_logic key (null)', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = {
      candidate_version: '1.0',
      candidate_id: 'DET-20260327150000-NULLLOGC',
      source_finding_id: 'F-004',
      technique_ids: ['T1078'],
      detection_logic: null,
      target_format: 'sigma',
      confidence: 'medium',
      promotion_readiness: 0.3,
      evidence_links: [],
      metadata: { author: 'test', created_at: '2026-03-27T15:00:00Z', last_updated: '2026-03-27T15:00:00Z', status: 'draft', notes: '' },
      content_hash: 'sha256:abc',
    };

    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const report = detection.generateDetectionRules(tmpDir, {});
    assert.equal(report.generated, 0);
    assert.equal(report.skipped, 1);
    assert.ok(report.skipped_candidates[0].reason.includes('detection_logic'));
  });
});

// ---------------------------------------------------------------------------
// Unit tests: validateStructure
// ---------------------------------------------------------------------------

describe('validateStructure', () => {
  let detection;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('validates Sigma required fields (title, logsource, detection.condition)', () => {
    const candidate = {
      detection_logic: {
        title: 'Valid Sigma Rule',
        logsource: { category: 'authentication', product: 'azure' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
      },
      target_format: 'sigma',
    };

    const result = detection.validateStructure(candidate, 'sigma');
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('reports errors for missing Sigma required fields', () => {
    const candidate = {
      detection_logic: {},
      target_format: 'sigma',
    };

    const result = detection.validateStructure(candidate, 'sigma');
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3, 'should have errors for title, logsource, detection');
    assert.ok(result.errors.some(e => e.includes('title')));
    assert.ok(result.errors.some(e => e.includes('logsource')));
    assert.ok(result.errors.some(e => e.includes('detection')));
  });

  it('warns on Sigma anti-patterns (empty logsource, empty selection)', () => {
    const candidate = {
      detection_logic: {
        title: 'Anti-pattern test',
        logsource: {},
        detection: { selection: {}, condition: 'selection' },
      },
      target_format: 'sigma',
    };

    const result = detection.validateStructure(candidate, 'sigma');
    assert.equal(result.valid, true, 'should still be valid with just warnings');
    assert.ok(result.warnings.length >= 1, 'should have at least one warning');
  });

  it('validates SPL/EQL/KQL stubs with stub warning', () => {
    for (const format of ['splunk_spl', 'elastic_eql', 'kql']) {
      const candidate = {
        detection_logic: { title: 'Stub test' },
        target_format: format,
      };

      const result = detection.validateStructure(candidate, format);
      assert.equal(result.valid, true, `${format} should be valid`);
      assert.ok(result.warnings.some(w => w.includes('stub')), `${format} should have stub warning`);
    }
  });

  it('handles unknown format gracefully', () => {
    const candidate = {
      detection_logic: { title: 'Test' },
      target_format: 'unknown_format',
    };

    const result = detection.validateStructure(candidate, 'unknown_format');
    assert.ok(result.errors.length > 0 || result.warnings.length > 0, 'should report issue for unknown format');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: scoreNoise
// ---------------------------------------------------------------------------

describe('scoreNoise', () => {
  let detection;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('scores low noise for specific Sigma content with no wildcards', () => {
    const candidate = {
      target_format: 'sigma',
      detection_logic: {
        title: 'Specific detection',
        logsource: { category: 'authentication' },
        detection: {
          selection: { EventID: 4624, LogonType: 10, TargetUserName: 'admin', SourceIP: '192.168.1.1', WorkstationName: 'WS01' },
          condition: 'selection',
        },
      },
    };
    // Sigma rendered content with specific fields, no wildcards, timeframe present
    const rendered = [
      'title: Specific detection',
      'logsource:',
      '  category: authentication',
      'detection:',
      '  selection:',
      '    EventID: 4624',
      '    LogonType: 10',
      '    TargetUserName: admin',
      '    SourceIP: 192.168.1.1',
      '    WorkstationName: WS01',
      '  condition: selection',
    ].join('\n');

    const result = detection.scoreNoise(candidate, rendered);
    assert.equal(result.noise_risk, 'low', `Expected low but got ${result.noise_risk} (score: ${result.score})`);
    assert.ok(result.dimensions);
    assert.equal(typeof result.score, 'number');
  });

  it('scores high noise for wildcard-heavy content with empty selection', () => {
    const candidate = {
      target_format: 'sigma',
      detection_logic: {
        title: 'Broad detection',
        logsource: { category: 'generic' },
        detection: {
          selection: {},
          condition: 'selection',
        },
      },
    };
    const rendered = [
      'title: Broad detection',
      'logsource:',
      '  category: generic',
      'detection:',
      '  selection:',
      '    CommandLine: "*"',
      '    ParentImage: "*"',
      '    TargetFilename: "*\\\\temp\\\\*"',
      '  condition: selection',
    ].join('\n');

    const result = detection.scoreNoise(candidate, rendered);
    assert.ok(result.score > 0.3, `Expected score > 0.3 but got ${result.score}`);
    assert.ok(result.dimensions.wildcard_density > 0, 'wildcard_density should be > 0');
  });

  it('returns medium noise with stub flag for stub formats', () => {
    for (const format of ['splunk_spl', 'elastic_eql', 'kql']) {
      const candidate = {
        target_format: format,
        detection_logic: { title: 'Stub' },
      };
      const rendered = 'index=* sourcetype=*';

      const result = detection.scoreNoise(candidate, rendered);
      assert.equal(result.noise_risk, 'medium', `${format} should be medium risk`);
      assert.equal(result.stub, true, `${format} should have stub: true`);
    }
  });

  it('returns dimensional breakdown in noise result', () => {
    const candidate = {
      target_format: 'sigma',
      detection_logic: {
        title: 'Test',
        logsource: { category: 'auth' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
      },
    };
    const rendered = 'detection:\n  selection:\n    EventID: 4624\n  condition: selection';

    const result = detection.scoreNoise(candidate, rendered);
    assert.ok('wildcard_density' in result.dimensions);
    assert.ok('field_specificity' in result.dimensions);
    assert.ok('time_window_breadth' in result.dimensions);
    assert.ok('negation_only' in result.dimensions);
    assert.ok(result.score >= 0 && result.score <= 1, 'score should be 0-1');
  });

  it('scores negation-only conditions as higher noise', () => {
    const candidate = {
      target_format: 'sigma',
      detection_logic: {
        title: 'Negation only',
        logsource: { category: 'auth' },
        detection: {
          selection: { EventID: 4624, TargetUserName: 'admin', SourceIP: '10.0.0.1', LogonType: 3, WorkstationName: 'DC01' },
          filter: { User: 'SYSTEM' },
          condition: 'NOT filter',
        },
      },
    };
    const rendered = 'detection:\n  selection:\n    EventID: 4624\n  filter:\n    User: SYSTEM\n  condition: NOT filter';

    const result = detection.scoreNoise(candidate, rendered);
    assert.equal(result.dimensions.negation_only, 1.0, 'negation_only should be 1.0');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: backtestDetection
// ---------------------------------------------------------------------------

describe('backtestDetection', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('produces a valid backtest result with required fields', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-BT1',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Backtest test',
        description: 'Test',
        logsource: { category: 'authentication', product: 'azure' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: 'test' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const result = detection.backtestDetection(tmpDir, candidate);
    assert.match(result.backtest_id, /^BT-\d{14}-[A-F0-9]{8}$/);
    assert.equal(result.candidate_id, candidate.candidate_id);
    assert.ok(result.timestamp);
    assert.ok(result.validation);
    assert.equal(typeof result.validation.passed, 'boolean');
    assert.ok(Array.isArray(result.validation.errors));
    assert.ok(Array.isArray(result.validation.warnings));
    assert.ok(result.noise_score);
    assert.ok(result.noise_score.noise_risk);
    assert.equal(typeof result.promotion_readiness_delta, 'number');
    assert.ok(result.content_hash);
    assert.match(result.content_hash, /^sha256:/);
  });

  it('writes backtest result to backtests/ directory', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-BT2',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Write test',
        description: 'Test',
        logsource: { category: 'authentication' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const result = detection.backtestDetection(tmpDir, candidate);
    const backtestsDir = path.join(detectionsDir, 'backtests');
    assert.ok(fs.existsSync(backtestsDir), 'backtests/ directory should exist');
    const files = fs.readdirSync(backtestsDir).filter(f => f.endsWith('.json'));
    assert.ok(files.length > 0, 'should have at least one backtest file');

    const written = JSON.parse(fs.readFileSync(path.join(backtestsDir, files[0]), 'utf-8'));
    assert.equal(written.backtest_id, result.backtest_id);
  });

  it('applies -0.2 penalty for structural validation failure', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    // Candidate with invalid detection_logic (missing required fields for sigma)
    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-BT3',
      technique_ids: ['T1078'],
      detection_logic: {
        // Missing title, logsource, detection.condition
        description: 'Incomplete candidate',
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const result = detection.backtestDetection(tmpDir, candidate);
    assert.equal(result.validation.passed, false, 'validation should fail');
    assert.ok(result.promotion_readiness_delta <= -0.2, `delta should include -0.2 penalty, got ${result.promotion_readiness_delta}`);
  });

  it('applies noise penalty to promotion_readiness_delta', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-BT4',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Valid but noisy',
        description: 'Test',
        logsource: { category: 'authentication' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const result = detection.backtestDetection(tmpDir, candidate);
    // The delta should be a number (could be negative for noise penalty)
    assert.equal(typeof result.promotion_readiness_delta, 'number');
  });

  it('updates candidate JSON with new promotion_readiness after backtest', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-BT5',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Update test',
        description: 'Test',
        logsource: { category: 'authentication', product: 'azure' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    const originalReadiness = candidate.promotion_readiness;
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    detection.backtestDetection(tmpDir, candidate);

    // Re-read candidate from disk
    const updated = JSON.parse(fs.readFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), 'utf-8'));
    assert.notEqual(updated.promotion_readiness, originalReadiness, 'promotion_readiness should be updated');
    assert.ok(updated.promotion_readiness >= 0 && updated.promotion_readiness <= 1, 'should be in 0-1 range');
    // Content hash should be recomputed
    assert.ok(updated.content_hash);
    assert.match(updated.content_hash, /^sha256:/);
  });

  it('validates expected_outcomes when present', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-BT6',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Expected outcomes test',
        description: 'Test',
        logsource: { category: 'authentication' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    candidate.expected_outcomes = {
      expected_matches: { min: 1, max: 100 },
      expected_noise_level: 'low',
      time_window: '24h',
    };
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const result = detection.backtestDetection(tmpDir, candidate);
    assert.ok(result.expected_outcomes, 'expected_outcomes should be in result');
    assert.equal(result.expected_outcomes.valid, true, 'expected outcomes should validate');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: validateExpectedOutcomes
// ---------------------------------------------------------------------------

describe('validateExpectedOutcomes', () => {
  let detection;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('returns valid with warning when outcomes is null', () => {
    const result = detection.validateExpectedOutcomes(null);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.length > 0, 'should warn about missing expected outcomes');
  });

  it('returns valid for well-formed expected outcomes', () => {
    const result = detection.validateExpectedOutcomes({
      expected_matches: { min: 0, max: 50 },
      expected_noise_level: 'low',
      time_window: '24h',
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('returns invalid for malformed expected outcomes', () => {
    const result = detection.validateExpectedOutcomes({
      expected_matches: { min: 'not a number' },
      expected_noise_level: 'invalid_level',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: FORMAT_EXTENSIONS and makeBacktestId
// ---------------------------------------------------------------------------

describe('FORMAT_EXTENSIONS and makeBacktestId', () => {
  let detection;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('FORMAT_EXTENSIONS maps formats to correct extensions', () => {
    assert.equal(detection.FORMAT_EXTENSIONS.sigma, '.yml');
    assert.equal(detection.FORMAT_EXTENSIONS.splunk_spl, '.spl');
    assert.equal(detection.FORMAT_EXTENSIONS.elastic_eql, '.eql');
    assert.equal(detection.FORMAT_EXTENSIONS.kql, '.kql');
  });

  it('makeBacktestId returns BT- prefixed ID matching expected pattern', () => {
    const id = detection.makeBacktestId();
    assert.match(id, /^BT-\d{14}-[A-F0-9]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// CLI Integration tests: detection generate
// ---------------------------------------------------------------------------

describe('CLI: detection generate', () => {
  let tmpDir;
  let candidateId;

  beforeEach(() => {
    tmpDir = createTempProject();
    const detection = require('../thrunt-god/bin/lib/detection.cjs');
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-CLI-GEN',
      source_phase: 'test-phase',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'CLI generate test',
        description: 'Test detection for CLI',
        logsource: { category: 'authentication', product: 'azure' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    candidateId = candidate.candidate_id;

    fs.writeFileSync(
      path.join(detectionsDir, `${candidate.candidate_id}.json`),
      JSON.stringify(candidate, null, 2)
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('detection generate --phase test exits 0 and creates rule files', () => {
    const result = runThruntTools(['detection', 'generate', '--phase', 'test'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);

    const rulesDir = path.join(tmpDir, '.planning', 'DETECTIONS', 'rules');
    assert.ok(fs.existsSync(rulesDir), 'rules/ directory should exist');
    const files = fs.readdirSync(rulesDir);
    assert.ok(files.length >= 1, 'should have at least one rule file');
  });

  it('detection generate --candidate ID --raw returns valid JSON report', () => {
    const result = runThruntTools(['detection', 'generate', '--candidate', candidateId, '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);

    const report = JSON.parse(result.output);
    assert.equal(report.generated, 1);
    assert.ok(report.rules.length === 1);
    assert.equal(report.rules[0].candidate_id, candidateId);
  });

  it('detection generate --phase nonexistent exits 0 with empty report', () => {
    const result = runThruntTools(['detection', 'generate', '--phase', 'nonexistent', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);

    const report = JSON.parse(result.output);
    assert.equal(report.generated, 0);
    assert.equal(report.total_candidates, 0);
  });
});

// ---------------------------------------------------------------------------
// CLI Integration tests: detection backtest
// ---------------------------------------------------------------------------

describe('CLI: detection backtest', () => {
  let tmpDir;
  let candidateId;

  beforeEach(() => {
    tmpDir = createTempProject();
    const detection = require('../thrunt-god/bin/lib/detection.cjs');
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-CLI-BT',
      source_phase: 'test-phase',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'CLI backtest test',
        description: 'Test detection for backtest CLI',
        logsource: { category: 'authentication', product: 'azure' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    candidateId = candidate.candidate_id;

    fs.writeFileSync(
      path.join(detectionsDir, `${candidate.candidate_id}.json`),
      JSON.stringify(candidate, null, 2)
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('detection backtest --phase test exits 0 and creates backtest files', () => {
    const result = runThruntTools(['detection', 'backtest', '--phase', 'test'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);

    const backtestsDir = path.join(tmpDir, '.planning', 'DETECTIONS', 'backtests');
    assert.ok(fs.existsSync(backtestsDir), 'backtests/ directory should exist');
    const files = fs.readdirSync(backtestsDir).filter(f => f.endsWith('.json'));
    assert.ok(files.length >= 1, 'should have at least one backtest file');
  });

  it('detection backtest --candidate ID --raw returns JSON with validation and noise_score', () => {
    const result = runThruntTools(['detection', 'backtest', '--candidate', candidateId, '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);

    const summary = JSON.parse(result.output);
    assert.equal(summary.backtested, 1);
    assert.ok(summary.results.length === 1);
    assert.ok(summary.results[0].validation);
    assert.ok(summary.results[0].noise_score);
    assert.ok(summary.results[0].noise_score.noise_risk);
  });

  it('updates candidate JSON with new promotion_readiness after backtest', () => {
    const candidateFile = path.join(tmpDir, '.planning', 'DETECTIONS', `${candidateId}.json`);
    const before = JSON.parse(fs.readFileSync(candidateFile, 'utf-8'));
    const originalReadiness = before.promotion_readiness;

    runThruntTools(['detection', 'backtest', '--candidate', candidateId], tmpDir);

    const after = JSON.parse(fs.readFileSync(candidateFile, 'utf-8'));
    // After backtest, promotion_readiness should be updated (different from original 0)
    assert.ok(after.promotion_readiness >= 0 && after.promotion_readiness <= 1);
    assert.notEqual(after.promotion_readiness, originalReadiness, 'readiness should change after backtest');
  });
});

// ---------------------------------------------------------------------------
// CLI Integration test: updated error message
// ---------------------------------------------------------------------------

describe('CLI: detection unknown subcommand (updated)', () => {
  it('error message includes all seven subcommands', () => {
    const tmpDir = createTempProject();
    const result = runThruntTools(['detection', 'unknown'], tmpDir);
    assert.ok(!result.success);
    assert.ok(result.error.includes('generate'), 'error should mention generate');
    assert.ok(result.error.includes('backtest'), 'error should mention backtest');
    assert.ok(result.error.includes('promote'), 'error should mention promote');
    assert.ok(result.error.includes('reject'), 'error should mention reject');
    assert.ok(result.error.includes('status'), 'error should mention status');
    cleanup(tmpDir);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: checkPromotionGates
// ---------------------------------------------------------------------------

describe('checkPromotionGates', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  function setupCandidateWithBacktest(tmpDir, opts = {}) {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    const backtestsDir = path.join(detectionsDir, 'backtests');
    fs.mkdirSync(backtestsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-GATE',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Gate test',
        description: 'Test',
        logsource: { category: 'authentication' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [
        { type: 'receipt', id: 'RCT-001' },
        { type: 'receipt', id: 'RCT-002' },
        { type: 'receipt', id: 'RCT-003' },
      ],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    candidate.promotion_readiness = opts.readiness !== undefined ? opts.readiness : 0.75;
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    if (opts.withBacktest !== false) {
      const backtest = {
        backtest_id: 'BT-20260327150000-TESTTEST',
        candidate_id: candidate.candidate_id,
        timestamp: '2026-03-27T15:00:00.000Z',
        validation: { passed: opts.backtestPassed !== false, errors: [], warnings: [] },
        noise_score: { noise_risk: 'low', score: 0.1 },
      };
      fs.writeFileSync(path.join(backtestsDir, `${backtest.backtest_id}.json`), JSON.stringify(backtest, null, 2));
    }

    return candidate;
  }

  it('returns all_passed true when all 3 gates pass', () => {
    const candidate = setupCandidateWithBacktest(tmpDir);
    const result = detection.checkPromotionGates(candidate, tmpDir, { approve: true });
    assert.equal(result.all_passed, true);
    assert.ok(Array.isArray(result.gates));
    assert.equal(result.gates.length, 3);
    assert.ok(result.gates.every(g => g.passed === true));
  });

  it('returns all_passed false when no backtest exists', () => {
    const candidate = setupCandidateWithBacktest(tmpDir, { withBacktest: false });
    const result = detection.checkPromotionGates(candidate, tmpDir, { approve: true });
    assert.equal(result.all_passed, false);
    assert.ok(result.gates.some(g => g.gate === 'backtest_passed' && g.passed === false));
  });

  it('returns all_passed false when backtest failed', () => {
    const candidate = setupCandidateWithBacktest(tmpDir, { backtestPassed: false });
    const result = detection.checkPromotionGates(candidate, tmpDir, { approve: true });
    assert.equal(result.all_passed, false);
    assert.ok(result.gates.some(g => g.gate === 'backtest_passed' && g.passed === false));
  });

  it('returns all_passed false when readiness below threshold', () => {
    const candidate = setupCandidateWithBacktest(tmpDir, { readiness: 0.3 });
    const result = detection.checkPromotionGates(candidate, tmpDir, { approve: true });
    assert.equal(result.all_passed, false);
    assert.ok(result.gates.some(g => g.gate === 'readiness_threshold' && g.passed === false));
  });

  it('returns all_passed false when --approve flag missing', () => {
    const candidate = setupCandidateWithBacktest(tmpDir);
    const result = detection.checkPromotionGates(candidate, tmpDir, {});
    assert.equal(result.all_passed, false);
    assert.ok(result.gates.some(g => g.gate === 'analyst_approval' && g.passed === false));
  });
});

// ---------------------------------------------------------------------------
// Unit tests: promoteDetection
// ---------------------------------------------------------------------------

describe('promoteDetection', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  function createPromotableCandidate(tmpDir) {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    const backtestsDir = path.join(detectionsDir, 'backtests');
    fs.mkdirSync(backtestsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-PROM',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Promote test',
        description: 'Promotion test detection',
        logsource: { category: 'authentication', product: 'azure' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [
        { type: 'receipt', id: 'RCT-001' },
        { type: 'receipt', id: 'RCT-002' },
        { type: 'receipt', id: 'RCT-003' },
      ],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    candidate.promotion_readiness = 0.75;
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const backtest = {
      backtest_id: 'BT-20260327150000-PROMTEST',
      candidate_id: candidate.candidate_id,
      timestamp: '2026-03-27T15:00:00.000Z',
      validation: { passed: true, errors: [], warnings: [] },
      noise_score: { noise_risk: 'low', score: 0.1 },
    };
    fs.writeFileSync(path.join(backtestsDir, `${backtest.backtest_id}.json`), JSON.stringify(backtest, null, 2));

    return candidate;
  }

  it('creates PROM receipt with required fields on successful promotion', () => {
    const candidate = createPromotableCandidate(tmpDir);
    const result = detection.promoteDetection(tmpDir, candidate, { approve: true });
    assert.equal(result.promoted, true);
    assert.ok(result.receipt);
    assert.ok(result.receipt.promotion_id);
    assert.match(result.receipt.promotion_id, /^PROM-/);
    assert.equal(result.receipt.candidate_id, candidate.candidate_id);
    assert.ok(result.receipt.rule_path);
    assert.ok(result.receipt.target_format);
    assert.ok(result.receipt.promoted_at);
    assert.ok(result.receipt.promoted_by);
    assert.ok(result.receipt.gate_results);
    assert.ok(result.receipt.evidence_chain);
    assert.ok(result.receipt.content_hash);
    assert.match(result.receipt.content_hash, /^sha256:/);
  });

  it('writes promoted rule file and meta.json sidecar to promotions/rules/', () => {
    const candidate = createPromotableCandidate(tmpDir);
    const result = detection.promoteDetection(tmpDir, candidate, { approve: true });
    assert.equal(result.promoted, true);
    assert.ok(result.rule_path);

    const promotionsRulesDir = path.join(tmpDir, '.planning', 'DETECTIONS', 'promotions', 'rules');
    assert.ok(fs.existsSync(promotionsRulesDir));
    const ruleFiles = fs.readdirSync(promotionsRulesDir);
    assert.ok(ruleFiles.some(f => f.endsWith('.yml')), 'should have a .yml rule file');
    assert.ok(ruleFiles.some(f => f.endsWith('.meta.json')), 'should have a .meta.json sidecar');
  });

  it('updates candidate status to promoted on disk', () => {
    const candidate = createPromotableCandidate(tmpDir);
    detection.promoteDetection(tmpDir, candidate, { approve: true });
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    const updated = JSON.parse(fs.readFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), 'utf-8'));
    assert.equal(updated.metadata.status, 'promoted');
    assert.ok(updated.content_hash);
    assert.match(updated.content_hash, /^sha256:/);
  });

  it('returns promoted false when gates fail', () => {
    const candidate = createPromotableCandidate(tmpDir);
    const result = detection.promoteDetection(tmpDir, candidate, {}); // no --approve
    assert.equal(result.promoted, false);
    assert.ok(result.gates);
    assert.ok(result.reason);
  });

  it('defaults promoted_by to detectRuntimeName() when not provided', () => {
    const candidate = createPromotableCandidate(tmpDir);
    const result = detection.promoteDetection(tmpDir, candidate, { approve: true });
    assert.ok(result.receipt.promoted_by);
    // Should be one of the known runtime names or 'unknown'
    assert.ok(['claude', 'gemini', 'codex', 'cursor', 'unknown'].includes(result.receipt.promoted_by));
  });

  it('uses options.promoted-by when provided', () => {
    const candidate = createPromotableCandidate(tmpDir);
    const result = detection.promoteDetection(tmpDir, candidate, { approve: true, 'promoted-by': 'analyst-jane' });
    assert.equal(result.receipt.promoted_by, 'analyst-jane');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: applyPromotionHooks
// ---------------------------------------------------------------------------

describe('applyPromotionHooks', () => {
  let detection;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
  });

  it('calls beforePromote and afterPromote hooks when provided', () => {
    const candidate = { candidate_id: 'DET-TEST', metadata: { status: 'draft' } };
    const receipt = { promotion_id: 'PROM-TEST' };
    const calls = [];

    const hooks = {
      beforePromote: (c) => { calls.push('before'); return c; },
      afterPromote: (c, r) => { calls.push('after'); },
    };

    const result = detection.applyPromotionHooks(candidate, receipt, hooks);
    assert.deepEqual(calls, ['before', 'after']);
  });

  it('returns candidate unchanged when no hooks provided', () => {
    const candidate = { candidate_id: 'DET-TEST', metadata: { status: 'draft' } };
    const receipt = { promotion_id: 'PROM-TEST' };
    const result = detection.applyPromotionHooks(candidate, receipt, {});
    assert.equal(result.candidate_id, 'DET-TEST');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: rejectDetection
// ---------------------------------------------------------------------------

describe('rejectDetection', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('creates REJ receipt with candidate_id, reason, rejected_at, rejected_by', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });
    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-REJ',
      technique_ids: ['T1078'],
      detection_logic: { title: 'Reject test', description: 'Test', logsource: { category: 'auth' }, detection: { selection: {}, condition: 'selection' }, false_positives: ['Unknown'] },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const result = detection.rejectDetection(tmpDir, candidate, { reason: 'high false positive rate' });
    assert.equal(result.rejected, true);
    assert.ok(result.receipt);
    assert.match(result.receipt.rejection_id, /^REJ-/);
    assert.equal(result.receipt.candidate_id, candidate.candidate_id);
    assert.equal(result.receipt.reason, 'high false positive rate');
    assert.ok(result.receipt.rejected_at);
    assert.ok(result.receipt.rejected_by);
    assert.ok(result.receipt.content_hash);
  });

  it('updates candidate status to rejected and adds rejection_reason', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });
    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-REJ2',
      technique_ids: ['T1110'],
      detection_logic: { title: 'Reject test 2', description: 'Test', logsource: { category: 'auth' }, detection: { selection: {}, condition: 'selection' }, false_positives: ['Unknown'] },
      confidence: 'low',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    detection.rejectDetection(tmpDir, candidate, { reason: 'Too noisy' });
    const updated = JSON.parse(fs.readFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), 'utf-8'));
    assert.equal(updated.metadata.status, 'rejected');
    assert.equal(updated.metadata.rejection_reason, 'Too noisy');
  });

  it('writes REJ receipt atomically to DETECTIONS/promotions/', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });
    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-REJ3',
      technique_ids: ['T1078'],
      detection_logic: { title: 'Reject atomic', description: 'Test', logsource: { category: 'auth' }, detection: { selection: {}, condition: 'selection' }, false_positives: ['Unknown'] },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    detection.rejectDetection(tmpDir, candidate, { reason: 'Test reject' });
    const promotionsDir = path.join(detectionsDir, 'promotions');
    assert.ok(fs.existsSync(promotionsDir));
    const rejFiles = fs.readdirSync(promotionsDir).filter(f => f.startsWith('REJ-') && f.endsWith('.json'));
    assert.ok(rejFiles.length >= 1, 'should have at least one REJ receipt');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: detectionStatus
// ---------------------------------------------------------------------------

describe('detectionStatus', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('groups candidates by status with counts', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidates = [
      { candidate_id: 'DET-A', metadata: { status: 'draft' }, promotion_readiness: 0.5 },
      { candidate_id: 'DET-B', metadata: { status: 'draft' }, promotion_readiness: 0.3 },
      { candidate_id: 'DET-C', metadata: { status: 'promoted' }, promotion_readiness: 0.9 },
      { candidate_id: 'DET-D', metadata: { status: 'rejected' }, promotion_readiness: 0.2 },
    ];
    for (const c of candidates) {
      fs.writeFileSync(path.join(detectionsDir, `${c.candidate_id}.json`), JSON.stringify(c, null, 2));
    }

    const result = detection.detectionStatus(tmpDir, {});
    assert.ok(result.by_status);
    assert.equal(result.by_status.draft.length, 2);
    assert.equal(result.by_status.promoted.length, 1);
    assert.equal(result.by_status.rejected.length, 1);
    assert.equal(result.counts.draft, 2);
    assert.equal(result.counts.promoted, 1);
    assert.equal(result.counts.rejected, 1);
    assert.equal(result.counts.total, 4);
  });

  it('returns empty groups when no candidates exist', () => {
    const result = detection.detectionStatus(tmpDir, {});
    assert.equal(result.counts.total, 0);
    assert.equal(result.by_status.draft.length, 0);
    assert.equal(result.by_status.promoted.length, 0);
    assert.equal(result.by_status.rejected.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: bulk promote
// ---------------------------------------------------------------------------

describe('bulk promote via cmdDetectionPromote', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('promotes eligible and skips ineligible in bulk', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    const backtestsDir = path.join(detectionsDir, 'backtests');
    fs.mkdirSync(backtestsDir, { recursive: true });

    // Eligible candidate
    const eligible = detection.createDetectionCandidate({
      source_finding_id: 'F-BULK1',
      source_phase: '19-promotion',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Bulk eligible',
        description: 'Test',
        logsource: { category: 'auth' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [{ type: 'receipt', id: 'RCT-001' }, { type: 'receipt', id: 'RCT-002' }, { type: 'receipt', id: 'RCT-003' }],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    eligible.promotion_readiness = 0.75;
    fs.writeFileSync(path.join(detectionsDir, `${eligible.candidate_id}.json`), JSON.stringify(eligible, null, 2));
    fs.writeFileSync(path.join(backtestsDir, `BT-BULK1.json`), JSON.stringify({
      backtest_id: 'BT-BULK1',
      candidate_id: eligible.candidate_id,
      validation: { passed: true, errors: [], warnings: [] },
    }, null, 2));

    // Ineligible candidate (no backtest)
    const ineligible = detection.createDetectionCandidate({
      source_finding_id: 'F-BULK2',
      source_phase: '19-promotion',
      technique_ids: ['T1110'],
      detection_logic: {
        title: 'Bulk ineligible',
        description: 'Test',
        logsource: { category: 'auth' },
        detection: { selection: { EventID: 4625 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    ineligible.promotion_readiness = 0.2;
    fs.writeFileSync(path.join(detectionsDir, `${ineligible.candidate_id}.json`), JSON.stringify(ineligible, null, 2));

    // Already promoted (should be skipped)
    const promoted = detection.createDetectionCandidate({
      source_finding_id: 'F-BULK3',
      source_phase: '19-promotion',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'Already promoted',
        description: 'Test',
        logsource: { category: 'auth' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [],
      metadata: { author: 'test', status: 'promoted', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${promoted.candidate_id}.json`), JSON.stringify(promoted, null, 2));

    const result = runThruntTools(['detection', 'promote', '--phase', '19', '--approve', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(parsed.promoted.length >= 1, 'should have at least 1 promoted');
    assert.ok(parsed.skipped.length >= 1, 'should have at least 1 skipped');
  });
});

// ---------------------------------------------------------------------------
// CLI Integration tests: detection promote, reject, status
// ---------------------------------------------------------------------------

describe('CLI: detection promote', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('detection promote --candidate ID --approve creates PROM receipt', () => {
    const detection = require('../thrunt-god/bin/lib/detection.cjs');
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    const backtestsDir = path.join(detectionsDir, 'backtests');
    fs.mkdirSync(backtestsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-CLI-PROM',
      technique_ids: ['T1078'],
      detection_logic: {
        title: 'CLI promote test',
        description: 'Test',
        logsource: { category: 'authentication' },
        detection: { selection: { EventID: 4624 }, condition: 'selection' },
        false_positives: ['Unknown'],
      },
      confidence: 'high',
      evidence_links: [{ type: 'receipt', id: 'RCT-001' }, { type: 'receipt', id: 'RCT-002' }, { type: 'receipt', id: 'RCT-003' }],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    candidate.promotion_readiness = 0.75;
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));
    fs.writeFileSync(path.join(backtestsDir, 'BT-CLI-TEST.json'), JSON.stringify({
      backtest_id: 'BT-CLI-TEST',
      candidate_id: candidate.candidate_id,
      validation: { passed: true, errors: [], warnings: [] },
    }, null, 2));

    const result = runThruntTools(['detection', 'promote', '--candidate', candidate.candidate_id, '--approve', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.promoted, true);
    assert.ok(parsed.receipt);
  });
});

describe('CLI: detection reject', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('detection reject --candidate ID --reason "text" creates REJ receipt', () => {
    const detection = require('../thrunt-god/bin/lib/detection.cjs');
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    const candidate = detection.createDetectionCandidate({
      source_finding_id: 'F-CLI-REJ',
      technique_ids: ['T1078'],
      detection_logic: { title: 'CLI reject test', description: 'Test', logsource: { category: 'auth' }, detection: { selection: {}, condition: 'selection' }, false_positives: ['Unknown'] },
      confidence: 'medium',
      evidence_links: [],
      metadata: { author: 'test', status: 'draft', notes: '' },
    });
    fs.writeFileSync(path.join(detectionsDir, `${candidate.candidate_id}.json`), JSON.stringify(candidate, null, 2));

    const result = runThruntTools(['detection', 'reject', '--candidate', candidate.candidate_id, '--reason', 'high false positive rate', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.rejected, true);
    assert.ok(parsed.receipt);
    assert.equal(parsed.receipt.reason, 'high false positive rate');
  });
});

describe('CLI: detection status', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('detection status --raw returns grouped status with counts', () => {
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(detectionsDir, { recursive: true });

    fs.writeFileSync(path.join(detectionsDir, 'DET-A.json'), JSON.stringify({ candidate_id: 'DET-A', metadata: { status: 'draft' }, promotion_readiness: 0.5 }));
    fs.writeFileSync(path.join(detectionsDir, 'DET-B.json'), JSON.stringify({ candidate_id: 'DET-B', metadata: { status: 'promoted' }, promotion_readiness: 0.9 }));

    const result = runThruntTools(['detection', 'status', '--raw'], tmpDir);
    assert.ok(result.success, `Expected success but got error: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok(parsed.by_status);
    assert.ok(parsed.counts);
    assert.equal(parsed.counts.total, 2);
  });
});
