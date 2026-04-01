/**
 * Technique pack library tests
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const packLib = require('../thrunt-god/bin/lib/pack.cjs');
const { createTempProject, cleanup } = require('./helpers.cjs');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe('built-in technique pack library', () => {
  test('registry ships the starter ATT&CK technique pack set', () => {
    const repoRoot = path.join(__dirname, '..');
    const registry = packLib.loadPackRegistry(repoRoot);

    const expectedIds = [
      'technique.t1059-command-and-scripting-interpreter',
      'technique.t1078-valid-accounts',
      'technique.t1098-account-manipulation',
      'technique.t1110-brute-force',
      'technique.t1566-phishing',
    ];

    const actualIds = registry.packs.filter(pack => pack.kind === 'technique').map(pack => pack.id);
    for (const id of expectedIds) {
      assert.ok(actualIds.includes(id), `expected built-in technique pack ${id}`);
    }
  });

  test('every shipped technique pack includes ATT&CK, hypotheses, telemetry, blind spots, and execution targets', () => {
    const repoRoot = path.join(__dirname, '..');
    const registry = packLib.loadPackRegistry(repoRoot);
    const techniquePacks = registry.packs.filter(pack => pack.kind === 'technique');

    assert.ok(techniquePacks.length >= 5, 'expected at least five technique packs');

    for (const pack of techniquePacks) {
      assert.ok(pack.attack.length > 0, `${pack.id} should declare ATT&CK ids`);
      assert.ok(pack.hypothesis_templates.length > 0, `${pack.id} should declare hypothesis templates`);
      assert.ok(pack.telemetry_requirements.length > 0, `${pack.id} should declare telemetry requirements`);
      assert.ok(pack.blind_spots.length > 0, `${pack.id} should declare blind spots`);
      assert.ok(pack.execution_targets.length > 0, `${pack.id} should declare execution targets`);

      for (const target of pack.execution_targets) {
        assert.ok(pack.required_connectors.includes(target.connector), `${pack.id} target connector should be required`);
        assert.ok(pack.supported_datasets.includes(target.dataset), `${pack.id} target dataset should be supported`);
        assert.ok(target.query_template.includes('{{'), `${pack.id} target should expose parameterizable query templates`);
      }
    }
  });
});

describe('built-in domain and family pack library', () => {
  test('registry ships the initial domain pack set plus a family pack', () => {
    const repoRoot = path.join(__dirname, '..');
    const registry = packLib.loadPackRegistry(repoRoot);

    const expectedDomainIds = [
      'domain.identity-abuse',
      'domain.email-intrusion',
      'domain.insider-risk',
      'domain.cloud-abuse',
      'domain.ransomware-precursors',
    ];

    const actualIds = registry.packs.map(pack => pack.id);
    for (const id of expectedDomainIds) {
      assert.ok(actualIds.includes(id), `expected built-in domain pack ${id}`);
    }
    assert.ok(actualIds.includes('family.oauth-phishing-session-hijack'));
  });

  test('domain and family packs resolve with composed content and executable targets', () => {
    const repoRoot = path.join(__dirname, '..');
    const registry = packLib.loadPackRegistry(repoRoot);
    const ids = [
      'domain.identity-abuse',
      'domain.email-intrusion',
      'domain.insider-risk',
      'domain.cloud-abuse',
      'domain.ransomware-precursors',
      'family.oauth-phishing-session-hijack',
    ];

    for (const id of ids) {
      const pack = registry.packs.find(item => item.id === id);
      assert.ok(pack, `expected ${id} to resolve`);
      assert.ok(pack.required_connectors.length > 0, `${id} should declare connectors`);
      assert.ok(pack.supported_datasets.length > 0, `${id} should declare datasets`);
      assert.ok(pack.execution_targets.length > 0, `${id} should declare execution targets`);
      assert.ok(pack.publish.expected_outcomes.length > 0, `${id} should declare expected outcomes`);
    }

    const familyPack = registry.packs.find(item => item.id === 'family.oauth-phishing-session-hijack');
    assert.ok(familyPack.composed_from.includes('domain.email-intrusion'));
    assert.ok(familyPack.composed_from.includes('domain.identity-abuse'));
    assert.ok(familyPack.attack.includes('T1566'));
    assert.ok(familyPack.attack.includes('T1078'));
  });

  test('shipped packs include example parameters for smoke testing', () => {
    const repoRoot = path.join(__dirname, '..');
    const registry = packLib.loadPackRegistry(repoRoot);

    for (const pack of registry.packs) {
      assert.ok(pack.examples, `${pack.id} should expose examples`);
      assert.ok(pack.examples.parameters, `${pack.id} should expose example parameters`);
      assert.ok(Object.keys(pack.examples.parameters).length > 0, `${pack.id} should have non-empty example parameters`);
    }
  });
});

describe('technique pack docs', () => {
  test('pack registry readme and features docs describe the ATT&CK and composed pack libraries', () => {
    const registryReadme = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'packs', 'README.md'),
      'utf-8'
    );
    const featuresDoc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'FEATURES.md'),
      'utf-8'
    );

    assert.match(registryReadme, /ATT&CK/i);
    assert.match(registryReadme, /technique packs/i);
    assert.match(registryReadme, /domain packs/i);
    assert.match(registryReadme, /family/i);
    assert.match(featuresDoc, /ATT&CK-oriented hunt packs/i);
    assert.match(featuresDoc, /domain packs/i);
    assert.match(featuresDoc, /pack composition/i);
    assert.match(featuresDoc, /pack list/i);
  });
});

describe('getPackFolderForKind', () => {
  test('maps technique to techniques', () => {
    assert.strictEqual(packLib.getPackFolderForKind('technique'), 'techniques');
  });

  test('maps domain to domains', () => {
    assert.strictEqual(packLib.getPackFolderForKind('domain'), 'domains');
  });

  test('maps family to families', () => {
    assert.strictEqual(packLib.getPackFolderForKind('family'), 'families');
  });

  test('maps campaign to campaigns', () => {
    assert.strictEqual(packLib.getPackFolderForKind('campaign'), 'campaigns');
  });

  test('maps custom to custom and example to examples', () => {
    assert.strictEqual(packLib.getPackFolderForKind('custom'), 'custom');
    assert.strictEqual(packLib.getPackFolderForKind('example'), 'examples');
  });

  test('unknown kind falls back to custom', () => {
    assert.strictEqual(packLib.getPackFolderForKind('unknown'), 'custom');
  });
});

describe('generateTestFixture', () => {
  test('generates fixture with correct pack_id and target_count', () => {
    const pack = {
      id: 'technique.test-pack',
      execution_targets: [
        { name: 't1', connector: 'splunk', dataset: 'events', query_template: 'x={{tenant}}' },
        { name: 't2', connector: 'elastic', dataset: 'events', query_template: 'y={{tenant}}' },
      ],
      examples: { parameters: { tenant: 'test', lookback_hours: 24 } },
    };
    const fixture = packLib.generateTestFixture(pack);
    assert.strictEqual(fixture.pack_id, 'technique.test-pack');
    assert.strictEqual(fixture.expected.target_count, 2);
    assert.strictEqual(fixture.expected.bootstrap_ok, true);
    assert.strictEqual(fixture.expected.render_ok, true);
    assert.strictEqual(fixture.parameters.tenant, 'test');
  });

  test('handles pack with no examples.parameters', () => {
    const pack = { id: 'custom.empty', execution_targets: [], examples: {} };
    const fixture = packLib.generateTestFixture(pack);
    assert.deepStrictEqual(fixture.parameters, {});
    assert.strictEqual(fixture.expected.render_ok, false);
    assert.strictEqual(fixture.expected.target_count, 0);
  });
});

describe('generateTestFile', () => {
  test('returns valid JavaScript string with describe and 4 tests', () => {
    const pack = { id: 'domain.test-gen' };
    const content = packLib.generateTestFile(pack);
    assert.ok(content.includes("describe('domain.test-gen'"), 'should include describe with pack id');
    assert.ok(content.includes('pack loads from registry'), 'should have registry test');
    assert.ok(content.includes('bootstrap succeeds'), 'should have bootstrap test');
    assert.ok(content.includes('execution targets render'), 'should have render test');
    assert.ok(content.includes('no undeclared template parameters'), 'should have undeclared test');
    assert.ok(content.includes('test-gen.fixture.json'), 'should reference fixture file by slug');
  });
});

describe('loadMockResponse', () => {
  test('loads splunk mock response', () => {
    const mock = packLib.loadMockResponse('splunk');
    assert.ok(mock, 'splunk mock should exist');
    assert.strictEqual(mock.connector, 'splunk');
    assert.ok(Array.isArray(mock.mock_response.results), 'should have results array');
  });

  test('loads elastic mock response', () => {
    const mock = packLib.loadMockResponse('elastic');
    assert.ok(mock, 'elastic mock should exist');
    assert.strictEqual(mock.connector, 'elastic');
  });

  test('loads crowdstrike mock response', () => {
    const mock = packLib.loadMockResponse('crowdstrike');
    assert.ok(mock, 'crowdstrike mock should exist');
    assert.strictEqual(mock.connector, 'crowdstrike');
  });

  test('returns null for unknown connector', () => {
    const mock = packLib.loadMockResponse('nonexistent');
    assert.strictEqual(mock, null);
  });
});

describe('loadPackRegistry with additional directories', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('thrunt-pack-reg-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('discovers packs from local-type pack_registries config', () => {
    // Create an extra pack directory
    const extraDir = path.join(tmpDir, 'extra-packs', 'customs');
    fs.mkdirSync(extraDir, { recursive: true });
    writeJson(path.join(extraDir, 'extra-pack.json'), {
      version: '1.0', id: 'custom.extra-test', kind: 'custom',
      title: 'Extra', description: 'Extra pack from additional registry',
      stability: 'experimental', metadata: {},
      hypothesis_ids: ['HYP-01'],
      hypothesis_templates: ['An adversary is exploiting an extra pack.'],
      required_connectors: ['splunk'],
      supported_datasets: ['events'],
      parameters: [{ name: 'tenant', type: 'string', required: true, description: 'Tenant' }],
      telemetry_requirements: [{ surface: 'test', description: 'Test', connectors: ['splunk'], datasets: ['events'] }],
      blind_spots: ['None.'],
      execution_targets: [{ name: 'Test', description: 'Test', connector: 'splunk', dataset: 'events', language: 'spl', query_template: 'index=test {{tenant}}' }],
      scope_defaults: { entities: ['user'], time_window: { lookback_minutes: 60 } },
      execution_defaults: { consistency: 'best_effort', receipt_policy: 'material' },
      examples: { parameters: { tenant: 'test' } },
      publish: { finding_type: 'test', expected_outcomes: ['test'], receipt_tags: ['pack:custom.extra-test'] },
    });

    // Create config.json with pack_registries
    writeJson(path.join(tmpDir, '.planning', 'config.json'), {
      pack_registries: [
        { name: 'extra', type: 'local', path: 'extra-packs' },
      ],
    });

    const registry = packLib.loadPackRegistry(tmpDir);
    const extraPack = registry.packs.find(p => p.id === 'custom.extra-test');
    assert.ok(extraPack, 'Extra pack should be discovered from additional registry');
  });

  test('git-type registries emit warning', () => {
    writeJson(path.join(tmpDir, '.planning', 'config.json'), {
      pack_registries: [
        { name: 'org', type: 'git', url: 'git@github.com:org/packs.git', path: 'packs/' },
      ],
    });

    const registry = packLib.loadPackRegistry(tmpDir);
    assert.ok(registry.warnings.some(w => w.includes('git-based registries are not yet supported')));
  });
});

describe('loadPackRegistry deprecation warnings', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject('thrunt-pack-dep-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('emits warning for deprecated pack', () => {
    writeJson(path.join(tmpDir, '.planning', 'packs', 'deprecated-pack.json'), {
      version: '1.0', id: 'custom.old-pack', kind: 'custom',
      title: 'Old Pack', description: 'Deprecated pack',
      stability: 'deprecated', metadata: { replaced_by: 'custom.new-pack' },
      hypothesis_ids: ['HYP-01'],
      hypothesis_templates: ['An adversary is exploiting a deprecated pack.'],
      required_connectors: ['splunk'],
      supported_datasets: ['events'],
      parameters: [{ name: 'tenant', type: 'string', required: true, description: 'Tenant' }],
      telemetry_requirements: [{ surface: 'test', description: 'Test', connectors: ['splunk'], datasets: ['events'] }],
      blind_spots: ['None.'],
      execution_targets: [{ name: 'Test', description: 'Test', connector: 'splunk', dataset: 'events', language: 'spl', query_template: 'index=test {{tenant}}' }],
      scope_defaults: { entities: ['user'], time_window: { lookback_minutes: 60 } },
      execution_defaults: { consistency: 'best_effort', receipt_policy: 'material' },
      examples: { parameters: { tenant: 'test' } },
      publish: { finding_type: 'test', expected_outcomes: ['test'], receipt_tags: ['pack:custom.old-pack'] },
    });

    const registry = packLib.loadPackRegistry(tmpDir);
    assert.ok(registry.warnings.some(w => w.includes('custom.old-pack') && w.includes('deprecated') && w.includes('custom.new-pack')));
  });

  test('emits warning for deprecated pack without replaced_by', () => {
    writeJson(path.join(tmpDir, '.planning', 'packs', 'dep2.json'), {
      version: '1.0', id: 'custom.dep-no-replace', kind: 'custom',
      title: 'Dep', description: 'Deprecated without replacement',
      stability: 'deprecated', metadata: {},
      hypothesis_ids: ['HYP-01'],
      hypothesis_templates: ['An adversary is exploiting a deprecated pack.'],
      required_connectors: ['splunk'],
      supported_datasets: ['events'],
      parameters: [{ name: 'tenant', type: 'string', required: true, description: 'Tenant' }],
      telemetry_requirements: [{ surface: 'test', description: 'Test', connectors: ['splunk'], datasets: ['events'] }],
      blind_spots: ['None.'],
      execution_targets: [{ name: 'Test', description: 'Test', connector: 'splunk', dataset: 'events', language: 'spl', query_template: 'index=test {{tenant}}' }],
      scope_defaults: { entities: ['user'], time_window: { lookback_minutes: 60 } },
      execution_defaults: { consistency: 'best_effort', receipt_policy: 'material' },
      examples: { parameters: { tenant: 'test' } },
      publish: { finding_type: 'test', expected_outcomes: ['test'], receipt_tags: ['pack:custom.dep-no-replace'] },
    });

    const registry = packLib.loadPackRegistry(tmpDir);
    assert.ok(registry.warnings.some(w => w.includes('custom.dep-no-replace') && w.includes('deprecated')));
  });
});
