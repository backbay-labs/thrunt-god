import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright';

interface FixtureExpectation {
  detect: boolean;
  pageType: string;
  confidence: 'high' | 'medium' | 'low';
  completeness: 'complete' | 'partial' | 'unsupported';
  supported: boolean;
  tableRows: number;
  queryLanguage: string | null;
  entityValues: string[];
  failureReasons?: string[];
}

interface FixtureDefinition {
  file: string;
  url: string;
  expected: FixtureExpectation;
}

interface FixtureManifest {
  vendorId: string;
  fixtures: FixtureDefinition[];
}

const FIXTURE_ROOT = path.resolve(import.meta.dir, 'fixtures');
const HARNESS_ENTRY = path.resolve(import.meta.dir, '../src/browser-harness-entry.ts');

let browser: Browser;
let context: BrowserContext;
let harnessPath: string;
let buildDir: string;

beforeAll(async () => {
  buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-site-adapters-'));
  const result = await Bun.build({
    entrypoints: [HARNESS_ENTRY],
    outdir: buildDir,
    naming: 'browser-harness.js',
    target: 'browser',
    format: 'iife',
    minify: false,
    sourcemap: 'none',
  });

  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'));
  }

  harnessPath = path.join(buildDir, 'browser-harness.js');
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
});

afterAll(async () => {
  await context.close();
  await browser.close();
  fs.rmSync(buildDir, { recursive: true, force: true });
});

describe('fixture metadata', () => {
  for (const vendorId of ['okta', 'sentinel', 'aws', 'elastic']) {
    test(`${vendorId} has at least three variants`, () => {
      const manifest = readManifest(vendorId);
      expect(manifest.fixtures.length).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('site adapters in a real browser', () => {
  for (const vendorId of ['okta', 'sentinel', 'aws', 'elastic']) {
    const manifest = readManifest(vendorId);

    for (const fixture of manifest.fixtures) {
      test(`${vendorId} fixture ${fixture.file}`, async () => {
        const page = await context.newPage();
        await serveFixture(page, vendorId, fixture);
        await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
        await page.addScriptTag({ path: harnessPath });

        const result = await page.evaluate((id) => {
          return window.__thruntSurfaces?.runAdapter(id);
        }, vendorId) as {
          detect: boolean;
          context: { pageType: string; extraction?: FixtureExpectation & { failureReasons?: string[] } };
          query: { language: string } | null;
          table: { totalRows: number } | null;
          entities: Array<{ value: string }>;
          supportedActions: string[];
        };

        expect(result.detect).toBe(fixture.expected.detect);
        expect(result.context.pageType).toBe(fixture.expected.pageType);
        expect(result.context.extraction?.confidence).toBe(fixture.expected.confidence);
        expect(result.context.extraction?.completeness).toBe(fixture.expected.completeness);
        expect(result.context.extraction?.supported).toBe(fixture.expected.supported);
        expect(result.query?.language ?? null).toBe(fixture.expected.queryLanguage);
        expect(result.table?.totalRows ?? 0).toBe(fixture.expected.tableRows);

        const entityValues = result.entities.map((entity) => entity.value);
        for (const value of fixture.expected.entityValues) {
          expect(entityValues).toContain(value);
        }

        if (fixture.expected.failureReasons) {
          for (const reason of fixture.expected.failureReasons) {
            expect(result.context.extraction?.failureReasons ?? []).toContain(reason);
          }
        }

        await page.close();
      });
    }
  }
});

function readManifest(vendorId: string): FixtureManifest {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_ROOT, vendorId, 'fixtures.json'), 'utf-8'),
  ) as FixtureManifest;
}

async function serveFixture(page: Page, vendorId: string, fixture: FixtureDefinition): Promise<void> {
  const html = fs.readFileSync(path.join(FIXTURE_ROOT, vendorId, fixture.file), 'utf-8');
  const requestUrl = stripHash(fixture.url);
  await page.route('**/*', async (route: Route) => {
    if (route.request().url() === requestUrl) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: html,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: '',
    });
  });
}

function stripHash(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}
