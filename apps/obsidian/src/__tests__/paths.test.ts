import { describe, it, expect } from 'vitest';
import { normalizePath, getPlanningDir, getCoreFilePath } from '../paths';

describe('normalizePath', () => {
  it('trims whitespace', () => {
    expect(normalizePath('  .planning  ')).toBe('.planning');
  });
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('.planning\\MISSION.md')).toBe('.planning/MISSION.md');
  });
  it('collapses consecutive slashes', () => {
    expect(normalizePath('.planning//MISSION.md')).toBe('.planning/MISSION.md');
  });
  it('strips trailing slash', () => {
    expect(normalizePath('.planning/')).toBe('.planning');
  });
  it('handles empty string', () => {
    expect(normalizePath('')).toBe('');
  });
  it('strips leading ./', () => {
    expect(normalizePath('./foo/bar')).toBe('foo/bar');
  });
  it('handles complex path', () => {
    expect(normalizePath('  foo\\\\bar//baz/  ')).toBe('foo/bar/baz');
  });
});

describe('getPlanningDir', () => {
  it('returns configured dir when non-empty', () => {
    expect(getPlanningDir('.hunt', '.planning')).toBe('.hunt');
  });
  it('falls back to default when configured is empty', () => {
    expect(getPlanningDir('', '.planning')).toBe('.planning');
  });
  it('falls back to default when configured is whitespace', () => {
    expect(getPlanningDir('   ', '.planning')).toBe('.planning');
  });
  it('normalizes the result', () => {
    expect(getPlanningDir('.hunt/', '.planning')).toBe('.hunt');
  });
});

describe('getCoreFilePath', () => {
  it('joins planningDir and fileName', () => {
    expect(getCoreFilePath('.planning', 'STATE.md')).toBe('.planning/STATE.md');
  });
  it('normalizes the result', () => {
    expect(getCoreFilePath('.planning/', 'STATE.md')).toBe('.planning/STATE.md');
  });
  it('handles nested planningDir', () => {
    expect(getCoreFilePath('deep/nested/.planning', 'MISSION.md')).toBe(
      'deep/nested/.planning/MISSION.md',
    );
  });
});
