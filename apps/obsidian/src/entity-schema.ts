import type { EntityTypeDefinition } from './types';

/**
 * Canonical entity type registry. Single source of truth for all entity
 * types, their folder locations, frontmatter schemas, and starter templates.
 *
 * Pure data module -- NO Obsidian imports. Safe for testing and CLI usage.
 *
 * Order: IOC/IP, IOC/Domain, IOC/Hash, TTP, Actor, Tool, Infrastructure, Data Source
 * Per MILESTONES-v2.md section 3.1
 */
export const ENTITY_TYPES: readonly EntityTypeDefinition[] = Object.freeze([
  {
    type: 'ioc/ip',
    label: 'IOC (IP)',
    folder: 'entities/iocs',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'ioc/ip', required: true },
      { key: 'value', type: 'string', default: '', required: true },
      { key: 'first_seen', type: 'date', default: null, required: false },
      { key: 'last_seen', type: 'date', default: null, required: false },
      { key: 'hunt_refs', type: 'string[]', default: [], required: false },
      { key: 'confidence', type: 'string', default: '', required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: ioc/ip
value: ""
first_seen: ""
last_seen: ""
hunt_refs: []
confidence: ""
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  {
    type: 'ioc/domain',
    label: 'IOC (Domain)',
    folder: 'entities/iocs',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'ioc/domain', required: true },
      { key: 'value', type: 'string', default: '', required: true },
      { key: 'first_seen', type: 'date', default: null, required: false },
      { key: 'last_seen', type: 'date', default: null, required: false },
      { key: 'hunt_refs', type: 'string[]', default: [], required: false },
      { key: 'confidence', type: 'string', default: '', required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: ioc/domain
value: ""
first_seen: ""
last_seen: ""
hunt_refs: []
confidence: ""
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  {
    type: 'ioc/hash',
    label: 'IOC (Hash)',
    folder: 'entities/iocs',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'ioc/hash', required: true },
      { key: 'hash_type', type: 'string', default: 'sha256', required: false },
      { key: 'value', type: 'string', default: '', required: true },
      { key: 'first_seen', type: 'date', default: null, required: false },
      { key: 'hunt_refs', type: 'string[]', default: [], required: false },
      { key: 'confidence', type: 'string', default: '', required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: ioc/hash
hash_type: sha256
value: ""
first_seen: ""
hunt_refs: []
confidence: ""
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  {
    type: 'ttp',
    label: 'TTP',
    folder: 'entities/ttps',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'ttp', required: true },
      { key: 'mitre_id', type: 'string', default: '', required: true },
      { key: 'tactic', type: 'string', default: '', required: false },
      { key: 'platforms', type: 'string[]', default: [], required: false },
      { key: 'data_sources', type: 'string[]', default: [], required: false },
      { key: 'hunt_count', type: 'number', default: 0, required: false },
      { key: 'last_hunted', type: 'date', default: null, required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: ttp
mitre_id: ""
tactic: ""
platforms: []
data_sources: []
hunt_count: 0
last_hunted: ""
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  {
    type: 'actor',
    label: 'Actor',
    folder: 'entities/actors',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'actor', required: true },
      { key: 'aliases', type: 'string[]', default: [], required: false },
      { key: 'mitre_group_id', type: 'string', default: '', required: false },
      { key: 'associated_ttps', type: 'string[]', default: [], required: false },
      { key: 'hunt_refs', type: 'string[]', default: [], required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: actor
aliases: []
mitre_group_id: ""
associated_ttps: []
hunt_refs: []
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  {
    type: 'tool',
    label: 'Tool / Malware',
    folder: 'entities/tools',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'tool', required: true },
      { key: 'category', type: 'string', default: '', required: false },
      { key: 'associated_actors', type: 'string[]', default: [], required: false },
      { key: 'associated_ttps', type: 'string[]', default: [], required: false },
      { key: 'hunt_refs', type: 'string[]', default: [], required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: tool
category: ""
associated_actors: []
associated_ttps: []
hunt_refs: []
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  {
    type: 'infrastructure',
    label: 'Infrastructure',
    folder: 'entities/infra',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'infrastructure', required: true },
      { key: 'kind', type: 'string', default: '', required: false },
      { key: 'associated_actors', type: 'string[]', default: [], required: false },
      { key: 'ioc_refs', type: 'string[]', default: [], required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: infrastructure
kind: ""
associated_actors: []
ioc_refs: []
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  {
    type: 'datasource',
    label: 'Data Source',
    folder: 'entities/datasources',
    frontmatterFields: [
      { key: 'schema_version', type: 'number', default: 1, required: true },
      { key: 'type', type: 'string', default: 'datasource', required: true },
      { key: 'platform', type: 'string', default: '', required: false },
      { key: 'retention', type: 'string', default: '', required: false },
      { key: 'coverage_ttps', type: 'string[]', default: [], required: false },
      { key: 'verdict', type: 'string', default: 'unknown', required: false },
    ],
    starterTemplate: (name: string) => `---
schema_version: 1
type: datasource
platform: ""
retention: ""
coverage_ttps: []
verdict: unknown
---
# ${name}

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`,
  },
]);

/**
 * Unique entity folder paths. Derived from ENTITY_TYPES but frozen
 * as a standalone constant for consumers that only need folder structure.
 */
export const ENTITY_FOLDERS: readonly string[] = Object.freeze([
  'entities/iocs',
  'entities/ttps',
  'entities/actors',
  'entities/tools',
  'entities/infra',
  'entities/datasources',
]);
