/**
 * Unit tests for base parser and 6 simple artifact parsers.
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 *
 * Uses real hunt artifacts from test/fixtures/brute-force-hunt/ as test data.
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
// Base parser tests
// ---------------------------------------------------------------------------
describe('base parser', () => {
  describe('extractFrontmatter', () => {
    it('parses YAML frontmatter from QRY-20260329-001.md', () => {
      const raw = fixture('QUERIES/QRY-20260329-001.md');
      const fm = ext.extractFrontmatter(raw);
      assert.equal(fm.query_id, 'QRY-20260329-001');
      assert.equal(fm.connector_id, 'okta');
      assert.deepEqual(fm.related_hypotheses, ['HYP-01', 'HYP-02']);
    });

    it('returns empty object for MISSION.md (no frontmatter)', () => {
      const raw = fixture('MISSION.md');
      const fm = ext.extractFrontmatter(raw);
      assert.deepEqual(fm, {});
    });

    it('returns empty object and does not throw on malformed YAML', () => {
      const malformed = '---\nkey: "unclosed\n---\n# Body';
      const fm = ext.extractFrontmatter(malformed);
      assert.equal(typeof fm, 'object');
      // Should not throw -- returns empty or partial
    });
  });

  describe('extractBody', () => {
    it('returns everything after closing --- delimiter', () => {
      const raw = '---\nkey: value\n---\n\n# Title\n\nBody text.';
      const body = ext.extractBody(raw);
      assert.ok(body.includes('# Title'));
      assert.ok(body.includes('Body text.'));
    });

    it('returns full content when no frontmatter', () => {
      const raw = '# Title\n\nBody text.';
      const body = ext.extractBody(raw);
      assert.ok(body.includes('# Title'));
      assert.ok(body.includes('Body text.'));
    });
  });

  describe('extractMarkdownSections', () => {
    it('splits body into Map keyed by heading text', () => {
      const body = '## First\n\nContent one.\n\n## Second\n\nContent two.';
      const sections = ext.extractMarkdownSections(body);
      assert.ok(sections instanceof Map);
      assert.ok(sections.has('First'));
      assert.ok(sections.has('Second'));
      assert.ok(sections.get('First').includes('Content one.'));
      assert.ok(sections.get('Second').includes('Content two.'));
    });
  });
});

// ---------------------------------------------------------------------------
// parseMission tests
// ---------------------------------------------------------------------------
describe('parseMission', () => {
  it('returns loaded ParseResult with correct fields from MISSION.md', () => {
    const raw = fixture('MISSION.md');
    const result = ext.parseMission(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.mode, 'case');
    assert.equal(result.data.status, 'Closed');
    assert.ok(result.data.signal.includes('Okta System Log alert'));
    assert.ok(result.data.desiredOutcome.includes('compromised'));
    assert.ok(result.data.scope.includes('david.park'));
    assert.ok(result.data.workingTheory.includes('Credential stuffing'));
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parseMission('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });

  it('returns error ParseResult on truncated input missing markers', () => {
    const result = ext.parseMission('# Mission\n\nSome text without sections.');
    assert.equal(result.status, 'error');
    assert.ok(result.error.includes('structural markers'));
  });
});

// ---------------------------------------------------------------------------
// parseHypotheses tests
// ---------------------------------------------------------------------------
describe('parseHypotheses', () => {
  it('returns active, parked, disproved arrays from HYPOTHESES.md', () => {
    const raw = fixture('HYPOTHESES.md');
    const result = ext.parseHypotheses(raw);
    assert.equal(result.status, 'loaded');
    // 3 active hypotheses (HYP-01, HYP-02, HYP-03) + HYP-04 appears under Active but is Disproved status
    assert.ok(result.data.active.length >= 3);
    assert.equal(result.data.active[0].id, 'HYP-01');
    assert.equal(result.data.active[0].status, 'Supported');
  });

  it('contains HYP-04 with Disproved status', () => {
    const raw = fixture('HYPOTHESES.md');
    const result = ext.parseHypotheses(raw);
    assert.equal(result.status, 'loaded');
    // HYP-04 is listed under Active Hypotheses but has status Disproved
    const hyp04 = [...result.data.active, ...result.data.disproved].find(h => h.id === 'HYP-04');
    assert.ok(hyp04, 'HYP-04 should exist');
    assert.equal(hyp04.status, 'Disproved');
  });

  it('treats "Supported Hypotheses" as parsed hypotheses', () => {
    const raw = `# Hypotheses\n\n## Active Hypotheses\n\n_(none)_\n\n## Supported Hypotheses\n\n### HYP-01: Consent grant is malicious\n\n- **Signal:** OAuth consent alert\n- **Assertion:** Attacker-controlled app received consent\n- **Priority:** High\n- **Status:** Supported\n- **Confidence:** High\n- **Scope:** Tenant-wide\n- **Data sources:** Entra audit logs\n- **Evidence needed:** Consent telemetry\n- **Disproof condition:** App is approved by IT\n\n## Parked Hypotheses\n\n- None\n\n## Disproved Hypotheses\n\n- None\n`;
    const result = ext.parseHypotheses(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.active.length, 1);
    assert.equal(result.data.active[0].id, 'HYP-01');
    assert.equal(result.data.active[0].status, 'Supported');
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parseHypotheses('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// parseHuntMap tests
// ---------------------------------------------------------------------------
describe('parseHuntMap', () => {
  it('returns 4 phases from HUNTMAP.md', () => {
    const raw = fixture('HUNTMAP.md');
    const result = ext.parseHuntMap(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.phases.length, 4);
    assert.ok(result.data.phases[0].name.includes('Signal Intake'));
  });

  it('all phases have status complete', () => {
    const raw = fixture('HUNTMAP.md');
    const result = ext.parseHuntMap(raw);
    assert.equal(result.status, 'loaded');
    for (const phase of result.data.phases) {
      assert.equal(phase.status, 'complete');
    }
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parseHuntMap('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// parseState tests
// ---------------------------------------------------------------------------
describe('parseState', () => {
  it('returns phase=4, totalPhases=4, status=Complete from STATE.md', () => {
    const raw = fixture('STATE.md');
    const result = ext.parseState(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.phase, 4);
    assert.equal(result.data.totalPhases, 4);
    assert.equal(result.data.status, 'Complete');
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parseState('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// parseEvidenceReview tests
// ---------------------------------------------------------------------------
describe('parseEvidenceReview', () => {
  it('returns publishabilityVerdict containing "Ready to publish"', () => {
    const raw = fixture('EVIDENCE_REVIEW.md');
    const result = ext.parseEvidenceReview(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.publishabilityVerdict.includes('Ready to publish'));
  });

  it('returns 6 evidence checks all Pass', () => {
    const raw = fixture('EVIDENCE_REVIEW.md');
    const result = ext.parseEvidenceReview(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.evidenceChecks.length, 6);
    for (const check of result.data.evidenceChecks) {
      assert.equal(check.status, 'Pass');
    }
  });

  it('returns anti-pattern checks', () => {
    const raw = fixture('EVIDENCE_REVIEW.md');
    const result = ext.parseEvidenceReview(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.antiPatternChecks.length > 0);
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parseEvidenceReview('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// parsePhaseSummary tests
// ---------------------------------------------------------------------------
describe('parsePhaseSummary', () => {
  it('returns executiveSummary containing "password spray" from FINDINGS.md', () => {
    const raw = fixture('FINDINGS.md');
    const result = ext.parsePhaseSummary(raw);
    assert.equal(result.status, 'loaded');
    assert.ok(result.data.executiveSummary.includes('password spray'));
  });

  it('returns 4 hypothesis verdicts', () => {
    const raw = fixture('FINDINGS.md');
    const result = ext.parsePhaseSummary(raw);
    assert.equal(result.status, 'loaded');
    assert.equal(result.data.hypothesisVerdicts.length, 4);
  });

  it('returns error ParseResult on empty string', () => {
    const result = ext.parsePhaseSummary('');
    assert.equal(result.status, 'error');
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: every parser returns error (not throws) on malformed input
// ---------------------------------------------------------------------------
describe('error handling', () => {
  const parsers = [
    ['parseMission', ext.parseMission],
    ['parseHypotheses', ext.parseHypotheses],
    ['parseHuntMap', ext.parseHuntMap],
    ['parseState', ext.parseState],
    ['parseEvidenceReview', ext.parseEvidenceReview],
    ['parsePhaseSummary', ext.parsePhaseSummary],
  ];

  for (const [name, parser] of parsers) {
    it(`${name} returns error ParseResult (not throws) on truncated input`, () => {
      const result = parser('# Truncated\n\nSome partial text.');
      assert.equal(result.status, 'error');
      assert.ok(typeof result.error === 'string');
      assert.ok(result.error.length > 0);
    });
  }
});
