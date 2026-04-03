/**
 * Unit tests for the Receipt parser and parser barrel index.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Uses real RCT fixtures from test/fixtures/brute-force-hunt/RECEIPTS/.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'brute-force-hunt');
function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// parseReceipt tests
// ---------------------------------------------------------------------------
describe('parseReceipt', () => {
  it('returns loaded ParseResult with correct frontmatter from RCT-001', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.receiptId, 'RCT-20260329-001');
    assert.equal(result.data.claimStatus, 'supports');
    assert.equal(result.data.source, 'Okta System Log');
    assert.equal(result.data.connectorId, 'okta');
    assert.equal(result.data.dataset, 'identity');
    assert.equal(result.data.resultStatus, 'ok');
    assert.equal(result.data.querySpecVersion, '1.0');
    assert.equal(result.data.manifestId, 'MAN-20260329-001');
  });

  it('extracts relatedHypotheses and relatedQueries from RCT-001 frontmatter', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.deepEqual(result.data.relatedHypotheses, ['HYP-01']);
    assert.deepEqual(result.data.relatedQueries, ['QRY-20260329-001']);
  });

  it('extracts claim containing "coordinated password spray" from RCT-001', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.claim.includes('coordinated password spray'));
  });

  it('extracts evidence text from RCT-001', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.evidence.includes('1,189 failed authentication attempts'));
  });

  it('extracts anomalyFrame.deviationScore.totalScore=4 from RCT-001', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.anomalyFrame !== null, 'anomalyFrame should not be null');
    assert.equal(result.data.anomalyFrame.deviationScore.totalScore, 4);
    assert.equal(result.data.anomalyFrame.deviationScore.category, 'EXPECTED_MALICIOUS');
  });

  it('extracts anomalyFrame.deviationScore.baseScore=3 from RCT-001', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.anomalyFrame.deviationScore.baseScore, 3);
  });

  it('extracts anomalyFrame.attackMapping containing "T1110.003" from RCT-001', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.anomalyFrame.attackMapping.includes('T1110.003'));
    assert.ok(result.data.anomalyFrame.attackMapping.includes('T1078'));
  });

  it('extracts deviationScore.totalScore=6 from RCT-002 (Critical)', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-002.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.anomalyFrame !== null);
    assert.equal(result.data.anomalyFrame.deviationScore.totalScore, 6);
    assert.equal(result.data.anomalyFrame.deviationScore.category, 'EXPECTED_MALICIOUS');
    assert.equal(result.data.anomalyFrame.deviationScore.baseScore, 3);
    // Should have 3 modifiers (excluding base and total)
    assert.equal(result.data.anomalyFrame.deviationScore.modifiers.length, 3);
  });

  it('extracts ATT&CK techniques from RCT-002', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-002.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.anomalyFrame.attackMapping.includes('T1078.001'));
    assert.ok(result.data.anomalyFrame.attackMapping.includes('T1111'));
    assert.ok(result.data.anomalyFrame.attackMapping.includes('T1098.005'));
    assert.ok(result.data.anomalyFrame.attackMapping.includes('T1098'));
  });

  it('extracts deviationScore.totalScore=5 from RCT-003', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-003.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.anomalyFrame !== null);
    assert.equal(result.data.anomalyFrame.deviationScore.totalScore, 5);
    assert.equal(result.data.anomalyFrame.deviationScore.category, 'EXPECTED_MALICIOUS');
    // ATT&CK mapping should include T1213.002
    assert.ok(result.data.anomalyFrame.attackMapping.includes('T1213.002'));
  });

  it('handles RCT-004 without Anomaly Framing section (anomalyFrame=null)', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-004.md');
    const result = ext.parseReceipt(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.receiptId, 'RCT-20260329-004');
    assert.equal(result.data.claimStatus, 'disproves');
    assert.equal(result.data.anomalyFrame, null);
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parseReceipt('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });

  it('returns error ParseResult on truncated content', () => {
    const result = ext.parseReceipt('---\nreceipt_id: test\n---\n\n# Receipt\n\nSome text.');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// parseArtifact dispatch tests
// ---------------------------------------------------------------------------
describe('parseArtifact', () => {
  it('dispatches to correct parser based on ArtifactType', () => {
    const raw = fixture('RECEIPTS/RCT-20260329-001.md');
    const directResult = ext.parseReceipt(raw);
    const dispatchResult = ext.parseArtifact('receipt', raw);
    assert.equal(dispatchResult.status, directResult.status);
    assert.equal(dispatchResult.data.receiptId, directResult.data.receiptId);
    assert.equal(dispatchResult.data.claimStatus, directResult.data.claimStatus);
  });

  it('dispatches query type correctly', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const directResult = ext.parseQuery(raw);
    const dispatchResult = ext.parseArtifact('query', raw);
    assert.equal(dispatchResult.status, directResult.status);
    assert.equal(dispatchResult.data.queryId, directResult.data.queryId);
  });

  it('dispatches mission type correctly', () => {
    const raw = fixture('MISSION.md');
    const dispatchResult = ext.parseArtifact('mission', raw);
    assert.equal(dispatchResult.status, 'loaded');
    assert.equal(dispatchResult.data.mode, 'case');
  });

  it('returns error for unknown artifact type', () => {
    const result = ext.parseArtifact('unknown', 'test');
    assert.equal(result.status, 'error');
    assert.ok(result.error.includes('Unknown artifact type'));
  });
});
