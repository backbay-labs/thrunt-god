'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.join(__dirname, '..', 'thrunt-god', 'workflows', 'hunt-validate-findings.md');
const TEMPLATE_PATH = path.join(__dirname, '..', 'thrunt-god', 'templates', 'evidence-review.md');

describe('Sequential Evidence Integrity - workflow', () => {
  const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');

  test('workflow contains Sequential Evidence Integrity step', () => {
    assert.ok(content.includes('Sequential Evidence Integrity'),
      'Missing Sequential Evidence Integrity section');
  });

  test('step checks for entity timelines', () => {
    assert.ok(content.includes('Entity timelines exist'),
      'Missing entity timelines check');
  });

  test('step checks for documented baselines', () => {
    assert.ok(content.includes('Baselines documented'),
      'Missing baselines check');
  });

  test('step checks for documented predictions', () => {
    assert.ok(content.includes('Predictions documented'),
      'Missing predictions check');
  });

  test('step checks for deviation scores', () => {
    assert.ok(content.includes('Deviation scores present'),
      'Missing deviation scores check');
  });

  test('step references anomaly-framing.md', () => {
    assert.ok(content.includes('anomaly-framing'),
      'Missing anomaly-framing reference');
  });

  test('workflow references the five-category rubric', () => {
    assert.ok(content.includes('EXPECTED_BENIGN') || content.includes('expected_benign'),
      'Missing deviation category reference');
  });

  test('step checks score-verdict consistency', () => {
    assert.ok(/score.*verdict|verdict.*score/i.test(content),
      'Missing score-verdict consistency check');
  });
});

describe('Sequential Evidence Anti-Patterns - template', () => {
  const content = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  test('template contains Sequential Evidence Anti-Patterns section', () => {
    assert.ok(content.includes('Sequential Evidence Anti-Patterns'),
      'Missing anti-patterns section');
  });

  test('includes post-hoc rationalization anti-pattern', () => {
    assert.ok(/[Pp]ost-hoc rationalization/.test(content),
      'Missing post-hoc rationalization');
  });

  test('includes missing baseline anti-pattern', () => {
    assert.ok(/[Mm]issing baseline/.test(content),
      'Missing baseline anti-pattern');
  });

  test('includes score inflation anti-pattern', () => {
    assert.ok(/[Ss]core inflation/.test(content),
      'Missing score inflation anti-pattern');
  });

  test('includes sequential evidence integrity in quality checks table', () => {
    assert.ok(/[Ss]equential evidence integrity/.test(content),
      'Missing sequential evidence row in quality checks');
  });

  test('preserves original template sections', () => {
    assert.ok(content.includes('Publishability Verdict'), 'Missing original Publishability section');
    assert.ok(content.includes('Evidence Quality Checks'), 'Missing original Quality Checks section');
    assert.ok(content.includes('Contradictory Evidence'), 'Missing original Contradictory section');
    assert.ok(content.includes('Blind Spots'), 'Missing original Blind Spots section');
    assert.ok(content.includes('Follow-Up Needed'), 'Missing original Follow-Up section');
  });
});
