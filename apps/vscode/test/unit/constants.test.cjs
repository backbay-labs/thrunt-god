/**
 * Unit tests for constants module values.
 *
 * Tests run against the built CJS bundle using node:test.
 * Constants are inlined by esbuild into the bundle, so we verify
 * the runtime values match the expected contract.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// The constants are inlined into the bundle by esbuild, but we can still
// inspect them by looking at the bundle source. Alternatively, we build
// a small helper. For robustness, we extract values by evaluating what
// the bundle uses (the constants are module-scoped variables in the bundle).
//
// A cleaner approach: build constants.ts as a separate entry so it can be
// tested independently. For now, we verify indirectly through the bundle
// source text and by checking the bundle's behavior.
//
// Actually, the simplest approach: read the source and extract. But that
// tests the source, not the build. Instead, let's just build constants
// separately for testing.
//
// Simplest of all: compile constants.ts to a standalone CJS file for testing.
// We do this inline here.

const { execSync } = require('child_process');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const CONSTANTS_SRC = path.join(ROOT, 'src', 'constants.ts');
const CONSTANTS_OUT = path.join(__dirname, '.constants-test-build.cjs');

// Build constants.ts to a standalone CJS module for testing
execSync(
  `npx esbuild "${CONSTANTS_SRC}" --bundle --platform=node --format=cjs --outfile="${CONSTANTS_OUT}"`,
  { cwd: ROOT, stdio: 'pipe' }
);

const constants = require(CONSTANTS_OUT);

// Clean up after loading
fs.unlinkSync(CONSTANTS_OUT);

describe('HUNT_MARKERS', () => {
  it('is an array with exactly 2 entries', () => {
    assert.ok(Array.isArray(constants.HUNT_MARKERS));
    assert.equal(constants.HUNT_MARKERS.length, 2);
  });

  it('first entry is .hunt/MISSION.md', () => {
    assert.equal(constants.HUNT_MARKERS[0], '.hunt/MISSION.md');
  });

  it('second entry is .planning/MISSION.md', () => {
    assert.equal(constants.HUNT_MARKERS[1], '.planning/MISSION.md');
  });
});

describe('HUNT_DIRS', () => {
  it('is an array with exactly 2 entries', () => {
    assert.ok(Array.isArray(constants.HUNT_DIRS));
    assert.equal(constants.HUNT_DIRS.length, 2);
  });

  it('contains .hunt and .planning', () => {
    assert.deepEqual([...constants.HUNT_DIRS], ['.hunt', '.planning']);
  });
});

describe('OUTPUT_CHANNEL_NAME', () => {
  it('equals THRUNT God', () => {
    assert.equal(constants.OUTPUT_CHANNEL_NAME, 'THRUNT God');
  });
});

describe('COMMAND_PREFIX', () => {
  it('equals thrunt-god', () => {
    assert.equal(constants.COMMAND_PREFIX, 'thrunt-god');
  });
});
