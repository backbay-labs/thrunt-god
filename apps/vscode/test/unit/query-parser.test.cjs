/**
 * Unit tests for the Query parser.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Uses real QRY fixtures from test/fixtures/brute-force-hunt/QUERIES/.
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
// parseQuery tests
// ---------------------------------------------------------------------------
describe('parseQuery', () => {
  it('returns loaded ParseResult with correct frontmatter from QRY-001', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.queryId, 'QRY-20260329-001');
    assert.equal(result.data.source, 'Identity');
    assert.equal(result.data.connectorId, 'okta');
    assert.equal(result.data.dataset, 'identity');
    assert.equal(result.data.querySpecVersion, '1.0');
    assert.equal(result.data.author, 'thrunt-telemetry-executor');
    assert.equal(result.data.manifestId, 'MAN-20260329-001');
  });

  it('extracts relatedHypotheses and relatedReceipts from QRY-001 frontmatter', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.deepEqual(result.data.relatedHypotheses, ['HYP-01', 'HYP-02']);
    assert.deepEqual(result.data.relatedReceipts, ['RCT-20260329-001', 'RCT-20260329-002']);
  });

  it('extracts intent containing "Collect all authentication events" from QRY-001', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.intent.includes('Collect all authentication events'));
  });

  it('extracts resultSummary starting with "events=1247, templates=3, entities=15"', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.resultSummary.startsWith('events=1247, templates=3, entities=15'));
  });

  it('extracts eventCount=1247, templateCount=3, entityCount=15 from QRY-001', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.eventCount, 1247);
    assert.equal(result.data.templateCount, 3);
    assert.equal(result.data.entityCount, 15);
  });

  it('extracts 3 DrainTemplates from QRY-001 with correct metadata', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.templates.length, 3);

    // T1
    assert.equal(result.data.templates[0].templateId, 'T1');
    assert.ok(result.data.templates[0].template.includes('Authentication failed'));
    assert.equal(result.data.templates[0].count, 1189);
    assert.equal(result.data.templates[0].percentage, 95.3);

    // T2
    assert.equal(result.data.templates[1].templateId, 'T2');
    assert.ok(result.data.templates[1].template.includes('Authentication succeeded'));
    assert.equal(result.data.templates[1].count, 43);
    assert.equal(result.data.templates[1].percentage, 3.4);

    // T3
    assert.equal(result.data.templates[2].templateId, 'T3');
    assert.ok(result.data.templates[2].template.includes('MFA challenge'));
    assert.equal(result.data.templates[2].count, 15);
    assert.equal(result.data.templates[2].percentage, 1.2);
  });

  it('extracts 5 templates from QRY-003 with correct counts', () => {
    const raw = fixture('QUERIES/QRY-20260329-003.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.templates.length, 5);

    // Verify counts
    assert.equal(result.data.templates[0].templateId, 'T1');
    assert.equal(result.data.templates[0].count, 62);
    assert.equal(result.data.templates[0].percentage, 39.7);

    assert.equal(result.data.templates[1].templateId, 'T2');
    assert.equal(result.data.templates[1].count, 47);
    assert.equal(result.data.templates[1].percentage, 30.1);

    assert.equal(result.data.templates[2].templateId, 'T3');
    assert.equal(result.data.templates[2].count, 18);
    assert.equal(result.data.templates[2].percentage, 11.5);

    assert.equal(result.data.templates[3].templateId, 'T4');
    assert.equal(result.data.templates[3].count, 21);
    assert.equal(result.data.templates[3].percentage, 13.5);

    assert.equal(result.data.templates[4].templateId, 'T5');
    assert.equal(result.data.templates[4].count, 8);
    assert.equal(result.data.templates[4].percentage, 5.1);
  });

  it('extracts 4 templates from QRY-002', () => {
    const raw = fixture('QUERIES/QRY-20260329-002.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.templates.length, 4);
    assert.equal(result.data.eventCount, 28);
    assert.equal(result.data.templateCount, 4);
    assert.equal(result.data.entityCount, 1);
  });

  it('extracts query title, time window, and template detail blocks from QRY-001', () => {
    const raw = fixture('QUERIES/QRY-20260329-001.md');
    const result = ext.parseQuery(raw);
    assert.equal(result.status, 'loaded');

    assert.equal(
      result.data.title,
      'Query Log: Okta Authentication Events During Password Spray Window'
    );
    assert.deepEqual(result.data.timeWindow, {
      start: '2026-03-29T14:00:00Z',
      end: '2026-03-29T14:15:00Z',
    });

    assert.equal(result.data.templateDetails.length, 3);
    assert.equal(result.data.templateDetails[0].templateId, 'T1');
    assert.ok(result.data.templateDetails[0].summary.includes('failed authentication attempts'));
    assert.equal(
      result.data.templateDetails[0].sampleEventText,
      '1,189 failed authentication attempts across 15 unique accounts'
    );
    assert.equal(result.data.templateDetails[0].sampleEventId, null);
    assert.deepEqual(result.data.templateDetails[0].eventIds, []);
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parseQuery('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });

  it('returns error ParseResult on content missing Result Summary', () => {
    const result = ext.parseQuery('---\nquery_id: test\n---\n\n# Query\n\n## Intent\n\nSome intent.\n');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });
});
