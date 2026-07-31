import { describe, test, expect } from 'bun:test';
import * as path from 'node:path';
import {
  extractFrontmatter,
  parseFrontmatter,
  extractSection,
  parseMission,
  parseState,
  parseHypotheses,
  parseFindings,
  parseEvidenceReview,
  parseHuntmapPhases,
  parseQueryLog,
  parseReceipt,
  loadAllArtifacts,
} from '../src/reader.ts';

// Path to the real example hunt artifacts
const EXAMPLE_ROOT = path.resolve(
  import.meta.dir,
  '../../../../thrunt-god/examples/oauth-session-hijack'
);

// ─── Frontmatter parsing ───────────────────────────────────────────────────

describe('extractFrontmatter', () => {
  test('parses simple key-value fields', () => {
    const content = '---\ntitle: Test\nmode: case\nowner: analyst-1\nstatus: Open\n---\n# Body';
    const fm = extractFrontmatter(content);
    expect(fm.title).toBe('Test');
    expect(fm.mode).toBe('case');
    expect(fm.owner).toBe('analyst-1');
  });

  test('returns empty for no frontmatter', () => {
    expect(extractFrontmatter('# No frontmatter')).toEqual({});
  });

  test('handles values with colons', () => {
    const content = '---\ntitle: Hunt: Suspicious Logins\nscope: network:internal\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.title).toBe('Hunt: Suspicious Logins');
  });
});

describe('parseFrontmatter', () => {
  test('parses YAML list fields', () => {
    const content = '---\nrelated_hypotheses:\n  - HYP-01\n  - HYP-02\nstatus: ok\n---\n';
    const result = parseFrontmatter(content);
    expect(result.lists.related_hypotheses).toEqual(['HYP-01', 'HYP-02']);
    expect(result.fields.status).toBe('ok');
  });

  test('parses nested fields', () => {
    const content = '---\nprogress:\n  total_phases: 4\n  percent: 50\n---\n';
    const result = parseFrontmatter(content);
    expect(result.nested.progress.total_phases).toBe('4');
    expect(result.nested.progress.percent).toBe('50');
  });

  test('strips quotes from values', () => {
    const content = '---\nversion: "1.0"\nname: \'test\'\n---\n';
    const result = parseFrontmatter(content);
    expect(result.fields.version).toBe('1.0');
    expect(result.fields.name).toBe('test');
  });
});

// ─── Section extraction ────────────────────────────────────────────────────

describe('extractSection', () => {
  test('extracts section content', () => {
    const content = '## Signal\n\nSome signal text\n\n## Scope\n\nScope text';
    expect(extractSection(content, 'Signal')).toBe('Some signal text');
  });

  test('returns empty for missing section', () => {
    expect(extractSection('## Other\ntext', 'Signal')).toBe('');
  });

  test('is case-insensitive', () => {
    const content = '## signal\nlower case heading.';
    expect(extractSection(content, 'Signal')).toBe('lower case heading.');
  });
});

// ─── Real artifact parsing against oauth-session-hijack example ────────────

describe('parseMission (real)', () => {
  test('parses oauth-session-hijack MISSION.md', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(path.join(EXAMPLE_ROOT, '.planning/MISSION.md'), 'utf-8');
    const mission = parseMission(content, EXAMPLE_ROOT);
    expect(mission.title).toContain('OAuth');
    expect(mission.mode).toBe('program');
    expect(mission.status.toLowerCase()).toContain('complete');
    expect(mission.signal).toBeTruthy();
    expect(mission.scope).toBeTruthy();
  });
});

describe('parseState (real)', () => {
  test('parses oauth-session-hijack STATE.md', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(path.join(EXAMPLE_ROOT, '.planning/STATE.md'), 'utf-8');
    const progress = parseState(content);
    expect(progress.currentPhase).toBe(3);
    expect(progress.lastActivity).toBeTruthy();
  });
});

describe('parseHypotheses (real)', () => {
  test('parses all three hypotheses', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(path.join(EXAMPLE_ROOT, '.planning/HYPOTHESES.md'), 'utf-8');
    const hyps = parseHypotheses(content);
    expect(hyps.length).toBe(3);
    expect(hyps[0].id).toBe('HYP-01');
    expect(hyps[0].status).toBe('Supported');
    expect(hyps[0].priority).toBe('High');
    expect(hyps[0].confidence).toBe('High');
    expect(hyps[0].assertion).toBeTruthy();
  });
});

describe('parseFindings (real)', () => {
  test('parses hypothesis verdicts from FINDINGS.md', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(path.join(EXAMPLE_ROOT, '.planning/FINDINGS.md'), 'utf-8');
    const findings = parseFindings(content);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].relatedHypotheses.length).toBeGreaterThan(0);
  });
});

describe('parseEvidenceReview (real)', () => {
  test('parses EVIDENCE_REVIEW.md', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(path.join(EXAMPLE_ROOT, '.planning/EVIDENCE_REVIEW.md'), 'utf-8');
    const er = parseEvidenceReview(content);
    expect(er.publishabilityVerdict).toContain('Ready to publish');
    expect(er.checks.length).toBeGreaterThan(0);
    expect(er.checks.every(c => c.status === 'Pass')).toBe(true);
    expect(er.antiPatterns.length).toBeGreaterThan(0);
  });
});

describe('parseHuntmapPhases (real)', () => {
  test('parses all three phases', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(path.join(EXAMPLE_ROOT, '.planning/HUNTMAP.md'), 'utf-8');
    const phases = parseHuntmapPhases(content);
    expect(phases.length).toBe(3);
    expect(phases[0].number).toBe(1);
    expect(phases[0].status).toBe('complete');
    expect(phases[2].number).toBe(3);
  });
});

describe('parseQueryLog (real)', () => {
  test('parses QRY-20260409-201 with YAML list frontmatter', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(
      path.join(EXAMPLE_ROOT, '.planning/QUERIES/QRY-20260409-201.md'), 'utf-8'
    );
    const q = parseQueryLog(content);
    expect(q.queryId).toBe('QRY-20260409-201');
    expect(q.connectorId).toBe('filesystem');
    expect(q.relatedHypotheses).toContain('HYP-01');
    expect(q.relatedReceipts).toContain('RCT-20260409-201');
    expect(q.eventCount).toBe(7);
    expect(q.templateCount).toBe(3);
    expect(q.entityCount).toBe(3);
    expect(q.title).toBeTruthy();
  });
});

describe('parseReceipt (real)', () => {
  test('parses RCT-20260409-201 with YAML list frontmatter', () => {
    const fs = require('node:fs');
    const content = fs.readFileSync(
      path.join(EXAMPLE_ROOT, '.planning/RECEIPTS/RCT-20260409-201.md'), 'utf-8'
    );
    const r = parseReceipt(content);
    expect(r.receiptId).toBe('RCT-20260409-201');
    expect(r.claimStatus).toBe('supports');
    expect(r.relatedHypotheses).toContain('HYP-01');
    expect(r.relatedQueries).toContain('QRY-20260409-201');
    expect(r.claim).toBeTruthy();
  });
});

// ─── Full loader ───────────────────────────────────────────────────────────

describe('loadAllArtifacts (real)', () => {
  test('loads complete case from oauth-session-hijack', () => {
    const loaded = loadAllArtifacts(EXAMPLE_ROOT);
    expect(loaded.mission).not.toBeNull();
    expect(loaded.mission!.title).toContain('OAuth');
    expect(loaded.progress).not.toBeNull();
    expect(loaded.progress!.currentPhase).toBe(3);
    expect(loaded.hypotheses.length).toBe(3);
    expect(loaded.findings.length).toBeGreaterThan(0);
    expect(loaded.queries.length).toBe(3);
    expect(loaded.receipts.length).toBe(3);
    expect(loaded.huntmapPhases.length).toBe(3);
    expect(loaded.evidenceReview).not.toBeNull();
    // Phases merged into progress
    expect(loaded.progress!.phases.length).toBe(3);
  });
});
