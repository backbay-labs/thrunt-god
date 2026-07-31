#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  OBSIDIAN_RELEASE_ASSETS,
  getObsidianAppDir,
  assertObsidianVersionSync,
} = require('./lib/obsidian-artifacts.cjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildReleaseBundle(options = {}) {
  const repoRoot = options.repoRoot || path.join(__dirname, '..');
  const appDir = getObsidianAppDir(repoRoot);
  const outputDir = options.outputDir || path.join(repoRoot, 'dist', 'obsidian-release');
  const runBuild = options.runBuild || (() => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npmCommand, ['run', 'build:obsidian'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  });

  const rootPackage = readJson(path.join(repoRoot, 'package.json'));
  const obsidianPackage = readJson(path.join(appDir, 'package.json'));
  const manifest = readJson(path.join(appDir, 'manifest.json'));
  const versions = readJson(path.join(appDir, 'versions.json'));

  assertObsidianVersionSync({
    rootPackage,
    obsidianPackage,
    manifest,
    versions,
  });

  runBuild({ repoRoot, appDir, outputDir });

  fs.mkdirSync(outputDir, { recursive: true });

  for (const assetFile of OBSIDIAN_RELEASE_ASSETS) {
    fs.rmSync(path.join(outputDir, assetFile), { force: true, recursive: true });
  }

  for (const assetFile of OBSIDIAN_RELEASE_ASSETS) {
    const sourcePath = path.join(appDir, assetFile);
    const destinationPath = path.join(outputDir, assetFile);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing Obsidian release asset: ${sourcePath}`);
    }

    fs.copyFileSync(sourcePath, destinationPath);
  }

  return { outputDir, assets: [...OBSIDIAN_RELEASE_ASSETS] };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(buildReleaseBundle(), null, 2)}\n`);
} else {
  module.exports = {
    buildReleaseBundle,
  };
}
