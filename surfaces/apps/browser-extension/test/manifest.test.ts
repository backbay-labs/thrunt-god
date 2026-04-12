import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const manifestPath = path.resolve(import.meta.dir, '../manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
  optional_host_permissions?: string[];
  content_scripts: Array<{
    matches: string[];
    js: string[];
  }>;
};

describe('browser extension manifest', () => {
  test('does not request wildcard optional host permissions', () => {
    expect(manifest.optional_host_permissions).toBeUndefined();
  });

  test('does not inject multiple Microsoft adapters into Azure portal pages', () => {
    const azureScripts = manifest.content_scripts
      .filter((entry) => entry.matches.includes('*://portal.azure.com/*'))
      .flatMap((entry) => entry.js);

    expect(azureScripts).toContain('dist/content-sentinel.js');
    expect(azureScripts).not.toContain('dist/content-m365.js');
  });
});
