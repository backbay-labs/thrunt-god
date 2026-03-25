/**
 * Technique pack library tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const packLib = require('../thrunt-god/bin/lib/pack.cjs');

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
