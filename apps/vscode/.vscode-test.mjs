import { defineConfig } from '@vscode/test-cli';

const workspaceFolder =
  process.env.THRUNT_TEST_WORKSPACE ?? './test/fixtures/sample-hunt';

export default defineConfig({
  files: 'test/integration/**/*.test.ts',
  version: 'stable',
  workspaceFolder,
  mocha: {
    timeout: 20000,
    require: ['esbuild-register'],
  },
  launchArgs: [
    '--disable-extensions',
    '--disable-gpu',
  ],
});
