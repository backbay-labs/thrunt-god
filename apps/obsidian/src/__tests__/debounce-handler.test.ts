import { describe, it, expect, vi } from 'vitest';
import { createScopedHandler } from '../sidebar-events';

describe('createScopedHandler', () => {
  const planningDir = '.planning';

  it('triggers callback for file inside planning directory', () => {
    const cb = vi.fn();
    const handler = createScopedHandler(planningDir, cb);
    handler({ path: '.planning/STATE.md' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('triggers callback for file at planning directory path', () => {
    const cb = vi.fn();
    const handler = createScopedHandler(planningDir, cb);
    handler({ path: '.planning' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('triggers callback for deeply nested file inside planning directory', () => {
    const cb = vi.fn();
    const handler = createScopedHandler(planningDir, cb);
    handler({ path: '.planning/phases/01-foo/01-01-PLAN.md' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger callback for file outside planning directory', () => {
    const cb = vi.fn();
    const handler = createScopedHandler(planningDir, cb);
    handler({ path: 'notes/daily.md' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT trigger for directory with planning dir as prefix but different name', () => {
    const cb = vi.fn();
    const handler = createScopedHandler(planningDir, cb);
    handler({ path: '.planning-backup/STATE.md' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT trigger for file that merely contains the planning dir string', () => {
    const cb = vi.fn();
    const handler = createScopedHandler(planningDir, cb);
    handler({ path: 'docs/.planning.txt' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('works with custom planning directory names', () => {
    const cb = vi.fn();
    const handler = createScopedHandler('.hunt', cb);
    handler({ path: '.hunt/MISSION.md' });
    expect(cb).toHaveBeenCalledTimes(1);

    cb.mockClear();
    handler({ path: '.hunting/MISSION.md' });
    expect(cb).not.toHaveBeenCalled();
  });
});
