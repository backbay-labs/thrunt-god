#!/usr/bin/env bun

import * as path from 'node:path';

import { runCertificationHarness } from '../packages/surfaces-site-adapters/src/certification-harness.ts';

const projectRoot = path.resolve(
  readFlag('project-root')
    || path.resolve(import.meta.dir, '../../thrunt-god/examples/oauth-session-hijack'),
);
const vendorList = readFlag('vendors');
const report = await runCertificationHarness({
  projectRoot,
  vendorIds: vendorList ? vendorList.split(',').map((value) => value.trim()).filter(Boolean) : undefined,
});

console.log(JSON.stringify({
  generatedAt: report.generatedAt,
  projectRoot: report.projectRoot,
  reportPath: report.reportPath,
  statusPath: report.statusPath,
  campaignCount: report.campaigns.length,
  vendors: report.vendors.map((vendor) => ({
    vendorId: vendor.vendorId,
    fixtureSnapshots: vendor.fixtureSnapshots,
    liveSnapshots: vendor.liveSnapshots,
    livePassed: vendor.livePassed,
    driftCount: vendor.driftCount,
    blockedCount: vendor.blockedCount,
    reviewRequiredCount: vendor.reviewRequiredCount,
    status: vendor.status?.status ?? null,
    summary: vendor.status?.summary ?? vendor.summary,
  })),
}, null, 2));

function readFlag(name: string): string | null {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}
