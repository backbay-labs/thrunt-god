# Phase 68: Entity Note Schema + ATT&CK Ontology Scaffold - Research

**Researched:** 2026-04-12
**Domain:** Obsidian plugin -- entity type registry, ATT&CK technique note generation, workspace bootstrap extension
**Confidence:** HIGH

## Summary

Phase 68 adds a knowledge schema to the THRUNT God Obsidian plugin. The work divides into three concrete deliverables: (1) an `ENTITY_TYPES` registry defining 8 entity types with typed YAML frontmatter schemas and canonical folder locations, (2) a "Scaffold ATT&CK ontology" command that generates 161 parent technique notes from the bundled `mitre-attack-enterprise.json`, and (3) extending the existing `bootstrap()` to create entity folder structure alongside core artifacts.

The codebase is well-prepared for this work. The `CORE_ARTIFACTS` registry in `artifacts.ts` provides a direct model for the new `ENTITY_TYPES` registry. The `VaultAdapter` interface already exposes `ensureFolder()`, `createFile()`, and `fileExists()` -- exactly the primitives needed for scaffold generation. The ATT&CK JSON (85KB, 161 parent techniques, 397 sub-techniques, 14 tactics) lives at `apps/mcp/data/mitre-attack-enterprise.json` and can be imported directly by esbuild (v0.25.12 handles JSON imports natively). The `WorkspaceService.bootstrap()` method is the natural extension point for entity folder creation. All new modules follow the established pattern: pure data modules (no Obsidian imports) for registries and schemas, pure functions for generation logic, Vitest for testing.

**Primary recommendation:** Create a new `entity-schema.ts` pure data module for the entity type registry, a `scaffold.ts` pure-function module for ATT&CK note generation, and extend `workspace.ts:bootstrap()` for folder creation. Copy the ATT&CK JSON into `apps/obsidian/data/` and import it directly (esbuild bundles JSON). Register the scaffold command in `main.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**ATT&CK Scaffold Scope:**
- Generate parent techniques only (~161 notes) -- sub-techniques referenced as sections within parent notes, not separate files
- Bundle `mitre-attack-enterprise.json` in the plugin package (already exists at `apps/mcp/data/`) -- works offline, no MCP dependency for scaffold
- Multi-tactic techniques get a single note with `tactic` frontmatter as array (e.g., `["Initial Access", "Persistence"]`)
- Note naming: `T1059.001 -- PowerShell.md` (ID + separator + name) -- human-readable, sortable, wiki-linkable

**Entity Schema Design:**
- Flat entity folders under `entities/` with type subfolders: `entities/iocs/`, `entities/ttps/`, `entities/actors/`, `entities/tools/`, `entities/infra/`, `entities/datasources/`
- Single `entities/iocs/` folder with IOC type differentiated by frontmatter (`type: ioc/ip`, `type: ioc/domain`, `type: ioc/hash`)
- Frontmatter fields use snake_case (`hunt_refs`, `first_seen`, `mitre_id`) -- consistent with existing templates and Dataview conventions
- File name IS the entity ID (e.g., `192.168.1.100.md`, `T1059.001 -- PowerShell.md`, `APT29.md`) -- no separate ID field

**Bootstrap Integration:**
- Entity folder structure created during `bootstrap()` alongside core artifacts -- analyst gets `entities/` folders from "Create mission scaffold"
- ATT&CK scaffold is a SEPARATE command "Scaffold ATT&CK ontology" -- heavier operation (~161 files), explicit opt-in, not auto-run during bootstrap
- Idempotency: skip files that already exist (content-agnostic) -- simplest approach, preserves any user edits
- New `ENTITY_TYPES` registry in `entity-schema.ts` -- entity types are structurally different from `CORE_ARTIFACTS` (generated vs hand-edited, many vs few)

### Claude's Discretion
- Internal module structure and function signatures for entity note generation
- Template content for the `## Sightings` and `## Related` sections in entity notes
- How sub-techniques are referenced within parent technique notes (section heading vs bullet list)
- Test strategy for scaffold (unit tests for template generation, fixture-based tests for ATT&CK parsing)

### Deferred Ideas (OUT OF SCOPE)
- MCP-based technique enrichment (Phase 73 -- MCP Enrichment)
- Entity extraction from agent output (Phase 71 -- Ingestion Engine)
- Sidebar entity counts (Phase 69 -- Knowledge Base Dashboard)
- Dataview query library (Phase 69 -- Knowledge Base Dashboard)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONTO-01 | Plugin can scaffold ATT&CK technique notes (~200) with typed frontmatter from a single command | ATT&CK JSON contains 161 parent techniques. Scaffold command generates notes with frontmatter from parsed JSON. Sub-techniques listed within parent notes. Entity schema defines TTP frontmatter fields. |
| ONTO-02 | Entity note types (IOC/IP, IOC/domain, IOC/hash, TTP, actor, tool, infrastructure, data source) each have a canonical folder and YAML frontmatter schema | `ENTITY_TYPES` registry defines all 8 types with folder paths, frontmatter field schemas, and starter templates. IOC subtypes share `entities/iocs/` folder, differentiated by `type` field. |
| ONTO-03 | Workspace bootstrap creates entity folder structure alongside core artifacts | `WorkspaceService.bootstrap()` extended to iterate `ENTITY_TYPES` and call `ensureFolder()` for each entity folder after creating core artifacts. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| obsidian | ^1.6.0 | Obsidian plugin API (already pinned) | Platform requirement |
| vitest | ^3.1.1 | Test runner for pure function tests (already installed) | Established project pattern |
| esbuild | ^0.25.5 | Bundler -- handles JSON imports natively (already installed) | Established project build |
| typescript | ^5.8.3 | Type checking (already installed) | Established project language |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | All dependencies already installed | No new packages needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON import for ATT&CK data | fetch() at runtime | JSON import bundles into main.js, works offline, no async init needed |
| Single `entity-schema.ts` | Separate file per entity type | Single file is simpler for 8 types; split only if file exceeds ~300 lines |
| Skip-if-exists idempotency | Content hash comparison | Skip-if-exists is simpler, user-proof, and explicitly chosen in CONTEXT.md |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
cd apps/obsidian && bun run test  # Verify baseline
```

## Architecture Patterns

### Recommended Project Structure
```
apps/obsidian/src/
  artifacts.ts          # Existing CORE_ARTIFACTS registry (untouched)
  entity-schema.ts      # NEW: ENTITY_TYPES registry, entity frontmatter types, template generators
  scaffold.ts           # NEW: ATT&CK scaffold logic -- pure functions, no Obsidian imports
  paths.ts              # EXTEND: add getEntityPath() and getEntityFolder()
  workspace.ts          # EXTEND: bootstrap() creates entity folders
  main.ts               # EXTEND: register "Scaffold ATT&CK ontology" command
  types.ts              # EXTEND: EntityTypeDefinition, ScaffoldResult types
  vault-adapter.ts      # UNCHANGED (already has all needed methods)
  __tests__/
    entity-schema.test.ts   # NEW: registry validation tests
    scaffold.test.ts        # NEW: template generation + ATT&CK parsing tests

apps/obsidian/data/
  mitre-attack-enterprise.json  # COPY from apps/mcp/data/ (bundled by esbuild)
```

### Pattern 1: Entity Type Registry (mirrors CORE_ARTIFACTS)
**What:** A readonly array of entity type definitions with folder paths, frontmatter schemas, and templates
**When to use:** Defining the canonical set of entity types
**Example:**
```typescript
// entity-schema.ts -- pure data module, no Obsidian imports
export interface EntityTypeDefinition {
  type: string;           // e.g. "ioc/ip", "ttp", "actor"
  label: string;          // e.g. "IOC (IP Address)"
  folder: string;         // e.g. "entities/iocs" (relative to planning dir)
  frontmatterSchema: Record<string, FrontmatterFieldDef>;
  starterTemplate: (name: string) => string;  // template generator function
}

export const ENTITY_TYPES: readonly EntityTypeDefinition[] = Object.freeze([
  // ... 8 entity types
]);

export const ENTITY_FOLDERS: readonly string[] = Object.freeze([
  'entities/iocs',
  'entities/ttps',
  'entities/actors',
  'entities/tools',
  'entities/infra',
  'entities/datasources',
]);
```

### Pattern 2: Pure Scaffold Generator Functions
**What:** Stateless functions that transform ATT&CK JSON data into note content strings
**When to use:** Generating technique note markdown from structured data
**Example:**
```typescript
// scaffold.ts -- pure functions, no Obsidian imports
import attackData from '../data/mitre-attack-enterprise.json';

export interface TechniqueData {
  id: string;
  name: string;
  tactic: string;         // comma-separated if multi-tactic
  description: string;
  sub_techniques: Array<{ id: string; name: string }>;
  platforms: string[];
  data_sources: string[];
}

export function generateTechniqueNote(technique: TechniqueData): string {
  const tactics = technique.tactic.split(', ').map(t => t.trim());
  const tacticYaml = tactics.length === 1
    ? tactics[0]
    : `[${tactics.map(t => `"${t}"`).join(', ')}]`;
  // ... generate full note content
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '-');
}

export function getTechniqueFileName(technique: TechniqueData): string {
  return `${technique.id} -- ${sanitizeFileName(technique.name)}.md`;
}

export function getParentTechniques(): TechniqueData[] {
  return attackData.techniques;
}
```

### Pattern 3: Scaffold Command (workspace.ts extension)
**What:** A method on WorkspaceService that generates all technique notes idempotently
**When to use:** The "Scaffold ATT&CK ontology" command handler
**Example:**
```typescript
// In workspace.ts or a new scaffold-service.ts
async scaffoldAttack(): Promise<ScaffoldResult> {
  const planningDir = getPlanningDir(...);
  const ttpsFolder = getEntityFolder(planningDir, 'ttps');
  await this.vaultAdapter.ensureFolder(ttpsFolder);

  const techniques = getParentTechniques();
  let created = 0, skipped = 0;

  for (const technique of techniques) {
    const fileName = getTechniqueFileName(technique);
    const path = normalizePath(`${ttpsFolder}/${fileName}`);
    if (this.vaultAdapter.fileExists(path)) {
      skipped++;
      continue;
    }
    const content = generateTechniqueNote(technique);
    await this.vaultAdapter.createFile(path, content);
    created++;
  }

  this.invalidate();
  return { created, skipped, total: techniques.length };
}
```

### Anti-Patterns to Avoid
- **Importing Obsidian in entity-schema.ts or scaffold.ts:** These modules must remain pure (no Obsidian imports) for testability. All vault I/O goes through VaultAdapter.
- **Auto-running scaffold during bootstrap:** The scaffold creates ~161 files. It must be an explicit, separate command per CONTEXT.md decision. Bootstrap only creates empty entity folders.
- **Content-aware idempotency (hashing/diffing):** CONTEXT.md explicitly chose "skip files that already exist (content-agnostic)" as the simplest approach. Do NOT build content hash comparison for Phase 68.
- **Creating sub-technique files:** CONTEXT.md decision is parent techniques only. Sub-techniques are sections within parent notes. Do NOT create ~397 additional files.
- **Generating YAML arrays inline without quoting:** Multi-tactic and platforms arrays must be valid YAML. Use explicit array syntax `["A", "B"]` not bare comma-separated values.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter generation | Custom YAML serializer | String template with careful quoting | Only need flat key-value pairs + arrays; full YAML library is overkill |
| File path sanitization | Per-character replacement logic | Simple regex `replace(/[\/\\:*?"<>|]/g, '-')` | 6 parent techniques have `/` in names; this covers all OS-unsafe characters |
| JSON data loading | Runtime fetch/read from disk | esbuild JSON import (`import data from '../data/file.json'`) | Bundles into main.js, works offline, zero async overhead |
| Obsidian file operations | Direct `app.vault` calls | Existing `VaultAdapter` interface | Already abstracts all needed operations; testable via stubs |
| Folder creation with nesting | Manual mkdir-p logic | Existing `VaultAdapter.ensureFolder()` | Already handles path splitting and incremental creation |

**Key insight:** The existing codebase already provides all the infrastructure primitives this phase needs. The work is defining data schemas and writing pure generation functions, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: File Name Sanitization for ATT&CK Techniques
**What goes wrong:** 6 parent techniques contain `/` in their names (e.g., "Scheduled Task/Job", "Deobfuscate/Decode Files or Information"). Using unsanitized names as file names creates subdirectory paths instead of files.
**Why it happens:** The CONTEXT.md naming convention is `T1053 -- Scheduled Task/Job.md` which contains a `/`.
**How to avoid:** Sanitize technique names before using as file names. Replace `/` and other OS-unsafe characters with `-`. `T1053 -- Scheduled Task-Job.md` is readable and safe.
**Warning signs:** Tests pass on macOS but fail on Windows, or files silently created in wrong directories.

### Pitfall 2: Multi-Tactic YAML Array Format
**What goes wrong:** The ATT&CK JSON stores tactics as a comma-separated string (`"Defense Evasion, Persistence, Privilege Escalation, Initial Access"`). Naively dumping this into YAML frontmatter creates invalid YAML or an unquoted string that Dataview cannot query as an array.
**Why it happens:** 25 of 161 parent techniques have multi-tactic associations. The tactic field must be a proper YAML array for Dataview queries like `WHERE contains(tactic, "Persistence")`.
**How to avoid:** Parse the comma-separated string into an array. For single-tactic techniques, use a bare string. For multi-tactic, use YAML array syntax: `tactic: ["Defense Evasion", "Persistence"]`. This matches CONTEXT.md decision.
**Warning signs:** Dataview queries for specific tactics return 0 results when techniques exist.

### Pitfall 3: Bootstrap Entity Folders Must Be Under Planning Dir
**What goes wrong:** Creating `entities/` at vault root instead of under the configured planning directory. The user may have `planningDir` set to `.hunt` or `.thrunt`.
**Why it happens:** CONTEXT.md says `entities/iocs/` but doesn't explicitly say whether this is under `planningDir` or vault root. The existing pattern (core artifacts) is always under `planningDir`.
**How to avoid:** Entity folders are `{planningDir}/entities/iocs/`, `{planningDir}/entities/ttps/`, etc. Use `getEntityFolder(planningDir, entityType)` that calls through `normalizePath()`.
**Warning signs:** Switching `planningDir` setting leaves orphaned `entities/` folders.

### Pitfall 4: esbuild JSON Import Configuration
**What goes wrong:** TypeScript compilation errors when importing `.json` files, or the JSON not being bundled into the output.
**Why it happens:** tsconfig.json needs `resolveJsonModule: true` and `esModuleInterop: true` for JSON imports. The current tsconfig does NOT have `resolveJsonModule`.
**How to avoid:** Add `"resolveJsonModule": true` to `tsconfig.json` compilerOptions. esbuild itself handles JSON imports natively regardless of tsconfig, but TypeScript type-checking needs it. Alternatively, type the import with a `.d.ts` declaration file.
**Warning signs:** `tsc --noEmit` fails but esbuild build succeeds (divergent behavior).

### Pitfall 5: ATT&CK Data File Location
**What goes wrong:** Importing from `../../mcp/data/mitre-attack-enterprise.json` creates a fragile cross-package dependency. If the MCP package moves or the JSON format changes, the Obsidian plugin breaks silently.
**Why it happens:** The JSON exists at `apps/mcp/data/` and CONTEXT.md says to "copy or reference it."
**How to avoid:** Copy the JSON file to `apps/obsidian/data/mitre-attack-enterprise.json`. Import from the local copy. This follows the CONTEXT.md decision to "bundle in the plugin package" and eliminates cross-package coupling.
**Warning signs:** Build breaks after MCP package refactoring.

### Pitfall 6: Scaffold Command Performance
**What goes wrong:** Creating 161 files sequentially with individual `createFile()` calls can be slow in Obsidian (each triggers vault events).
**Why it happens:** The vault adapter's `createFile()` calls `app.vault.create()` which triggers Obsidian's indexing per file.
**How to avoid:** This is an accepted tradeoff -- scaffold is a one-time operation. Show a Notice with progress or final count. Consider batching by creating all content first, then writing. The refresh callback in `main.ts` should NOT trigger 161 re-renders; `invalidate()` once after all writes.
**Warning signs:** Obsidian UI freezes during scaffold.

## Code Examples

### Entity Type Registry Structure
```typescript
// entity-schema.ts
export interface FrontmatterFieldDef {
  key: string;
  type: 'string' | 'number' | 'string[]' | 'date';
  default: string | number | string[] | null;
  required: boolean;
}

export interface EntityTypeDefinition {
  type: string;           // "ioc/ip", "ioc/domain", "ioc/hash", "ttp", "actor", "tool", "infrastructure", "datasource"
  label: string;          // Human-readable label
  folder: string;         // Relative folder under planningDir: "entities/iocs", "entities/ttps", etc.
  frontmatterFields: FrontmatterFieldDef[];
  starterTemplate: (name: string) => string;
}

// From MILESTONES-v2.md section 3.1:
export const ENTITY_TYPES: readonly EntityTypeDefinition[] = Object.freeze([
  {
    type: 'ioc/ip',
    label: 'IOC (IP Address)',
    folder: 'entities/iocs',
    frontmatterFields: [
      { key: 'type', type: 'string', default: 'ioc/ip', required: true },
      { key: 'value', type: 'string', default: '', required: true },
      { key: 'first_seen', type: 'date', default: '', required: false },
      { key: 'last_seen', type: 'date', default: '', required: false },
      { key: 'hunt_refs', type: 'string[]', default: [], required: false },
      { key: 'confidence', type: 'string', default: '', required: false },
      { key: 'verdict', type: 'string', default: '', required: false },
    ],
    starterTemplate: (name: string) => `---
type: ioc/ip
value: "${name}"
first_seen: ""
last_seen: ""
hunt_refs: []
confidence: ""
verdict: ""
---
# ${name}

## Sightings

_No sightings recorded yet._

## Related

`,
  },
  // ... similar entries for ioc/domain, ioc/hash, ttp, actor, tool, infrastructure, datasource
]);

export const ENTITY_FOLDERS: readonly string[] = Object.freeze([
  'entities/iocs',
  'entities/ttps',
  'entities/actors',
  'entities/tools',
  'entities/infra',
  'entities/datasources',
]);
```

### ATT&CK Technique Note Template
```typescript
// scaffold.ts
export function generateTechniqueNote(technique: TechniqueData): string {
  // Parse multi-tactic
  const tactics = technique.tactic.split(',').map(t => t.trim());
  const tacticYaml = tactics.length === 1
    ? `"${tactics[0]}"`
    : `[${tactics.map(t => `"${t}"`).join(', ')}]`;

  const platformsYaml = `[${technique.platforms.map(p => `"${p}"`).join(', ')}]`;
  const dataSourcesYaml = `[${technique.data_sources.map(d => `"${d}"`).join(', ')}]`;

  let content = `---
type: ttp
mitre_id: "${technique.id}"
tactic: ${tacticYaml}
name: "${technique.name}"
platforms: ${platformsYaml}
data_sources: ${dataSourcesYaml}
hunt_count: 0
last_hunted: ""
---
# ${technique.id} -- ${technique.name}

${technique.description}

`;

  // Sub-techniques section (if any)
  if (technique.sub_techniques.length > 0) {
    content += `## Sub-Techniques\n\n`;
    for (const sub of technique.sub_techniques) {
      content += `- **${sub.id}** ${sub.name}\n`;
    }
    content += '\n';
  }

  content += `## Sightings

_No hunts have targeted this technique yet._

## Detections

## Related

`;

  return content;
}
```

### Bootstrap Extension
```typescript
// In workspace.ts bootstrap()
async bootstrap(): Promise<void> {
  const planningDir = getPlanningDir(
    this.getSettings().planningDir,
    this.defaultPlanningDir,
  );

  await this.vaultAdapter.ensureFolder(planningDir);

  // Core artifacts (existing)
  for (const artifact of CORE_ARTIFACTS) {
    const path = getCoreFilePath(planningDir, artifact.fileName);
    if (!this.vaultAdapter.fileExists(path)) {
      await this.vaultAdapter.createFile(path, artifact.starterTemplate);
    }
  }

  // Entity folders (new)
  for (const folder of ENTITY_FOLDERS) {
    await this.vaultAdapter.ensureFolder(
      normalizePath(`${planningDir}/${folder}`),
    );
  }

  this.invalidate();
}
```

### File Name Sanitization
```typescript
// scaffold.ts
const UNSAFE_CHARS = /[\/\\:*?"<>|]/g;

export function sanitizeFileName(name: string): string {
  return name.replace(UNSAFE_CHARS, '-');
}

export function getTechniqueFileName(technique: TechniqueData): string {
  const safeName = sanitizeFileName(technique.name);
  return `${technique.id} -- ${safeName}.md`;
}

// Results for the 6 problematic techniques:
// T1053 -- Scheduled Task-Job.md
// T1140 -- Deobfuscate-Decode Files or Information.md
// T1497 -- Virtualization-Sandbox Evasion.md
// T1033 -- System Owner-User Discovery.md
// T1529 -- System Shutdown-Reboot.md
// T1593 -- Search Open Websites-Domains.md
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 5 core artifacts only | 5 core + 8 entity types | Phase 68 | Entity notes become first-class citizens with typed frontmatter |
| Bootstrap creates only core files | Bootstrap creates core files + entity folders | Phase 68 | New workspaces are entity-ready from day one |
| No ATT&CK integration | 161 scaffolded technique notes | Phase 68 | Dataview can immediately query techniques by tactic, platform, hunt count |
| Obsidian plugin as workspace viewer | Plugin as knowledge schema owner | Phase 68 (start of v4.0) | Foundation for ingestion, enrichment, and cross-hunt intelligence |

**Existing codebase patterns preserved:**
- Pure data modules for registries (same as `artifacts.ts`)
- VaultAdapter for all file I/O (same as `workspace.ts`)
- Vitest for pure function testing (same as existing test suite)
- snake_case frontmatter fields (consistent with Dataview conventions)
- `thrunt-artifact` type identifiers in frontmatter (extended with `type: ttp`, `type: ioc/ip`, etc.)

## Open Questions

1. **Sub-technique reference format within parent notes**
   - What we know: CONTEXT.md says "sub-techniques referenced as sections within parent notes" and leaves format (section heading vs bullet list) to Claude's discretion
   - Recommendation: Use a `## Sub-Techniques` heading with a bullet list of `**T1059.001** PowerShell` entries. This is lightweight, scannable, and wiki-linkable if sub-technique notes are ever created in the future.

2. **ATT&CK JSON copy vs symlink**
   - What we know: CONTEXT.md says "Bundle in plugin package." The JSON is 85KB. esbuild bundles JSON imports into main.js.
   - Recommendation: Physical copy to `apps/obsidian/data/`. A symlink would break in production builds. The 85KB cost is trivial when bundled.

3. **tsconfig.json resolveJsonModule**
   - What we know: Current tsconfig does NOT have `resolveJsonModule: true`. esbuild handles JSON regardless, but `tsc --noEmit` will fail on JSON imports.
   - Recommendation: Add `"resolveJsonModule": true` to tsconfig.json compilerOptions. This is standard TypeScript configuration for JSON imports. Also verify `esModuleInterop` is available (current config has `allowSyntheticDefaultImports: true` which partially covers this).

4. **Scaffold progress feedback**
   - What we know: Creating 161 files will take a few seconds. Obsidian's `Notice` API supports both transient and sticky notices.
   - Recommendation: Show a final Notice with counts: "ATT&CK ontology scaffolded: 161 created, 0 skipped." For the first run. On subsequent runs: "ATT&CK ontology: 0 created, 161 skipped (already exist)." No progress bar needed for <200 files.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.1.1 (already installed) |
| Config file | none -- vitest runs via package.json script |
| Quick run command | `cd apps/obsidian && bun run test` |
| Full suite command | `cd apps/obsidian && bun run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONTO-01 | Scaffold generates 161 technique notes with correct frontmatter | unit | `cd apps/obsidian && npx vitest run src/__tests__/scaffold.test.ts -x` | Wave 0 |
| ONTO-01 | Generated frontmatter has valid YAML with required fields | unit | `cd apps/obsidian && npx vitest run src/__tests__/scaffold.test.ts -x` | Wave 0 |
| ONTO-01 | Multi-tactic techniques produce array tactic field | unit | `cd apps/obsidian && npx vitest run src/__tests__/scaffold.test.ts -x` | Wave 0 |
| ONTO-01 | File names are sanitized (no `/` or OS-unsafe chars) | unit | `cd apps/obsidian && npx vitest run src/__tests__/scaffold.test.ts -x` | Wave 0 |
| ONTO-01 | Scaffold is idempotent (skips existing files) | unit | `cd apps/obsidian && npx vitest run src/__tests__/scaffold.test.ts -x` | Wave 0 |
| ONTO-02 | ENTITY_TYPES registry has 8 entries covering all entity types | unit | `cd apps/obsidian && npx vitest run src/__tests__/entity-schema.test.ts -x` | Wave 0 |
| ONTO-02 | Each entity type has non-empty folder, frontmatter schema, starter template | unit | `cd apps/obsidian && npx vitest run src/__tests__/entity-schema.test.ts -x` | Wave 0 |
| ONTO-02 | Entity templates produce valid YAML frontmatter | unit | `cd apps/obsidian && npx vitest run src/__tests__/entity-schema.test.ts -x` | Wave 0 |
| ONTO-02 | IOC types share folder but differ by type field | unit | `cd apps/obsidian && npx vitest run src/__tests__/entity-schema.test.ts -x` | Wave 0 |
| ONTO-03 | Bootstrap creates all 6 entity folders | unit | `cd apps/obsidian && npx vitest run src/__tests__/workspace.test.ts -x` | Extend existing |
| ONTO-03 | Bootstrap entity folder creation is idempotent | unit | `cd apps/obsidian && npx vitest run src/__tests__/workspace.test.ts -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `cd apps/obsidian && bun run test`
- **Per wave merge:** `cd apps/obsidian && bun run test && bun run typecheck`
- **Phase gate:** Full suite green + typecheck before verify

### Wave 0 Gaps
- [ ] `src/__tests__/entity-schema.test.ts` -- covers ONTO-02 (entity type registry validation)
- [ ] `src/__tests__/scaffold.test.ts` -- covers ONTO-01 (ATT&CK note generation + idempotency)
- [ ] Extend `src/__tests__/workspace.test.ts` -- covers ONTO-03 (bootstrap entity folder creation)
- [ ] `apps/obsidian/data/mitre-attack-enterprise.json` -- copied from `apps/mcp/data/`
- [ ] `tsconfig.json` update -- add `resolveJsonModule: true`

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** Direct reading of all 16 source files in `apps/obsidian/src/` -- full understanding of current architecture, patterns, and extension points
- **ATT&CK JSON:** `apps/mcp/data/mitre-attack-enterprise.json` -- 161 parent techniques, 397 sub-techniques, 14 tactics, 25 multi-tactic techniques, 6 techniques with `/` in names
- **MILESTONES-v2.md:** Section 3.1 defines exact frontmatter schemas for all 8 entity types
- **68-CONTEXT.md:** All implementation decisions locked and documented

### Secondary (MEDIUM confidence)
- **esbuild JSON import:** esbuild v0.25 handles JSON imports natively with `bundle: true` -- verified from esbuild documentation and version check

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing tooling sufficient
- Architecture: HIGH -- direct extension of established patterns (CORE_ARTIFACTS registry, VaultAdapter, WorkspaceService)
- Pitfalls: HIGH -- identified from direct codebase analysis (file name sanitization verified against actual ATT&CK data, tsconfig gap verified by reading config)

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain, no external dependency changes expected)
