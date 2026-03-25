/**
 * Pack command tests
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { createTempProject, cleanup, runThruntTools } = require('./helpers.cjs');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('pack command surface', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('thrunt-pack-cmd-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('pack list includes built-in packs and local override metadata', () => {
    writeJson(path.join(tmpDir, '.planning', 'packs', 'local-session.json'), {
      version: '1.0',
      id: 'starter.identity-session-anomaly',
      kind: 'example',
      title: 'Local Override',
      description: 'Project-local override for the built-in starter pack.',
      stability: 'stable',
      metadata: {},
      hypothesis_ids: ['HYP-02'],
      required_connectors: ['okta'],
      supported_datasets: ['identity'],
      parameters: [
        {
          name: 'tenant',
          type: 'string',
          required: true,
          description: 'Tenant selector.',
        },
      ],
      scope_defaults: {},
      execution_defaults: {},
      publish: {
        finding_type: 'hunt_case',
        expected_outcomes: ['local_override'],
        receipt_tags: ['pack:starter.identity-session-anomaly'],
      },
    });

    const result = runThruntTools(['pack', 'list'], tmpDir);
    assert.ok(result.success, result.error);

    const output = JSON.parse(result.output);
    const pack = output.packs.find(item => item.id === 'starter.identity-session-anomaly');

    assert.ok(pack, 'expected starter pack in list output');
    assert.strictEqual(pack.source, 'local');
    assert.strictEqual(pack.title, 'Local Override');
    assert.strictEqual(output.overrides.length, 1);
    assert.match(output.paths.local, /\.planning\/packs$/);
  });

  test('pack show resolves built-in and composed packs and returns found false for unknown ids', () => {
    const found = runThruntTools(['pack', 'show', 'starter.identity-session-anomaly'], tmpDir);
    assert.ok(found.success, found.error);
    const packOutput = JSON.parse(found.output);

    assert.strictEqual(packOutput.found, true);
    assert.strictEqual(packOutput.pack.id, 'starter.identity-session-anomaly');
    assert.match(packOutput.pack.path, /thrunt-god\/packs\/examples\/identity-session-anomaly\.json$/);

    const composed = runThruntTools(['pack', 'show', 'domain.identity-abuse'], tmpDir);
    assert.ok(composed.success, composed.error);
    const composedOutput = JSON.parse(composed.output);
    assert.strictEqual(composedOutput.found, true);
    assert.strictEqual(composedOutput.pack.id, 'domain.identity-abuse');
    assert.ok(composedOutput.pack.composed_from.includes('technique.t1078-valid-accounts'));
    assert.ok(composedOutput.pack.execution_targets.length > 0);

    const missing = runThruntTools(['pack', 'show', 'missing.pack'], tmpDir);
    assert.ok(missing.success, missing.error);
    const missingOutput = JSON.parse(missing.output);
    assert.strictEqual(missingOutput.found, false);
    assert.strictEqual(missingOutput.pack_id, 'missing.pack');
  });

  test('pack validate supports --params JSON plus --param overrides', () => {
    const valid = runThruntTools([
      'pack',
      'validate',
      'starter.identity-session-anomaly',
      '--params',
      '{"tenant":"acme","lookback_hours":24}',
      '--param',
      'focus_user=alice@example.com',
      '--param',
      'lookback_hours=12',
    ], tmpDir);
    assert.ok(valid.success, valid.error);

    const output = JSON.parse(valid.output);
    assert.strictEqual(output.valid, true);
    assert.deepStrictEqual(output.parameters, {
      tenant: 'acme',
      lookback_hours: 12,
      focus_user: 'alice@example.com',
    });
  });

  test('pack validate fails closed on missing, unknown, and unsafe parameters', () => {
    const result = runThruntTools([
      'pack',
      'validate',
      'starter.identity-session-anomaly',
      '--param',
      'lookback_hours=0',
      '--param',
      'unknown=value',
    ], tmpDir);
    assert.ok(result.success, result.error);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false);
    assert.match(output.errors.join('\n'), /Missing required parameter: tenant/);
    assert.match(output.errors.join('\n'), /Unknown parameter: unknown/);
    assert.match(output.errors.join('\n'), /Invalid parameter lookback_hours: must be >= 1/);
  });

  test('pack bootstrap materializes hunt bootstrap content from a pack', () => {
    const result = runThruntTools([
      'pack',
      'bootstrap',
      'domain.identity-abuse',
      '--param',
      'tenant=acme',
      '--param',
      'focus_user=alice@example.com',
    ], tmpDir);
    assert.ok(result.success, result.error);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true);
    assert.strictEqual(output.pack_id, 'domain.identity-abuse');
    assert.strictEqual(output.bootstrap.mission.title, 'Identity Abuse Hunt');
    assert.ok(output.bootstrap.hypotheses.length > 0);
    assert.strictEqual(output.bootstrap.phase_seed.length, 3);
  });

  test('pack render-targets renders concrete QuerySpecs and reports missing template parameters', () => {
    const valid = runThruntTools([
      'pack',
      'render-targets',
      'technique.t1078-valid-accounts',
      '--param',
      'tenant=acme',
      '--param',
      'focus_user=alice@example.com',
    ], tmpDir);
    assert.ok(valid.success, valid.error);

    const validOutput = JSON.parse(valid.output);
    assert.strictEqual(validOutput.valid, true);
    assert.ok(validOutput.query_specs.length >= 1);
    assert.ok(!validOutput.query_specs[0].query_spec.query.statement.includes('{{'));

    const invalid = runThruntTools([
      'pack',
      'render-targets',
      'technique.t1078-valid-accounts',
      '--param',
      'tenant=acme',
    ], tmpDir);
    assert.ok(invalid.success, invalid.error);

    const invalidOutput = JSON.parse(invalid.output);
    assert.strictEqual(invalidOutput.valid, false);
    assert.ok(invalidOutput.missing_template_parameters.includes('focus_user'));
  });

  test('pack lint and pack test validate the shipped registry against authoring policy', () => {
    const lint = runThruntTools(['pack', 'lint'], tmpDir);
    assert.ok(lint.success, lint.error);
    const lintOutput = JSON.parse(lint.output);
    assert.strictEqual(lintOutput.valid, true);
    assert.ok(lintOutput.packs.length > 0);

    const packTest = runThruntTools(['pack', 'test', 'domain.identity-abuse'], tmpDir);
    assert.ok(packTest.success, packTest.error);
    const testOutput = JSON.parse(packTest.output);
    assert.strictEqual(testOutput.valid, true);
    assert.strictEqual(testOutput.packs.length, 1);
    assert.strictEqual(testOutput.packs[0].bootstrap_ok, true);
    assert.strictEqual(testOutput.packs[0].render_ok, true);
  });

  test('pack init scaffolds a local pack under .planning/packs', () => {
    const result = runThruntTools([
      'pack',
      'init',
      'custom.okta-session-abuse',
      '--kind', 'custom',
      '--title', 'Okta Session Abuse',
    ], tmpDir);
    assert.ok(result.success, result.error);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.match(output.path, /\.planning\/packs\/custom\/okta-session-abuse\.json$/);
    assert.strictEqual(output.pack.id, 'custom.okta-session-abuse');
    assert.strictEqual(output.pack.examples.parameters.tenant, 'example-tenant');
    assert.ok(fs.existsSync(path.join(tmpDir, output.path)));
  });
});
