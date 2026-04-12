#!/usr/bin/env bun
/**
 * Build script for the THRUNT browser extension.
 *
 * Bundles background worker, side panel, and content scripts separately.
 */

import { join } from 'path';

const src = join(import.meta.dir, '..', 'src');
const dist = join(import.meta.dir, '..', 'dist');

type BuildOptions = Parameters<typeof Bun.build>[0];
type BuildResult = Awaited<ReturnType<typeof Bun.build>>;
type BuildFn = (options: BuildOptions) => Promise<Pick<BuildResult, 'success' | 'logs'>>;

export interface ExtensionBuildEntrypoint {
  name: string;
  entry: string;
}

export const entrypoints: ExtensionBuildEntrypoint[] = [
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

export async function buildExtension(
  targets: ExtensionBuildEntrypoint[] = entrypoints,
  build: BuildFn = (options) => Bun.build(options),
): Promise<boolean> {
  let hadFailure = false;

  for (const { name, entry } of targets) {
    try {
      const result = await build({
        entrypoints: [entry],
        outdir: dist,
        naming: `${name}.js`,
        target: 'browser',
        minify: false,
        sourcemap: 'external',
      });

      if (!result.success) {
        hadFailure = true;
        console.error(`  ✗ ${name}: ${result.logs.map((log) => log.message).join(', ')}`);
        continue;
      }

      console.log(`  ✓ ${name}`);
    } catch (err) {
      hadFailure = true;
      console.error(`  ✗ ${name}: ${err}`);
    }
  }

  return !hadFailure;
}

if (import.meta.main) {
  console.log('Building THRUNT browser extension...');
  const ok = await buildExtension();
  if (!ok) {
    console.error('Build failed.');
    process.exit(1);
  }
  console.log('Build complete.');
}
