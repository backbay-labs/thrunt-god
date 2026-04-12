import { describe, it, expect } from 'vitest';
import { ENTITY_TYPES, ENTITY_FOLDERS } from '../entity-schema';
import { getEntityFolder } from '../paths';

describe('ENTITY_TYPES', () => {
  it('has exactly 8 entries', () => {
    expect(ENTITY_TYPES).toHaveLength(8);
  });

  it('has all 8 expected type strings', () => {
    const types = ENTITY_TYPES.map((e) => e.type);
    expect(types).toContain('ioc/ip');
    expect(types).toContain('ioc/domain');
    expect(types).toContain('ioc/hash');
    expect(types).toContain('ttp');
    expect(types).toContain('actor');
    expect(types).toContain('tool');
    expect(types).toContain('infrastructure');
    expect(types).toContain('datasource');
  });

  it('IOC types share folder "entities/iocs"', () => {
    const iocTypes = ENTITY_TYPES.filter((e) => e.type.startsWith('ioc/'));
    expect(iocTypes).toHaveLength(3);
    for (const ioc of iocTypes) {
      expect(ioc.folder).toBe('entities/iocs');
    }
  });

  it('non-IOC types each have distinct folders', () => {
    const nonIocTypes = ENTITY_TYPES.filter((e) => !e.type.startsWith('ioc/'));
    const folders = nonIocTypes.map((e) => e.folder);
    expect(new Set(folders).size).toBe(folders.length);
  });

  it('every type has non-empty label and folder', () => {
    for (const entity of ENTITY_TYPES) {
      expect(entity.label.trim().length).toBeGreaterThan(0);
      expect(entity.folder.trim().length).toBeGreaterThan(0);
    }
  });

  it('every starterTemplate returns a string starting with "---"', () => {
    for (const entity of ENTITY_TYPES) {
      const template = entity.starterTemplate('test');
      expect(template.startsWith('---')).toBe(true);
    }
  });

  it('IOC/IP template contains required fields and sections', () => {
    const iocIp = ENTITY_TYPES.find((e) => e.type === 'ioc/ip')!;
    const template = iocIp.starterTemplate('test');
    expect(template).toContain('type: ioc/ip');
    expect(template).toContain('value:');
    expect(template).toContain('first_seen:');
    expect(template).toContain('## Sightings');
    expect(template).toContain('## Related');
  });

  it('IOC/Domain template contains type: ioc/domain', () => {
    const iocDomain = ENTITY_TYPES.find((e) => e.type === 'ioc/domain')!;
    const template = iocDomain.starterTemplate('test');
    expect(template).toContain('type: ioc/domain');
    expect(template).toContain('value:');
    expect(template).toContain('first_seen:');
    expect(template).toContain('last_seen:');
  });

  it('IOC/Hash template contains hash_type field', () => {
    const iocHash = ENTITY_TYPES.find((e) => e.type === 'ioc/hash')!;
    const template = iocHash.starterTemplate('test');
    expect(template).toContain('type: ioc/hash');
    expect(template).toContain('hash_type:');
    expect(template).toContain('value:');
  });

  it('TTP template contains required fields', () => {
    const ttp = ENTITY_TYPES.find((e) => e.type === 'ttp')!;
    const template = ttp.starterTemplate('test');
    expect(template).toContain('type: ttp');
    expect(template).toContain('mitre_id:');
    expect(template).toContain('tactic:');
    expect(template).toContain('hunt_count: 0');
  });

  it('Actor template contains required fields', () => {
    const actor = ENTITY_TYPES.find((e) => e.type === 'actor')!;
    const template = actor.starterTemplate('test');
    expect(template).toContain('type: actor');
    expect(template).toContain('aliases:');
    expect(template).toContain('mitre_group_id:');
  });

  it('Tool template contains required fields', () => {
    const tool = ENTITY_TYPES.find((e) => e.type === 'tool')!;
    const template = tool.starterTemplate('test');
    expect(template).toContain('type: tool');
    expect(template).toContain('category:');
    expect(template).toContain('associated_actors:');
    expect(template).toContain('associated_ttps:');
  });

  it('Infrastructure template contains required fields', () => {
    const infra = ENTITY_TYPES.find((e) => e.type === 'infrastructure')!;
    const template = infra.starterTemplate('test');
    expect(template).toContain('type: infrastructure');
    expect(template).toContain('kind:');
    expect(template).toContain('associated_actors:');
    expect(template).toContain('ioc_refs:');
  });

  it('Data Source template contains required fields', () => {
    const ds = ENTITY_TYPES.find((e) => e.type === 'datasource')!;
    const template = ds.starterTemplate('test');
    expect(template).toContain('type: datasource');
    expect(template).toContain('platform:');
    expect(template).toContain('retention:');
    expect(template).toContain('coverage_ttps:');
  });

  it('all templates use snake_case field names (no camelCase)', () => {
    const camelCasePattern = /^[a-z]+[A-Z]/;
    for (const entity of ENTITY_TYPES) {
      const template = entity.starterTemplate('test');
      // Extract YAML keys from frontmatter
      const frontmatter = template.split('---')[1];
      const lines = frontmatter.split('\n');
      for (const line of lines) {
        const keyMatch = line.match(/^(\w+):/);
        if (keyMatch) {
          expect(keyMatch[1]).not.toMatch(camelCasePattern);
        }
      }
    }
  });

  it('all templates include ## Sightings and ## Related sections', () => {
    for (const entity of ENTITY_TYPES) {
      const template = entity.starterTemplate('test');
      expect(template).toContain('## Sightings');
      expect(template).toContain('## Related');
    }
  });
});

describe('ENTITY_FOLDERS', () => {
  it('has exactly 6 entries (unique folders)', () => {
    expect(ENTITY_FOLDERS).toHaveLength(6);
  });

  it('contains all expected folder paths', () => {
    expect(ENTITY_FOLDERS).toContain('entities/iocs');
    expect(ENTITY_FOLDERS).toContain('entities/ttps');
    expect(ENTITY_FOLDERS).toContain('entities/actors');
    expect(ENTITY_FOLDERS).toContain('entities/tools');
    expect(ENTITY_FOLDERS).toContain('entities/infra');
    expect(ENTITY_FOLDERS).toContain('entities/datasources');
  });

  it('has no duplicates', () => {
    expect(new Set(ENTITY_FOLDERS).size).toBe(ENTITY_FOLDERS.length);
  });
});

describe('getEntityFolder', () => {
  it('resolves entity folder under planning dir', () => {
    expect(getEntityFolder('planning', 'entities/iocs')).toBe(
      'planning/entities/iocs',
    );
  });

  it('normalizes trailing slashes', () => {
    expect(getEntityFolder('planning/', 'entities/ttps/')).toBe(
      'planning/entities/ttps',
    );
  });

  it('normalizes double slashes', () => {
    expect(getEntityFolder('planning//', 'entities//actors')).toBe(
      'planning/entities/actors',
    );
  });
});
