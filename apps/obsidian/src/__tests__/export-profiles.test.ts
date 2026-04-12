import { describe, it, expect } from 'vitest';
import { DEFAULT_PROFILES, loadProfiles } from '../export-profiles';
import type { ExportProfile } from '../types';

// ---------------------------------------------------------------------------
// DEFAULT_PROFILES structure
// ---------------------------------------------------------------------------

describe('DEFAULT_PROFILES', () => {
  it('has exactly 5 entries', () => {
    expect(DEFAULT_PROFILES).toHaveLength(5);
  });

  it('contains all expected agentIds', () => {
    const ids = DEFAULT_PROFILES.map((p) => p.agentId);
    expect(ids).toContain('query-writer');
    expect(ids).toContain('intel-advisor');
    expect(ids).toContain('findings-validator');
    expect(ids).toContain('signal-triager');
    expect(ids).toContain('hunt-planner');
  });

  it('each profile has non-empty includeSections', () => {
    for (const profile of DEFAULT_PROFILES) {
      expect(profile.includeSections.length).toBeGreaterThan(0);
    }
  });

  it('each profile has includeRelated with entityTypes array and depth number', () => {
    for (const profile of DEFAULT_PROFILES) {
      expect(Array.isArray(profile.includeRelated.entityTypes)).toBe(true);
      expect(typeof profile.includeRelated.depth).toBe('number');
    }
  });

  it('each profile has required fields', () => {
    for (const profile of DEFAULT_PROFILES) {
      expect(typeof profile.agentId).toBe('string');
      expect(profile.agentId.length).toBeGreaterThan(0);
      expect(typeof profile.label).toBe('string');
      expect(profile.label.length).toBeGreaterThan(0);
      expect(typeof profile.promptTemplate).toBe('string');
      expect(profile.promptTemplate.length).toBeGreaterThan(0);
      expect(typeof profile.maxTokenEstimate).toBe('number');
      expect(profile.maxTokenEstimate).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-profile section/entity validation
// ---------------------------------------------------------------------------

describe('query-writer profile', () => {
  it('includeSections contains hypothesis, environment, data-sources, technique-details', () => {
    const profile = DEFAULT_PROFILES.find((p) => p.agentId === 'query-writer')!;
    expect(profile.includeSections).toContain('hypothesis');
    expect(profile.includeSections).toContain('environment');
    expect(profile.includeSections).toContain('data-sources');
    expect(profile.includeSections).toContain('technique-details');
  });
});

describe('intel-advisor profile', () => {
  it('includeRelated depth is 1 and entityTypes includes ttp and actor', () => {
    const profile = DEFAULT_PROFILES.find((p) => p.agentId === 'intel-advisor')!;
    expect(profile.includeRelated.depth).toBe(1);
    expect(profile.includeRelated.entityTypes).toContain('ttp');
    expect(profile.includeRelated.entityTypes).toContain('actor');
  });
});

describe('findings-validator profile', () => {
  it('includeSections contains hypothesis, receipts, evidence-review', () => {
    const profile = DEFAULT_PROFILES.find((p) => p.agentId === 'findings-validator')!;
    expect(profile.includeSections).toContain('hypothesis');
    expect(profile.includeSections).toContain('receipts');
    expect(profile.includeSections).toContain('evidence-review');
  });
});

describe('signal-triager profile', () => {
  it('includeSections contains signal, environment, sightings', () => {
    const profile = DEFAULT_PROFILES.find((p) => p.agentId === 'signal-triager')!;
    expect(profile.includeSections).toContain('signal');
    expect(profile.includeSections).toContain('environment');
    expect(profile.includeSections).toContain('sightings');
  });
});

describe('hunt-planner profile', () => {
  it('includeSections contains mission, hypotheses, coverage-gaps, data-sources', () => {
    const profile = DEFAULT_PROFILES.find((p) => p.agentId === 'hunt-planner')!;
    expect(profile.includeSections).toContain('mission');
    expect(profile.includeSections).toContain('hypotheses');
    expect(profile.includeSections).toContain('coverage-gaps');
    expect(profile.includeSections).toContain('data-sources');
  });
});

// ---------------------------------------------------------------------------
// loadProfiles
// ---------------------------------------------------------------------------

describe('loadProfiles', () => {
  it('returns DEFAULT_PROFILES unchanged when customJson is null', () => {
    const result = loadProfiles(null);
    expect(result).toHaveLength(DEFAULT_PROFILES.length);
    expect(result.map((p) => p.agentId)).toEqual(
      DEFAULT_PROFILES.map((p) => p.agentId),
    );
  });

  it('appends custom profile to defaults', () => {
    const custom: ExportProfile[] = [
      {
        agentId: 'custom-agent',
        label: 'Custom Agent',
        includeSections: ['mission'],
        includeRelated: { entityTypes: ['ttp'], depth: 1 },
        promptTemplate: 'Custom: {{context}}',
        maxTokenEstimate: 5000,
      },
    ];
    const result = loadProfiles(JSON.stringify(custom));
    expect(result).toHaveLength(DEFAULT_PROFILES.length + 1);
    expect(result.find((p) => p.agentId === 'custom-agent')).toBeDefined();
  });

  it('overrides default profile when custom agentId matches', () => {
    const custom: ExportProfile[] = [
      {
        agentId: 'query-writer',
        label: 'Custom Query Writer',
        includeSections: ['custom-section'],
        includeRelated: { entityTypes: ['actor'], depth: 2 },
        promptTemplate: 'Override: {{context}}',
        maxTokenEstimate: 9999,
      },
    ];
    const result = loadProfiles(JSON.stringify(custom));
    // Length should remain same since override replaces
    expect(result).toHaveLength(DEFAULT_PROFILES.length);
    const overridden = result.find((p) => p.agentId === 'query-writer')!;
    expect(overridden.label).toBe('Custom Query Writer');
    expect(overridden.maxTokenEstimate).toBe(9999);
  });

  it('returns DEFAULT_PROFILES unchanged for malformed JSON', () => {
    const result = loadProfiles('{ this is not valid json !!!');
    expect(result).toHaveLength(DEFAULT_PROFILES.length);
    expect(result.map((p) => p.agentId)).toEqual(
      DEFAULT_PROFILES.map((p) => p.agentId),
    );
  });
});
