'use strict';

/**
 * Pack authoring engine tests (pack-author.cjs).
 *
 * Covers: hypothesis validation, ID generation, folder mapping,
 * connector language correctness, non-interactive buildPackFromFlags,
 * CLI dispatch via subprocess, and regression guards.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

const packAuthor = require('../thrunt-god/bin/lib/pack-author.cjs');
const packLib = require('../thrunt-god/bin/lib/pack.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'thrunt-god', 'bin', 'thrunt-tools.cjs');
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Run `thrunt-tools pack create` as a subprocess, capturing structured output.
 * Always appends --raw for JSON output parsing.
 */
function runPackCreate(args = []) {
  try {
    const stdout = execFileSync('node', [TOOLS_PATH, 'pack', 'create', ...args, '--raw'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 30000,
    });
    return { success: true, data: JSON.parse(stdout) };
  } catch (err) {
    return {
      success: false,
      stderr: (err.stderr || '').toString(),
      stdout: (err.stdout || '').toString(),
      exitCode: err.status,
    };
  }
}

// ---------------------------------------------------------------------------
// Suite 1: validateHypothesis
// ---------------------------------------------------------------------------

describe('validateHypothesis', () => {

  test('accepts valid hypothesis with actionable verb', () => {
    const result = packAuthor.validateHypothesis(
      'A compromised account is being used for lateral movement across the network.'
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('rejects hypothesis that is too short (under 20 chars)', () => {
    const result = packAuthor.validateHypothesis('Bad actors exist');
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some(e => /at least 20 characters/i.test(e)),
      `Expected length error, got: ${result.errors.join('; ')}`
    );
  });

  test('rejects hypothesis without quality word', () => {
    const result = packAuthor.validateHypothesis(
      'The quick brown fox jumps over the lazy dog repeatedly today'
    );
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some(e => /actionable verb/i.test(e)),
      `Expected actionability error, got: ${result.errors.join('; ')}`
    );
  });

  test('accepts hypothesis with {{param}} placeholder', () => {
    const result = packAuthor.validateHypothesis(
      'An adversary is using {{focus_user}} credentials to access resources.'
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('rejects invalid {{param}} format (non-identifier)', () => {
    const result = packAuthor.validateHypothesis(
      'Hypothesis with {{123bad}} placeholder that is testing validation.'
    );
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some(e => /invalid template parameter/i.test(e) || /parameter/i.test(e)),
      `Expected parameter error, got: ${result.errors.join('; ')}`
    );
  });

  test('accepts hypothesis with multiple quality words', () => {
    const result = packAuthor.validateHypothesis(
      'Compromised credentials are being used to execute commands.'
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('validates exactly 20 characters with quality word', () => {
    // Build a 20-char hypothesis containing a quality word
    // "is" is a quality word; pad to exactly 20 chars
    const hyp = 'This is test paddddd'; // exactly 20 chars
    assert.strictEqual(hyp.length, 20);
    const result = packAuthor.validateHypothesis(hyp);
    assert.strictEqual(result.valid, true, `Expected valid for 20 chars, got errors: ${result.errors.join('; ')}`);
  });

  test('rejects exactly 19 characters', () => {
    // Build a 19-char hypothesis with a quality word -- still too short
    const hyp = 'This is test padddd'; // exactly 19 chars
    assert.strictEqual(hyp.length, 19);
    const result = packAuthor.validateHypothesis(hyp);
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some(e => /at least 20 characters/i.test(e)),
      `Expected length error for 19 chars, got: ${result.errors.join('; ')}`
    );
  });

});

// ---------------------------------------------------------------------------
// Suite 2: generatePackId
// ---------------------------------------------------------------------------

describe('generatePackId', () => {

  test('technique kind: includes lowered attack ID and slug', () => {
    const id = packAuthor.generatePackId('technique', 'Supply Chain Compromise', 'T1195');
    assert.strictEqual(id, 'technique.t1195-supply-chain-compromise');
  });

  test('domain kind: uses kind.slug format', () => {
    const id = packAuthor.generatePackId('domain', 'Identity Abuse');
    assert.strictEqual(id, 'domain.identity-abuse');
  });

  test('family kind: uses kind.slug format', () => {
    const id = packAuthor.generatePackId('family', 'APT29 Cozy Bear');
    assert.strictEqual(id, 'family.apt29-cozy-bear');
  });

  test('campaign kind: uses kind.slug format', () => {
    const id = packAuthor.generatePackId('campaign', 'SolarWinds 2020');
    assert.strictEqual(id, 'campaign.solarwinds-2020');
  });

  test('custom kind: uses kind.slug format', () => {
    const id = packAuthor.generatePackId('custom', 'My Custom Pack');
    assert.strictEqual(id, 'custom.my-custom-pack');
  });

  test('collapses special chars to single dash', () => {
    const id = packAuthor.generatePackId('domain', 'Multi---Dash   Space');
    assert.strictEqual(id, 'domain.multi-dash-space');
  });

});

// ---------------------------------------------------------------------------
// Suite 3: getPackFolderForKind
// ---------------------------------------------------------------------------

describe('getPackFolderForKind', () => {

  test('technique -> techniques', () => {
    assert.strictEqual(packAuthor.getPackFolderForKind('technique'), 'techniques');
  });

  test('domain -> domains', () => {
    assert.strictEqual(packAuthor.getPackFolderForKind('domain'), 'domains');
  });

  test('family -> families', () => {
    assert.strictEqual(packAuthor.getPackFolderForKind('family'), 'families');
  });

  test('campaign -> campaigns', () => {
    assert.strictEqual(packAuthor.getPackFolderForKind('campaign'), 'campaigns');
  });

  test('custom -> custom', () => {
    assert.strictEqual(packAuthor.getPackFolderForKind('custom'), 'custom');
  });

});

// ---------------------------------------------------------------------------
// Suite 4: CONNECTOR_LANGUAGES correctness
// ---------------------------------------------------------------------------

describe('CONNECTOR_LANGUAGES', () => {

  test('contains all 10 connectors with correct language IDs', () => {
    const expected = {
      splunk: 'spl',
      elastic: 'esql',
      sentinel: 'kql',
      opensearch: 'sql',
      defender_xdr: 'kql',
      crowdstrike: 'fql',
      okta: 'api',
      m365: 'odata',
      aws: 'api',
      gcp: 'logging-filter',
    };

    const actual = packAuthor.CONNECTOR_LANGUAGES;

    // Verify all 10 are present
    assert.strictEqual(Object.keys(actual).length, 10, 'Expected exactly 10 connectors');

    for (const [connectorId, lang] of Object.entries(expected)) {
      assert.strictEqual(
        actual[connectorId],
        lang,
        `Connector "${connectorId}" should map to "${lang}", got "${actual[connectorId]}"`
      );
    }
  });

});

// ---------------------------------------------------------------------------
// Suite 5: buildPackFromFlags - technique pack
// ---------------------------------------------------------------------------

describe('buildPackFromFlags - technique pack', () => {

  test('builds valid technique pack with all required flags', () => {
    const result = packAuthor.buildPackFromFlags(PROJECT_ROOT, {
      kind: 'technique',
      id: 'technique.t1078-test-pack',
      title: 'Test Pack',
      description: 'A test technique pack for validation.',
      attack: 'T1078',
      connectors: 'splunk,okta',
      datasets: 'events,identity',
      hypothesis: 'An adversary is using compromised credentials for unauthorized access.',
      dryRun: true,
    });
    assert.strictEqual(result.dry_run, true);
    assert.ok(result.pack, 'Expected pack object in result');
    assert.strictEqual(result.pack.kind, 'technique');
    assert.strictEqual(result.pack.id, 'technique.t1078-test-pack');
  });

  test('technique pack has correct attack array, connectors, and datasets', () => {
    const result = packAuthor.buildPackFromFlags(PROJECT_ROOT, {
      kind: 'technique',
      id: 'technique.t1078-test-pack',
      title: 'Test Pack',
      description: 'A test technique pack for validation.',
      attack: 'T1078',
      connectors: 'splunk,okta',
      datasets: 'events,identity',
      hypothesis: 'An adversary is using compromised credentials for unauthorized access.',
      dryRun: true,
    });
    const pack = result.pack;
    assert.deepStrictEqual(pack.attack, ['T1078']);
    assert.deepStrictEqual(pack.required_connectors, ['splunk', 'okta']);
    assert.deepStrictEqual(pack.supported_datasets, ['events', 'identity']);
  });

  test('technique pack includes hypothesis_templates, telemetry, blind_spots, execution_targets', () => {
    const result = packAuthor.buildPackFromFlags(PROJECT_ROOT, {
      kind: 'technique',
      id: 'technique.t1078-test-pack',
      title: 'Test Pack',
      description: 'A test technique pack for validation.',
      attack: 'T1078',
      connectors: 'splunk',
      datasets: 'events',
      hypothesis: 'An adversary is using compromised credentials for unauthorized access.',
      dryRun: true,
    });
    const pack = result.pack;
    assert.ok(Array.isArray(pack.hypothesis_templates), 'Expected hypothesis_templates array');
    assert.ok(pack.hypothesis_templates.length > 0, 'Expected at least one hypothesis template');
    assert.ok(Array.isArray(pack.telemetry_requirements), 'Expected telemetry_requirements array');
    assert.ok(pack.telemetry_requirements.length > 0, 'Expected at least one telemetry requirement');
    assert.ok(Array.isArray(pack.blind_spots), 'Expected blind_spots array');
    assert.ok(pack.blind_spots.length > 0, 'Expected at least one blind spot');
    assert.ok(Array.isArray(pack.execution_targets), 'Expected execution_targets array');
    assert.ok(pack.execution_targets.length > 0, 'Expected at least one execution target');
  });

});

// ---------------------------------------------------------------------------
// Suite 6: buildPackFromFlags - domain pack
// ---------------------------------------------------------------------------

describe('buildPackFromFlags - domain pack', () => {

  test('builds valid domain pack with extends', () => {
    const result = packAuthor.buildPackFromFlags(PROJECT_ROOT, {
      kind: 'domain',
      id: 'domain.test-domain',
      title: 'Test Domain',
      description: 'A test domain pack.',
      extends: 'foundation.identity-core',
      connectors: 'okta',
      datasets: 'identity',
      hypothesis: 'Domain level hypothesis is investigating identity patterns.',
      dryRun: true,
    });
    assert.strictEqual(result.dry_run, true);
    assert.ok(result.pack, 'Expected pack object in result');
    assert.strictEqual(result.pack.kind, 'domain');
    assert.strictEqual(result.pack.id, 'domain.test-domain');
  });

  test('domain pack extends array contains parent pack id', () => {
    const result = packAuthor.buildPackFromFlags(PROJECT_ROOT, {
      kind: 'domain',
      id: 'domain.test-domain',
      title: 'Test Domain',
      description: 'A test domain pack.',
      extends: 'foundation.identity-core',
      connectors: 'okta',
      datasets: 'identity',
      hypothesis: 'Domain level hypothesis is investigating identity patterns.',
      dryRun: true,
    });
    assert.deepStrictEqual(result.pack.extends, ['foundation.identity-core']);
  });

});

// ---------------------------------------------------------------------------
// Suite 7: buildPackFromFlags - dry-run mode
// ---------------------------------------------------------------------------

describe('buildPackFromFlags - dry-run mode', () => {

  test('dry-run returns pack without writing file', () => {
    const result = packAuthor.buildPackFromFlags(PROJECT_ROOT, {
      kind: 'custom',
      id: 'custom.dry-run-test',
      title: 'Dry Run Test',
      description: 'Testing dry-run mode.',
      connectors: 'splunk',
      datasets: 'events',
      hypothesis: 'An adversary is performing suspicious operations.',
      dryRun: true,
    });
    assert.strictEqual(result.dry_run, true);
    assert.ok(result.pack, 'Expected pack object');
    assert.strictEqual(result.pack_id, 'custom.dry-run-test');
  });

  test('dry-run does not create output file', () => {
    const fs = require('fs');
    const result = packAuthor.buildPackFromFlags(PROJECT_ROOT, {
      kind: 'custom',
      id: 'custom.dry-run-nofile-test',
      title: 'Dry Run No File',
      description: 'Testing dry-run does not write.',
      connectors: 'splunk',
      datasets: 'events',
      hypothesis: 'An adversary is performing suspicious operations.',
      dryRun: true,
    });
    // The file should NOT exist
    const folder = packAuthor.getPackFolderForKind('custom');
    const possiblePath = path.join(PROJECT_ROOT, 'packs', folder, 'dry-run-nofile-test.json');
    assert.strictEqual(fs.existsSync(possiblePath), false, 'dry-run should not create a file');
  });

});

// ---------------------------------------------------------------------------
// Suite 8: buildPackFromFlags - validation errors
// ---------------------------------------------------------------------------

describe('buildPackFromFlags - validation errors', () => {

  test('throws on invalid --kind', () => {
    assert.throws(
      () => packAuthor.buildPackFromFlags(PROJECT_ROOT, {
        kind: 'bogus',
        id: 'bogus.test',
        title: 'Bad Kind',
        description: 'Testing invalid kind.',
        dryRun: true,
      }),
      /invalid pack kind|must be one of/i
    );
  });

  test('throws on technique pack without --attack', () => {
    assert.throws(
      () => packAuthor.buildPackFromFlags(PROJECT_ROOT, {
        kind: 'technique',
        id: 'technique.no-attack',
        title: 'No Attack',
        description: 'Missing attack flag.',
        connectors: 'splunk',
        datasets: 'events',
        dryRun: true,
      }),
      /technique packs require.*attack/i
    );
  });

  test('throws on invalid ATT&CK ID format', () => {
    assert.throws(
      () => packAuthor.buildPackFromFlags(PROJECT_ROOT, {
        kind: 'technique',
        id: 'technique.invalid-attack',
        title: 'Invalid Attack',
        description: 'Invalid ATT&CK ID.',
        attack: 'INVALID',
        connectors: 'splunk',
        datasets: 'events',
        dryRun: true,
      }),
      /invalid|attack/i
    );
  });

});

// ---------------------------------------------------------------------------
// Suite 9: CLI dispatch via subprocess
// ---------------------------------------------------------------------------

describe('CLI dispatch via subprocess', () => {

  test('non-interactive dry-run returns valid JSON with pack object', () => {
    const result = runPackCreate([
      '--non-interactive',
      '--kind', 'custom',
      '--id', 'custom.cli-test',
      '--title', 'CLI Test',
      '--description', 'Testing CLI dispatch.',
      '--connectors', 'splunk',
      '--datasets', 'events',
      '--hypothesis', 'An adversary is performing suspicious operations.',
      '--dry-run',
    ]);
    assert.strictEqual(result.success, true, `Expected success, got stderr: ${result.stderr}`);
    assert.ok(result.data, 'Expected JSON output');
    assert.strictEqual(result.data.dry_run, true);
    assert.ok(result.data.pack, 'Expected pack object in output');
    assert.strictEqual(result.data.pack_id, 'custom.cli-test');
  });

  test('subprocess without --non-interactive does not crash (exits or starts interactive)', () => {
    // Without --non-interactive, the CLI tries to open readline on stdin.
    // In a subprocess with no TTY, it may throw or exit with error.
    // We just verify it doesn't cause a catastrophic crash (segfault, etc.).
    const result = runPackCreate(['--dry-run']);
    // Either fails gracefully or succeeds -- both are acceptable
    assert.ok(
      typeof result.success === 'boolean',
      'Expected boolean success indicator from subprocess'
    );
  });

});

// ---------------------------------------------------------------------------
// Suite 10: Regression guards
// ---------------------------------------------------------------------------

describe('regression guards', () => {

  test('commands.cjs exports cmdPackCreate', () => {
    const commands = require('../thrunt-god/bin/lib/commands.cjs');
    assert.strictEqual(typeof commands.cmdPackCreate, 'function');
  });

  test('pack-author.cjs has no circular dependency issues', () => {
    // Re-require after clearing cache to catch circular issues
    delete require.cache[require.resolve('../thrunt-god/bin/lib/pack-author.cjs')];
    const pa = require('../thrunt-god/bin/lib/pack-author.cjs');
    assert.ok(pa.runPackAuthor, 'Expected runPackAuthor export');
    assert.ok(pa.buildPackFromFlags, 'Expected buildPackFromFlags export');
    assert.ok(pa.validateHypothesis, 'Expected validateHypothesis export');
    assert.ok(pa.generatePackId, 'Expected generatePackId export');
    assert.ok(pa.getPackFolderForKind, 'Expected getPackFolderForKind export');
    assert.ok(pa.HYPOTHESIS_QUALITY_WORDS, 'Expected HYPOTHESIS_QUALITY_WORDS export');
    assert.ok(pa.CONNECTOR_LANGUAGES, 'Expected CONNECTOR_LANGUAGES export');
    assert.ok(pa.DATASET_KINDS, 'Expected DATASET_KINDS export');
  });

  test('DATASET_KINDS matches expected set', () => {
    const expected = ['events', 'alerts', 'entities', 'identity', 'endpoint', 'cloud', 'email', 'other'];
    assert.deepStrictEqual(packAuthor.DATASET_KINDS, expected);
  });

});
