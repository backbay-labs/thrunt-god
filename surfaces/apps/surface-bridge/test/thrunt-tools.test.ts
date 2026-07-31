import { describe, test, expect } from 'bun:test';
import * as path from 'node:path';
import { resolveThruntTools } from '../src/thrunt-tools.ts';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const TOOLS_PATH = path.join(REPO_ROOT, 'thrunt-god', 'bin', 'thrunt-tools.cjs');

describe('resolveThruntTools', () => {
  test('resolves an explicit configured tools path', () => {
    const result = resolveThruntTools(REPO_ROOT, TOOLS_PATH);
    expect(result.toolsPath).toBe(TOOLS_PATH);
    expect(result.argvPrefix[result.argvPrefix.length - 1]).toBe(TOOLS_PATH);
    expect(result.diagnostics).toContain(`configured:${TOOLS_PATH}`);
  });

  test('resolves the repo-local tools path without explicit configuration', () => {
    const result = resolveThruntTools(REPO_ROOT);
    expect(result.toolsPath).toBe(TOOLS_PATH);
    expect(result.diagnostics.some((line) => line.includes('candidate:'))).toBe(true);
  });

  test('returns precise diagnostics when configured path is missing', () => {
    const missing = path.join(REPO_ROOT, 'thrunt-god', 'bin', 'missing-thrunt-tools.cjs');
    const result = resolveThruntTools(REPO_ROOT, missing);
    expect(result.toolsPath).toBe(TOOLS_PATH);
    expect(result.diagnostics).toContain(`configured:${missing}`);
    expect(result.diagnostics).toContain(`missing:${missing}`);
  });
});
