import { describe, test, expect } from 'bun:test';
import { SiteAdapterRegistry, createDefaultRegistry } from '../src/registry.ts';
import { createSplunkAdapter } from '../src/adapters/splunk.ts';
import { createElasticAdapter } from '../src/adapters/elastic.ts';
import { createSentinelAdapter } from '../src/adapters/sentinel.ts';

describe('SiteAdapterRegistry', () => {
  test('starts empty', () => {
    const registry = new SiteAdapterRegistry();
    expect(registry.list()).toEqual([]);
  });

  test('registers and lists adapters', () => {
    const registry = new SiteAdapterRegistry();
    const splunk = createSplunkAdapter();
    const elastic = createElasticAdapter();

    registry.register(splunk);
    registry.register(elastic);

    expect(registry.list()).toHaveLength(2);
    expect(registry.list()[0].id).toBe('splunk');
    expect(registry.list()[1].id).toBe('elastic');
  });

  test('matches URL to correct adapter', () => {
    const registry = new SiteAdapterRegistry();
    registry.register(createSplunkAdapter());
    registry.register(createElasticAdapter());
    registry.register(createSentinelAdapter());

    const match = registry.match('https://acme.splunkcloud.com/en-US/app/search/search');
    expect(match).not.toBeNull();
    expect(match!.id).toBe('splunk');
  });

  test('matches Elastic URL', () => {
    const registry = new SiteAdapterRegistry();
    registry.register(createSplunkAdapter());
    registry.register(createElasticAdapter());

    const match = registry.match('https://my-deployment.cloud.elastic.co/app/security');
    expect(match).not.toBeNull();
    expect(match!.id).toBe('elastic');
  });

  test('returns null for unmatched URL', () => {
    const registry = new SiteAdapterRegistry();
    registry.register(createSplunkAdapter());

    const match = registry.match('https://example.com/random-page');
    expect(match).toBeNull();
  });

  test('list returns a copy', () => {
    const registry = new SiteAdapterRegistry();
    registry.register(createSplunkAdapter());

    const list = registry.list();
    list.pop();
    expect(registry.list()).toHaveLength(1);
  });

  test('createDefaultRegistry returns empty registry', () => {
    const registry = createDefaultRegistry();
    expect(registry.list()).toEqual([]);
  });
});
