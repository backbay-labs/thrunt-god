'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OBSIDIAN_INSTALL_ASSETS = Object.freeze([
  'main.js',
  'manifest.json',
  'styles.css',
]);

const OBSIDIAN_RELEASE_ASSETS = Object.freeze([
  ...OBSIDIAN_INSTALL_ASSETS,
  'versions.json',
]);

function getObsidianAppDir(repoRoot) {
  return path.join(repoRoot, 'apps', 'obsidian');
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertObsidianVersionSync({ rootPackage, obsidianPackage, manifest, versions }) {
  const rootVersion = assertString(rootPackage && rootPackage.version, 'package.json version');
  const obsidianVersion = assertString(
    obsidianPackage && obsidianPackage.version,
    'apps/obsidian/package.json version'
  );
  const manifestVersion = assertString(
    manifest && manifest.version,
    'apps/obsidian/manifest.json version'
  );
  const minAppVersion = assertString(
    manifest && manifest.minAppVersion,
    'apps/obsidian/manifest.json minAppVersion'
  );

  if (rootVersion !== obsidianVersion) {
    throw new Error(
      `Version drift: package.json version ${rootVersion} does not match apps/obsidian/package.json version ${obsidianVersion}.`
    );
  }

  if (obsidianVersion !== manifestVersion) {
    throw new Error(
      `Version drift: apps/obsidian/package.json version ${obsidianVersion} does not match apps/obsidian/manifest.json version ${manifestVersion}.`
    );
  }

  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new Error('apps/obsidian/versions.json must be a JSON object.');
  }

  const mappedMinAppVersion = versions[rootVersion];

  if (typeof mappedMinAppVersion !== 'string' || mappedMinAppVersion.trim() === '') {
    throw new Error(
      `Version drift: apps/obsidian/versions.json is missing a ${rootVersion} entry.`
    );
  }

  if (mappedMinAppVersion !== minAppVersion) {
    throw new Error(
      `Version drift: apps/obsidian/versions.json maps ${rootVersion} to ${mappedMinAppVersion}, expected ${minAppVersion}.`
    );
  }

  return {
    rootVersion,
    minAppVersion,
  };
}

module.exports = {
  OBSIDIAN_INSTALL_ASSETS,
  OBSIDIAN_RELEASE_ASSETS,
  getObsidianAppDir,
  assertObsidianVersionSync,
};
