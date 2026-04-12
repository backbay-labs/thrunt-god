#!/usr/bin/env bun

import * as path from 'node:path';

import { runCertificationHarness } from '../src/certification-harness.ts';

const args = process.argv.slice(2);
const projectRoot = resolveFlag(args, 'project-root') || process.cwd();
const vendorList = resolveFlag(args, 'vendors');
const fixturesRoot = resolveFlag(args, 'fixtures-root') || undefined;

const report = await runCertificationHarness({
  projectRoot: path.resolve(projectRoot),
  vendorIds: vendorList ? vendorList.split(',').map((value) => value.trim()).filter(Boolean) : undefined,
  fixturesRoot,
});

console.log(JSON.stringify({
  generatedAt: report.generatedAt,
  projectRoot: report.projectRoot,
  reportPath: report.reportPath,
  statusPath: report.statusPath,
  vendors: report.vendors.map((vendor) => ({
    vendorId: vendor.vendorId,
    fixtureSnapshots: vendor.fixtureSnapshots,
    liveSnapshots: vendor.liveSnapshots,
    livePassed: vendor.livePassed,
    driftCount: vendor.driftCount,
    status: vendor.status?.status ?? null,
    summary: vendor.status?.summary ?? vendor.summary,
  })),
}, null, 2));

function resolveFlag(argv: string[], name: string): string | null {
  const flag = `--${name}`;
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}
