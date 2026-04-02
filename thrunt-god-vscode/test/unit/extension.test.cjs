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

  it('does not export unexpected top-level keys', () => {
    const ext = require(BUNDLE_PATH);
    const exportedKeys = Object.keys(ext).filter(
      (k) => k !== '__esModule'
    );
    assert.deepEqual(exportedKeys.sort(), ['activate', 'deactivate']);
  });
});
