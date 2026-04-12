/**
 * Tests for findings promote command -- cmdFindingsPromote
 * Generates detection rules from FINDINGS.md in Sigma/SPL/KQL formats,
 * written as versioned markdown artifacts to .planning/DETECTIONS/.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempProject, runThruntTools, cleanup } = require('./helpers.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Write a FINDINGS.md with structured findings into a phase directory.
 */
function writeFindingsFile(tmpDir, phaseDir, content) {
  const fullDir = path.join(tmpDir, '.planning', 'phases', phaseDir);
  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(fullDir, 'FINDINGS.md'), content, 'utf-8');
}

/**
 * Write receipt files referencing finding IDs.
 */
function writeReceipts(tmpDir, findingId, count) {
  const receiptsDir = path.join(tmpDir, '.planning', 'RECEIPTS');
  fs.mkdirSync(receiptsDir, { recursive: true });
  for (let i = 1; i <= count; i++) {
    const stamp = `2026041200000${i}`;
    const suffix = `AABB${String(i).padStart(4, '0')}`;
    fs.writeFileSync(
      path.join(receiptsDir, `RCT-${stamp}-${suffix}.md`),
      `---\nreceipt_id: RCT-${stamp}-${suffix}\n---\n\nEvidence for ${findingId}\n`,
      'utf-8'
    );
  }
}

/**
 * Read all DET-*.md files from DETECTIONS/ and return array of { filename, content }.
 */
function readDetections(tmpDir) {
  const detDir = path.join(tmpDir, '.planning', 'DETECTIONS');
  if (!fs.existsSync(detDir)) return [];
  return fs.readdirSync(detDir)
    .filter(f => f.startsWith('DET-') && f.endsWith('.md'))
    .map(f => ({
      filename: f,
      content: fs.readFileSync(path.join(detDir, f), 'utf-8'),
    }));
}

/**
 * Parse YAML frontmatter from markdown content.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kv) {
      let val = kv[2].trim();
      // Parse arrays like [T1078, T1078.001]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      }
      fm[kv[1]] = val;
    }
  }
  return fm;
}

const SAMPLE_FINDINGS = `# Findings

- **F-001**: OAuth token reuse without validation detected via T1078.001 credential access | status: confirmed | hypothesis: HYP-001
- **F-002**: Lateral movement using stolen session cookie T1550.001 | status: supported | hypothesis: HYP-002
`;

// ---------------------------------------------------------------------------
// Test 1: Sigma format produces markdown with correct frontmatter
// ---------------------------------------------------------------------------

describe('cmdFindingsPromote', () => {
  let detection;
  let tmpDir;

  beforeEach(() => {
    detection = require('../thrunt-god/bin/lib/detection.cjs');
    tmpDir = createTempProject();
    writeFindingsFile(tmpDir, '01-recon', SAMPLE_FINDINGS);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('Test 1: sigma format produces markdown with correct frontmatter', () => {
    writeReceipts(tmpDir, 'F-001', 2);

    detection.cmdFindingsPromote(tmpDir, { format: 'sigma' }, true);

    const dets = readDetections(tmpDir);
    assert.ok(dets.length > 0, 'should write at least one detection markdown');

    const det = dets[0];
    const fm = parseFrontmatter(det.content);

    assert.ok(fm.detection_id, 'frontmatter should have detection_id');
    assert.ok(fm.detection_id.startsWith('DET-'), 'detection_id should start with DET-');
    assert.equal(fm.format, 'sigma');
    assert.ok(fm.finding_id, 'frontmatter should have finding_id');
    assert.ok(fm.technique_ids, 'frontmatter should have technique_ids');
    assert.ok(fm.confidence, 'frontmatter should have confidence');
    assert.ok(fm.created_at, 'frontmatter should have created_at');
    assert.ok(fm.hunt_id, 'frontmatter should have hunt_id');
  });

  // ---------------------------------------------------------------------------
  // Test 2: SPL format produces markdown with SPL body
  // ---------------------------------------------------------------------------

  it('Test 2: splunk format produces markdown with SPL body', () => {
    writeReceipts(tmpDir, 'F-001', 1);

    detection.cmdFindingsPromote(tmpDir, { format: 'splunk' }, true);

    const dets = readDetections(tmpDir);
    assert.ok(dets.length > 0, 'should write at least one detection markdown');

    const det = dets[0];
    const fm = parseFrontmatter(det.content);
    assert.equal(fm.format, 'splunk');

    // SPL body should contain key SPL constructs
    assert.ok(det.content.includes('index'), 'SPL body should contain index');
    assert.ok(det.content.includes('sourcetype'), 'SPL body should contain sourcetype');
    assert.ok(det.content.includes('stats') || det.content.includes('tstats'), 'SPL body should contain stats/tstats');
    assert.ok(det.content.includes('eval'), 'SPL body should contain eval');
  });

  // ---------------------------------------------------------------------------
  // Test 3: KQL format produces markdown with KQL body
  // ---------------------------------------------------------------------------

  it('Test 3: kql format produces markdown with KQL body', () => {
    writeReceipts(tmpDir, 'F-001', 1);

    detection.cmdFindingsPromote(tmpDir, { format: 'kql' }, true);

    const dets = readDetections(tmpDir);
    assert.ok(dets.length > 0, 'should write at least one detection markdown');

    const det = dets[0];
    const fm = parseFrontmatter(det.content);
    assert.equal(fm.format, 'kql');

    // KQL body should contain key KQL constructs
    assert.ok(
      det.content.includes('SecurityEvent') || det.content.includes('SigninLogs'),
      'KQL body should contain SecurityEvent or SigninLogs'
    );
    assert.ok(det.content.includes('where'), 'KQL body should contain where clause');
    assert.ok(det.content.includes('project'), 'KQL body should contain project');
    assert.ok(det.content.includes('summarize'), 'KQL body should contain summarize');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Sigma body is valid YAML with logsource, detection, tags, level
  // ---------------------------------------------------------------------------

  it('Test 4: sigma body has logsource, detection, tags, and level', () => {
    writeReceipts(tmpDir, 'F-001', 2);

    detection.cmdFindingsPromote(tmpDir, { format: 'sigma' }, true);

    const dets = readDetections(tmpDir);
    assert.ok(dets.length > 0);

    // Extract the sigma code block
    const det = dets[0];
    const codeBlockMatch = det.content.match(/```sigma\n([\s\S]*?)```/);
    assert.ok(codeBlockMatch, 'should have a sigma code block');
    const sigmaBody = codeBlockMatch[1];

    // Check for key Sigma fields
    assert.ok(sigmaBody.includes('title:'), 'sigma should have title');
    assert.ok(sigmaBody.includes('logsource:'), 'sigma should have logsource');
    assert.ok(/category:/.test(sigmaBody), 'logsource should have category');
    assert.ok(/product:/.test(sigmaBody), 'logsource should have product');
    assert.ok(sigmaBody.includes('detection:'), 'sigma should have detection');
    assert.ok(sigmaBody.includes('selection:'), 'sigma should have selection in detection');
    assert.ok(sigmaBody.includes('condition:'), 'sigma should have condition in detection');
    assert.ok(sigmaBody.includes('tags:'), 'sigma should have tags');
    assert.ok(/attack\.t\d{4}/i.test(sigmaBody), 'tags should contain attack.tXXXX');
    assert.ok(sigmaBody.includes('level:'), 'sigma should have level');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Confidence scoring based on receipt count
  // ---------------------------------------------------------------------------

  it('Test 5: confidence is high with 3+ receipts, medium with 1-2, low with 0', () => {
    // Test high confidence (3 receipts)
    const tmpHigh = createTempProject();
    writeFindingsFile(tmpHigh, '01-recon', SAMPLE_FINDINGS);
    writeReceipts(tmpHigh, 'F-001', 3);
    detection.cmdFindingsPromote(tmpHigh, { format: 'sigma' }, true);
    const detsHigh = readDetections(tmpHigh);
    const fmHigh = parseFrontmatter(detsHigh[0].content);
    assert.equal(fmHigh.confidence, 'high', '3 receipts should yield high confidence');
    cleanup(tmpHigh);

    // Test medium confidence (1 receipt)
    const tmpMed = createTempProject();
    writeFindingsFile(tmpMed, '01-recon', SAMPLE_FINDINGS);
    writeReceipts(tmpMed, 'F-001', 1);
    detection.cmdFindingsPromote(tmpMed, { format: 'sigma' }, true);
    const detsMed = readDetections(tmpMed);
    const fmMed = parseFrontmatter(detsMed[0].content);
    assert.equal(fmMed.confidence, 'medium', '1 receipt should yield medium confidence');
    cleanup(tmpMed);

    // Test low confidence (0 receipts)
    const tmpLow = createTempProject();
    writeFindingsFile(tmpLow, '01-recon', SAMPLE_FINDINGS);
    detection.cmdFindingsPromote(tmpLow, { format: 'sigma' }, true);
    const detsLow = readDetections(tmpLow);
    const fmLow = parseFrontmatter(detsLow[0].content);
    assert.equal(fmLow.confidence, 'low', '0 receipts should yield low confidence');
    cleanup(tmpLow);
  });

  // ---------------------------------------------------------------------------
  // Test 6: No FINDINGS.md produces error and exits cleanly
  // ---------------------------------------------------------------------------

  it('Test 6: no FINDINGS.md outputs error message and exits cleanly', () => {
    const tmpEmpty = createTempProject();
    // No findings file written

    const result = runThruntTools(['findings', 'promote', '--format', 'sigma'], tmpEmpty);
    // Should exit with an error message about no findings
    assert.ok(!result.success || result.output.includes('No findings') || result.output.includes('no findings') || result.output.includes('[]'),
      'should report no findings or empty result');
    cleanup(tmpEmpty);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Findings without ATT&CK tags produce empty technique_ids
  // ---------------------------------------------------------------------------

  it('Test 7: findings without ATT&CK tags have empty technique_ids', () => {
    const tmpNoTech = createTempProject();
    writeFindingsFile(tmpNoTech, '01-recon',
      `# Findings\n\n- **F-003**: Suspicious activity observed on endpoint | status: confirmed | hypothesis: HYP-003\n`
    );
    writeReceipts(tmpNoTech, 'F-003', 1);

    detection.cmdFindingsPromote(tmpNoTech, { format: 'sigma' }, true);

    const dets = readDetections(tmpNoTech);
    // Finding has no technique IDs; the function should either skip it
    // or write it with empty technique_ids
    if (dets.length > 0) {
      const fm = parseFrontmatter(dets[0].content);
      // technique_ids should be empty array (not fabricated)
      assert.ok(!fm.technique_ids || (Array.isArray(fm.technique_ids) && fm.technique_ids.length === 0),
        'technique_ids should be empty, not fabricated');
    }
    // If no detections written, that's also acceptable (skipped finding with no techniques)
    cleanup(tmpNoTech);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Output markdown has provenance section
  // ---------------------------------------------------------------------------

  it('Test 8: output markdown has provenance section linking back to source finding', () => {
    writeReceipts(tmpDir, 'F-001', 2);

    detection.cmdFindingsPromote(tmpDir, { format: 'sigma' }, true);

    const dets = readDetections(tmpDir);
    assert.ok(dets.length > 0);

    const det = dets[0];
    assert.ok(det.content.includes('Provenance'), 'markdown should have Provenance section');
    assert.ok(det.content.includes('F-001'), 'provenance should reference finding ID');
    assert.ok(det.content.includes('Source Finding'), 'provenance should have Source Finding');
    assert.ok(det.content.includes('Hunt'), 'provenance should have Hunt reference');
    assert.ok(det.content.includes('Hypothesis'), 'provenance should have Hypothesis reference');
    assert.ok(det.content.includes('Evidence Chain'), 'provenance should have Evidence Chain');
  });
});
