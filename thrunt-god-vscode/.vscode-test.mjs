import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'test/integration/**/*.test.ts',
  version: 'stable',
  workspaceFolder: './test/fixtures/sample-hunt',
  mocha: {
    timeout: 20000,
    require: ['esbuild-register'],
  },
  launchArgs: [
    '--disable-extensions',
    '--disable-gpu',
  ],
});
