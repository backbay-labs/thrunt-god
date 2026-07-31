import { describe, test, expect } from 'bun:test';
import { SentinelCompanion } from '../src/index.ts';

describe('SentinelCompanion', () => {
  const companion = new SentinelCompanion();

  test('can be instantiated', () => {
    expect(companion).toBeInstanceOf(SentinelCompanion);
  });

  test('generateWorkbookTemplate returns valid template', () => {
    const template = companion.generateWorkbookTemplate();

    expect(template).toBeDefined();
    expect(template.$schema).toContain('schema.management.azure.com');
    expect(template.version).toBe('1.0.0');
    expect(template.name).toContain('THRUNT');
    expect(template.items).toBeArray();
    expect(template.items.length).toBeGreaterThan(0);

    // Should have at least a header, hypotheses, queries, and findings panel
    const itemNames = template.items.map((item) => item.name);
    expect(itemNames).toContain('Hypotheses Status');
    expect(itemNames).toContain('Recent Queries');
    expect(itemNames).toContain('Findings Summary');
  });

  test('generatePlaybookSkeleton returns valid skeleton', () => {
    const skeleton = companion.generatePlaybookSkeleton();

    expect(skeleton).toBeDefined();
    expect(skeleton.$schema).toContain('schema.management.azure.com');
    expect(skeleton.definition).toBeDefined();
    expect(skeleton.definition.triggers).toBeDefined();
    expect(skeleton.definition.actions).toBeDefined();
    expect(skeleton.metadata).toBeDefined();
    expect(skeleton.metadata.name).toContain('THRUNT');
    expect(skeleton.metadata.triggerType).toContain('Sentinel');

    // Should have the bridge call action
    expect(skeleton.definition.actions).toHaveProperty('Call_THRUNT_Bridge_Open_Case');
  });
});
