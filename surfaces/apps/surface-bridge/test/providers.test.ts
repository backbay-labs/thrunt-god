import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { safeJsonParse } from '../src/providers.ts';

describe('safeJsonParse', () => {
  test('reads and deletes trusted @file temp payloads', () => {
    const filePath = path.join(os.tmpdir(), `thrunt-provider-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ ok: true, items: [1, 2, 3] }), 'utf-8');

    expect(safeJsonParse<{ ok: boolean; items: number[] }>(`@file:${filePath}`)).toEqual({
      ok: true,
      items: [1, 2, 3],
    });
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('rejects @file payloads outside the trusted temp namespace', () => {
    const dir = fs.mkdtempSync(path.join(import.meta.dir, 'provider-json-'));
    const filePath = path.join(dir, 'thrunt-provider.json');
    fs.writeFileSync(filePath, JSON.stringify({ secret: true }), 'utf-8');

    try {
      expect(safeJsonParse(`@file:${filePath}`)).toBeNull();
      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
