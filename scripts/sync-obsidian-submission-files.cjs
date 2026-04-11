#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const appDir = path.join(repoRoot, 'apps', 'obsidian');

const files = [
  'manifest.json',
  'versions.json',
];

for (const fileName of files) {
  const sourcePath = path.join(appDir, fileName);
  const destinationPath = path.join(repoRoot, fileName);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing Obsidian submission source file: ${sourcePath}`);
  }

  const contents = fs.readFileSync(sourcePath, 'utf8');
  fs.writeFileSync(destinationPath, contents);
}

process.stdout.write(
  `${JSON.stringify({ synced: files, sourceDir: 'apps/obsidian' }, null, 2)}\n`
);
