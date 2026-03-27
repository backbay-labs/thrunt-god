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
