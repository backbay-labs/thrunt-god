#!/usr/bin/env bun

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runThruntCommand } from '../apps/surface-bridge/src/thrunt-tools.ts';

const projectRoot = path.resolve(
  readFlag('project-root')
    || fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-dogfood-case-')),
);
const toolsPath = path.resolve(
  readFlag('tools-path')
    || process.env.THRUNT_TOOLS_PATH
    || path.resolve(import.meta.dir, '../../thrunt-god/bin/thrunt-tools.cjs'),
);
const signal = readFlag('signal')
  || 'Okta system log shows suspicious consent grant from unknown ASN';
const caseTitle = readFlag('name') || 'Phase Four Dogfood Case';

const result = await runThruntCommand(
  projectRoot,
  ['case', 'new', caseTitle, '--signal', signal, '--bootstrap-program', '--raw'],
  toolsPath,
);

if (!result.ok) {
  console.error(JSON.stringify({
    success: false,
    projectRoot,
    toolsPath,
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    diagnostics: result.diagnostics,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  success: true,
  projectRoot,
  toolsPath,
  command: result.command,
  exitCode: result.exitCode,
  stdout: result.stdout,
  stderr: result.stderr,
  activeCasePath: path.join(projectRoot, '.planning', '.active-case'),
}, null, 2));

function readFlag(name: string): string | null {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}
