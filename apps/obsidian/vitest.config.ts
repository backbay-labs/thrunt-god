import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      // The "obsidian" npm package is types-only (no JS entrypoint).
      // Redirect to a lightweight stub so tests can import modules that
      // depend on the Obsidian runtime (e.g. commands.ts → Notice).
      obsidian: new URL('./src/__mocks__/obsidian.ts', import.meta.url).pathname,
    },
  },
});
