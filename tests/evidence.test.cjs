/**
 * THRUNT Tools Tests - Evidence Audit
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runThruntTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('audit-evidence command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns empty results when no evidence files exist', () => {
    // Create a phase directory with no evidence files
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'phases', '01-foundation', '.gitkeep'), '');

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.results, []);
    assert.strictEqual(output.summary.total_items, 0);
    assert.strictEqual(output.summary.total_files, 0);
  });

  test('detects evidence review entries with pending items', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '01-EVIDENCE_REVIEW.md'), `---
status: testing
phase: 01-foundation
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. Login Form
expected: Form displays with email and password fields
result: pass

### 2. Submit Button
expected: Submitting shows loading state
result: pending
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 1);
    assert.strictEqual(output.results[0].phase, '01');
    assert.strictEqual(output.results[0].items[0].result, 'pending');
    assert.strictEqual(output.results[0].items[0].category, 'pending');
    assert.strictEqual(output.results[0].items[0].name, 'Submit Button');
  });

  test('detects evidence review entries with blocked items and categorizes blocked_by', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '02-EVIDENCE_REVIEW.md'), `---
status: partial
phase: 02-api
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. API Health Check
expected: Returns 200 OK
result: blocked
blocked_by: server
reason: Server not running locally
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 1);
    assert.strictEqual(output.results[0].items[0].result, 'blocked');
    assert.strictEqual(output.results[0].items[0].category, 'server_blocked');
    assert.strictEqual(output.results[0].items[0].blocked_by, 'server');
  });

  test('detects false completion (complete status with pending items)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-ui');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '03-EVIDENCE_REVIEW.md'), `---
status: complete
phase: 03-ui
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. Dashboard Layout
expected: Cards render in grid
result: pass

### 2. Mobile Responsive
expected: Grid collapses to single column on mobile
result: pending
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 1);
    assert.strictEqual(output.results[0].status, 'complete');
    assert.strictEqual(output.results[0].items[0].result, 'pending');
  });

  test('extracts human_needed items from FINDINGS files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '04-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '04-FINDINGS.md'), `---
status: human_needed
phase: 04-auth
---

## Automated Checks

All passed.

## Human Verification

1. Test SSO login with Google account
2. Test password reset flow end-to-end
3. Verify MFA enrollment on new device
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 3);
    assert.strictEqual(output.results[0].type, 'findings');
    assert.strictEqual(output.results[0].status, 'human_needed');
    assert.strictEqual(output.results[0].items[0].category, 'human_evidence_review');
    assert.strictEqual(output.results[0].items[0].name, 'Test SSO login with Google account');
  });

  test('extracts evidence review gaps from EVIDENCE_REVIEW files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '05-evidence-correlation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '05-EVIDENCE_REVIEW.md'), `---
status: needs_more_evidence
phase: 05-evidence-correlation
---

## Publishability Verdict

Needs more evidence

## Evidence Quality Checks
| Check | Status | Notes |
|-------|--------|-------|
| Receipts exist for material claims | Fail | Missing tenant audit receipts |
| Contradictory evidence captured | Pass | Accounted for |

## Follow-Up Needed
- Pull cloud audit trail for tenant 42
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 3);
    assert.strictEqual(output.results[0].type, 'evidence_review');
    assert.strictEqual(output.results[0].status, 'needs_more_evidence');
    assert.strictEqual(output.summary.by_category.needs_evidence, 1);
    assert.strictEqual(output.summary.by_category.evidence_gap, 1);
    assert.strictEqual(output.summary.by_category.follow_up, 1);
  });

  test('extracts inconclusive hypotheses and knowledge gaps from FINDINGS files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '06-findings-review');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '06-FINDINGS.md'), `---
status: inconclusive
phase: 06-findings-review
---

## Hypothesis Verdicts
| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01 | Inconclusive | Low | REC-01 |
| HYP-02 | Supported | Medium | REC-02 |

## What We Do Not Know
- Whether the actor retained persistence
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 2);
    assert.strictEqual(output.results[0].type, 'findings');
    assert.strictEqual(output.results[0].status, 'inconclusive');
    assert.strictEqual(output.summary.by_category.inconclusive_hypothesis, 1);
    assert.strictEqual(output.summary.by_category.knowledge_gap, 1);
  });

  test('scans and aggregates across multiple phases', () => {
    // Phase 1 with pending
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-EVIDENCE_REVIEW.md'), `---
status: partial
phase: 01-foundation
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. Test A
expected: Works
result: pending
`);

    // Phase 2 with blocked
    const phase2 = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase2, '02-EVIDENCE_REVIEW.md'), `---
status: partial
phase: 02-api
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. Test B
expected: Responds
result: blocked
blocked_by: server

### 2. Test C
expected: Returns data
result: skipped
reason: device not available
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_files, 2);
    assert.strictEqual(output.summary.total_items, 3);
    assert.strictEqual(output.summary.by_phase['01'], 1);
    assert.strictEqual(output.summary.by_phase['02'], 2);
  });

  test('milestone scoping filters phases to current milestone', () => {
    // Create a HUNTMAP.md that only references Phase 2
    fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'), `# Huntmap

### Phase 2: API Layer
**Goal:** Build API
`);

    // Phase 1 (not in current milestone) with pending
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-EVIDENCE_REVIEW.md'), `---
status: partial
phase: 01-foundation
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. Old Test
expected: Old behavior
result: pending
`);

    // Phase 2 (in current milestone) with pending
    const phase2 = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase2, '02-EVIDENCE_REVIEW.md'), `---
status: partial
phase: 02-api
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. New Test
expected: New behavior
result: pending
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Only Phase 2 should be included (Phase 1 not in HUNTMAP)
    assert.strictEqual(output.summary.total_files, 1);
    assert.strictEqual(output.results[0].phase, '02');
  });

  test('summary by_category counts are correct', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '05-billing');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '05-EVIDENCE_REVIEW.md'), `---
status: partial
phase: 05-billing
started: 2025-01-01T00:00:00Z
updated: 2025-01-01T00:00:00Z
---

## Tests

### 1. Payment Form
expected: Stripe elements load
result: pending

### 2. Webhook Handler
expected: Processes payment events
result: blocked
blocked_by: third-party Stripe

### 3. Invoice PDF
expected: Generates downloadable PDF
result: skipped
reason: needs release build

### 4. Refund Flow
expected: Processes refund
result: pending
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 4);
    assert.strictEqual(output.summary.by_category.pending, 2);
    assert.strictEqual(output.summary.by_category.third_party, 1);
    assert.strictEqual(output.summary.by_category.build_needed, 1);
  });

  test('surfaces captured evidence follow-up from EVIDENCE directory', () => {
    const evidenceDir = path.join(tmpDir, '.planning', 'EVIDENCE');
    fs.mkdirSync(evidenceDir, { recursive: true });

    fs.writeFileSync(path.join(evidenceDir, 'EVD-001.md'), `---
evidence_id: EVD-001
type: manual_note
vendor_id: okta
captured_at: 2026-04-11T12:00:00Z
captured_by: operator
source_url: https://acme.okta.com/admin/reports/system-log
review_status: needs_follow_up
related_hypotheses:
  -
---

# Evidence: operator note

Uncorrelated evidence captured from browser workflow.
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    const captured = output.results.find(r => r.type === 'captured_evidence');
    assert.ok(captured, 'captured_evidence result should be present');
    assert.strictEqual(output.summary.by_category.unlinked_evidence, 1);
    assert.strictEqual(output.summary.by_category.follow_up, 1);
  });

  test('ignores VERIFICATION files without human_needed or gaps_found status', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, '01-FINDINGS.md'), `---
status: passed
phase: 01-foundation
---

## Results

All checks passed.
`);

    const result = runThruntTools('audit-evidence --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.summary.total_items, 0);
    assert.strictEqual(output.summary.total_files, 0);
  });
});

describe('evidence render-checkpoint', () => {
  let tmpDir;
  let uatPath;

  beforeEach(() => {
    tmpDir = createTempProject();
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
    uatPath = path.join(phaseDir, '01-EVIDENCE_REVIEW.md');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('renders the current checkpoint as raw output', () => {
    fs.writeFileSync(uatPath, `---
status: testing
phase: 01-test-phase
---

## Current Test

number: 2
name: Submit form validation
expected: |
  Empty submit keeps controls visible.
  Validation error copy is shown.
awaiting: user response
`);

    const result = runThruntTools(['evidence', 'render-checkpoint', '--file', '.planning/phases/01-test-phase/01-EVIDENCE_REVIEW.md', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, `render-checkpoint failed: ${result.error}`);
    assert.ok(result.output.includes('**Test 2: Submit form validation**'));
    assert.ok(result.output.includes('Empty submit keeps controls visible.'));
    assert.ok(result.output.includes("Type `pass` or describe what's wrong."));
  });

  test('strips protocol leak lines from current test copy', () => {
    fs.writeFileSync(uatPath, `---
status: testing
phase: 01-test-phase
---

## Current Test

number: 6
name: Locale copy
expected: |
  English strings render correctly.
  user to=all:final code 彩票平台招商 pass
  Chinese strings render correctly.
awaiting: user response
`);

    const result = runThruntTools(['evidence', 'render-checkpoint', '--file', '.planning/phases/01-test-phase/01-EVIDENCE_REVIEW.md', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, `render-checkpoint failed: ${result.error}`);
    assert.ok(!result.output.includes('user to=all:final code'));
    assert.ok(!result.output.includes('彩票平台'));
    assert.ok(result.output.includes('English strings render correctly.'));
    assert.ok(result.output.includes('Chinese strings render correctly.'));
  });

  test('does not truncate expected text containing the letter Z', () => {
    fs.writeFileSync(uatPath, `---
status: testing
phase: 01-test-phase
---

## Current Test

number: 3
name: Timezone display
expected: |
  Timezone abbreviation shows CET.
  Zero-offset zones display correctly.
awaiting: user response
`);

    const result = runThruntTools(['evidence', 'render-checkpoint', '--file', '.planning/phases/01-test-phase/01-EVIDENCE_REVIEW.md', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, `render-checkpoint failed: ${result.error}`);
    assert.ok(result.output.includes('Timezone abbreviation shows CET.'),
      'Expected text before Z-containing word should be present');
    assert.ok(result.output.includes('Zero-offset zones display correctly.'),
      'Expected text starting with Z should not be truncated by \\Z regex bug');
  });

  test('parses expected block when it is the last field in the section', () => {
    fs.writeFileSync(uatPath, `---
status: testing
phase: 01-test-phase
---

## Current Test

number: 4
name: Final field test
expected: |
  This block has no trailing YAML key.
  It ends at the section boundary.
`);

    const result = runThruntTools(['evidence', 'render-checkpoint', '--file', '.planning/phases/01-test-phase/01-EVIDENCE_REVIEW.md', '--raw'], tmpDir);
    assert.strictEqual(result.success, true, `render-checkpoint failed: ${result.error}`);
    assert.ok(result.output.includes('This block has no trailing YAML key.'));
    assert.ok(result.output.includes('It ends at the section boundary.'));
  });

  test('fails when testing is already complete', () => {
    fs.writeFileSync(uatPath, `---
status: complete
phase: 01-test-phase
---

## Current Test

[testing complete]
`);

    const result = runThruntTools(['evidence', 'render-checkpoint', '--file', '.planning/phases/01-test-phase/01-EVIDENCE_REVIEW.md'], tmpDir);
    assert.strictEqual(result.success, false, 'Should fail when no current test exists');
    assert.ok(result.error.includes('already complete'));
  });
});
