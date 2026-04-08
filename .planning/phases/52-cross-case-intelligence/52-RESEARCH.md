# Phase 52: Cross-Case Intelligence - Research

**Researched:** 2026-04-07
**Domain:** SQLite/FTS5 case artifact indexing, full-text search, better-sqlite3 native module integration
**Confidence:** HIGH

## Summary

This phase introduces the first SQLite database (`program.db`) to the thrunt-god runtime, using better-sqlite3 ^12.8.0 with FTS5 external content tables for cross-case full-text search. The core pattern is straightforward: on `cmdCaseClose`, read case artifacts (FINDINGS.md, HYPOTHESES.md, technique IDs, IOCs), insert into SQLite tables, and maintain an FTS5 index synchronized via explicit INSERT/DELETE commands (not triggers, since indexing is batch-oriented). On `cmdCaseNew`, run an FTS5 MATCH query plus a technique overlap query against the same database and return top 5 matches. A new `case-search` CLI command provides explicit search.

The primary risk is FTS5 tokenization of security-specific content (technique IDs like T1059, dotted IOCs like 192.168.1.1). The mitigation is separating structured fields (technique_ids as a B-tree column) from prose fields (findings/hypotheses text in FTS5), and using column weights in BM25 to boost high-signal matches.

**Primary recommendation:** Build a single `db.cjs` module with five exports (`openProgramDb`, `ensureSchema`, `indexCase`, `searchCases`, `findTechniqueOverlap`). Use FTS5 external content tables with `porter unicode61` tokenizer. Keep technique ID lookups in a separate `case_techniques` junction table with a B-tree index, not in FTS5.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Database file: `.planning/program.db` (per-program, lives alongside .planning/ artifacts)
- Engine: `better-sqlite3 ^12.8.0` (synchronous, in-process, FTS5 support built-in)
- WAL mode enabled on open: `PRAGMA journal_mode=WAL`
- Busy timeout: `PRAGMA busy_timeout=5000`
- Schema tables: `case_index`, `case_artifacts`, `case_artifacts_fts` (FTS5 virtual table)
- FTS5 external content pattern: `content=case_artifacts` with `porter unicode61` tokenizer
- Indexing trigger: `cmdCaseClose` call indexes all case artifacts into program.db
- Auto-search: `cmdCaseNew` runs FTS5 search + technique overlap, returns top 5 matches as `past_case_matches[]`
- CLI command: `thrunt-tools case-search <query> [--program <path>] [--limit N] [--technique T1078]`
- New module: `thrunt-god/bin/lib/db.cjs` with exports: `openProgramDb`, `ensureSchema`, `indexCase`, `searchCases`, `findTechniqueOverlap`
- `better-sqlite3` added to package.json as production dependency
- Idempotent re-indexing: re-closing a case replaces existing index entries (DELETE + INSERT)
- Silent failure: if no program.db exists or no matches found, return empty array (not an error)

### Claude's Discretion
- FTS5 snippet length and highlighting format
- Exact technique ID extraction regex refinement
- IOC extraction patterns (IP, domain, hash regexes)
- Database migration strategy for schema changes in future phases
- Whether to index QUERIES/ and RECEIPTS/ content (heavyweight -- may defer)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTEL-01 | Past case artifacts (findings, hypotheses, techniques, IOCs, outcomes) are indexed into SQLite+FTS5 on case close | db.cjs `indexCase` function, FTS5 external content table schema, artifact file parsing patterns, idempotent DELETE+INSERT |
| INTEL-02 | new-case auto-searches past cases for similar signals, hypotheses, and techniques, presenting matches to the hunter | db.cjs `searchCases`/`findTechniqueOverlap`, FTS5 MATCH with BM25, snippet extraction, integration into `cmdCaseNew` |
| INTEL-03 | thrunt-tools case-search command enables explicit full-text search across all past cases with program filter | CLI routing pattern in thrunt-tools.cjs, `cmdCaseSearch` function, --technique/--limit/--program flags |
| INTEL-04 | Case search results include case name, match context, technique overlap, and outcome summary | FTS5 snippet() function, JOIN pattern across case_index/case_artifacts/case_artifacts_fts, BM25 column weights |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | `^12.8.0` (verified: 12.8.0 current on npm) | SQLite storage for program.db case index with FTS5 | Synchronous API matches CJS runtime. FTS5 included in bundled SQLite 3.51.3. Node 20 prebuilds available. Already chosen in project architecture. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `^3.23.8` (existing) | Schema validation for search options/results | Already a dependency. Use for validating CLI input and search result shapes. |

### Alternatives NOT to Use
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| `better-sqlite3` | `node:sqlite` (Node 22.5+) | Project targets Node >=20.0.0; `node:sqlite` not universally available |
| `better-sqlite3` | `sql.js` (WASM) | No prebuilt binaries needed but 5-10x slower; no FTS5 support in default WASM build |
| ORM (knex, drizzle) | Raw prepared statements | Unnecessary abstraction for a targeted schema of 3 tables + 1 FTS5 virtual table |

**Installation:**
```bash
npm install better-sqlite3
```

**Native module note:** `better-sqlite3` ships prebuilt binaries for Node 20 on Linux x64, macOS arm64, macOS x64, Windows x64. If prebuilds are unavailable, it falls back to `node-gyp rebuild` which requires Python 3 + C++ build tools. The prebuilt path covers all typical hunter workstations. Add `better-sqlite3` to the `dependencies` field in package.json (not devDependencies) since it is required at runtime.

## Architecture Patterns

### Recommended Module Structure
```
thrunt-god/bin/lib/
  db.cjs              # NEW: SQLite database module (5 exports)
  commands.cjs        # MODIFIED: cmdCaseClose adds indexing, cmdCaseNew adds auto-search, new cmdCaseSearch
  state.cjs           # READ ONLY: getCaseRoster used for batch indexing reference
  core.cjs            # READ ONLY: planningPaths/planningRoot for path resolution

thrunt-god/bin/
  thrunt-tools.cjs    # MODIFIED: add case-search route

.planning/
  program.db          # NEW: SQLite database (created on first indexCase or searchCases call)
  cases/<slug>/       # EXISTING: case artifact directories (read during indexing)
```

### Pattern 1: Database Module Lifecycle (db.cjs)
**What:** Single module that owns all SQLite interactions. Opens DB lazily, ensures schema, provides query functions.
**When to use:** Every interaction with program.db goes through db.cjs exports.
**Example:**
```javascript
// Source: better-sqlite3 API + SQLite FTS5 docs
'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const { planningRoot } = require('./core.cjs');

function openProgramDb(cwd) {
  const dbPath = path.join(planningRoot(cwd), 'program.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);
  return db;
}
```

### Pattern 2: FTS5 External Content Table with Explicit Sync
**What:** FTS5 virtual table references `case_artifacts` as external content source. Synchronization via explicit INSERT/DELETE commands during `indexCase`, not database triggers.
**Why triggers are unnecessary here:** Indexing only happens in `indexCase` (batch operation during cmdCaseClose). There are no ad-hoc writes to `case_artifacts`. Explicit sync in the indexCase function is simpler and avoids trigger complexity.
**Example:**
```javascript
// Source: sqlite.org/fts5.html (external content tables)
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'closed',
      opened_at TEXT,
      closed_at TEXT,
      outcome_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS case_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES case_index(id) ON DELETE CASCADE,
      artifact_type TEXT NOT NULL CHECK(artifact_type IN ('finding','hypothesis','technique','ioc')),
      content TEXT NOT NULL,
      technique_ids TEXT DEFAULT ''
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS case_artifacts_fts USING fts5(
      content,
      artifact_type,
      content='case_artifacts',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS case_techniques (
      case_id INTEGER NOT NULL REFERENCES case_index(id) ON DELETE CASCADE,
      technique_id TEXT NOT NULL,
      PRIMARY KEY (case_id, technique_id)
    );

    CREATE INDEX IF NOT EXISTS idx_case_techniques_tid
      ON case_techniques(technique_id);
  `);
}
```

### Pattern 3: Idempotent Re-indexing with Transaction
**What:** Wrap indexCase in a single transaction. DELETE all existing rows for the case slug, then INSERT fresh data.
**Why:** Handles re-closing a case (e.g., after updating findings). The `BEGIN IMMEDIATE` avoids write-upgrade deadlock if another process holds a deferred read.
**Example:**
```javascript
// Source: better-sqlite3 transaction API + Pitfall 4 mitigation
function indexCase(db, slug, caseDir) {
  const doIndex = db.transaction((slug, caseDir) => {
    // Upsert case_index row
    let caseRow = db.prepare('SELECT id FROM case_index WHERE slug = ?').get(slug);
    if (caseRow) {
      // Delete existing artifacts + FTS entries for idempotent re-index
      const artifacts = db.prepare('SELECT id, content, artifact_type FROM case_artifacts WHERE case_id = ?').all(caseRow.id);
      const delFts = db.prepare('INSERT INTO case_artifacts_fts(case_artifacts_fts, rowid, content, artifact_type) VALUES(\'delete\', ?, ?, ?)');
      for (const a of artifacts) delFts.run(a.id, a.content, a.artifact_type);
      db.prepare('DELETE FROM case_artifacts WHERE case_id = ?').run(caseRow.id);
      db.prepare('DELETE FROM case_techniques WHERE case_id = ?').run(caseRow.id);
    } else {
      // Insert new case_index row
      const info = db.prepare('INSERT INTO case_index (slug, name, status) VALUES (?, ?, ?)').run(slug, name, 'closed');
      caseRow = { id: info.lastInsertRowid };
    }

    // Insert artifacts + sync FTS
    const insertArtifact = db.prepare('INSERT INTO case_artifacts (case_id, artifact_type, content, technique_ids) VALUES (?, ?, ?, ?)');
    const insertFts = db.prepare('INSERT INTO case_artifacts_fts(rowid, content, artifact_type) VALUES (?, ?, ?)');
    // ... for each artifact: insertArtifact.run(...) then insertFts.run(lastInsertRowid, ...)
  });

  doIndex.immediate(slug, caseDir);  // BEGIN IMMEDIATE to avoid deadlock
}
```

### Pattern 4: FTS5 Search with Snippet + JOIN
**What:** Query FTS5 index, join back to case_artifacts and case_index for full result context.
**Example:**
```javascript
// Source: sqlite.org/fts5.html (snippet, bm25 functions)
function searchCases(db, query, options = {}) {
  const limit = options.limit || 10;
  const stmt = db.prepare(`
    SELECT
      ci.slug,
      ci.name,
      ci.status,
      ci.opened_at,
      ci.closed_at,
      ci.outcome_summary,
      ca.artifact_type,
      snippet(case_artifacts_fts, 0, '**', '**', '...', 32) AS match_snippet,
      bm25(case_artifacts_fts, 5.0, 1.0) AS relevance_score
    FROM case_artifacts_fts fts
    JOIN case_artifacts ca ON ca.id = fts.rowid
    JOIN case_index ci ON ci.id = ca.case_id
    WHERE case_artifacts_fts MATCH ?
    ORDER BY relevance_score
    LIMIT ?
  `);
  return stmt.all(query, limit);
}
```

### Pattern 5: Technique Overlap via B-Tree Junction Table
**What:** Use a separate `case_techniques` table with a B-tree index for exact technique ID matching. Do not rely on FTS5 for T-code lookups.
**Why:** FTS5 tokenizes `T1059.001` into `T1059` and `001`, producing false positives. B-tree index gives exact match.
**Example:**
```javascript
function findTechniqueOverlap(db, techniqueIds) {
  if (!techniqueIds || techniqueIds.length === 0) return [];
  const placeholders = techniqueIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT ci.slug, ci.name, ci.status, ci.outcome_summary,
           GROUP_CONCAT(DISTINCT ct.technique_id) AS overlapping_techniques,
           COUNT(DISTINCT ct.technique_id) AS overlap_count
    FROM case_techniques ct
    JOIN case_index ci ON ci.id = ct.case_id
    WHERE ct.technique_id IN (${placeholders})
    GROUP BY ct.case_id
    ORDER BY overlap_count DESC
  `);
  return stmt.all(...techniqueIds);
}
```

### Anti-Patterns to Avoid
- **Storing technique IDs only in FTS5:** FTS5 tokenizes dotted IDs (T1078.002 becomes T1078 + 002). Always use the `case_techniques` B-tree junction table for exact technique matching.
- **Using database triggers for FTS sync:** Triggers add complexity for a batch-only write pattern. Since `indexCase` is the only writer, explicit FTS INSERT/DELETE in the same transaction is cleaner and more debuggable.
- **Calling FTS5 OPTIMIZE during indexing:** OPTIMIZE merges all FTS segments into one -- can take 10+ seconds on many cases. Never call inline; only as a maintenance operation.
- **Opening a new Database connection per function call:** Open once in `openProgramDb`, pass the `db` object to all functions. Database objects are reusable and connection setup (WAL pragma, busy_timeout) should happen once.
- **Using `content_rowid='rowid'` (default) when content table has autoincrement id:** Explicitly set `content_rowid='id'` to match `case_artifacts.id`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | Custom regex search across markdown files | FTS5 MATCH with BM25 ranking | BM25 relevance ranking, snippet extraction, porter stemming, 100x faster than file scanning on 50+ cases |
| SQLite connection management | Custom open/close/retry logic | `better-sqlite3` constructor + `pragma busy_timeout` | Handles WAL locking, SQLITE_BUSY retries, connection pooling unnecessary for synchronous API |
| Technique ID normalization | Custom multi-pass regex parser | Single regex `T\d{4}(?:\.\d{3})?` with case-insensitive flag | Covers T1078, T1078.002, t1078 (from Sigma tags); sub-techniques included |
| IOC extraction | Build comprehensive IOC parser | Simple targeted regexes for IP, domain, hash | Full IOC parsing is a rabbit hole; start with IPv4 + MD5/SHA1/SHA256 patterns only |

**Key insight:** The entire value of this phase is in the FTS5 index + structured technique overlap. Do not over-invest in IOC parsing sophistication -- the high-value path is fast keyword search + technique correlation.

## Common Pitfalls

### Pitfall 1: FTS5 Tokenization Splits Security Identifiers
**What goes wrong:** FTS5's `unicode61` tokenizer splits on dots and hyphens. `T1059.001` becomes tokens `t1059` and `001`. `192.168.1.1` becomes `192`, `168`, `1`, `1`. A search for `T1059.001` matches every case mentioning any number.
**Why it happens:** FTS5 tokenizes on Unicode word boundaries. Security content is full of dot-separated identifiers that are meaningful as units.
**How to avoid:** Use the `case_techniques` B-tree junction table for all technique ID lookups. For IOCs, store as artifact rows with `artifact_type = 'ioc'` and search via exact LIKE/GLOB queries, not FTS5 MATCH. Reserve FTS5 for prose content (findings, hypotheses).
**Warning signs:** `case-search T1059` returns every case in the system; IOC searches return hundreds of false positives.

### Pitfall 2: FTS5 External Content Table Desync
**What goes wrong:** When rows are deleted from `case_artifacts` without issuing a corresponding FTS5 'delete' command, the FTS index contains phantom entries. Queries return rowids that no longer exist in the content table, producing NULL columns in JOIN results.
**Why it happens:** FTS5 external content tables require explicit sync -- the database engine does NOT automatically cascade deletes from the content table to the FTS index.
**How to avoid:** In `indexCase`, always delete FTS entries BEFORE deleting content rows. The correct order: (1) read existing artifacts, (2) issue FTS 'delete' for each, (3) DELETE from case_artifacts, (4) INSERT new artifacts, (5) INSERT corresponding FTS entries. Wrap in a single IMMEDIATE transaction.
**Warning signs:** Search returns results with NULL case names; `PRAGMA integrity_check` passes but FTS results are inconsistent.

### Pitfall 3: better-sqlite3 Native Module Not Found at Runtime
**What goes wrong:** `require('better-sqlite3')` throws `Error: Cannot find module` or `Error: The module was compiled against a different Node.js version` when the user installs thrunt-god globally via `npm install -g`.
**Why it happens:** Native modules are compiled for a specific Node.js version + platform. If the user's Node version differs from the prebuild version, and they lack build tools for the node-gyp fallback, the install silently succeeds but the require fails.
**How to avoid:** (1) Pin `engines.node` in package.json to match prebuild availability (`"node": ">=20.0.0"`), which is already set. (2) Add a startup check in `openProgramDb` that catches the require error and provides a helpful message: "better-sqlite3 native module not found. Run `npm rebuild better-sqlite3` or ensure Node.js build tools are installed." (3) Make `better-sqlite3` a regular dependency, not optional -- installation failure should be visible.
**Warning signs:** `thrunt-tools case close` fails with a native module error after global install on a different machine.

### Pitfall 4: SQLite Dual-Writer Locking (from project PITFALLS.md)
**What goes wrong:** If the CLI and a future MCP server both open `program.db` simultaneously, SQLite allows only one writer at a time even in WAL mode. Without `busy_timeout`, writes fail immediately with SQLITE_BUSY.
**How to avoid:** Set `PRAGMA busy_timeout = 5000` on every connection. Use `BEGIN IMMEDIATE` for write transactions (the `db.transaction(...).immediate()` call in better-sqlite3). For Phase 52 specifically, only the CLI writes (indexCase on close, no MCP server yet), so this is a future-proofing concern.
**Warning signs:** SQLITE_BUSY errors when running case-search while another process is indexing.

### Pitfall 5: Empty Database on First new-case
**What goes wrong:** The very first case in a program has no past cases to search. If `openProgramDb` creates the database and schema on first call, the auto-search in `cmdCaseNew` returns empty results, which is correct. But if `openProgramDb` throws when the DB file doesn't exist, the entire `cmdCaseNew` fails.
**How to avoid:** `openProgramDb` must create the database file if it doesn't exist (this is better-sqlite3's default behavior). `searchCases` must return `[]` when the DB exists but has no data. `cmdCaseNew` must treat "no program.db" and "no matches" identically: include `past_case_matches: []` in output. Never throw on empty results.
**Warning signs:** First case creation in a new program fails with a database error.

## Code Examples

### Complete openProgramDb Pattern
```javascript
// Source: better-sqlite3 API docs + project PITFALLS.md
'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function openProgramDb(cwd) {
  const { planningRoot } = require('./core.cjs');
  const root = planningRoot(cwd);
  const dbPath = path.join(root, 'program.db');

  // Ensure .planning/ directory exists (it should from new-program)
  if (!fs.existsSync(root)) {
    return null;  // No planning directory = no program = no DB
  }

  const db = new Database(dbPath);  // Creates file if absent
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);
  return db;
}
```

### Artifact Parsing: Extract Technique IDs from Markdown
```javascript
// Regex covers: T1078, T1078.002, t1059.001 (case-insensitive)
const TECHNIQUE_RE = /T\d{4}(?:\.\d{3})?/gi;

function extractTechniqueIds(text) {
  const matches = text.match(TECHNIQUE_RE) || [];
  // Normalize to uppercase, deduplicate
  return [...new Set(matches.map(t => t.toUpperCase()))];
}
```

### Artifact Parsing: Extract IOCs from Text
```javascript
// Targeted patterns -- not comprehensive, but covers common hunt artifacts
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const MD5_RE = /\b[a-fA-F0-9]{32}\b/g;
const SHA1_RE = /\b[a-fA-F0-9]{40}\b/g;
const SHA256_RE = /\b[a-fA-F0-9]{64}\b/g;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;

function extractIOCs(text) {
  return {
    ips: [...new Set(text.match(IPV4_RE) || [])],
    md5s: [...new Set(text.match(MD5_RE) || [])],
    sha1s: [...new Set(text.match(SHA1_RE) || [])],
    sha256s: [...new Set(text.match(SHA256_RE) || [])],
    domains: [...new Set(text.match(DOMAIN_RE) || [])],
  };
}
```

### FTS5 Snippet Extraction
```javascript
// Source: sqlite.org/fts5.html snippet() docs
// snippet(table, column_idx, open_marker, close_marker, ellipsis, max_tokens)
// column_idx: -1 = auto-select best column; 0 = first column (content)
// max_tokens: must be > 0 and <= 64
const SNIPPET_SQL = `snippet(case_artifacts_fts, 0, '**', '**', '...', 32)`;
// Produces: "...attacker used **pass-the-hash** to move laterally across..."
```

### Integration into cmdCaseClose
```javascript
// In commands.cjs cmdCaseClose, after updating roster and STATE.md:
function cmdCaseClose(cwd, slug, raw) {
  // ... existing close logic (roster update, STATE.md update, clear active) ...

  // NEW: Index case artifacts into program.db
  try {
    const db = openProgramDb(cwd);
    if (db) {
      const root = planningRoot(cwd);
      const caseDir = path.join(root, 'cases', slug);
      indexCase(db, slug, caseDir);
      db.close();
    }
  } catch (err) {
    // Non-fatal: case is closed even if indexing fails
    // Log warning but don't fail the close operation
    if (!raw) console.error(`Warning: case indexing failed: ${err.message}`);
  }

  output({ success: true, slug, message: `Case closed: ${slug}` }, raw);
}
```

### Integration into cmdCaseNew
```javascript
// In commands.cjs cmdCaseNew, after creating case directory and setting active:
function cmdCaseNew(cwd, name, options, raw) {
  // ... existing creation logic ...

  // NEW: Auto-search past cases for similar signals
  let past_case_matches = [];
  try {
    const db = openProgramDb(cwd);
    if (db) {
      // Search using case name as initial signal
      const results = searchCases(db, name, { limit: 5 });
      // Also check technique overlap if technique IDs provided in options
      if (options.techniques && options.techniques.length > 0) {
        const overlap = findTechniqueOverlap(db, options.techniques);
        // Merge and deduplicate
        // ...
      }
      past_case_matches = results;
      db.close();
    }
  } catch {
    // Silent failure: new-case succeeds even if search fails
    past_case_matches = [];
  }

  output({
    success: true, slug, name, case_dir: caseDirRel,
    message: `Case created: ${slug}`,
    past_case_matches,
  }, raw);
}
```

### CLI Routing for case-search
```javascript
// In thrunt-tools.cjs runCommand switch:
case 'case-search': {
  const query = args[1];
  if (!query) error('Usage: thrunt-tools case-search <query> [--limit N] [--technique T1078] [--program <path>]');

  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

  const techIdx = args.indexOf('--technique');
  const technique = techIdx !== -1 ? args[techIdx + 1] : null;

  const progIdx = args.indexOf('--program');
  const programPath = progIdx !== -1 ? args[progIdx + 1] : null;

  commands.cmdCaseSearch(programPath || cwd, query, { limit, technique }, raw);
  break;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Grep across markdown files | FTS5 indexed search | SQLite 3.9.0+ (2015), but external content pattern matured in 3.31+ | Orders of magnitude faster for 50+ cases; ranked results |
| `node:sqlite` built-in | `better-sqlite3` external package | Node.js 22.5+ added experimental built-in | Project targets Node >=20; `node:sqlite` not available. Revisit if minimum is bumped to 22.5+ |
| FTS3/FTS4 | FTS5 | SQLite 3.9.0 (2015) | FTS5 has BM25 built-in, external content, column weights, snippet/highlight functions |

**Not deprecated but important:**
- `better-sqlite3` v12.8.0 bundles SQLite 3.51.3 which includes all FTS5 features needed
- FTS5 `detail=full` is the default and appropriate for this use case (phrase matching useful for security content)

## Open Questions

1. **Whether to index QUERIES/ and RECEIPTS/ content**
   - What we know: These directories contain query files (QRY-*.md) and receipt files (RCT-*.md) with structured evidence
   - What's unclear: Indexing these is heavyweight and may slow down case close significantly for large cases
   - Recommendation: Defer to Claude's discretion per CONTEXT.md. Start with FINDINGS.md, HYPOTHESES.md, technique IDs, and IOCs only. Add QUERIES/RECEIPTS indexing in a follow-up if hunters request it.

2. **Database migration strategy for future schema changes**
   - What we know: `ensureSchema` uses `CREATE TABLE IF NOT EXISTS` which is idempotent for initial creation
   - What's unclear: How to handle column additions or FTS5 schema changes in future phases
   - Recommendation: Add a `schema_version` row in a `db_meta` table. Check on open, run migrations if needed. For FTS5 changes, the only option is DROP + CREATE + rebuild from source data, which is acceptable since source artifacts are in markdown files.

3. **Hash collision risk in IOC extraction regexes**
   - What we know: MD5 regex (`[a-fA-F0-9]{32}`) matches any 32-char hex string, including UUIDs without dashes
   - What's unclear: How many false positive IOCs this produces in typical hunt artifacts
   - Recommendation: Accept false positives for now. IOCs are stored as artifact rows for FTS search, not as authoritative indicators. Precision can be improved later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node.js 20+) |
| Config file | None (uses `scripts/run-tests.cjs` runner) |
| Quick run command | `node --test tests/db.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTEL-01 | indexCase writes artifacts + FTS entries on close | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-01 | idempotent re-indexing (close same case twice) | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-01 | technique ID extraction from markdown | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-01 | IOC extraction from text | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-02 | cmdCaseNew includes past_case_matches in output | integration | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-02 | auto-search returns empty array on first case | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-02 | auto-search returns empty array when no DB | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-03 | case-search CLI returns ranked results | integration | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-03 | --technique flag filters by technique ID | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-03 | --limit flag caps result count | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-04 | results include snippet, technique overlap, outcome | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |
| INTEL-04 | snippet contains match context markers | unit | `node --test tests/db.test.cjs` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/db.test.cjs`
- **Per wave merge:** `npm test` (full suite: all ~90 test files)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/db.test.cjs` -- covers INTEL-01 through INTEL-04 (all db.cjs unit tests + integration with cmdCaseClose/cmdCaseNew)
- [ ] Framework install: `npm install better-sqlite3` -- native module must be present for tests to run
- [ ] Test fixtures: temp directory with pre-populated case artifacts (FINDINGS.md, HYPOTHESES.md with technique IDs, IOCs)

## Sources

### Primary (HIGH confidence)
- [SQLite FTS5 Official Documentation](https://www.sqlite.org/fts5.html) -- External content tables, snippet() function (5 parameters: column_idx, open_marker, close_marker, ellipsis, max_tokens), bm25() column weights, trigger patterns for sync, `content=` and `content_rowid=` options
- [better-sqlite3 API Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) -- Database constructor, pragma(), prepare/run/get/all, transaction() with .immediate() variant, close()
- [better-sqlite3 npm registry](https://www.npmjs.com/package/better-sqlite3) -- Version 12.8.0 confirmed current, engines: `node: '20.x || 22.x || 23.x || 24.x || 25.x'`
- `.planning/research/STACK.md` -- better-sqlite3 ^12.8.0 selection rationale, FTS5 external content pattern, synchronous API
- `.planning/research/PITFALLS.md` -- Pitfall 4 (SQLite dual-writer WAL + busy_timeout), Pitfall 5 (FTS5 index bloat + external content mitigation), Pitfall 11 (cross-case FTS5 false positives from short security tokens)
- `thrunt-god/bin/lib/commands.cjs` lines 3372-3459 -- cmdCaseNew and cmdCaseClose exact implementation (integration points verified)
- `thrunt-god/bin/lib/core.cjs` lines 599-661 -- planningDir/planningRoot/planningPaths with case support (path resolution verified)
- `thrunt-god/bin/lib/state.cjs` lines 1023-1072 -- getCaseRoster/addCaseToRoster/updateCaseInRoster (data source verified)

### Secondary (MEDIUM confidence)
- [SQLite FTS5 Triggers Pattern](https://simonh.uk/2021/05/11/sqlite-fts5-triggers/) -- Verified trigger syntax for external content sync (DELETE before INSERT pattern)
- [SQLite WAL Documentation](https://www.sqlite.org/wal.html) -- WAL mode is persistent, one writer many readers, busy_timeout behavior
- `.planning/research/FEATURES.md` -- Cross-case intelligence dependency graph, MVP scope definition

### Tertiary (LOW confidence)
- IOC extraction regex patterns -- Based on common security tooling patterns; not validated against real hunt artifacts from this project. May need refinement based on actual FINDINGS.md content.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- better-sqlite3 ^12.8.0 version verified against npm, FTS5 API verified against sqlite.org docs, all API patterns confirmed
- Architecture: HIGH -- Integration points in commands.cjs/core.cjs/state.cjs verified by reading source. Module boundaries and function signatures match established patterns.
- Pitfalls: HIGH -- Drawn from project's own PITFALLS.md research (Pitfalls 4, 5, 11) plus verified FTS5 tokenization behavior from official docs

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days -- stable domain, no fast-moving dependencies)
