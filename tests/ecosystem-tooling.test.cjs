'use strict';

/**
 * Ecosystem tooling structure tests.
 *
 * Validates:
 * - Reusable connector CI workflow structure and content
 * - Connector plugin starter template files and content
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// REQUIRED_MANIFEST_FIELDS from plugin-registry.cjs (not exported, mirrored here)
const REQUIRED_MANIFEST_FIELDS = [
  'name',
  'version',
  'sdk_version',
  'connector_id',
  'display_name',
  'entry',
  'auth_types',
  'dataset_kinds',
  'languages',
  'pagination_modes',
  'permissions',
];

const WORKFLOW_PATH = path.join(PROJECT_ROOT, '.github', 'workflows', 'reusable-connector-test.yml');
const PACK_WORKFLOW_PATH = path.join(PROJECT_ROOT, '.github', 'workflows', 'reusable-pack-test.yml');
const TEMPLATE_DIR = path.join(PROJECT_ROOT, 'thrunt-god', 'templates', 'connector-plugin');

// ---------------------------------------------------------------------------
// 1. Reusable connector CI workflow
// ---------------------------------------------------------------------------

describe('reusable-connector-test.yml workflow', () => {
  const workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf8');

  test('exists and contains workflow_call trigger', () => {
    assert.ok(fs.existsSync(WORKFLOW_PATH), 'Workflow file must exist');
    assert.ok(workflowContent.includes('workflow_call'), 'Must use workflow_call trigger');
  });

  test('contains manifest validation step (doctor-connectors)', () => {
    assert.ok(
      workflowContent.includes('doctor-connectors'),
      'Must include doctor-connectors manifest validation step'
    );
  });

  test('contains contract test step', () => {
    assert.ok(
      workflowContent.includes('contract.test.cjs'),
      'Must include contract test step referencing contract.test.cjs'
    );
  });

  test('contains coverage step (c8)', () => {
    assert.ok(
      workflowContent.includes('c8'),
      'Must include c8 coverage tool'
    );
    assert.ok(
      workflowContent.includes('lcov'),
      'Must produce lcov coverage report'
    );
    assert.ok(
      workflowContent.includes('find tests -type f'),
      'Coverage step must discover explicit Node test files'
    );
    assert.ok(
      !workflowContent.includes('npx c8 --reporter text --reporter lcov node --test tests/'),
      'Coverage step must not pass tests/ as a positional script argument'
    );
  });

  test('contains thrunt-version input', () => {
    assert.ok(
      workflowContent.includes('thrunt-version'),
      'Must accept thrunt-version input'
    );
  });

  test('contains upload-artifact step', () => {
    assert.ok(
      workflowContent.includes('upload-artifact'),
      'Must upload coverage artifact'
    );
  });

  test('contains npm test step', () => {
    assert.ok(
      workflowContent.includes('npm test'),
      'Must run npm test for unit tests'
    );
  });
});

// ---------------------------------------------------------------------------
// 1b. Reusable pack CI workflow
// ---------------------------------------------------------------------------

describe('reusable-pack-test.yml workflow', () => {
  const workflowContent = fs.readFileSync(PACK_WORKFLOW_PATH, 'utf8');

  test('exists and validates discovered pack JSON files', () => {
    assert.ok(fs.existsSync(PACK_WORKFLOW_PATH), 'Pack workflow file must exist');
    assert.ok(
      workflowContent.includes("find \"$PACKS_DIR\" -type f -name '*.json'"),
      'Pack workflow must iterate over discovered pack JSON files'
    );
    assert.ok(
      workflowContent.includes('pack test "$PACK_ID"'),
      'Pack workflow must run thrunt-tools pack test for each pack'
    );
  });

  test('fails when pack test reports valid=false even if the command exits zero', () => {
    assert.ok(
      workflowContent.includes("result.valid !== true"),
      'Pack workflow must treat valid=false JSON output as a CI failure'
    );
    assert.ok(
      workflowContent.includes('JSON.parse'),
      'Pack workflow must parse pack test JSON output before deciding success'
    );
    assert.ok(
      workflowContent.includes('mktemp'),
      'Pack workflow must capture command output before semantic validation'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Connector plugin starter template
// ---------------------------------------------------------------------------

describe('connector-plugin template directory', () => {
  const EXPECTED_FILES = [
    'package.json.tmpl',
    'thrunt-connector.json.tmpl',
    'src/index.cjs.tmpl',
    'tests/unit.test.cjs.tmpl',
    'tests/contract.test.cjs.tmpl',
    '.gitignore.tmpl',
    'README.md.tmpl',
  ];

  test('all 7 template files exist', () => {
    for (const file of EXPECTED_FILES) {
      const filePath = path.join(TEMPLATE_DIR, file);
      assert.ok(
        fs.existsSync(filePath),
        `Template file must exist: ${file}`
      );
    }
  });

  test('package.json.tmpl contains peerDependencies with thrunt-god', () => {
    const content = fs.readFileSync(path.join(TEMPLATE_DIR, 'package.json.tmpl'), 'utf8');
    assert.ok(content.includes('peerDependencies'), 'Must declare peerDependencies');
    assert.ok(content.includes('thrunt-god'), 'peerDependencies must include thrunt-god');
  });

  test('package.json.tmpl contains keywords array with thrunt-connector', () => {
    const content = fs.readFileSync(path.join(TEMPLATE_DIR, 'package.json.tmpl'), 'utf8');
    assert.ok(content.includes('"keywords"'), 'Must have keywords field');
    assert.ok(content.includes('thrunt-connector'), 'Keywords must include thrunt-connector');
  });

  test('thrunt-connector.json.tmpl contains all REQUIRED_MANIFEST_FIELDS placeholders', () => {
    const content = fs.readFileSync(path.join(TEMPLATE_DIR, 'thrunt-connector.json.tmpl'), 'utf8');
    for (const field of REQUIRED_MANIFEST_FIELDS) {
      assert.ok(
        content.includes(`"${field}"`),
        `Manifest template must contain field: "${field}"`
      );
    }
  });

  test('src/index.cjs.tmpl exports createAdapter function', () => {
    const content = fs.readFileSync(path.join(TEMPLATE_DIR, 'src', 'index.cjs.tmpl'), 'utf8');
    assert.ok(content.includes('createAdapter'), 'Must define createAdapter');
    assert.ok(
      content.includes('module.exports') && content.includes('createAdapter'),
      'Must export createAdapter'
    );
  });

  test('tests/contract.test.cjs.tmpl imports runContractTests', () => {
    const content = fs.readFileSync(path.join(TEMPLATE_DIR, 'tests', 'contract.test.cjs.tmpl'), 'utf8');
    assert.ok(
      content.includes('runContractTests'),
      'Must import and call runContractTests'
    );
    assert.ok(
      content.includes('contract-tests.cjs'),
      'Must require from contract-tests.cjs'
    );
  });

  test('README.md.tmpl references reusable-connector-test.yml workflow', () => {
    const content = fs.readFileSync(path.join(TEMPLATE_DIR, 'README.md.tmpl'), 'utf8');
    assert.ok(
      content.includes('reusable-connector-test.yml'),
      'README must reference the reusable CI workflow'
    );
  });
});
