/**
 * Tests for review.cjs — Evidence quality scoring, publish gating,
 * contradiction detection, blind spots, chain-of-custody, and CLI integration.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempProject, runThruntTools, cleanup } = require('./helpers.cjs');
const { computeContentHash, computeManifestHash, canonicalSerialize, buildProvenance } = require('../thrunt-god/bin/lib/manifest.cjs');

// Helper: build a minimal valid manifest with provenance + hash
function buildTestManifest(overrides = {}) {
  const manifest = {
    manifest_version: '1.1',
    manifest_id: overrides.manifest_id || 'MAN-TEST-001',
    created_at: '2026-03-27T12:00:00.000Z',
    connector_id: 'test-connector',
    dataset: 'test-dataset',
    execution: {
      profile: 'default',
      query_id: 'QRY-TEST-001',
      request_id: 'REQ-TEST-001',
      status: 'success',
      started_at: '2026-03-27T11:59:00.000Z',
      completed_at: '2026-03-27T12:00:00.000Z',
      duration_ms: 60000,
      dry_run: false,
    },
    artifacts: overrides.artifacts || [
      {
        id: 'QRY-TEST-001',
        type: 'query_log',
        path: '.planning/QUERIES/QRY-TEST-001.md',
        content_hash: 'sha256:abc123',
      },
    ],
    hypothesis_ids: overrides.hypothesis_ids || ['HYP-01'],
    tags: null,
    raw_metadata: null,
    ...overrides,
  };

  // Add provenance if not explicitly overridden to null
  if (overrides.provenance === undefined) {
    manifest.provenance = {
      signer: {
        signer_type: 'system',
        signer_id: 'thrunt-runtime',
        signer_context: { cli_version: '0.1.0' },
      },
      environment: {
        os_platform: 'darwin',
        node_version: 'v22.0.0',
        thrunt_version: '0.1.0',
        runtime_name: 'unknown',
      },
      signed_at: '2026-03-27T12:00:01.000Z',
    };
  } else if (overrides.provenance === null) {
    // Explicitly no provenance
    delete manifest.provenance;
  }

  manifest.signature = null;
  manifest.manifest_hash = computeManifestHash(manifest);

  return manifest;
}

// Helper: write a manifest JSON to the temp project's MANIFESTS dir
function writeManifest(tmpDir, manifest) {
  const dir = path.join(tmpDir, '.planning', 'MANIFESTS');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${manifest.manifest_id}.json`);
  fs.writeFileSync(filePath, canonicalSerialize(manifest), 'utf-8');
  return filePath;
}

// Helper: write artifact file so integrity check passes
function writeArtifact(tmpDir, relativePath, content) {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return computeContentHash(content);
}

// Helper: write a receipt file
function writeReceipt(tmpDir, receiptId, hypothesisIds) {
  const dir = path.join(tmpDir, '.planning', 'RECEIPTS');
  fs.mkdirSync(dir, { recursive: true });
  const content = [
    '---',
    `receipt_id: ${receiptId}`,
    'related_hypotheses:',
    ...hypothesisIds.map(id => `  - ${id}`),
    '---',
    '',
    `# Receipt: ${receiptId}`,
    '',
    '## Claim',
    '',
    'Test evidence.',
  ].join('\n');
  fs.writeFileSync(path.join(dir, `${receiptId}.md`), content, 'utf-8');
}

// Helper: write HYPOTHESES.md
function writeHypotheses(tmpDir, hypothesisIds) {
  const content = [
    '---',
    'status: active',
    '---',
    '',
    '# Hypotheses',
    '',
    ...hypothesisIds.map(id => `- [ ] **${id}**: Test hypothesis for ${id}`),
  ].join('\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'HYPOTHESES.md'), content, 'utf-8');
}

// Helper: write a FINDINGS.md with finding items
function writeFindings(tmpDir, phaseDir, findings) {
  const dir = path.join(tmpDir, '.planning', 'phases', phaseDir);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    '---',
    'status: complete',
    '---',
    '',
    '# Findings',
    '',
  ];
  for (const f of findings) {
    lines.push(`- **${f.id}**: ${f.description} | status: ${f.status} | hypothesis: ${f.hypothesis_id}`);
  }
  fs.writeFileSync(path.join(dir, `${phaseDir.split('-')[0]}-FINDINGS.md`), lines.join('\n'), 'utf-8');
}

// ---------------------------------------------------------------------------
// scoreEvidenceQuality
// ---------------------------------------------------------------------------

describe('scoreEvidenceQuality', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns score 1.0 with no manifests/findings (vacuously true)', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.score, 1.0);
    assert.equal(result.passed, true);
    assert.equal(result.dimensions.receipt_coverage.score, 1.0);
    assert.equal(result.dimensions.integrity.score, 1.0);
    assert.equal(result.dimensions.provenance_completeness.score, 1.0);
  });

  it('returns score near 1.0 when all checks pass', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    // Write artifact content
    const content = 'test query content';
    const contentHash = writeArtifact(tmpDir, '.planning/QUERIES/QRY-TEST-001.md', content);

    // Write manifest with correct content hash
    const manifest = buildTestManifest({
      artifacts: [{
        id: 'QRY-TEST-001',
        type: 'query_log',
        path: '.planning/QUERIES/QRY-TEST-001.md',
        content_hash: contentHash,
      }],
      hypothesis_ids: ['HYP-01'],
    });
    writeManifest(tmpDir, manifest);

    // Write hypotheses and receipt covering HYP-01
    writeHypotheses(tmpDir, ['HYP-01']);
    writeReceipt(tmpDir, 'RCT-001', ['HYP-01']);

    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.ok(result.score >= 0.9, `Expected score >= 0.9, got ${result.score}`);
    assert.equal(result.passed, true);
    assert.equal(result.dimensions.receipt_coverage.score, 1.0);
    assert.equal(result.dimensions.integrity.score, 1.0);
    assert.equal(result.dimensions.provenance_completeness.score, 1.0);
  });

  it('returns receipt_coverage at 0.5 with 50% receipt coverage', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    writeHypotheses(tmpDir, ['HYP-01', 'HYP-02']);
    writeReceipt(tmpDir, 'RCT-001', ['HYP-01']);
    // HYP-02 has no receipt

    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.dimensions.receipt_coverage.score, 0.5);
    assert.equal(result.dimensions.receipt_coverage.total, 2);
    assert.equal(result.dimensions.receipt_coverage.covered, 1);
  });

  it('counts heading-style hunt hypotheses when scoring evidence quality', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HYPOTHESES.md'),
      [
        '# Hypotheses',
        '',
        '### HYP-01: Spray succeeded against david.park',
        '',
        '### HYP-02: Another admin account was compromised',
      ].join('\n'),
      'utf-8'
    );
    writeReceipt(tmpDir, 'RCT-001', ['HYP-01']);

    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.dimensions.receipt_coverage.total, 2);
    assert.equal(result.dimensions.receipt_coverage.covered, 1);
    assert.equal(result.dimensions.receipt_coverage.score, 0.5);
  });

  it('returns integrity below 1.0 with integrity failures', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    // Write a manifest that has a bad content hash (file will mismatch)
    writeArtifact(tmpDir, '.planning/QUERIES/QRY-TEST-001.md', 'real content');

    const manifest = buildTestManifest({
      artifacts: [{
        id: 'QRY-TEST-001',
        type: 'query_log',
        path: '.planning/QUERIES/QRY-TEST-001.md',
        content_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      }],
    });
    // Recompute manifest hash with the bad artifact hash
    manifest.manifest_hash = computeManifestHash(manifest);
    writeManifest(tmpDir, manifest);

    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.ok(result.dimensions.integrity.score < 1.0, `Expected integrity < 1.0, got ${result.dimensions.integrity.score}`);
    assert.ok(result.dimensions.integrity.failures.length > 0);
  });

  it('returns provenance_completeness below 1.0 with missing signers', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    // Manifest with no provenance
    const manifest = buildTestManifest({ provenance: null });
    writeManifest(tmpDir, manifest);

    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.dimensions.provenance_completeness.score, 0);
    assert.equal(result.dimensions.provenance_completeness.with_signer, 0);
    assert.equal(result.dimensions.provenance_completeness.total, 1);
  });

  it('subtracts 0.1 per contradiction from composite score', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    writeHypotheses(tmpDir, ['HYP-01']);
    writeReceipt(tmpDir, 'RCT-001', ['HYP-01']);

    // Write findings with contradicting statuses for HYP-01
    writeFindings(tmpDir, '01-test-phase', [
      { id: 'F-001', description: 'Confirmed finding', status: 'confirmed', hypothesis_id: 'HYP-01' },
      { id: 'F-002', description: 'Refuted finding', status: 'refuted', hypothesis_id: 'HYP-01' },
    ]);

    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.contradiction_penalty, 0.1);
    assert.equal(result.contradictions.length, 1);
    // With no manifests, all dimensions are 1.0. Average = 1.0. Score = 1.0 - 0.1 = 0.9
    assert.ok(result.score <= 0.9 + 0.001, `Expected score <= 0.9, got ${result.score}`);
  });

  it('floors composite score at 0.0', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    writeHypotheses(tmpDir, ['HYP-01', 'HYP-02', 'HYP-03', 'HYP-04', 'HYP-05',
      'HYP-06', 'HYP-07', 'HYP-08', 'HYP-09', 'HYP-10', 'HYP-11']);

    // Write findings with contradictions for all 11 hypotheses
    const findings = [];
    for (let i = 1; i <= 11; i++) {
      const id = `HYP-${String(i).padStart(2, '0')}`;
      findings.push({ id: `F-${i}a`, description: 'Confirmed', status: 'confirmed', hypothesis_id: id });
      findings.push({ id: `F-${i}b`, description: 'Refuted', status: 'refuted', hypothesis_id: id });
    }
    writeFindings(tmpDir, '01-test-phase', findings);

    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.score, 0);
  });

  it('filters by phase when --phase option is set', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    const content1 = 'query content for phase 01';
    const hash1 = writeArtifact(tmpDir, '.planning/QUERIES/QRY-P01.md', content1);
    const content2 = 'query content for phase 02';
    const hash2 = writeArtifact(tmpDir, '.planning/QUERIES/QRY-P02.md', content2);

    const m1 = buildTestManifest({
      manifest_id: 'MAN-PHASE01',
      artifacts: [{
        id: 'QRY-P01',
        type: 'query_log',
        path: '.planning/QUERIES/QRY-P01.md',
        content_hash: hash1,
      }],
      tags: ['phase:01'],
    });
    writeManifest(tmpDir, m1);

    const m2 = buildTestManifest({
      manifest_id: 'MAN-PHASE02',
      artifacts: [{
        id: 'QRY-P02',
        type: 'query_log',
        path: '.planning/QUERIES/QRY-P02.md',
        content_hash: hash2,
      }],
      tags: ['phase:02'],
    });
    writeManifest(tmpDir, m2);

    // Filter to phase 01 only
    const result = review.scoreEvidenceQuality(tmpDir, { phase: '01' });
    assert.equal(result.phase_filter, '01');
    assert.equal(result.dimensions.integrity.total, 1);
  });
});

// ---------------------------------------------------------------------------
// checkPublishGate
// ---------------------------------------------------------------------------

describe('checkPublishGate', () => {
  it('returns passed true when score >= threshold', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const scoreResult = { score: 0.8, threshold: 0.7, dimensions: {} };
    const gate = review.checkPublishGate(scoreResult, {});
    assert.equal(gate.passed, true);
    assert.equal(gate.forced, false);
  });

  it('returns passed false with reason when score < threshold', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const scoreResult = {
      score: 0.5,
      threshold: 0.7,
      dimensions: {
        receipt_coverage: { score: 0.3 },
        integrity: { score: 0.8 },
        provenance_completeness: { score: 0.4 },
      },
    };
    const gate = review.checkPublishGate(scoreResult, {});
    assert.equal(gate.passed, false);
    assert.ok(gate.reason, 'Expected a reason string');
    assert.ok(gate.failed_dimensions.length > 0);
  });

  it('returns passed true with forced flag when force=true', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const scoreResult = { score: 0.3, threshold: 0.7, dimensions: {} };
    const gate = review.checkPublishGate(scoreResult, { force: true, override_reason: 'testing' });
    assert.equal(gate.passed, true);
    assert.equal(gate.forced, true);
    assert.equal(gate.override_reason, 'testing');
  });
});

// ---------------------------------------------------------------------------
// detectContradictions
// ---------------------------------------------------------------------------

describe('detectContradictions', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns contradictions for hypotheses with confirmed and refuted findings', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    writeFindings(tmpDir, '01-test', [
      { id: 'F-001', description: 'Supports HYP-01', status: 'confirmed', hypothesis_id: 'HYP-01' },
      { id: 'F-002', description: 'Refutes HYP-01', status: 'refuted', hypothesis_id: 'HYP-01' },
    ]);

    const contradictions = review.detectContradictions(tmpDir, {});
    assert.equal(contradictions.length, 1);
    assert.equal(contradictions[0].hypothesis_id, 'HYP-01');
    assert.equal(contradictions[0].conflicting_findings.length, 2);
  });

  it('returns empty array when no contradictions exist', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    writeFindings(tmpDir, '01-test', [
      { id: 'F-001', description: 'Confirmed', status: 'confirmed', hypothesis_id: 'HYP-01' },
      { id: 'F-002', description: 'Also confirmed', status: 'confirmed', hypothesis_id: 'HYP-01' },
    ]);

    const contradictions = review.detectContradictions(tmpDir, {});
    assert.equal(contradictions.length, 0);
  });

  it('returns empty array when no findings exist', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const contradictions = review.detectContradictions(tmpDir, {});
    assert.equal(contradictions.length, 0);
  });
});

// ---------------------------------------------------------------------------
// detectBlindSpots
// ---------------------------------------------------------------------------

describe('detectBlindSpots', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns hypothesis IDs with zero receipts', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    writeHypotheses(tmpDir, ['HYP-01', 'HYP-02', 'HYP-03']);
    writeReceipt(tmpDir, 'RCT-001', ['HYP-01']);
    // HYP-02 and HYP-03 have no receipts

    const blindSpots = review.detectBlindSpots(tmpDir, {});
    assert.deepEqual(blindSpots.sort(), ['HYP-02', 'HYP-03']);
  });

  it('returns empty array when all hypotheses have receipts', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    writeHypotheses(tmpDir, ['HYP-01']);
    writeReceipt(tmpDir, 'RCT-001', ['HYP-01']);

    const blindSpots = review.detectBlindSpots(tmpDir, {});
    assert.equal(blindSpots.length, 0);
  });

  it('returns empty array when no hypotheses exist', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const blindSpots = review.detectBlindSpots(tmpDir, {});
    assert.equal(blindSpots.length, 0);
  });
});

// ---------------------------------------------------------------------------
// buildChainOfCustody
// ---------------------------------------------------------------------------

describe('buildChainOfCustody', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns chronologically sorted custody entries from manifests', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    const m1 = buildTestManifest({
      manifest_id: 'MAN-001',
    });
    m1.provenance.signed_at = '2026-03-27T10:00:00.000Z';
    m1.manifest_hash = computeManifestHash(m1);
    writeManifest(tmpDir, m1);

    const m2 = buildTestManifest({
      manifest_id: 'MAN-002',
    });
    m2.provenance.signed_at = '2026-03-27T08:00:00.000Z';
    m2.manifest_hash = computeManifestHash(m2);
    writeManifest(tmpDir, m2);

    const chain = review.buildChainOfCustody(tmpDir, {});
    assert.equal(chain.length, 2);
    // Should be sorted chronologically — earliest first
    assert.equal(chain[0].manifest_id, 'MAN-002');
    assert.equal(chain[1].manifest_id, 'MAN-001');
    assert.ok(chain[0].signed_at < chain[1].signed_at);
  });

  it('handles manifests with no provenance gracefully', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    const m1 = buildTestManifest({ provenance: null });
    writeManifest(tmpDir, m1);

    const chain = review.buildChainOfCustody(tmpDir, {});
    assert.equal(chain.length, 0);
  });

  it('returns empty array when no manifests exist', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const chain = review.buildChainOfCustody(tmpDir, {});
    assert.equal(chain.length, 0);
  });
});

// ---------------------------------------------------------------------------
// renderReviewMarkdown
// ---------------------------------------------------------------------------

describe('renderReviewMarkdown', () => {
  it('produces Markdown with all expected sections', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');

    const result = {
      score: 0.85,
      passed: true,
      threshold: 0.7,
      dimensions: {
        receipt_coverage: { score: 0.8, total: 5, covered: 4, details: [] },
        integrity: { score: 0.9, total: 10, passed_count: 9, failures: [] },
        provenance_completeness: { score: 0.85, total: 10, with_signer: 8.5 },
      },
      contradiction_penalty: 0,
      contradictions: [],
      blind_spots: [],
      chain_of_custody: [],
      phase_filter: null,
    };

    const gateResult = { passed: true, forced: false, score: 0.85, threshold: 0.7, failed_dimensions: [], reason: null };

    const md = review.renderReviewMarkdown(result, gateResult);
    assert.ok(md.includes('# Evidence Quality Review'), 'Missing title');
    assert.ok(md.includes('Score Summary'), 'Missing Score Summary section');
    assert.ok(md.includes('Dimension Breakdown'), 'Missing Dimension Breakdown section');
    assert.ok(md.includes('Contradictions'), 'Missing Contradictions section');
    assert.ok(md.includes('Blind Spots'), 'Missing Blind Spots section');
    assert.ok(md.includes('Chain of Custody'), 'Missing Chain of Custody section');
    assert.ok(md.includes('Gate Status'), 'Missing Gate Status section');
    assert.ok(md.includes('0.85'), 'Missing score value');
  });
});

// ---------------------------------------------------------------------------
// cmdEvidenceReview (CLI integration)
// ---------------------------------------------------------------------------

describe('cmdEvidenceReview (CLI)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('outputs JSON when --raw flag is set', () => {
    const result = runThruntTools('evidence review --raw', tmpDir);
    assert.equal(result.success, true, `CLI failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.ok('score' in parsed, 'Missing score in JSON output');
    assert.ok('gate' in parsed, 'Missing gate in JSON output');
  });

  it('outputs Markdown when --raw is not set', () => {
    const result = runThruntTools('evidence review', tmpDir);
    assert.equal(result.success, true, `CLI failed: ${result.error}`);
    assert.ok(result.output.includes('Evidence Quality Review'), 'Expected Markdown output');
  });

  it('respects --force flag', () => {
    const result = runThruntTools('evidence review --raw --force', tmpDir);
    assert.equal(result.success, true, `CLI failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.gate.forced, true);
  });

  it('respects --phase flag', () => {
    const result = runThruntTools('evidence review --raw --phase 01', tmpDir);
    assert.equal(result.success, true, `CLI failed: ${result.error}`);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.phase_filter, '01');
  });
});

// ---------------------------------------------------------------------------
// Division by zero edge cases
// ---------------------------------------------------------------------------

describe('division by zero', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('returns 1.0 for receipt_coverage when no hypotheses exist', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.dimensions.receipt_coverage.score, 1.0);
    assert.equal(result.dimensions.receipt_coverage.total, 0);
  });

  it('returns 1.0 for integrity when no manifests exist', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.dimensions.integrity.score, 1.0);
    assert.equal(result.dimensions.integrity.total, 0);
  });

  it('returns 1.0 for provenance_completeness when no manifests exist', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.dimensions.provenance_completeness.score, 1.0);
    assert.equal(result.dimensions.provenance_completeness.total, 0);
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe('module exports', () => {
  it('exports all 7 required functions', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const expected = [
      'scoreEvidenceQuality',
      'checkPublishGate',
      'detectContradictions',
      'detectBlindSpots',
      'buildChainOfCustody',
      'renderReviewMarkdown',
      'cmdEvidenceReview',
    ];
    for (const name of expected) {
      assert.equal(typeof review[name], 'function', `Missing export: ${name}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Promotion coverage feedback in scoreEvidenceQuality
// ---------------------------------------------------------------------------

describe('promotion coverage feedback', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  function writePromotionReceipt(tmpDir, promotionId, sourcePhase = null) {
    const dir = path.join(tmpDir, '.planning', 'DETECTIONS', 'promotions');
    const detectionsDir = path.join(tmpDir, '.planning', 'DETECTIONS');
    fs.mkdirSync(dir, { recursive: true });
    const receipt = {
      promotion_id: promotionId,
      candidate_id: `DET-TEST-${promotionId}`,
      source_phase: sourcePhase,
      promoted_at: '2026-03-27T15:00:00.000Z',
      promoted_by: 'test',
      content_hash: 'sha256:test',
    };
    fs.writeFileSync(path.join(dir, `${promotionId}.json`), JSON.stringify(receipt, null, 2), 'utf-8');
    fs.writeFileSync(path.join(detectionsDir, `${receipt.candidate_id}.json`), JSON.stringify({
      candidate_id: receipt.candidate_id,
      source_phase: sourcePhase,
      metadata: { status: 'promoted' },
    }, null, 2), 'utf-8');
  }

  it('returns bonus 0 when no promotions directory exists', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.ok(result.promotion_coverage);
    assert.equal(result.promotion_coverage.bonus, 0);
    assert.equal(result.promotion_coverage.promoted_count, 0);
    // Score should be unaffected (still 1.0 for vacuously-true project)
    assert.equal(result.score, 1.0);
  });

  it('adds +0.05 bonus for 1 promoted detection', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    writePromotionReceipt(tmpDir, 'PROM-20260327-AAA');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.promotion_coverage.promoted_count, 1);
    assert.equal(result.promotion_coverage.bonus, 0.05);
    // Vacuously-true 1.0 + 0.05 clamped to 1.0
    assert.equal(result.score, 1.0);
  });

  it('adds +0.10 bonus for 2 promoted detections', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    writePromotionReceipt(tmpDir, 'PROM-20260327-AAA');
    writePromotionReceipt(tmpDir, 'PROM-20260327-BBB');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.promotion_coverage.promoted_count, 2);
    assert.equal(result.promotion_coverage.bonus, 0.10);
  });

  it('caps bonus at +0.15 for 3+ promoted detections', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    writePromotionReceipt(tmpDir, 'PROM-20260327-AAA');
    writePromotionReceipt(tmpDir, 'PROM-20260327-BBB');
    writePromotionReceipt(tmpDir, 'PROM-20260327-CCC');
    writePromotionReceipt(tmpDir, 'PROM-20260327-DDD');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.equal(result.promotion_coverage.promoted_count, 4);
    assert.equal(result.promotion_coverage.bonus, 0.15);
    assert.equal(result.promotion_coverage.cap, 0.15);
  });

  it('includes promotion receipts list in promotion_coverage', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    writePromotionReceipt(tmpDir, 'PROM-20260327-XXX');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.ok(Array.isArray(result.promotion_coverage.receipts));
    assert.ok(result.promotion_coverage.receipts.includes('PROM-20260327-XXX'));
  });

  it('filters promotion coverage by phase when review is phase-scoped', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    writePromotionReceipt(tmpDir, 'PROM-20260327-P01', '01-detection/FINDINGS.md');
    writePromotionReceipt(tmpDir, 'PROM-20260327-P02', '02-detection/FINDINGS.md');

    const result = review.scoreEvidenceQuality(tmpDir, { phase: '01' });
    assert.equal(result.promotion_coverage.promoted_count, 1);
    assert.equal(result.promotion_coverage.bonus, 0.05);
    assert.deepEqual(result.promotion_coverage.receipts, ['PROM-20260327-P01']);
  });

  it('score is floored at 0.0 and rounded to 4 decimal places', () => {
    const review = require('../thrunt-god/bin/lib/review.cjs');
    const result = review.scoreEvidenceQuality(tmpDir, {});
    assert.ok(result.score >= 0);
    const rounded = Math.round(result.score * 10000) / 10000;
    assert.equal(result.score, rounded);
  });

  it('review.cjs does NOT import detection.cjs (no circular dependency)', () => {
    const reviewSource = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'bin', 'lib', 'review.cjs'),
      'utf-8'
    );
    assert.ok(!reviewSource.includes("require('./detection.cjs')"), 'review.cjs must not import detection.cjs');
    assert.ok(!reviewSource.includes('require("./detection.cjs")'), 'review.cjs must not import detection.cjs');
  });
});
