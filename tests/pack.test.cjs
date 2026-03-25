/**
 * Pack schema and registry tests
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { createTempProject, cleanup } = require('./helpers.cjs');
const packLib = require('../thrunt-god/bin/lib/pack.cjs');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('pack schema and registry', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('thrunt-pack-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('createPackDefinition normalizes a canonical pack object', () => {
    const pack = packLib.createPackDefinition({
      id: 'technique.t1059-command-shell',
      kind: 'technique',
      title: 'Command Shell Execution',
      description: 'Investigate shell-based command execution activity.',
      stability: 'preview',
      attack: ['T1059'],
      metadata: {
        surfaces: ['endpoint', 'siem'],
      },
      hypothesis_ids: ['HYP-02'],
      hypothesis_templates: [
        'Suspicious command interpreter execution indicates hands-on-keyboard activity on a monitored endpoint.',
      ],
      required_connectors: ['crowdstrike', 'splunk'],
      supported_datasets: ['endpoint', 'events'],
      parameters: [
        {
          name: 'tenant',
          type: 'string',
          required: true,
          description: 'Tenant selector.',
          pattern: '^[A-Za-z0-9._-]+$',
        },
        {
          name: 'lookback_hours',
          type: 'integer',
          description: 'How far back to search.',
          default: 4,
          minimum: 1,
          maximum: 48,
        },
      ],
      telemetry_requirements: [
        {
          surface: 'endpoint_process_telemetry',
          description: 'Process start, parent-child lineage, and command-line visibility.',
          connectors: ['crowdstrike', 'splunk'],
          datasets: ['endpoint', 'events'],
        },
      ],
      blind_spots: [
        'Hosts without endpoint telemetry or with aggressive command-line truncation may hide malicious execution.',
      ],
      execution_targets: [
        {
          name: 'CrowdStrike Process Hunt',
          description: 'Look for suspicious shell ancestry and encoded command patterns.',
          connector: 'crowdstrike',
          dataset: 'endpoint',
          language: 'falcon',
          query_template: 'event_simpleName=ProcessRollup2 CommandLine=*{{focus_term}}*',
        },
      ],
      scope_defaults: {
        entities: ['host', 'user'],
      },
      execution_defaults: {
        consistency: 'best_effort',
      },
      publish: {
        finding_type: 'hunt_case',
        expected_outcomes: ['triage_story'],
        receipt_tags: ['pack:technique.t1059-command-shell'],
      },
    });

    assert.strictEqual(pack.version, packLib.PACK_SCHEMA_VERSION);
    assert.strictEqual(pack.id, 'technique.t1059-command-shell');
    assert.strictEqual(pack.kind, 'technique');
    assert.deepStrictEqual(pack.required_connectors, ['crowdstrike', 'splunk']);
    assert.deepStrictEqual(pack.supported_datasets, ['endpoint', 'events']);
    assert.deepStrictEqual(pack.attack, ['T1059']);
    assert.strictEqual(pack.hypothesis_templates.length, 1);
    assert.strictEqual(pack.telemetry_requirements.length, 1);
    assert.strictEqual(pack.execution_targets.length, 1);
    assert.strictEqual(pack.parameters[0].name, 'tenant');
    assert.strictEqual(pack.parameters[1].default, 4);
    assert.deepStrictEqual(pack.publish.expected_outcomes, ['triage_story']);
  });

  test('validatePackDefinition reports malformed datasets and parameters', () => {
    const validation = packLib.validatePackDefinition({
      version: packLib.PACK_SCHEMA_VERSION,
      id: 'invalid.pack',
      kind: 'technique',
      title: 'Broken Pack',
      description: 'Broken pack for validation testing.',
      stability: 'stable',
      attack: ['BAD-TECHNIQUE'],
      hypothesis_ids: ['HYP-02'],
      hypothesis_templates: [],
      required_connectors: ['splunk'],
      supported_datasets: ['events', 'made_up'],
      parameters: [
        {
          name: 'bad-name',
          type: 'string',
          description: 'Invalid parameter name.',
          required: true,
          enum: [],
          pattern: null,
          minimum: null,
          maximum: null,
          min_items: null,
          max_items: null,
        },
        {
          name: 'limit',
          type: 'integer',
          description: 'Broken bounds.',
          required: false,
          enum: [],
          pattern: null,
          minimum: 10,
          maximum: 1,
          min_items: null,
          max_items: null,
        },
      ],
      telemetry_requirements: [],
      blind_spots: [],
      execution_targets: [],
      scope_defaults: {},
      execution_defaults: {},
      publish: {
        finding_type: 'hunt_case',
        expected_outcomes: ['triage_story'],
        receipt_tags: [],
      },
      notes: [],
    });

    assert.strictEqual(validation.valid, false);
    assert.match(validation.errors.join('\n'), /attack contains invalid ATT&CK id: BAD-TECHNIQUE/);
    assert.match(validation.errors.join('\n'), /technique packs must include at least one hypothesis template/);
    assert.match(validation.errors.join('\n'), /supported_datasets contains unsupported kind: made_up/);
    assert.match(validation.errors.join('\n'), /parameter names must start with a letter/);
    assert.match(validation.errors.join('\n'), /parameter limit has minimum greater than maximum/);
  });

  test('validatePackParameters coerces supported values and rejects unsafe input', () => {
    const pack = packLib.createPackDefinition({
      id: 'domain.identity-anomaly',
      kind: 'domain',
      title: 'Identity Anomaly',
      description: 'Hunt suspicious identity anomalies.',
      stability: 'experimental',
      hypothesis_ids: ['HYP-02'],
      required_connectors: ['okta'],
      supported_datasets: ['identity'],
      parameters: [
        {
          name: 'tenant',
          type: 'string',
          required: true,
          description: 'Tenant selector.',
          pattern: '^[A-Za-z0-9._-]+$',
        },
        {
          name: 'lookback_hours',
          type: 'integer',
          required: false,
          description: 'Lookback in hours.',
          default: 24,
          minimum: 1,
          maximum: 720,
        },
        {
          name: 'include_disabled',
          type: 'boolean',
          required: false,
          description: 'Include disabled identities.',
          default: false,
        },
        {
          name: 'actors',
          type: 'string_array',
          required: false,
          description: 'Actor list.',
          min_items: 1,
          max_items: 3,
        },
      ],
      scope_defaults: {},
      execution_defaults: {},
      publish: {
        finding_type: 'hunt_case',
        expected_outcomes: ['identity_triage'],
        receipt_tags: ['pack:domain.identity-anomaly'],
      },
    });

    const good = packLib.validatePackParameters(pack, {
      tenant: 'acme-prod',
      lookback_hours: '12',
      include_disabled: 'true',
      actors: 'alice,bob',
    });
    assert.strictEqual(good.valid, true);
    assert.deepStrictEqual(good.parameters, {
      tenant: 'acme-prod',
      lookback_hours: 12,
      include_disabled: true,
      actors: ['alice', 'bob'],
    });

    const bad = packLib.validatePackParameters(pack, {
      tenant: 'bad tenant with spaces',
      lookback_hours: '0',
      extra: 'nope',
    });
    assert.strictEqual(bad.valid, false);
    assert.match(bad.errors.join('\n'), /Unknown parameter: extra/);
    assert.match(bad.errors.join('\n'), /Invalid parameter tenant: must match pattern/);
    assert.match(bad.errors.join('\n'), /Invalid parameter lookback_hours: must be >= 1/);
  });

  test('loadPackRegistry applies local overrides over built-in packs and records provenance', () => {
    const localPackPath = path.join(tmpDir, '.planning', 'packs', 'examples', 'identity-session-anomaly.json');
    writeJson(localPackPath, {
      version: '1.0',
      id: 'starter.identity-session-anomaly',
      kind: 'example',
      title: 'Local Session Anomaly Override',
      description: 'Project-local override for the starter identity pack.',
      stability: 'preview',
      metadata: {
        domains: ['identity'],
      },
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
        expected_outcomes: ['local_override_story'],
        receipt_tags: ['pack:starter.identity-session-anomaly'],
      },
    });

    const registry = packLib.loadPackRegistry(tmpDir);
    const pack = registry.packs.find(item => item.id === 'starter.identity-session-anomaly');

    assert.ok(pack, 'expected starter pack to resolve');
    assert.strictEqual(pack.source, 'local');
    assert.strictEqual(pack.title, 'Local Session Anomaly Override');
    assert.strictEqual(pack.path, '.planning/packs/examples/identity-session-anomaly.json');
    assert.strictEqual(registry.overrides.length, 1);
    assert.strictEqual(registry.overrides[0].id, 'starter.identity-session-anomaly');
    assert.match(registry.overrides[0].replaces, /thrunt-god\/packs\/examples\/identity-session-anomaly\.json$/);
  });

  test('loadPackRegistry rejects duplicate pack ids within the same source', () => {
    const builtInDir = path.join(tmpDir, 'fixtures', 'built-in');
    writeJson(path.join(builtInDir, 'one.json'), {
      version: '1.0',
      id: 'duplicate.pack',
      kind: 'custom',
      title: 'Duplicate One',
      description: 'First duplicate definition.',
      stability: 'experimental',
      hypothesis_ids: ['HYP-02'],
      required_connectors: ['splunk'],
      supported_datasets: ['events'],
      parameters: [],
      scope_defaults: {},
      execution_defaults: {},
      publish: {
        finding_type: 'hunt_case',
        expected_outcomes: ['first'],
        receipt_tags: ['pack:duplicate.pack'],
      },
    });
    writeJson(path.join(builtInDir, 'two.json'), {
      version: '1.0',
      id: 'duplicate.pack',
      kind: 'custom',
      title: 'Duplicate Two',
      description: 'Second duplicate definition.',
      stability: 'experimental',
      hypothesis_ids: ['HYP-02'],
      required_connectors: ['splunk'],
      supported_datasets: ['events'],
      parameters: [],
      scope_defaults: {},
      execution_defaults: {},
      publish: {
        finding_type: 'hunt_case',
        expected_outcomes: ['second'],
        receipt_tags: ['pack:duplicate.pack'],
      },
    });

    assert.throws(() => {
      packLib.loadPackRegistry(tmpDir, {
        builtInDir,
        localDir: path.join(tmpDir, 'fixtures', 'local-empty'),
      });
    }, /Duplicate pack id duplicate\.pack/);
  });

  test('loadPackRegistry resolves composed packs into one validated pack object', () => {
    const builtInDir = path.join(tmpDir, 'fixtures', 'built-in');

    writeJson(path.join(builtInDir, 'foundation.json'), {
      version: '1.0',
      id: 'foundation.identity-core',
      kind: 'custom',
      title: 'Identity Core',
      description: 'Identity foundation.',
      stability: 'stable',
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
      telemetry_requirements: [
        {
          surface: 'identity_sign_ins',
          description: 'Identity sign-in telemetry.',
          connectors: ['okta'],
          datasets: ['identity'],
        },
      ],
      blind_spots: ['Unmanaged identities remain outside coverage.'],
      scope_defaults: {
        entities: ['user'],
      },
      execution_defaults: {
        consistency: 'best_effort',
      },
      publish: {
        finding_type: 'identity_foundation',
        expected_outcomes: ['identity_triage'],
        receipt_tags: ['pack:foundation.identity-core'],
      },
    });

    writeJson(path.join(builtInDir, 'technique.json'), {
      version: '1.0',
      id: 'technique.t1078-valid-accounts',
      kind: 'technique',
      title: 'Valid Accounts',
      description: 'Technique pack.',
      stability: 'preview',
      attack: ['T1078'],
      hypothesis_ids: ['HYP-02'],
      hypothesis_templates: ['A valid account is being misused.'],
      required_connectors: ['okta'],
      supported_datasets: ['identity'],
      parameters: [
        {
          name: 'focus_user',
          type: 'string',
          required: false,
          description: 'User to focus on.',
        },
      ],
      telemetry_requirements: [
        {
          surface: 'session_anomalies',
          description: 'Session anomalies.',
          connectors: ['okta'],
          datasets: ['identity'],
        },
      ],
      blind_spots: ['Session token replay can miss fresh sign-in visibility.'],
      execution_targets: [
        {
          name: 'Okta session review',
          description: 'Review suspicious sessions.',
          connector: 'okta',
          dataset: 'identity',
          language: 'system_log',
          query_template: 'eventType eq \"user.session.start\"',
        },
      ],
      scope_defaults: {},
      execution_defaults: {
        consistency: 'best_effort',
      },
      publish: {
        finding_type: 'technique_hunt',
        expected_outcomes: ['session_story'],
        receipt_tags: ['pack:technique.t1078-valid-accounts'],
      },
    });

    writeJson(path.join(builtInDir, 'domain.json'), {
      version: '1.0',
      id: 'domain.identity-abuse',
      kind: 'domain',
      title: 'Identity Abuse',
      description: 'Composed domain pack.',
      stability: 'preview',
      extends: ['foundation.identity-core', 'technique.t1078-valid-accounts'],
      metadata: {
        coverage: ['identity abuse'],
      },
      hypothesis_templates: ['The account misuse is part of a larger abuse pattern.'],
      publish: {
        finding_type: 'identity_abuse_hunt',
        expected_outcomes: ['identity_abuse_story'],
        receipt_tags: ['pack:domain.identity-abuse'],
      },
    });

    const registry = packLib.loadPackRegistry(tmpDir, {
      builtInDir,
      localDir: path.join(tmpDir, 'fixtures', 'local-empty'),
    });
    const pack = registry.packs.find(item => item.id === 'domain.identity-abuse');

    assert.ok(pack, 'expected composed domain pack to resolve');
    assert.deepStrictEqual(pack.extends, ['foundation.identity-core', 'technique.t1078-valid-accounts']);
    assert.deepStrictEqual(pack.attack, ['T1078']);
    assert.ok(pack.required_connectors.includes('okta'));
    assert.ok(pack.parameters.some(item => item.name === 'tenant'));
    assert.ok(pack.parameters.some(item => item.name === 'focus_user'));
    assert.ok(pack.execution_targets.some(item => item.name === 'Okta session review'));
    assert.deepStrictEqual(pack.composed_from, [
      'domain.identity-abuse',
      'foundation.identity-core',
      'technique.t1078-valid-accounts',
    ]);
  });

  test('loadPackRegistry fails closed on composition cycles', () => {
    const builtInDir = path.join(tmpDir, 'fixtures', 'built-in');

    writeJson(path.join(builtInDir, 'one.json'), {
      version: '1.0',
      id: 'custom.one',
      kind: 'custom',
      title: 'One',
      description: 'Cycle one.',
      stability: 'experimental',
      extends: ['custom.two'],
      publish: {
        finding_type: 'cycle',
        expected_outcomes: ['none'],
        receipt_tags: ['pack:custom.one'],
      },
    });

    writeJson(path.join(builtInDir, 'two.json'), {
      version: '1.0',
      id: 'custom.two',
      kind: 'custom',
      title: 'Two',
      description: 'Cycle two.',
      stability: 'experimental',
      extends: ['custom.one'],
      publish: {
        finding_type: 'cycle',
        expected_outcomes: ['none'],
        receipt_tags: ['pack:custom.two'],
      },
    });

    assert.throws(() => {
      packLib.loadPackRegistry(tmpDir, {
        builtInDir,
        localDir: path.join(tmpDir, 'fixtures', 'local-empty'),
      });
    }, /composition cycle detected/i);
  });
});
