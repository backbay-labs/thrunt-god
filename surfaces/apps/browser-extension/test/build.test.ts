import { describe, expect, test } from 'bun:test';
import { buildExtension, type ExtensionBuildEntrypoint } from '../scripts/build.ts';

describe('browser extension build script', () => {
  test('returns false when any entrypoint build reports failure', async () => {
    const targets: ExtensionBuildEntrypoint[] = [
      { name: 'background', entry: '/tmp/background.ts' },
      { name: 'sidepanel', entry: '/tmp/sidepanel.ts' },
    ];
    const ok = await buildExtension(targets, async (options) => {
      if (options.naming === 'sidepanel.js') {
        return { success: false, logs: [{ message: 'sidepanel failed' }] } as any;
      }
      return { success: true, logs: [] } as any;
    });

    expect(ok).toBe(false);
  });

  test('returns false when the build callback throws', async () => {
    const targets: ExtensionBuildEntrypoint[] = [
      { name: 'background', entry: '/tmp/background.ts' },
    ];
    const ok = await buildExtension(targets, async () => {
      throw new Error('boom');
    });

    expect(ok).toBe(false);
  });
});
