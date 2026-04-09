import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');
const isProduction = process.env.NODE_ENV === 'production';
const packageRoot = process.cwd();

function resolveRepoRoot(startDir) {
  const candidates = [
    path.resolve(startDir, '..', '..'),
    path.resolve(startDir, '..'),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'thrunt-god')) && existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve repo root from ${startDir}`);
}

const repoRoot = resolveRepoRoot(packageRoot);

/** Shared build options */
const shared = {
  bundle: true,
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
};

/** Extension host bundle -- CJS for VS Code's Node.js process */
const extensionConfig = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
};

/** Create a webview bundle config -- ESM for the browser-based webview iframe */
function createWebviewConfig(entryPoint, outfile) {
  return {
    ...shared,
    entryPoints: [entryPoint],
    outfile,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  };
}

const webviewConfigs = [
  createWebviewConfig('webview/drain-template-viewer/index.tsx', 'dist/webview-drain.js'),
  createWebviewConfig('webview/hunt-overview/index.tsx', 'dist/webview-hunt-overview.js'),
  createWebviewConfig('webview/evidence-board/index.tsx', 'dist/webview-evidence-board.js'),
  createWebviewConfig('webview/query-analysis/index.tsx', 'dist/webview-query-analysis.js'),
  createWebviewConfig('webview/program-dashboard/index.tsx', 'dist/webview-program-dashboard.js'),
  createWebviewConfig('webview/mcp-control-panel/index.tsx', 'dist/webview-mcp-control.js'),
  createWebviewConfig('webview/command-deck/index.tsx', 'dist/webview-command-deck.js'),
  createWebviewConfig('webview/runbook/index.tsx', 'dist/webview-runbook.js'),
];

/**
 * Format bytes into human-readable string.
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Report build output sizes.
 */
function reportSizes(label, outfile) {
  try {
    const stat = statSync(outfile);
    console.log(`  ${label}: ${outfile} (${formatSize(stat.size)})`);
  } catch {
    // File may not exist yet during watch initialization
  }
}

function syncBundledThruntRuntime() {
  const distRoot = path.join(packageRoot, 'dist');
  const thruntSourceRoot = path.join(repoRoot, 'thrunt-god');
  const agentsSourceRoot = path.join(repoRoot, 'agents');
  const packageJsonSource = path.join(repoRoot, 'package.json');
  const runtimeFixturesSource = path.join(repoRoot, 'tests', 'runtime-fixtures.cjs');

  const requiredSources = [thruntSourceRoot, agentsSourceRoot, packageJsonSource, runtimeFixturesSource];
  for (const source of requiredSources) {
    if (!existsSync(source)) {
      throw new Error(`Missing THRUNT runtime source: ${source}`);
    }
  }

  const thruntDestRoot = path.join(distRoot, 'thrunt-god');
  const agentsDestRoot = path.join(distRoot, 'agents');
  const packageJsonDest = path.join(distRoot, 'package.json');
  const runtimeFixturesDest = path.join(distRoot, 'tests', 'runtime-fixtures.cjs');

  mkdirSync(distRoot, { recursive: true });

  rmSync(thruntDestRoot, { recursive: true, force: true });
  rmSync(agentsDestRoot, { recursive: true, force: true });
  rmSync(packageJsonDest, { force: true });

  const thruntRuntimeDirs = [
    'bin',
    'commands',
    'data',
    'packs',
    'references',
    'templates',
    'workflows',
  ];

  for (const dir of thruntRuntimeDirs) {
    cpSync(path.join(thruntSourceRoot, dir), path.join(thruntDestRoot, dir), {
      recursive: true,
      force: true,
    });
  }

  cpSync(agentsSourceRoot, agentsDestRoot, {
    recursive: true,
    force: true,
  });
  cpSync(packageJsonSource, packageJsonDest, {
    force: true,
  });
  mkdirSync(path.dirname(runtimeFixturesDest), { recursive: true });
  cpSync(runtimeFixturesSource, runtimeFixturesDest, {
    force: true,
  });
}

async function build() {
  const start = Date.now();
  const distRoot = path.join(packageRoot, 'dist');

  if (isWatch) {
    // Use esbuild context API for incremental rebuilds
    const contexts = await Promise.all([
      esbuild.context(extensionConfig),
      ...webviewConfigs.map((cfg) => esbuild.context(cfg)),
    ]);

    await Promise.all(contexts.map((ctx) => ctx.watch()));
    syncBundledThruntRuntime();

    console.log('[watch] Watching for changes...');
  } else {
    rmSync(distRoot, { recursive: true, force: true });

    // Single build
    await Promise.all([
      esbuild.build(extensionConfig),
      ...webviewConfigs.map((cfg) => esbuild.build(cfg)),
    ]);
    syncBundledThruntRuntime();

    const elapsed = Date.now() - start;

    console.log(`\nBuild complete in ${elapsed}ms${isProduction ? ' (production)' : ''}`);
    reportSizes('Extension host (CJS)', 'dist/extension.js');
    reportSizes('Webview: Drain (ESM)', 'dist/webview-drain.js');
    reportSizes('Webview: Hunt Overview (ESM)', 'dist/webview-hunt-overview.js');
    reportSizes('Webview: Evidence Board (ESM)', 'dist/webview-evidence-board.js');
    reportSizes('Webview: Query Analysis (ESM)', 'dist/webview-query-analysis.js');
    reportSizes('Webview: Program Dashboard (ESM)', 'dist/webview-program-dashboard.js');
    reportSizes('Webview: MCP Control (ESM)', 'dist/webview-mcp-control.js');
    reportSizes('Webview: Command Deck (ESM)', 'dist/webview-command-deck.js');
    reportSizes('Webview: Runbook (ESM)', 'dist/webview-runbook.js');
    reportSizes('Bundled THRUNT CLI', 'dist/thrunt-god/bin/thrunt-tools.cjs');

    if (elapsed < 1000) {
      console.log('\nBuild completed in under 1 second.');
    }
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
