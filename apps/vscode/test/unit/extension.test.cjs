/**
 * Unit tests for extension exports (dist/extension.js).
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');

describe('extension exports', () => {
  it('exports activate function', () => {
    const ext = require(BUNDLE_PATH);
    assert.equal(typeof ext.activate, 'function');
  });

  it('exports deactivate function', () => {
    const ext = require(BUNDLE_PATH);
    assert.equal(typeof ext.deactivate, 'function');
  });

  it('deactivate() does not throw', () => {
    const ext = require(BUNDLE_PATH);
    assert.doesNotThrow(() => ext.deactivate());
  });

  it('exports expected top-level keys', () => {
    const ext = require(BUNDLE_PATH);
    const exportedKeys = Object.keys(ext).filter(
      (k) => k !== '__esModule'
    );
    // Core extension exports
    assert.ok(exportedKeys.includes('activate'));
    assert.ok(exportedKeys.includes('deactivate'));
    // Parser exports (added in Phase 8)
    assert.ok(exportedKeys.includes('parseMission'));
    assert.ok(exportedKeys.includes('parseHypotheses'));
    assert.ok(exportedKeys.includes('parseHuntMap'));
    assert.ok(exportedKeys.includes('parseState'));
    assert.ok(exportedKeys.includes('parseEvidenceReview'));
    assert.ok(exportedKeys.includes('parsePhaseSummary'));
    assert.ok(exportedKeys.includes('extractFrontmatter'));
    assert.ok(exportedKeys.includes('extractBody'));
    assert.ok(exportedKeys.includes('extractMarkdownSections'));
  });
});

describe('CLI parsing helpers', () => {
  it('preserves literal Windows path backslashes', () => {
    const ext = require(BUNDLE_PATH);
    assert.deepEqual(
      ext.parseCliInput('runtime execute --workspace C:\\Logs\\hunt'),
      ['runtime', 'execute', '--workspace', 'C:\\Logs\\hunt']
    );
  });

  it('still supports escaped delimiters in unquoted input', () => {
    const ext = require(BUNDLE_PATH);
    assert.deepEqual(
      ext.parseCliInput('runtime execute --label incident\\ response --note \\\"quoted\\\"'),
      ['runtime', 'execute', '--label', 'incident response', '--note', '"quoted"']
    );
  });

  it('rejects phase templates that require an unset packId', () => {
    const ext = require(BUNDLE_PATH);
    assert.throws(
      () => ext.resolvePhaseCommandTemplate('runtime execute --pack {packId} --phase {phase}', {
        phase: '4',
        phaseName: 'Collect Evidence',
        phaseNameSlug: 'collect-evidence',
        packId: '',
      }),
      /defaultPackId/
    );
  });

  it('allows phase templates that do not use packId', () => {
    const ext = require(BUNDLE_PATH);
    assert.deepEqual(
      ext.resolvePhaseCommandTemplate('runtime execute --phase {phase}', {
        phase: '4',
        phaseName: 'Collect Evidence',
        phaseNameSlug: 'collect-evidence',
        packId: '',
      }),
      {
        commandString: 'runtime execute --phase 4',
        args: ['runtime', 'execute', '--phase', '4'],
      }
    );
  });
});
