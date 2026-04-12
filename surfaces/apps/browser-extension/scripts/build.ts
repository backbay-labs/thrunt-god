#!/usr/bin/env bun
/**
 * Build script for the THRUNT browser extension.
 *
 * Bundles background worker, side panel, and content scripts separately.
 */

import { join } from 'path';

const src = join(import.meta.dir, '..', 'src');
const dist = join(import.meta.dir, '..', 'dist');

const entrypoints = [
  { name: 'background', entry: join(src, 'background', 'index.ts') },
  { name: 'sidepanel', entry: join(src, 'sidepanel', 'index.ts') },
  // Content scripts — one per vendor
  { name: 'content-splunk', entry: join(src, 'content', 'splunk.ts') },
  { name: 'content-elastic', entry: join(src, 'content', 'elastic.ts') },
  { name: 'content-sentinel', entry: join(src, 'content', 'sentinel.ts') },
  { name: 'content-okta', entry: join(src, 'content', 'okta.ts') },
  { name: 'content-m365', entry: join(src, 'content', 'm365.ts') },
  { name: 'content-crowdstrike', entry: join(src, 'content', 'crowdstrike.ts') },
  { name: 'content-aws', entry: join(src, 'content', 'aws.ts') },
  { name: 'content-gcp', entry: join(src, 'content', 'gcp.ts') },
  { name: 'content-jira', entry: join(src, 'content', 'jira.ts') },
  { name: 'content-confluence', entry: join(src, 'content', 'confluence.ts') },
  { name: 'content-servicenow', entry: join(src, 'content', 'servicenow.ts') },
];

console.log('Building THRUNT browser extension...');

for (const { name, entry } of entrypoints) {
  try {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: dist,
      naming: `${name}.js`,
      target: 'browser',
      minify: false,
      sourcemap: 'external',
    });

    if (!result.success) {
      console.error(`  ✗ ${name}: ${result.logs.map(l => l.message).join(', ')}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    console.error(`  ✗ ${name}: ${err}`);
  }
}

console.log('Build complete.');
