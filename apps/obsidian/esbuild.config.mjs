import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import process from 'node:process';

const banner = '/* Bundled by esbuild for THRUNT God Obsidian plugin */';
const isProduction = process.argv[2] === 'production';

const external = [
  'obsidian',
  'electron',
  '@codemirror/autocomplete',
  '@codemirror/collab',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

const context = await esbuild.context({
  banner: {
    js: banner,
  },
  bundle: true,
  entryPoints: ['src/main.ts'],
  external,
  format: 'cjs',
  logLevel: 'info',
  minify: isProduction,
  outfile: 'main.js',
  platform: 'browser',
  sourcemap: isProduction ? false : 'inline',
  target: 'es2018',
  treeShaking: true,
});

if (isProduction) {
  await context.rebuild();
  process.exit(0);
}

await context.watch();

