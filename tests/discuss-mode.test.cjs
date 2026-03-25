const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('workflow discussion settings', () => {
  test('config template includes discuss_mode default', () => {
    const template = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'thrunt-god', 'templates', 'config.json'), 'utf8')
    );
    assert.strictEqual(template.workflow.discuss_mode, 'discuss');
  });

  test('assumptions workflow still supports auto and text-mode operation', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'workflows', 'hunt-shape-assumptions.md'),
      'utf8'
    );
    assert.ok(workflow.includes('--auto'), 'assumptions workflow should handle --auto');
    assert.ok(workflow.includes('--text'), 'assumptions workflow should handle --text');
    assert.ok(workflow.includes('DISCUSSION-LOG.md'), 'assumptions workflow should keep an audit log');
  });

  test('progress workflow surfaces discuss_mode', () => {
    const progress = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'workflows', 'progress.md'),
      'utf8'
    );
    assert.ok(progress.includes('workflow.discuss_mode'), 'progress should read discuss_mode config');
    assert.ok(progress.includes('Discuss mode'), 'progress should display discuss mode');
  });

  test('plan init still exposes text_mode', () => {
    const initSrc = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'bin', 'lib', 'init.cjs'),
      'utf8'
    );
    const planInitBlock = initSrc.slice(initSrc.indexOf('function cmdInitPlan'));
    assert.ok(planInitBlock.includes('text_mode: config.text_mode'), 'plan init must expose text_mode');
  });
});
