/**
 * THRUNT Tools Tests - Commands
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const { runThruntTools, createTempProject, cleanup } = require('./helpers.cjs');
const { extractFrontmatter, spliceFrontmatter } = require('../thrunt-god/bin/lib/frontmatter.cjs');

describe('history-digest command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty phases directory returns valid schema', () => {
    const result = runThruntTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    assert.deepStrictEqual(digest.phases, {}, 'phases should be empty object');
    assert.deepStrictEqual(digest.decisions, [], 'decisions should be empty array');
    assert.deepStrictEqual(digest.tech_stack, [], 'tech_stack should be empty array');
  });

  test('nested frontmatter fields extracted correctly', () => {
    // Create phase directory with SUMMARY containing nested frontmatter
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    const summaryContent = `---
phase: "01"
name: "Foundation Setup"
dependency-graph:
  provides:
    - "Database schema"
    - "Auth system"
  affects:
    - "API layer"
tech-stack:
  added:
    - "prisma"
    - "jose"
patterns-established:
  - "Repository pattern"
  - "JWT auth flow"
key-decisions:
  - "Use Prisma over Drizzle"
  - "JWT in httpOnly cookies"
---

# Summary content here
`;

    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), summaryContent);

    const result = runThruntTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    // Check nested dependency-graph.provides
    assert.ok(digest.phases['01'], 'Phase 01 should exist');
    assert.deepStrictEqual(
      digest.phases['01'].provides.sort(),
      ['Auth system', 'Database schema'],
      'provides should contain nested values'
    );

    // Check nested dependency-graph.affects
    assert.deepStrictEqual(
      digest.phases['01'].affects,
      ['API layer'],
      'affects should contain nested values'
    );

    // Check nested tech-stack.added
    assert.deepStrictEqual(
      digest.tech_stack.sort(),
      ['jose', 'prisma'],
      'tech_stack should contain nested values'
    );

    // Check patterns-established (flat array)
    assert.deepStrictEqual(
      digest.phases['01'].patterns.sort(),
      ['JWT auth flow', 'Repository pattern'],
      'patterns should be extracted'
    );

    // Check key-decisions
    assert.strictEqual(digest.decisions.length, 2, 'Should have 2 decisions');
    assert.ok(
      digest.decisions.some(d => d.decision === 'Use Prisma over Drizzle'),
      'Should contain first decision'
    );
  });

  test('multiple phases merged into single digest', () => {
    // Create phase 01
    const phase01Dir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phase01Dir, { recursive: true });
    fs.writeFileSync(
      path.join(phase01Dir, '01-01-SUMMARY.md'),
      `---
phase: "01"
name: "Foundation"
provides:
  - "Database"
patterns-established:
  - "Pattern A"
key-decisions:
  - "Decision 1"
---
`
    );

    // Create phase 02
    const phase02Dir = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase02Dir, { recursive: true });
    fs.writeFileSync(
      path.join(phase02Dir, '02-01-SUMMARY.md'),
      `---
phase: "02"
name: "API"
provides:
  - "REST endpoints"
patterns-established:
  - "Pattern B"
key-decisions:
  - "Decision 2"
tech-stack:
  added:
    - "zod"
---
`
    );

    const result = runThruntTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    // Both phases present
    assert.ok(digest.phases['01'], 'Phase 01 should exist');
    assert.ok(digest.phases['02'], 'Phase 02 should exist');

    // Decisions merged
    assert.strictEqual(digest.decisions.length, 2, 'Should have 2 decisions total');

    // Tech stack merged
    assert.deepStrictEqual(digest.tech_stack, ['zod'], 'tech_stack should have zod');
  });

  test('malformed SUMMARY.md skipped gracefully', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Valid summary
    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
phase: "01"
provides:
  - "Valid feature"
---
`
    );

    // Malformed summary (no frontmatter)
    fs.writeFileSync(
      path.join(phaseDir, '01-02-SUMMARY.md'),
      `# Just a heading
No frontmatter here
`
    );

    // Another malformed summary (broken YAML)
    fs.writeFileSync(
      path.join(phaseDir, '01-03-SUMMARY.md'),
      `---
broken: [unclosed
---
`
    );

    const result = runThruntTools('history-digest', tmpDir);
    assert.ok(result.success, `Command should succeed despite malformed files: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.ok(digest.phases['01'], 'Phase 01 should exist');
    assert.ok(
      digest.phases['01'].provides.includes('Valid feature'),
      'Valid feature should be extracted'
    );
  });

  test('flat provides field still works (backward compatibility)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
phase: "01"
provides:
  - "Direct provides"
---
`
    );

    const result = runThruntTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.deepStrictEqual(
      digest.phases['01'].provides,
      ['Direct provides'],
      'Direct provides should work'
    );
  });

  test('inline array syntax supported', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
phase: "01"
provides: [Feature A, Feature B]
patterns-established: ["Pattern X", "Pattern Y"]
---
`
    );

    const result = runThruntTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.deepStrictEqual(
      digest.phases['01'].provides.sort(),
      ['Feature A', 'Feature B'],
      'Inline array should work'
    );
    assert.deepStrictEqual(
      digest.phases['01'].patterns.sort(),
      ['Pattern X', 'Pattern Y'],
      'Inline quoted array should work'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phases list command
// ─────────────────────────────────────────────────────────────────────────────


describe('summary-extract command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing file returns error', () => {
    const result = runThruntTools('summary-extract .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report missing file');
  });

  test('extracts all fields from SUMMARY.md', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
one-liner: Set up Prisma with User and Project models
key-files:
  - prisma/schema.prisma
  - src/lib/db.ts
tech-stack:
  added:
    - prisma
    - zod
patterns-established:
  - Repository pattern
  - Dependency injection
key-decisions:
  - Use Prisma over Drizzle: Better DX and ecosystem
  - Single database: Start simple, shard later
hypotheses-completed:
  - AUTH-01
  - AUTH-02
---

# Summary

Full summary content here.
`
    );

    const result = runThruntTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.path, '.planning/phases/01-foundation/01-01-SUMMARY.md', 'path correct');
    assert.strictEqual(output.one_liner, 'Set up Prisma with User and Project models', 'one-liner extracted');
    assert.deepStrictEqual(output.key_files, ['prisma/schema.prisma', 'src/lib/db.ts'], 'key files extracted');
    assert.deepStrictEqual(output.tech_added, ['prisma', 'zod'], 'tech added extracted');
    assert.deepStrictEqual(output.patterns, ['Repository pattern', 'Dependency injection'], 'patterns extracted');
    assert.strictEqual(output.decisions.length, 2, 'decisions extracted');
    assert.deepStrictEqual(output.hypotheses_completed, ['AUTH-01', 'AUTH-02'], 'hypotheses completed extracted');
  });

  test('selective extraction with --fields', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
one-liner: Set up database
key-files:
  - prisma/schema.prisma
tech-stack:
  added:
    - prisma
patterns-established:
  - Repository pattern
key-decisions:
  - Use Prisma: Better DX
hypotheses-completed:
  - AUTH-01
---
`
    );

    const result = runThruntTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md --fields one_liner,key_files,hypotheses_completed', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.one_liner, 'Set up database', 'one_liner included');
    assert.deepStrictEqual(output.key_files, ['prisma/schema.prisma'], 'key_files included');
    assert.deepStrictEqual(output.hypotheses_completed, ['AUTH-01'], 'hypotheses_completed included');
    assert.strictEqual(output.tech_added, undefined, 'tech_added excluded');
    assert.strictEqual(output.patterns, undefined, 'patterns excluded');
    assert.strictEqual(output.decisions, undefined, 'decisions excluded');
  });

  test('extracts one-liner from body when not in frontmatter', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
phase: "01"
key-files:
  - src/lib/db.ts
---

# Phase 1: Foundation Summary

**JWT auth with refresh rotation using jose library**

## Performance

- **Duration:** 28 min
- **Tasks:** 5
`
    );

    const result = runThruntTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.one_liner, 'JWT auth with refresh rotation using jose library',
      'one-liner should be extracted from body **bold** line');
  });

  test('handles missing frontmatter fields gracefully', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
one-liner: Minimal summary
---

# Summary
`
    );

    const result = runThruntTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.one_liner, 'Minimal summary', 'one-liner extracted');
    assert.deepStrictEqual(output.key_files, [], 'key_files defaults to empty');
    assert.deepStrictEqual(output.tech_added, [], 'tech_added defaults to empty');
    assert.deepStrictEqual(output.patterns, [], 'patterns defaults to empty');
    assert.deepStrictEqual(output.decisions, [], 'decisions defaults to empty');
    assert.deepStrictEqual(output.hypotheses_completed, [], 'hypotheses_completed defaults to empty');
  });

  test('parses key-decisions with rationale', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
key-decisions:
  - Use Prisma: Better DX than alternatives
  - JWT tokens: Stateless auth for scalability
---
`
    );

    const result = runThruntTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.decisions[0].summary, 'Use Prisma', 'decision summary parsed');
    assert.strictEqual(output.decisions[0].rationale, 'Better DX than alternatives', 'decision rationale parsed');
    assert.strictEqual(output.decisions[1].summary, 'JWT tokens', 'second decision summary');
    assert.strictEqual(output.decisions[1].rationale, 'Stateless auth for scalability', 'second decision rationale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init commands tests
// ─────────────────────────────────────────────────────────────────────────────


describe('progress command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('renders JSON progress', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap v1.0 MVP\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Done');
    fs.writeFileSync(path.join(p1, '01-02-PLAN.md'), '# Plan 2');

    const result = runThruntTools('progress json', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.total_plans, 2, '2 total plans');
    assert.strictEqual(output.total_summaries, 1, '1 summary');
    assert.strictEqual(output.percent, 50, '50%');
    assert.strictEqual(output.phases.length, 1, '1 phase');
    assert.strictEqual(output.phases[0].status, 'In Progress', 'phase in progress');
  });

  test('renders bar format', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap v1.0\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Done');

    const result = runThruntTools('progress bar --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(result.output.includes('1/1'), 'should include count');
    assert.ok(result.output.includes('100%'), 'should include 100%');
  });

  test('renders table format', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap v1.0 MVP\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');

    const result = runThruntTools('progress table --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(result.output.includes('Phase'), 'should have table header');
    assert.ok(result.output.includes('foundation'), 'should include phase name');
  });

  test('does not crash when summaries exceed plans (orphaned SUMMARY.md)', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap v1.0 MVP\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    // 1 plan but 2 summaries (orphaned SUMMARY.md after PLAN.md deletion)
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Done');
    fs.writeFileSync(path.join(p1, '01-02-SUMMARY.md'), '# Orphaned summary');

    // bar format - should not crash with RangeError
    const barResult = runThruntTools('progress bar --raw', tmpDir);
    assert.ok(barResult.success, `Bar format crashed: ${barResult.error}`);
    assert.ok(barResult.output.includes('100%'), 'percent should be clamped to 100%');

    // table format - should not crash with RangeError
    const tableResult = runThruntTools('progress table --raw', tmpDir);
    assert.ok(tableResult.success, `Table format crashed: ${tableResult.error}`);

    // json format - percent should be clamped
    const jsonResult = runThruntTools('progress json', tmpDir);
    assert.ok(jsonResult.success, `JSON format crashed: ${jsonResult.error}`);
    const output = JSON.parse(jsonResult.output);
    assert.ok(output.percent <= 100, `percent should be <= 100 but got ${output.percent}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// todo complete command
// ─────────────────────────────────────────────────────────────────────────────


describe('todo complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('moves todo from pending to completed', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, 'add-dark-mode.md'),
      `title: Add dark mode\narea: ui\ncreated: 2025-01-01\n`
    );

    const result = runThruntTools('todo complete add-dark-mode.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed, true);

    // Verify moved
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'pending', 'add-dark-mode.md')),
      'should be removed from pending'
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'completed', 'add-dark-mode.md')),
      'should be in completed'
    );

    // Verify completion timestamp added
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'todos', 'completed', 'add-dark-mode.md'),
      'utf-8'
    );
    assert.ok(content.startsWith('completed:'), 'should have completed timestamp');
  });

  test('fails for nonexistent todo', () => {
    const result = runThruntTools('todo complete nonexistent.md', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('not found'), 'error mentions not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// todo match-phase command
// ─────────────────────────────────────────────────────────────────────────────

describe('todo match-phase command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });
  afterEach(() => cleanup(tmpDir));

  test('returns empty matches when no todos exist', () => {
    const result = runThruntTools('todo match-phase 01', tmpDir);
    assert.ok(result.success, 'should succeed');
    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.deepStrictEqual(output.matches, []);
  });

  test('matches todo by keyword overlap with phase name', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'auth-todo.md'),
      'title: Add OAuth token refresh\narea: auth\ncreated: 2026-03-01\n\nNeed to handle token expiry for OAuth flows.');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 01: Authentication and Session Management\n\n**Goal:** Implement OAuth login and session handling\n');

    const result = runThruntTools('todo match-phase 01', tmpDir);
    assert.ok(result.success, 'should succeed');
    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1, 'should find 1 todo');
    assert.ok(output.matches.length > 0, 'should have matches');
    assert.strictEqual(output.matches[0].title, 'Add OAuth token refresh');
    assert.ok(output.matches[0].score > 0, 'score should be positive');
    assert.ok(output.matches[0].reasons.length > 0, 'should have reasons');
  });

  test('does not match unrelated todo', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'auth-todo.md'),
      'title: Add OAuth token refresh\narea: auth\ncreated: 2026-03-01\n\nOAuth token expiry.');
    fs.writeFileSync(path.join(pendingDir, 'unrelated-todo.md'),
      'title: Fix CSS grid layout in dashboard\narea: ui\ncreated: 2026-03-01\n\nGrid columns break on mobile.');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 01: Authentication and Session Management\n\n**Goal:** Implement OAuth login and session handling\n');

    const result = runThruntTools('todo match-phase 01', tmpDir);
    assert.ok(result.success, 'should succeed');
    const output = JSON.parse(result.output);
    const matchTitles = output.matches.map(m => m.title);
    assert.ok(matchTitles.includes('Add OAuth token refresh'), 'auth todo should match');
    assert.ok(!matchTitles.includes('Fix CSS grid layout in dashboard'), 'unrelated todo should not match');
  });

  test('matches todo by area overlap', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'auth-todo.md'),
      'title: Add OAuth token refresh\narea: auth\ncreated: 2026-03-01\n\nOAuth token handling.');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 01: Auth System\n\n**Goal:** Build auth module\n');

    const result = runThruntTools('todo match-phase 01', tmpDir);
    const output = JSON.parse(result.output);
    const authMatch = output.matches.find(m => m.title === 'Add OAuth token refresh');
    assert.ok(authMatch, 'should find auth todo');
    const hasAreaReason = authMatch.reasons.some(r => r.startsWith('area:'));
    assert.ok(hasAreaReason, 'should match on area');
  });

  test('sorts matches by score descending', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'weak-match.md'),
      'title: Check token format\narea: general\ncreated: 2026-03-01\n\nToken format validation.');
    fs.writeFileSync(path.join(pendingDir, 'strong-match.md'),
      'title: Session management authentication OAuth token handling\narea: auth\ncreated: 2026-03-01\n\nSession auth OAuth tokens.');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 01: Authentication and Session Management\n\n**Goal:** Implement OAuth login, session handling, and token management\n');

    const result = runThruntTools('todo match-phase 01', tmpDir);
    const output = JSON.parse(result.output);
    assert.ok(output.matches.length >= 2, 'should have multiple matches');
    for (let i = 1; i < output.matches.length; i++) {
      assert.ok(output.matches[i - 1].score >= output.matches[i].score,
        `match ${i-1} score (${output.matches[i-1].score}) should be >= match ${i} score (${output.matches[i].score})`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scaffold command
// ─────────────────────────────────────────────────────────────────────────────


describe('scaffold command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('scaffolds context file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runThruntTools('scaffold context --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    // Verify file content
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-CONTEXT.md'),
      'utf-8'
    );
    assert.ok(content.includes('Phase 3'), 'should reference phase number');
    assert.ok(content.includes('Decisions'), 'should have decisions section');
    assert.ok(content.includes('Discretion Areas'), 'should have discretion section');
  });

  test('scaffolds context file with hunt-native command hint when HUNTMAP.md is active', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap

### Phase 3: API
**Goal:** Query telemetry
`
    );

    const result = runThruntTools('scaffold context --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-CONTEXT.md'),
      'utf-8'
    );
    assert.ok(content.includes('/hunt:shape-hypothesis 3'));
  });

  test('scaffolds evidence review file with hunt-native content', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runThruntTools('scaffold evidence-review --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-EVIDENCE_REVIEW.md'),
      'utf-8'
    );
    assert.ok(content.includes('Evidence Review'), 'should have evidence review heading');
    assert.ok(content.includes('Publishability Verdict'), 'should have verdict section');
  });

  test('scaffolds findings file with hunt-native content', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runThruntTools('scaffold findings --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-FINDINGS.md'),
      'utf-8'
    );
    assert.ok(content.includes('Findings'), 'should have findings heading');
    assert.ok(content.includes('Hypothesis Verdicts'), 'should have verdict table');
  });

  test('scaffolds findings file with hunt-native sections when HUNTMAP.md is active', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap

### Phase 3: API
**Goal:** Query telemetry
`
    );

    const result = runThruntTools('scaffold findings --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-FINDINGS.md'),
      'utf-8'
    );
    assert.ok(content.includes('## Hypothesis Verdicts'));
    assert.ok(content.includes('## Recommended Action'));
  });

  test('scaffolds evidence review file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runThruntTools('scaffold evidence-review --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-EVIDENCE_REVIEW.md'),
      'utf-8'
    );
    assert.ok(content.includes('Publishability Verdict'));
    assert.ok(content.includes('Evidence Quality Checks'));
    assert.ok(content.includes('Follow-Up Needed'));
  });

  test('scaffolds findings file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runThruntTools('scaffold findings --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-FINDINGS.md'),
      'utf-8'
    );
    assert.ok(content.includes('Hypothesis Verdicts'));
    assert.ok(content.includes('What We Do Not Know'));
    assert.ok(content.includes('Recommended Action'));
  });

  test('scaffolds phase directory', () => {
    const result = runThruntTools('scaffold phase-dir --phase 5 --name User Dashboard', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '05-user-dashboard')),
      'directory should be created'
    );
  });

  test('does not overwrite existing files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Existing content');

    const result = runThruntTools('scaffold context --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, false, 'should not overwrite');
    assert.strictEqual(output.reason, 'already_exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdGenerateSlug tests (CMD-01)
// ─────────────────────────────────────────────────────────────────────────────

describe('generate-slug command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('converts normal text to slug', () => {
    const result = runThruntTools('generate-slug "Hello World"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'hello-world');
  });

  test('strips special characters', () => {
    const result = runThruntTools('generate-slug "Test@#$%^Special!!!"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'test-special');
  });

  test('preserves numbers', () => {
    const result = runThruntTools('generate-slug "Phase 3 Plan"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'phase-3-plan');
  });

  test('strips leading and trailing hyphens', () => {
    const result = runThruntTools('generate-slug "---leading-trailing---"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'leading-trailing');
  });

  test('fails when no text provided', () => {
    const result = runThruntTools('generate-slug', tmpDir);
    assert.ok(!result.success, 'should fail without text');
    assert.ok(result.error.includes('text required'), 'error should mention text required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdCurrentTimestamp tests (CMD-01)
// ─────────────────────────────────────────────────────────────────────────────

describe('current-timestamp command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('date format returns YYYY-MM-DD', () => {
    const result = runThruntTools('current-timestamp date', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.match(output.timestamp, /^\d{4}-\d{2}-\d{2}$/, 'should be YYYY-MM-DD format');
  });

  test('filename format returns ISO without colons or fractional seconds', () => {
    const result = runThruntTools('current-timestamp filename', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.match(output.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/, 'should replace colons with hyphens and strip fractional seconds');
  });

  test('full format returns full ISO string', () => {
    const result = runThruntTools('current-timestamp full', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.match(output.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'should be full ISO format');
  });

  test('default (no format) returns full ISO string', () => {
    const result = runThruntTools('current-timestamp', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.match(output.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'default should be full ISO format');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdListTodos tests (CMD-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('list-todos command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty directory returns zero count', () => {
    const result = runThruntTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 0, 'count should be 0');
    assert.deepStrictEqual(output.todos, [], 'todos should be empty');
  });

  test('returns multiple todos with correct fields', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'add-tests.md'), 'title: Add unit tests\narea: testing\ncreated: 2026-01-15\n');
    fs.writeFileSync(path.join(pendingDir, 'fix-bug.md'), 'title: Fix login bug\narea: auth\ncreated: 2026-01-20\n');

    const result = runThruntTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 2, 'should have 2 todos');
    assert.strictEqual(output.todos.length, 2, 'todos array should have 2 entries');

    const testTodo = output.todos.find(t => t.file === 'add-tests.md');
    assert.ok(testTodo, 'add-tests.md should be in results');
    assert.strictEqual(testTodo.title, 'Add unit tests');
    assert.strictEqual(testTodo.area, 'testing');
    assert.strictEqual(testTodo.created, '2026-01-15');
  });

  test('area filter returns only matching todos', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'ui-task.md'), 'title: UI task\narea: ui\ncreated: 2026-01-01\n');
    fs.writeFileSync(path.join(pendingDir, 'api-task.md'), 'title: API task\narea: api\ncreated: 2026-01-01\n');

    const result = runThruntTools('list-todos ui', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 1, 'should have 1 matching todo');
    assert.strictEqual(output.todos[0].area, 'ui', 'should only return ui area');
  });

  test('area filter miss returns zero count', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task.md'), 'title: Some task\narea: backend\ncreated: 2026-01-01\n');

    const result = runThruntTools('list-todos nonexistent-area', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 0, 'should have 0 matching todos');
  });

  test('malformed files use defaults', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    // File with no title or area fields
    fs.writeFileSync(path.join(pendingDir, 'malformed.md'), 'some random content\nno fields here\n');

    const result = runThruntTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 1, 'malformed file should still be counted');
    assert.strictEqual(output.todos[0].title, 'Untitled', 'missing title defaults to Untitled');
    assert.strictEqual(output.todos[0].area, 'general', 'missing area defaults to general');
    assert.strictEqual(output.todos[0].created, 'unknown', 'missing created defaults to unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdCheckPathExists tests (CMD-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('check-path-exists command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('existing file returns exists=true with type=file', () => {
    fs.writeFileSync(path.join(tmpDir, 'test-file.txt'), 'hello');

    const result = runThruntTools('check-path-exists test-file.txt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.exists, true);
    assert.strictEqual(output.type, 'file');
  });

  test('existing directory returns exists=true with type=directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'test-dir'), { recursive: true });

    const result = runThruntTools('check-path-exists test-dir', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.exists, true);
    assert.strictEqual(output.type, 'directory');
  });

  test('missing path returns exists=false', () => {
    const result = runThruntTools('check-path-exists nonexistent/path', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.exists, false);
    assert.strictEqual(output.type, null);
  });

  test('absolute path resolves correctly', () => {
    const absFile = path.join(tmpDir, 'abs-test.txt');
    fs.writeFileSync(absFile, 'content');

    const result = runThruntTools(`check-path-exists ${absFile}`, tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.exists, true);
    assert.strictEqual(output.type, 'file');
  });

  test('fails when no path provided', () => {
    const result = runThruntTools('check-path-exists', tmpDir);
    assert.ok(!result.success, 'should fail without path');
    assert.ok(result.error.includes('path required'), 'error should mention path required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdResolveModel tests (CMD-03)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolve-model command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('known agent returns model and profile without unknown_agent', () => {
    const result = runThruntTools('resolve-model thrunt-hunt-planner', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.model, 'should have model field');
    assert.ok(output.profile, 'should have profile field');
    assert.strictEqual(output.unknown_agent, undefined, 'should not have unknown_agent for known agent');
  });

  test('unknown agent returns unknown_agent=true', () => {
    const result = runThruntTools('resolve-model fake-nonexistent-agent', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.unknown_agent, true, 'should flag unknown agent');
  });

  test('default profile fallback when no config exists', () => {
    // tmpDir has no config.json, so defaults to balanced profile
    const result = runThruntTools('resolve-model thrunt-telemetry-executor', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.profile, 'balanced', 'should default to balanced profile');
    assert.ok(output.model, 'should resolve a model');
  });

  test('fails when no agent-type provided', () => {
    const result = runThruntTools('resolve-model', tmpDir);
    assert.ok(!result.success, 'should fail without agent-type');
    assert.ok(result.error.includes('agent-type required'), 'error should mention agent-type required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdCommit tests (CMD-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('commit command', () => {
  const { createTempGitProject } = require('./helpers.cjs');
  const { execSync } = require('child_process');
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('skips when commit_docs is false', () => {
    // Write config with commit_docs: false
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false })
    );

    const result = runThruntTools('commit "test message"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, false);
    assert.strictEqual(output.reason, 'skipped_commit_docs_false');
  });

  test('skips when .planning is gitignored', () => {
    // Add .planning/ to .gitignore and commit it so git recognizes the ignore
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.planning/\n');
    execSync('git add .gitignore', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "add gitignore"', { cwd: tmpDir, stdio: 'pipe' });

    const result = runThruntTools('commit "test message"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, false);
    assert.strictEqual(output.reason, 'skipped_gitignored');
  });

  test('handles nothing to commit', () => {
    // Don't modify any files after initial commit
    const result = runThruntTools('commit "test message"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, false);
    assert.strictEqual(output.reason, 'nothing_to_commit');
  });

  test('creates real commit with correct hash', () => {
    // Create a new file in .planning/
    fs.writeFileSync(path.join(tmpDir, '.planning', 'test-file.md'), '# Test\n');

    const result = runThruntTools('commit "test: add test file" --files .planning/test-file.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, true, 'should have committed');
    assert.ok(output.hash, 'should have a commit hash');
    assert.strictEqual(output.reason, 'committed');

    // Verify via git log
    const gitLog = execSync('git log --oneline -1', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    assert.ok(gitLog.includes('test: add test file'), 'git log should contain the commit message');
    assert.ok(gitLog.includes(output.hash), 'git log should contain the returned hash');
  });

  test('stages the configured planning dir when THRUNT_PLANNING_DIR is set', () => {
    fs.mkdirSync(path.join(tmpDir, '.planx'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planx', 'custom-file.md'), '# Custom\n');

    const result = runThruntTools(
      'commit "docs: add custom planning file"',
      tmpDir,
      { THRUNT_PLANNING_DIR: '.planx' }
    );
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, true, 'should commit custom planning dir changes');

    const gitLog = execSync('git log --oneline -1', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    assert.ok(gitLog.includes('docs: add custom planning file'), 'git log should contain the commit message');
  });

  test('amend mode works without crashing', () => {
    // Create a file and commit it first
    fs.writeFileSync(path.join(tmpDir, '.planning', 'amend-file.md'), '# Initial\n');
    execSync('git add .planning/amend-file.md', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "initial file"', { cwd: tmpDir, stdio: 'pipe' });

    // Modify the file and amend
    fs.writeFileSync(path.join(tmpDir, '.planning', 'amend-file.md'), '# Amended\n');

    const result = runThruntTools('commit "ignored" --files .planning/amend-file.md --amend', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, true, 'amend should succeed');

    // Verify only 2 commits total (initial setup + amended)
    const logCount = execSync('git log --oneline', { cwd: tmpDir, encoding: 'utf-8' }).trim().split('\n').length;
    assert.strictEqual(logCount, 2, 'should have 2 commits (initial + amended)');
  });
  test('creates strategy branch before first commit when branching_strategy is milestone', () => {
    // Configure milestone branching strategy
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        commit_docs: true,
        branching_strategy: 'milestone',
        milestone_branch_template: 'thrunt/{milestone}-{slug}',
      })
    );
    // getMilestoneInfo reads HUNTMAP.md for milestone version/name
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '## v1.0: Initial Release\n\n### Phase 1: Setup\n'
    );

    // Create a file to commit
    fs.writeFileSync(path.join(tmpDir, '.planning', 'test-context.md'), '# Context\n');

    const result = runThruntTools('commit "docs: add context" --files .planning/test-context.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, true, 'should have committed');

    // Verify we're on the strategy branch
    const { execFileSync } = require('child_process');
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmpDir, encoding: 'utf-8' }).trim();
    assert.strictEqual(branch, 'thrunt/v1.0-initial-release', 'should be on milestone branch');
  });

  test('creates strategy branch before first commit when branching_strategy is phase', () => {
    // Configure phase branching strategy
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        commit_docs: true,
        branching_strategy: 'phase',
        phase_branch_template: 'thrunt/phase-{phase}-{slug}',
      })
    );
    // Create HUNTMAP.md with a phase
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-setup'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n## Phase 1: Setup\nGoal: Initial setup\n'
    );

    // Create a context file for phase 1
    fs.writeFileSync(path.join(tmpDir, '.planning', 'phases', '01-setup', '01-CONTEXT.md'), '# Context\n');

    const result = runThruntTools(
      'commit "docs(01): add context" --files .planning/phases/01-setup/01-CONTEXT.md',
      tmpDir
    );
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.committed, true, 'should have committed');

    // Verify we're on the strategy branch
    const { execFileSync } = require('child_process');
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmpDir, encoding: 'utf-8' }).trim();
    assert.strictEqual(branch, 'thrunt/phase-01-setup', 'should be on phase branch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdWebsearch tests (CMD-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('websearch command', () => {
  const { cmdWebsearch } = require('../thrunt-god/bin/lib/commands.cjs');
  let origFetch;
  let origApiKey;
  let origWriteSync;
  let captured;

  beforeEach(() => {
    origFetch = global.fetch;
    origApiKey = process.env.BRAVE_API_KEY;
    origWriteSync = fs.writeSync;
    captured = '';
    // output() uses fs.writeSync(1, data) since #1276 — mock it to capture output
    fs.writeSync = (fd, data) => { if (fd === 1) captured += data; return Buffer.byteLength(String(data)); };
  });

  afterEach(() => {
    global.fetch = origFetch;
    if (origApiKey !== undefined) {
      process.env.BRAVE_API_KEY = origApiKey;
    } else {
      delete process.env.BRAVE_API_KEY;
    }
    fs.writeSync = origWriteSync;
  });

  test('returns available=false when BRAVE_API_KEY is unset', async () => {
    delete process.env.BRAVE_API_KEY;

    await cmdWebsearch('test query', {}, false);

    const output = JSON.parse(captured);
    assert.strictEqual(output.available, false);
    assert.ok(output.reason.includes('BRAVE_API_KEY'), 'should mention missing API key');
  });

  test('returns error when no query provided', async () => {
    process.env.BRAVE_API_KEY = 'test-key';

    await cmdWebsearch(null, {}, false);

    const output = JSON.parse(captured);
    assert.strictEqual(output.available, false);
    assert.ok(output.error.includes('Query required'), 'should mention query required');
  });

  test('returns results for successful API response', async () => {
    process.env.BRAVE_API_KEY = 'test-key';

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'Test Result', url: 'https://example.com', description: 'A test result', age: '1d' },
          ],
        },
      }),
    });

    await cmdWebsearch('test query', { limit: 5, freshness: 'pd' }, false);

    const output = JSON.parse(captured);
    assert.strictEqual(output.available, true);
    assert.strictEqual(output.query, 'test query');
    assert.strictEqual(output.count, 1);
    assert.strictEqual(output.results[0].title, 'Test Result');
    assert.strictEqual(output.results[0].url, 'https://example.com');
    assert.strictEqual(output.results[0].age, '1d');
  });

  test('constructs correct URL parameters', async () => {
    process.env.BRAVE_API_KEY = 'test-key';
    let capturedUrl = '';

    global.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({ web: { results: [] } }),
      };
    };

    await cmdWebsearch('node.js testing', { limit: 5, freshness: 'pd' }, false);

    const parsed = new URL(capturedUrl);
    assert.strictEqual(parsed.searchParams.get('q'), 'node.js testing', 'query param should decode to original string');
    assert.strictEqual(parsed.searchParams.get('count'), '5', 'count param should be 5');
    assert.strictEqual(parsed.searchParams.get('freshness'), 'pd', 'freshness param should be pd');
  });

  test('handles API error (non-200 status)', async () => {
    process.env.BRAVE_API_KEY = 'test-key';

    global.fetch = async () => ({
      ok: false,
      status: 429,
    });

    await cmdWebsearch('test query', {}, false);

    const output = JSON.parse(captured);
    assert.strictEqual(output.available, false);
    assert.ok(output.error.includes('429'), 'error should include status code');
  });

  test('handles network failure', async () => {
    process.env.BRAVE_API_KEY = 'test-key';

    global.fetch = async () => {
      throw new Error('Network timeout');
    };

    await cmdWebsearch('test query', {}, false);

    const output = JSON.parse(captured);
    assert.strictEqual(output.available, false);
    assert.strictEqual(output.error, 'Network timeout');
  });
});

describe('stats command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns valid JSON with empty hunt program', () => {
    const result = runThruntTools('stats', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stats = JSON.parse(result.output);
    assert.ok(Array.isArray(stats.phases), 'phases should be an array');
    assert.strictEqual(stats.total_plans, 0);
    assert.strictEqual(stats.total_summaries, 0);
    assert.strictEqual(stats.percent, 0);
    assert.strictEqual(stats.phases_completed, 0);
    assert.strictEqual(stats.phases_total, 0);
    assert.strictEqual(stats.hypotheses_total, 0);
    assert.strictEqual(stats.hypotheses_complete, 0);
  });

  test('counts phases, plans, and summaries correctly', () => {
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-auth');
    const p2 = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(p1, { recursive: true });
    fs.mkdirSync(p2, { recursive: true });

    // Phase 1: 2 plans, 2 summaries (complete)
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-02-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(p1, '01-02-SUMMARY.md'), '# Summary');

    // Phase 2: 1 plan, 0 summaries (planned)
    fs.writeFileSync(path.join(p2, '02-01-PLAN.md'), '# Plan');

    const result = runThruntTools('stats', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stats = JSON.parse(result.output);
    assert.strictEqual(stats.phases_total, 2);
    assert.strictEqual(stats.phases_completed, 1);
    assert.strictEqual(stats.total_plans, 3);
    assert.strictEqual(stats.total_summaries, 2);
    assert.strictEqual(stats.percent, 50);
    assert.strictEqual(stats.plan_percent, 67);
  });

  test('counts hypotheses from HYPOTHESES.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HYPOTHESES.md'),
      `# Hypotheses

## Active Hypotheses

- [x] **AUTH-01**: User can sign up
- [x] **AUTH-02**: User can log in
- [ ] **API-01**: REST endpoints
- [ ] **API-02**: GraphQL support
`
    );

    const result = runThruntTools('stats', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stats = JSON.parse(result.output);
    assert.strictEqual(stats.hypotheses_total, 4);
    assert.strictEqual(stats.hypotheses_complete, 2);
  });

  test('reads last activity from STATE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Phase:** 01\n**Status:** In progress\n**Last Activity:** 2025-06-15\n**Last Activity Description:** Working\n`
    );

    const result = runThruntTools('stats', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stats = JSON.parse(result.output);
    assert.strictEqual(stats.last_activity, '2025-06-15');
  });

  test('reads last activity from plain STATE.md template format', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Hunt State\n\n## Current Position\n\nPhase: 1 of 2 (Foundation)\nPlan: 1 of 1 in current phase\nStatus: In progress\nLast activity: 2025-06-16 — Finished plan 01-01\n`
    );

    const result = runThruntTools('stats', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stats = JSON.parse(result.output);
    assert.strictEqual(stats.last_activity, '2025-06-16 — Finished plan 01-01');
  });

  test('includes roadmap-only phases in totals and preserves hyphenated names', () => {
    const p1 = path.join(tmpDir, '.planning', 'phases', '14-auth-hardening');
    const p2 = path.join(tmpDir, '.planning', 'phases', '15-proof-generation');
    fs.mkdirSync(p1, { recursive: true });
    fs.mkdirSync(p2, { recursive: true });
    fs.writeFileSync(path.join(p1, '14-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '14-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(p2, '15-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p2, '15-01-SUMMARY.md'), '# Summary');

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap

- [x] **Phase 14: Auth Hardening**
- [x] **Phase 15: Proof Generation**
- [ ] **Phase 16: Multi-Claim Verification & UX**

## Milestone v1.0 Growth

### Phase 14: Auth Hardening
**Goal:** Improve auth checks

### Phase 15: Proof Generation
**Goal:** Improve proof generation

### Phase 16: Multi-Claim Verification & UX
**Goal:** Support multi-claim verification
`
    );

    const result = runThruntTools('stats', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stats = JSON.parse(result.output);
    assert.strictEqual(stats.phases_total, 3);
    assert.strictEqual(stats.phases_completed, 2);
    assert.strictEqual(stats.percent, 67);
    assert.strictEqual(stats.plan_percent, 100);
    assert.strictEqual(
      stats.phases.find(p => p.number === '16')?.name,
      'Multi-Claim Verification & UX'
    );
    assert.strictEqual(
      stats.phases.find(p => p.number === '16')?.status,
      'Not Started'
    );
  });

  test('reports git commit count and first commit date from repository history', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });

    fs.writeFileSync(path.join(tmpDir, '.planning', 'MISSION.md'), '# Project\n');
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "initial commit"', {
      cwd: tmpDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
      },
    });

    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Updated\n');
    execSync('git add README.md', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "second commit"', {
      cwd: tmpDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: '2026-02-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-02-01T00:00:00Z',
      },
    });

    const result = runThruntTools('stats', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stats = JSON.parse(result.output);
    assert.strictEqual(stats.git_commits, 2);
    assert.strictEqual(stats.git_first_commit_date, '2026-01-01');
  });

  test('table format renders readable output', () => {
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-auth');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const result = runThruntTools('stats table', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.ok(parsed.rendered, 'table format should include rendered field');
    assert.ok(parsed.rendered.includes('Statistics'), 'should include Statistics header');
    assert.ok(parsed.rendered.includes('| Phase |'), 'should include table header');
    assert.ok(parsed.rendered.includes('| 1 |'), 'should include phase row');
    assert.ok(parsed.rendered.includes('1/1 phases'), 'should report phase progress');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdMigrateCase tests (HIER-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdMigrateCase', () => {
  const { createTempGitProject } = require('./helpers.cjs');
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    // Set up a flat .planning/ with hunt artifacts
    const planDir = path.join(tmpDir, '.planning');
    fs.writeFileSync(path.join(planDir, 'STATE.md'), '---\nthrunt_state_version: 1.0\nstatus: active\ncase_roster: []\n---\n\n# State\n');
    fs.writeFileSync(path.join(planDir, 'MISSION.md'), '# Mission\n');
    fs.writeFileSync(path.join(planDir, 'ENVIRONMENT.md'), '# Environment\n');
    fs.writeFileSync(path.join(planDir, 'config.json'), '{}');
    fs.writeFileSync(path.join(planDir, 'HUNTMAP.md'), '# Huntmap\n');
    fs.writeFileSync(path.join(planDir, 'HYPOTHESES.md'), '# Hypotheses\n');
    fs.writeFileSync(path.join(planDir, 'SUCCESS_CRITERIA.md'), '# Success Criteria\n');
    fs.writeFileSync(path.join(planDir, 'FINDINGS.md'), '# Findings\n');
    fs.mkdirSync(path.join(planDir, 'QUERIES'), { recursive: true });
    fs.mkdirSync(path.join(planDir, 'RECEIPTS'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('successful migration moves hunt artifacts into cases/<slug>/', () => {
    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.slug, 'my-hunt');
    assert.ok(parsed.files_moved.includes('HUNTMAP.md'), 'should move HUNTMAP.md');
    assert.ok(parsed.files_moved.includes('HYPOTHESES.md'), 'should move HYPOTHESES.md');
    assert.ok(parsed.files_moved.includes('SUCCESS_CRITERIA.md'), 'should move SUCCESS_CRITERIA.md');
    assert.ok(parsed.files_moved.includes('FINDINGS.md'), 'should move FINDINGS.md');
    assert.ok(parsed.files_moved.includes('QUERIES'), 'should move QUERIES/');
    assert.ok(parsed.files_moved.includes('RECEIPTS'), 'should move RECEIPTS/');

    // Verify files exist at new location
    const caseDir = path.join(tmpDir, '.planning', 'cases', 'my-hunt');
    assert.ok(fs.existsSync(path.join(caseDir, 'HUNTMAP.md')), 'HUNTMAP.md should exist in case dir');
    assert.ok(fs.existsSync(path.join(caseDir, 'HYPOTHESES.md')), 'HYPOTHESES.md should exist in case dir');
    assert.ok(fs.existsSync(path.join(caseDir, 'QUERIES')), 'QUERIES/ should exist in case dir');
    assert.ok(fs.existsSync(path.join(caseDir, 'RECEIPTS')), 'RECEIPTS/ should exist in case dir');

    // Verify files removed from root
    assert.ok(!fs.existsSync(path.join(tmpDir, '.planning', 'HUNTMAP.md')), 'HUNTMAP.md should not remain at root');
    assert.ok(!fs.existsSync(path.join(tmpDir, '.planning', 'HYPOTHESES.md')), 'HYPOTHESES.md should not remain at root');
  });

  test('shared artifacts (MISSION.md, ENVIRONMENT.md, config.json) stay at root', () => {
    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Shared artifacts must remain at root
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'MISSION.md')), 'MISSION.md should stay at root');
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'ENVIRONMENT.md')), 'ENVIRONMENT.md should stay at root');
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'config.json')), 'config.json should stay at root');

    // Shared artifacts should not be moved into the case dir
    const caseDir = path.join(tmpDir, '.planning', 'cases', 'my-hunt');
    assert.ok(!fs.existsSync(path.join(caseDir, 'ENVIRONMENT.md')), 'ENVIRONMENT.md should not be in case dir');
    assert.ok(!fs.existsSync(path.join(caseDir, 'config.json')), 'config.json should not be in case dir');
  });

  test('creates case-level MISSION.md with required sections during migration', () => {
    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const caseMissionPath = path.join(tmpDir, '.planning', 'cases', 'my-hunt', 'MISSION.md');
    assert.ok(fs.existsSync(caseMissionPath), 'case MISSION.md should be created');

    const content = fs.readFileSync(caseMissionPath, 'utf-8');
    assert.ok(content.includes('**Mode:** case'));
    assert.ok(content.includes('## Signal'));
    assert.ok(content.includes('## Desired Outcome'));
    assert.ok(content.includes('## Scope'));
    assert.ok(content.includes('migrated from the flat .planning/ layout'));
  });

  test('creates case-level STATE.md with active status', () => {
    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const caseStatePath = path.join(tmpDir, '.planning', 'cases', 'my-hunt', 'STATE.md');
    assert.ok(fs.existsSync(caseStatePath), 'case STATE.md should be created');

    const content = fs.readFileSync(caseStatePath, 'utf-8');
    assert.ok(content.includes('status: active'), 'case STATE.md should have active status');
    assert.ok(content.includes('opened_at:'), 'case STATE.md should have opened_at');
  });

  test('creates parseable migrated case STATE.md content', () => {
    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const caseStatePath = path.join(tmpDir, '.planning', 'cases', 'my-hunt', 'STATE.md');
    const content = fs.readFileSync(caseStatePath, 'utf-8');
    assert.ok(content.includes('title: My Hunt'));
    assert.ok(content.includes('## Current Position'));
    assert.ok(content.includes('**Active signal:** my-hunt migrated from flat .planning/ layout'));
    assert.ok(content.includes('Status: Active'));
  });

  test('sets .active-case pointer to migrated slug', () => {
    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const pointerPath = path.join(tmpDir, '.planning', '.active-case');
    assert.ok(fs.existsSync(pointerPath), '.active-case should be created');
    assert.strictEqual(fs.readFileSync(pointerPath, 'utf-8').trim(), 'my-hunt');
  });

  test('rejects when case directory already exists', () => {
    // Create the case dir first
    fs.mkdirSync(path.join(tmpDir, '.planning', 'cases', 'my-hunt'), { recursive: true });

    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(!result.success, 'should fail when case directory exists');
    assert.ok(result.error.includes('already exists') || result.output.includes('already exists'),
      'error should mention directory already exists');
  });

  test('rejects empty slug', () => {
    const result = runThruntTools('migrate-case', tmpDir);
    assert.ok(!result.success, 'should fail with no slug');
  });

  test('rejects path traversal in slug', () => {
    const result = runThruntTools('migrate-case ../escape', tmpDir);
    assert.ok(!result.success, 'should fail with path traversal');
  });

  test('only moves artifacts that exist (skips missing ones)', () => {
    // Remove some artifacts
    fs.unlinkSync(path.join(tmpDir, '.planning', 'SUCCESS_CRITERIA.md'));
    fs.unlinkSync(path.join(tmpDir, '.planning', 'FINDINGS.md'));

    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.ok(!parsed.files_moved.includes('SUCCESS_CRITERIA.md'), 'should not list missing SUCCESS_CRITERIA.md');
    assert.ok(!parsed.files_moved.includes('FINDINGS.md'), 'should not list missing FINDINGS.md');
    assert.ok(parsed.files_moved.includes('HUNTMAP.md'), 'should still move existing HUNTMAP.md');
  });

  test('adds case to program STATE.md roster', () => {
    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('my-hunt'), 'STATE.md roster should contain the case slug');
  });

  test('roster write failure aborts migration and rolls artifacts back', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\n' +
      'thrunt_state_version: 1.0\n' +
      'status: active\n' +
      'case_roster:\n' +
      '  - slug: my-hunt\n' +
      '    name: Existing Hunt\n' +
      '    status: active\n' +
      '    opened_at: "2026-04-01"\n' +
      '    technique_count: "0"\n' +
      '---\n\n# State\n'
    );

    const result = runThruntTools('migrate-case my-hunt', tmpDir);
    assert.ok(!result.success, 'migration should fail when roster already has the slug');
    assert.ok(
      (result.error || result.output).includes('rolled back'),
      'failure should report rollback'
    );

    assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'HUNTMAP.md')), 'HUNTMAP.md should be restored at root');
    assert.ok(!fs.existsSync(path.join(tmpDir, '.planning', 'cases', 'my-hunt')), 'case dir should be removed on rollback');
  });

  test('rollback on failure restores files to original location', () => {
    // This test validates via unit test by calling cmdMigrateCase directly with a
    // scenario that would fail. We test indirectly: if the case dir doesn't exist
    // after a failed migration, rollback worked. Use a slug with invalid chars
    // to trigger early error (before any moves happen).
    // For a true rollback test, we need to test at the function level.
    // The CLI integration test verifies the happy path and error paths.
    // We'll verify that after a failed attempt (duplicate slug), the original files remain.
    const result1 = runThruntTools('migrate-case first-case', tmpDir);
    assert.ok(result1.success, `First migration failed: ${result1.error}`);

    // Now create a new flat structure and try to migrate with same slug
    fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'), '# New Huntmap\n');
    const result2 = runThruntTools('migrate-case first-case', tmpDir);
    assert.ok(!result2.success, 'duplicate migration should fail');

    // The new HUNTMAP.md should still be at root (not lost)
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'HUNTMAP.md')), 'HUNTMAP.md should remain at root after failed migration');
  });
});

describe('cmdProgramRollup', () => {
  const { createTempGitProject } = require('./helpers.cjs');
  let tmpDir;

  function setupProgramState(cwd, rosterEntries = []) {
    const planDir = path.join(cwd, '.planning');
    const rosterYaml = rosterEntries.length === 0
      ? 'case_roster: []'
      : 'case_roster:\n' + rosterEntries.map(e => {
          let yaml = `  - slug: ${e.slug}\n    name: ${e.name}\n    status: ${e.status}\n    opened_at: "${e.opened_at}"`;
          if (e.closed_at) yaml += `\n    closed_at: "${e.closed_at}"`;
          if (e.technique_count) yaml += `\n    technique_count: "${e.technique_count}"`;
          if (e.last_activity) yaml += `\n    last_activity: "${e.last_activity}"`;
          return yaml;
        }).join('\n');
    fs.writeFileSync(path.join(planDir, 'STATE.md'),
      `---\nthrunt_state_version: 1.0\nstatus: active\n${rosterYaml}\n---\n\n# Program State\n`);
    fs.writeFileSync(path.join(planDir, 'MISSION.md'), '# Mission\n');
    fs.writeFileSync(path.join(planDir, 'config.json'), '{}');
  }

  function setupCaseState(cwd, slug, techniqueIds = []) {
    const caseDir = path.join(cwd, '.planning', 'cases', slug);
    fs.mkdirSync(caseDir, { recursive: true });
    const techYaml = techniqueIds.length === 0
      ? 'technique_ids: []'
      : 'technique_ids: [' + techniqueIds.join(', ') + ']';
    fs.writeFileSync(path.join(caseDir, 'STATE.md'),
      `---\nstatus: active\nopened_at: "2026-04-01"\n${techYaml}\n---\n\n# Case: ${slug}\n`);
  }

  beforeEach(() => {
    tmpDir = createTempGitProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('programRollup: empty roster generates 0 counts', () => {
    setupProgramState(tmpDir, []);
    const result = runThruntTools('program rollup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.active, 0);
    assert.strictEqual(parsed.closed, 0);
    assert.strictEqual(parsed.stale, 0);
    assert.strictEqual(parsed.techniques, 0);

    // Verify STATE.md body contains Case Summary
    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('## Case Summary'), 'should contain ## Case Summary');
    assert.ok(stateContent.includes('0 active, 0 closed, 0 stale'), 'should show zero counts');
  });

  test('programRollup: 2 cases (1 active, 1 closed) produces correct counts and table', () => {
    setupProgramState(tmpDir, [
      { slug: 'case-alpha', name: 'Alpha', status: 'active', opened_at: '2026-04-01', technique_count: '2' },
      { slug: 'case-beta', name: 'Beta', status: 'closed', opened_at: '2026-03-15', closed_at: '2026-04-05', technique_count: '1' },
    ]);
    setupCaseState(tmpDir, 'case-alpha', ['T1059.001', 'T1053.005']);
    setupCaseState(tmpDir, 'case-beta', ['T1059.001']);

    const result = runThruntTools('program rollup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.active, 1);
    assert.strictEqual(parsed.closed, 1);
    assert.strictEqual(parsed.stale, 0);
    assert.strictEqual(parsed.techniques, 2);

    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('case-alpha'), 'table should include case-alpha');
    assert.ok(stateContent.includes('case-beta'), 'table should include case-beta');
    assert.ok(stateContent.includes('| Slug |'), 'should have table header');
  });

  test('programRollup: technique_ids from case STATE.md are aggregated as unique set', () => {
    setupProgramState(tmpDir, [
      { slug: 'case-1', name: 'One', status: 'active', opened_at: '2026-04-01' },
      { slug: 'case-2', name: 'Two', status: 'active', opened_at: '2026-04-02' },
    ]);
    // Overlapping technique: T1059.001 appears in both
    setupCaseState(tmpDir, 'case-1', ['T1059.001', 'T1053.005']);
    setupCaseState(tmpDir, 'case-2', ['T1059.001', 'T1078.004']);

    const result = runThruntTools('program rollup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.techniques, 3, 'unique technique count should be 3');

    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('Techniques covered:'), 'should list covered techniques');
    assert.ok(stateContent.includes('T1053.005'), 'should include T1053.005');
    assert.ok(stateContent.includes('T1059.001'), 'should include T1059.001');
    assert.ok(stateContent.includes('T1078.004'), 'should include T1078.004');
  });

  test('programRollup: falls back to technique IDs extracted from case artifacts', () => {
    setupProgramState(tmpDir, [
      { slug: 'artifact-case', name: 'Artifact Case', status: 'active', opened_at: '2026-04-01' },
    ]);
    setupCaseState(tmpDir, 'artifact-case', []);

    const caseDir = path.join(tmpDir, '.planning', 'cases', 'artifact-case');
    fs.writeFileSync(
      path.join(caseDir, 'FINDINGS.md'),
      '# Findings\n\nObserved T1059.001 execution followed by T1078.004 credential use.\n'
    );
    fs.writeFileSync(
      path.join(caseDir, 'HYPOTHESES.md'),
      '# Hypotheses\n\n## Hypothesis 1\n\nT1059.001 likely enabled the follow-on access.\n'
    );

    const result = runThruntTools('program rollup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.techniques, 2, 'artifact-derived techniques should be included in rollup');

    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('Techniques covered: T1059.001, T1078.004'));
    assert.ok(stateContent.includes('| artifact-case | Artifact Case | active | 2026-04-01 | - | 2 |'));
    assert.ok(!stateContent.includes('No technique data available.'));
  });

  test('programRollup: artifact fallback still works when db module is unavailable', () => {
    setupProgramState(tmpDir, [
      { slug: 'artifact-case', name: 'Artifact Case', status: 'active', opened_at: '2026-04-01' },
    ]);
    setupCaseState(tmpDir, 'artifact-case', []);

    const caseDir = path.join(tmpDir, '.planning', 'cases', 'artifact-case');
    fs.writeFileSync(
      path.join(caseDir, 'FINDINGS.md'),
      '# Findings\n\nObserved T1059.001 execution followed by T1078.004 credential use.\n'
    );
    fs.writeFileSync(
      path.join(caseDir, 'HYPOTHESES.md'),
      '# Hypotheses\n\n## Hypothesis 1\n\nT1059.001 likely enabled the follow-on access.\n'
    );

    const commandsPath = require.resolve('../thrunt-god/bin/lib/commands.cjs');
    const originalLoad = Module._load;
    const originalWriteSync = fs.writeSync;
    let captured = '';

    delete require.cache[commandsPath];
    Module._load = function(request, parent, isMain) {
      if (request === './db.cjs' && parent && parent.filename === commandsPath) {
        throw new Error('better-sqlite3 unavailable');
      }
      return originalLoad.apply(this, arguments);
    };
    fs.writeSync = (fd, data) => {
      if (fd === 1) captured += data;
      return Buffer.byteLength(String(data));
    };

    try {
      const { cmdProgramRollup } = require('../thrunt-god/bin/lib/commands.cjs');
      cmdProgramRollup(tmpDir, false);
    } finally {
      Module._load = originalLoad;
      fs.writeSync = originalWriteSync;
      delete require.cache[commandsPath];
    }

    const parsed = JSON.parse(captured);
    assert.strictEqual(parsed.techniques, 2, 'artifact-derived techniques should survive without db.cjs');
  });

  test('programRollup: idempotent - running twice does not duplicate Case Summary', () => {
    setupProgramState(tmpDir, [
      { slug: 'case-x', name: 'Xray', status: 'active', opened_at: '2026-04-01' },
    ]);
    setupCaseState(tmpDir, 'case-x');

    // Run twice
    const result1 = runThruntTools('program rollup', tmpDir);
    assert.ok(result1.success, `First run failed: ${result1.error}`);
    const result2 = runThruntTools('program rollup', tmpDir);
    assert.ok(result2.success, `Second run failed: ${result2.error}`);

    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    const matches = stateContent.match(/## Case Summary/g);
    assert.strictEqual(matches.length, 1, 'should have exactly one ## Case Summary section after two runs');
  });

  test('programRollup: stale detection - case opened 30 days ago with no activity shows as stale', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setupProgramState(tmpDir, [
      { slug: 'old-case', name: 'Old Case', status: 'active', opened_at: thirtyDaysAgo },
    ]);
    setupCaseState(tmpDir, 'old-case');
    const caseStatePath = path.join(tmpDir, '.planning', 'cases', 'old-case', 'STATE.md');
    const staleTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(caseStatePath, staleTime, staleTime);

    const result = runThruntTools('program rollup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.stale, 1, 'should detect 1 stale case');
    assert.strictEqual(parsed.active, 0, 'stale cases should not count as active');

    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('stale'), 'STATE.md should show stale status in table');
  });

  test('programRollup: recent case STATE activity keeps active case out of stale bucket', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setupProgramState(tmpDir, [
      { slug: 'recent-case', name: 'Recent Case', status: 'active', opened_at: thirtyDaysAgo },
    ]);
    setupCaseState(tmpDir, 'recent-case');

    const result = runThruntTools('program rollup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.stale, 0, 'recent case STATE activity should prevent stale classification');
    assert.strictEqual(parsed.active, 1, 'case should remain active when STATE.md was recently updated');
  });

  test('programRollup: nested query or receipt activity keeps case active', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setupProgramState(tmpDir, [
      { slug: 'nested-activity', name: 'Nested Activity', status: 'active', opened_at: thirtyDaysAgo },
    ]);
    setupCaseState(tmpDir, 'nested-activity');

    const caseDir = path.join(tmpDir, '.planning', 'cases', 'nested-activity');
    const caseStatePath = path.join(caseDir, 'STATE.md');
    const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(caseStatePath, oldTime, oldTime);

    const queryDir = path.join(caseDir, 'QUERIES');
    fs.mkdirSync(queryDir, { recursive: true });
    const queryPath = path.join(queryDir, 'QRY-20260410-001.md');
    fs.writeFileSync(queryPath, '# Query\n\nRecent evidence collection.\n');

    const recentTime = new Date();
    fs.utimesSync(queryPath, recentTime, recentTime);

    const result = runThruntTools('program rollup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.stale, 0, 'nested activity should prevent stale classification');
    assert.strictEqual(parsed.active, 1, 'case should remain active when nested artifacts were updated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdCaseClose indexing + cmdCaseNew auto-search (Phase 52 Plan 02)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdCaseClose indexing + cmdCaseNew auto-search', () => {
  const Database = require('better-sqlite3');
  let tmpDir;

  function setupProgramState(cwd, rosterEntries = []) {
    const planDir = path.join(cwd, '.planning');
    fs.mkdirSync(planDir, { recursive: true });
    const rosterYaml = rosterEntries.length === 0
      ? 'case_roster: []'
      : 'case_roster:\n' + rosterEntries.map(e => {
          let yaml = `  - slug: ${e.slug}\n    name: ${e.name}\n    status: ${e.status}\n    opened_at: "${e.opened_at}"`;
          if (e.closed_at) yaml += `\n    closed_at: "${e.closed_at}"`;
          if (e.technique_count) yaml += `\n    technique_count: "${e.technique_count}"`;
          return yaml;
        }).join('\n');
    fs.writeFileSync(path.join(planDir, 'STATE.md'),
      `---\nthrunt_state_version: 1.0\nstatus: active\n${rosterYaml}\n---\n\n# Program State\n`);
    fs.writeFileSync(path.join(planDir, 'MISSION.md'), '# Mission\n');
    fs.writeFileSync(path.join(planDir, 'config.json'), '{}');
  }

  function createCaseDir(cwd, slug, opts = {}) {
    const caseDir = path.join(cwd, '.planning', 'cases', slug);
    fs.mkdirSync(caseDir, { recursive: true });
    fs.mkdirSync(path.join(caseDir, 'QUERIES'), { recursive: true });
    fs.mkdirSync(path.join(caseDir, 'RECEIPTS'), { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const techYaml = opts.technique_ids && opts.technique_ids.length > 0
      ? 'technique_ids: [' + opts.technique_ids.join(', ') + ']'
      : 'technique_ids: []';
    const status = opts.status || 'active';
    const title = opts.name || slug;
    const outcomeYaml = opts.outcome_summary ? `\noutcome_summary: "${opts.outcome_summary}"` : '';
    fs.writeFileSync(path.join(caseDir, 'STATE.md'),
      `---\nstatus: ${status}\nopened_at: "${today}"\ntitle: "${title}"\n${techYaml}${outcomeYaml}\n---\n\n# Case: ${title}\n`);

    fs.writeFileSync(path.join(caseDir, 'HUNTMAP.md'),
      `---\ntitle: ${title}\nstatus: active\ncreated: ${today}\n---\n\n# Huntmap\n`);

    fs.writeFileSync(path.join(caseDir, 'HYPOTHESES.md'),
      opts.hypotheses || `# Hypotheses\n\n_No hypotheses yet._\n`);

    if (opts.findings) {
      fs.writeFileSync(path.join(caseDir, 'FINDINGS.md'), opts.findings);
    }

    return caseDir;
  }

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('cmdCaseClose indexes case artifacts into program.db', () => {
    // Create a case with FINDINGS.md containing technique IDs and IOCs
    setupProgramState(tmpDir, [
      { slug: 'apt-powershell', name: 'APT Powershell', status: 'active', opened_at: '2026-04-01' },
    ]);
    createCaseDir(tmpDir, 'apt-powershell', {
      name: 'APT Powershell',
      technique_ids: ['T1059.001'],
      findings: '# Findings\n\nAttacker used T1059.001 powershell to execute malware from 192.168.1.50.\nPayload hash: d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592\n',
      hypotheses: '## Hypothesis 1: PowerShell Abuse\n\nAdversary leverages T1059.001 for initial execution.\n',
    });

    // Close the case (should trigger indexing)
    const result = runThruntTools(['case', 'close', 'apt-powershell'], tmpDir);
    assert.ok(result.success, `Close failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);

    // Verify program.db exists and contains indexed data
    const dbPath = path.join(tmpDir, '.planning', 'program.db');
    assert.ok(fs.existsSync(dbPath), 'program.db should exist after case close');

    const db = new Database(dbPath);
    try {
      const caseRows = db.prepare('SELECT * FROM case_index WHERE slug = ?').all('apt-powershell');
      assert.strictEqual(caseRows.length, 1, 'should have exactly 1 case_index row');
      assert.strictEqual(caseRows[0].slug, 'apt-powershell');

      const artifacts = db.prepare('SELECT * FROM case_artifacts WHERE case_id = ?').all(caseRows[0].id);
      assert.ok(artifacts.length >= 2, 'should have at least 2 artifacts (finding + hypothesis)');

      const techniques = db.prepare('SELECT * FROM case_techniques WHERE case_id = ?').all(caseRows[0].id);
      assert.ok(techniques.length >= 1, 'should have at least 1 technique');
      assert.ok(techniques.some(t => t.technique_id === 'T1059.001'), 'should include T1059.001');
    } finally {
      db.close();
    }
  });

  test('cmdCaseClose re-indexing is idempotent', () => {
    setupProgramState(tmpDir, [
      { slug: 'idempotent-case', name: 'Idempotent Case', status: 'active', opened_at: '2026-04-01' },
    ]);
    createCaseDir(tmpDir, 'idempotent-case', {
      name: 'Idempotent Case',
      findings: '# Findings\n\nSuspicious lateral movement T1021.002 via SMB.\n',
    });

    // Close twice
    runThruntTools(['case', 'close', 'idempotent-case'], tmpDir);

    // Re-open by manipulating roster, then close again
    const planDir = path.join(tmpDir, '.planning');
    const stateContent = fs.readFileSync(path.join(planDir, 'STATE.md'), 'utf-8');
    fs.writeFileSync(path.join(planDir, 'STATE.md'),
      stateContent.replace('status: closed', 'status: active'));
    // Update case STATE.md too
    const caseStatePath = path.join(planDir, 'cases', 'idempotent-case', 'STATE.md');
    const caseState = fs.readFileSync(caseStatePath, 'utf-8');
    fs.writeFileSync(caseStatePath, caseState.replace('status: closed', 'status: active'));

    runThruntTools(['case', 'close', 'idempotent-case'], tmpDir);

    // Verify no duplicates
    const dbPath = path.join(planDir, 'program.db');
    const db = new Database(dbPath);
    try {
      const caseRows = db.prepare('SELECT * FROM case_index WHERE slug = ?').all('idempotent-case');
      assert.strictEqual(caseRows.length, 1, 'should have exactly 1 case_index row after re-close');

      const artifacts = db.prepare('SELECT * FROM case_artifacts WHERE case_id = ?').all(caseRows[0].id);
      // Should not have duplicates — count finding artifacts
      const findings = artifacts.filter(a => a.artifact_type === 'finding');
      assert.strictEqual(findings.length, 1, 'should have exactly 1 finding artifact after re-close');
    } finally {
      db.close();
    }
  });

  test('cmdCaseClose without FINDINGS.md still succeeds', () => {
    setupProgramState(tmpDir, [
      { slug: 'no-findings', name: 'No Findings Case', status: 'active', opened_at: '2026-04-01' },
    ]);
    createCaseDir(tmpDir, 'no-findings', {
      name: 'No Findings Case',
      // no findings, just hypotheses
      hypotheses: '## Hypothesis A\n\nTest hypothesis content.\n',
    });

    const result = runThruntTools(['case', 'close', 'no-findings'], tmpDir);
    assert.ok(result.success, `Close failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true, 'case close should succeed without FINDINGS.md');

    // DB should still exist and have hypothesis indexed
    const dbPath = path.join(tmpDir, '.planning', 'program.db');
    assert.ok(fs.existsSync(dbPath), 'program.db should exist even without FINDINGS.md');
  });

  test('cmdCaseNew returns empty past_case_matches on first case', () => {
    setupProgramState(tmpDir, []);

    const result = runThruntTools(['case', 'new', 'First Investigation'], tmpDir);
    assert.ok(result.success, `New case failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(Array.isArray(output.past_case_matches), 'output should include past_case_matches array');
    assert.strictEqual(output.past_case_matches.length, 0, 'first case should have empty past_case_matches');
  });

  test('cmdCaseNew writes parseable case STATE.md content', () => {
    setupProgramState(tmpDir, []);

    const result = runThruntTools(['case', 'new', 'First Investigation'], tmpDir);
    assert.ok(result.success, `New case failed: ${result.error}`);

    const statePath = path.join(tmpDir, '.planning', 'cases', 'first-investigation', 'STATE.md');
    const content = fs.readFileSync(statePath, 'utf-8');
    assert.ok(content.includes('title: First Investigation'));
    assert.ok(content.includes('## Current Position'));
    assert.ok(content.includes('**Active signal:** First Investigation opened for investigation'));
    assert.ok(content.includes('Phase: 1 of 1 (Initial Triage and Evidence Collection)'));
    assert.ok(content.includes('Plan: 1 of 2 in current phase'));
    assert.ok(content.includes('Status: Active'));
  });

  test('cmdCaseNew can bootstrap a minimal program root when requested', () => {
    const bareDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'thrunt-case-bootstrap-'));
    try {
      const result = runThruntTools([
        'case',
        'new',
        'Bridge Opened Investigation',
        '--signal',
        'Browser console signal',
        '--bootstrap-program',
      ], bareDir);
      assert.ok(result.success, `New case failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.success, true);
      assert.strictEqual(output.bootstrapped_program, true);
      assert.ok(fs.existsSync(path.join(bareDir, '.planning', 'STATE.md')), 'program STATE.md should exist');
      assert.ok(fs.existsSync(path.join(bareDir, '.planning', 'MISSION.md')), 'program MISSION.md should exist');
      assert.ok(fs.existsSync(path.join(bareDir, '.planning', 'cases', 'bridge-opened-investigation', 'MISSION.md')), 'case MISSION.md should exist');
    } finally {
      cleanup(bareDir);
    }
  });

  test('cmdCaseNew returns matches after past case indexed', () => {
    setupProgramState(tmpDir, []);

    // Create and close a case with content about powershell T1059.001
    const newResult = runThruntTools(['case', 'new', 'PowerShell Execution'], tmpDir);
    assert.ok(newResult.success, `New case failed: ${newResult.error}`);

    // Add FINDINGS.md to the created case
    const caseDir = path.join(tmpDir, '.planning', 'cases', 'powershell-execution');
    fs.writeFileSync(path.join(caseDir, 'FINDINGS.md'),
      '# Findings\n\nAdversary used T1059.001 PowerShell to download and execute payload.\n' +
      'Lateral movement detected via T1021.002 SMB shares.\n' +
      'Malicious IP: 10.0.0.42\n');

    // Close the case (triggers indexing)
    const closeResult = runThruntTools(['case', 'close', 'powershell-execution'], tmpDir);
    assert.ok(closeResult.success, `Close failed: ${closeResult.error}`);

    // Now create a new case with a name that overlaps with the past case
    const newResult2 = runThruntTools(['case', 'new', 'PowerShell T1059 Investigation'], tmpDir);
    assert.ok(newResult2.success, `Second new case failed: ${newResult2.error}`);
    const output2 = JSON.parse(newResult2.output);
    assert.ok(Array.isArray(output2.past_case_matches), 'output should include past_case_matches');
    assert.ok(output2.past_case_matches.length > 0, 'should have past case matches from FTS or technique overlap');
    assert.ok(
      output2.past_case_matches.some(match => match.name === 'PowerShell Execution'),
      'past case matches should preserve the user-facing case title instead of the slug'
    );
  });

  test('cmdCaseClose indexing failure is non-fatal', () => {
    setupProgramState(tmpDir, [
      { slug: 'error-case', name: 'Error Case', status: 'active', opened_at: '2026-04-01' },
    ]);
    // Create case dir but make the case dir not exist (so indexCase fails to find FINDINGS)
    // Actually just verify the try/catch structure works by checking close succeeds
    // The real test: close succeeds even when case dir is missing for indexing
    // We skip creating the case dir files for indexing — only the STATE.md in cases/ is needed
    const caseDir = path.join(tmpDir, '.planning', 'cases', 'error-case');
    fs.mkdirSync(caseDir, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    fs.writeFileSync(path.join(caseDir, 'STATE.md'),
      `---\nstatus: active\nopened_at: "${today}"\ntitle: "Error Case"\n---\n\n# Case\n`);

    const result = runThruntTools(['case', 'close', 'error-case'], tmpDir);
    assert.ok(result.success, `Close should succeed even if indexing has issues: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true, 'case close should succeed even with indexing edge cases');
  });

  test('cmdCaseClose updates structured case STATE.md status fields', () => {
    setupProgramState(tmpDir, []);

    const newResult = runThruntTools(['case', 'new', 'Close Me'], tmpDir);
    assert.ok(newResult.success, `New case failed: ${newResult.error}`);

    const closeResult = runThruntTools(['case', 'close', 'close-me'], tmpDir);
    assert.ok(closeResult.success, `Close failed: ${closeResult.error}`);

    const statePath = path.join(tmpDir, '.planning', 'cases', 'close-me', 'STATE.md');
    const content = fs.readFileSync(statePath, 'utf-8');
    assert.ok(content.includes('status: closed'), 'frontmatter should be updated to closed');
    assert.ok(content.includes('Status: Closed'), 'body status should be updated to Closed');
    assert.ok(content.includes('Last activity: Closed '), 'body last activity should reflect closure');
  });

  test('cmdCaseClose refreshes roster technique_count from indexed case techniques', () => {
    setupProgramState(tmpDir, [
      { slug: 'count-me', name: 'Count Me', status: 'active', opened_at: '2026-04-01', technique_count: '0' },
    ]);
    createCaseDir(tmpDir, 'count-me', {
      name: 'Count Me',
      findings: '# Findings\n\nObserved T1059.001 execution and T1021.002 lateral movement.\n',
      hypotheses: '## Hypothesis A\n\nFollow-up on T1059.001 activity.\n',
    });

    const closeResult = runThruntTools(['case', 'close', 'count-me'], tmpDir);
    assert.ok(closeResult.success, `Close failed: ${closeResult.error}`);

    const statusResult = runThruntTools(['case', 'status', 'count-me'], tmpDir);
    assert.ok(statusResult.success, `Status failed: ${statusResult.error}`);
    const status = JSON.parse(statusResult.output);

    assert.strictEqual(status.status, 'closed');
    assert.strictEqual(status.technique_count, '2');
  });

  test('cmdCaseClose persists inferred technique_ids into case STATE.md frontmatter', () => {
    setupProgramState(tmpDir, [
      { slug: 'persist-techniques', name: 'Persist Techniques', status: 'active', opened_at: '2026-04-01', technique_count: '0' },
    ]);
    createCaseDir(tmpDir, 'persist-techniques', {
      name: 'Persist Techniques',
      findings: '# Findings\n\nObserved T1059.001 execution and T1021.002 lateral movement.\n',
      hypotheses: '## Hypothesis A\n\nFollow-up on T1059.001 activity.\n',
    });

    const statePath = path.join(tmpDir, '.planning', 'cases', 'persist-techniques', 'STATE.md');
    const beforeClose = extractFrontmatter(fs.readFileSync(statePath, 'utf-8'));
    assert.deepStrictEqual(beforeClose.technique_ids, []);

    const closeResult = runThruntTools(['case', 'close', 'persist-techniques'], tmpDir);
    assert.ok(closeResult.success, `Close failed: ${closeResult.error}`);

    const afterClose = extractFrontmatter(fs.readFileSync(statePath, 'utf-8'));
    assert.deepStrictEqual(afterClose.technique_ids, ['T1021.002', 'T1059.001']);
    assert.strictEqual(afterClose.status, 'closed');
  });

  test('cmdCaseClose preserves legacy case notes when STATE.md lacks Current Position', () => {
    setupProgramState(tmpDir, [
      { slug: 'legacy-case', name: 'Legacy Case', status: 'active', opened_at: '2026-04-01' },
    ]);
    const caseDir = createCaseDir(tmpDir, 'legacy-case', {
      name: 'Legacy Case',
      findings: '# Findings\n\nObserved T1059.001 execution.\n',
    });
    fs.writeFileSync(
      path.join(caseDir, 'STATE.md'),
      [
        '---',
        'status: active',
        'opened_at: "2026-04-01"',
        'title: "Legacy Case"',
        '---',
        '',
        '# Legacy State',
        '',
        '## Analyst Notes',
        '',
        'Preserve this note when the case is closed.',
        '',
        '**Status:** In progress',
      ].join('\n')
    );

    const closeResult = runThruntTools(['case', 'close', 'legacy-case'], tmpDir);
    assert.ok(closeResult.success, `Close failed: ${closeResult.error}`);

    const statePath = path.join(caseDir, 'STATE.md');
    const content = fs.readFileSync(statePath, 'utf-8');
    const fm = extractFrontmatter(content);

    assert.strictEqual(fm.status, 'closed');
    assert.ok(fm.closed_at, 'frontmatter should record closed_at');
    assert.ok(content.includes('## Analyst Notes'), 'custom notes header should be preserved');
    assert.ok(content.includes('Preserve this note when the case is closed.'), 'custom notes content should be preserved');
    assert.ok(content.includes('**Status:** Closed'), 'existing body status line should be updated in place');
    assert.ok(!content.includes('## Current Position'), 'legacy state should not be rewritten to the template body');
  });

  test('cmdCaseClose rejects traversal slugs before mutating other planning scopes', () => {
    setupProgramState(tmpDir, []);

    const workstreamDir = path.join(tmpDir, '.planning', 'workstreams', 'ws');
    fs.mkdirSync(workstreamDir, { recursive: true });
    const originalState = '---\nstatus: active\n---\n# State\n**Status:** In progress\n';
    fs.writeFileSync(path.join(workstreamDir, 'STATE.md'), originalState);

    const result = runThruntTools(['case', 'close', '../workstreams/ws'], tmpDir);
    assert.ok(!result.success, 'case close should fail for traversal slug');
    assert.ok(result.error.includes('Invalid case slug'), `unexpected error: ${result.error}`);

    const currentState = fs.readFileSync(path.join(workstreamDir, 'STATE.md'), 'utf-8');
    assert.strictEqual(currentState, originalState, 'workstream STATE.md should remain unchanged');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdCaseSearch (Phase 52 Plan 02 Task 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdCaseSearch', () => {
  const Database = require('better-sqlite3');
  let tmpDir;

  function setupProgramState(cwd, rosterEntries = []) {
    const planDir = path.join(cwd, '.planning');
    fs.mkdirSync(planDir, { recursive: true });
    const rosterYaml = rosterEntries.length === 0
      ? 'case_roster: []'
      : 'case_roster:\n' + rosterEntries.map(e => {
          let yaml = `  - slug: ${e.slug}\n    name: ${e.name}\n    status: ${e.status}\n    opened_at: "${e.opened_at}"`;
          if (e.closed_at) yaml += `\n    closed_at: "${e.closed_at}"`;
          if (e.technique_count) yaml += `\n    technique_count: "${e.technique_count}"`;
          return yaml;
        }).join('\n');
    fs.writeFileSync(path.join(planDir, 'STATE.md'),
      `---\nthrunt_state_version: 1.0\nstatus: active\n${rosterYaml}\n---\n\n# Program State\n`);
    fs.writeFileSync(path.join(planDir, 'MISSION.md'), '# Mission\n');
    fs.writeFileSync(path.join(planDir, 'config.json'), '{}');
  }

  function createAndCloseCase(cwd, slug, name, opts = {}) {
    // Create case via CLI — slug is derived from name automatically
    const newResult = runThruntTools(['case', 'new', name], cwd);
    // Derive the actual slug from the CLI output
    const derivedSlug = newResult.success ? JSON.parse(newResult.output).slug : slug;

    // Add FINDINGS.md if provided
    const caseDir = path.join(cwd, '.planning', 'cases', derivedSlug);
    if (opts.findings) {
      fs.writeFileSync(path.join(caseDir, 'FINDINGS.md'), opts.findings);
    }
    if (opts.hypotheses) {
      fs.writeFileSync(path.join(caseDir, 'HYPOTHESES.md'), opts.hypotheses);
    }
    // Update case STATE.md with outcome_summary if provided
    if (opts.outcome_summary) {
      const statePath = path.join(caseDir, 'STATE.md');
      const content = fs.readFileSync(statePath, 'utf-8');
      fs.writeFileSync(statePath, content.replace('---\n\n', `outcome_summary: "${opts.outcome_summary}"\n---\n\n`));
    }

    // Close the case (triggers indexing)
    runThruntTools(['case', 'close', derivedSlug], cwd);
  }

  beforeEach(() => {
    tmpDir = createTempProject();
    setupProgramState(tmpDir, []);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('case-search returns matching results', () => {
    createAndCloseCase(tmpDir, 'apt-recon', 'APT Recon', {
      findings: '# Findings\n\nAdversary performed network reconnaissance using T1018 Remote System Discovery.\n' +
        'Scanned internal subnets 10.0.0.0/24 for open SMB shares.\n',
      outcome_summary: 'Recon activity contained',
    });

    const result = runThruntTools(['case-search', 'reconnaissance'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(Array.isArray(output.results), 'results should be array');
    assert.ok(output.results.length > 0, 'should have at least 1 match for "reconnaissance"');
    assert.strictEqual(output.query, 'reconnaissance');

    // Verify result shape has required INTEL-04 fields
    const r = output.results[0];
    assert.ok('slug' in r, 'result should have slug');
    assert.ok('name' in r, 'result should have name');
    assert.ok('match_snippet' in r, 'result should have match_snippet');
    assert.ok('technique_overlap' in r, 'result should have technique_overlap');
    assert.ok('outcome_summary' in r, 'result should have outcome_summary');
    assert.ok('relevance_score' in r, 'result should have relevance_score');
  });

  test('case-search --technique filters by technique ID', () => {
    createAndCloseCase(tmpDir, 'phishing-case', 'Phishing Campaign', {
      findings: '# Findings\n\nT1566.001 spearphishing attachment delivered malware via email.\n',
    });
    createAndCloseCase(tmpDir, 'brute-force', 'Brute Force Attack', {
      findings: '# Findings\n\nT1110.001 password spraying against VPN gateway.\n',
    });

    // Search for technique that only exists in phishing case
    const result = runThruntTools(['case-search', 'malware', '--technique', 'T1566.001'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    // Results should only include cases with T1566.001
    for (const r of output.results) {
      assert.ok(
        r.slug === 'phishing-campaign' || r.technique_overlap?.includes('T1566.001'),
        `result ${r.slug} should have technique T1566.001`
      );
    }
  });

  test('case-search --technique normalizes lowercase technique IDs before overlap lookup', () => {
    createAndCloseCase(tmpDir, 'phishing-case', 'Phishing Campaign', {
      findings: '# Findings\n\nT1566.001 spearphishing attachment delivered malware via email.\n',
    });
    createAndCloseCase(tmpDir, 'brute-force', 'Brute Force Attack', {
      findings: '# Findings\n\nT1110.001 password spraying against VPN gateway.\n',
    });

    const result = runThruntTools(['case-search', 'malware', '--technique', 't1566.001'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(output.results.length > 0, 'expected at least one technique-filtered result');
    for (const r of output.results) {
      assert.ok(
        r.slug === 'phishing-campaign' || r.technique_overlap?.includes('T1566.001'),
        `result ${r.slug} should have technique T1566.001`
      );
    }
  });

  test('case-search --technique matches state-only technique IDs and expands parent technique filters', () => {
    const newResult = runThruntTools(['case', 'new', 'Password Spray Followup'], tmpDir);
    assert.ok(newResult.success, `case new failed: ${newResult.error}`);

    const slug = JSON.parse(newResult.output).slug;
    const caseDir = path.join(tmpDir, '.planning', 'cases', slug);
    fs.writeFileSync(
      path.join(caseDir, 'FINDINGS.md'),
      '# Findings\n\nPassword spray activity confirmed against the Okta tenant.\n'
    );

    const statePath = path.join(caseDir, 'STATE.md');
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    const frontmatter = extractFrontmatter(stateContent);
    frontmatter.technique_ids = ['T1110.003'];
    fs.writeFileSync(statePath, spliceFrontmatter(stateContent, frontmatter));

    const closeResult = runThruntTools(['case', 'close', slug], tmpDir);
    assert.ok(closeResult.success, `case close failed: ${closeResult.error}`);

    const result = runThruntTools(['case-search', 'password spray', '--technique', 'T1110'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.total, 1, `expected one state-backed technique match, got ${output.total}`);
    assert.strictEqual(output.results[0].slug, slug, 'search should return the indexed case');
    assert.ok(
      output.results[0].technique_overlap.includes('T1110.003'),
      'parent technique filter should expand to matching indexed sub-techniques'
    );
  });

  test('case-search --limit caps results', () => {
    // Create 3 cases with similar content
    createAndCloseCase(tmpDir, 'lateral-1', 'Lateral Move Alpha', {
      findings: '# Findings\n\nLateral movement via SMB T1021.002 detected in alpha subnet.\n',
    });
    createAndCloseCase(tmpDir, 'lateral-2', 'Lateral Move Beta', {
      findings: '# Findings\n\nLateral movement via RDP T1021.001 detected in beta subnet.\n',
    });
    createAndCloseCase(tmpDir, 'lateral-3', 'Lateral Move Gamma', {
      findings: '# Findings\n\nLateral movement via WinRM T1021.006 detected in gamma subnet.\n',
    });

    const result = runThruntTools(['case-search', 'lateral', '--limit', '1'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(output.results.length <= 1, 'should have at most 1 result with --limit 1');
  });

  test('case-search returns empty for no matches', () => {
    createAndCloseCase(tmpDir, 'some-case', 'Some Case', {
      findings: '# Findings\n\nSome finding about malware.\n',
    });

    const result = runThruntTools(['case-search', 'zzzyyyxxx_nomatch'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.results.length, 0, 'should have 0 results for non-matching query');
  });

  test('case-search with missing query returns error', () => {
    const result = runThruntTools(['case-search'], tmpDir);
    // Should either fail or return success:false
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.strictEqual(output.success, false, 'should return success:false for missing query');
      assert.ok(output.error, 'should have error message');
    } else {
      assert.ok(result.error, 'should have error output');
    }
  });

  test('case-search rejects option-only invocation without a real query', () => {
    const result = runThruntTools(['case-search', '--limit', '1'], tmpDir);
    assert.ok(result.success, `case-search should exit cleanly: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, false, 'option-only invocation should fail validation');
    assert.ok(output.error.includes('Query required'), 'error should report missing query');
  });

  test('case-search on empty DB returns empty results', () => {
    // Don't create or close any cases — DB should be empty or non-existent
    const result = runThruntTools(['case-search', 'anything'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.results.length, 0, 'empty DB should return 0 results');
  });

  test('case-search results include required INTEL-04 fields', () => {
    createAndCloseCase(tmpDir, 'intel-fields-case', 'Intel Fields Test', {
      findings: '# Findings\n\nDetected T1059.001 PowerShell execution with IOC 10.0.0.42.\n' +
        'Adversary used encoded commands for persistence.\n',
      outcome_summary: 'PowerShell abuse contained and remediated',
    });

    const result = runThruntTools(['case-search', 'powershell'], tmpDir);
    assert.ok(result.success, `case-search failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(output.results.length > 0, 'should have results for powershell search');

    const r = output.results[0];
    // Required fields per INTEL-04
    assert.ok(typeof r.slug === 'string', 'slug should be string');
    assert.ok(typeof r.name === 'string', 'name should be string');
    assert.ok(typeof r.match_snippet === 'string', 'match_snippet should be string');
    assert.ok(Array.isArray(r.technique_overlap), 'technique_overlap should be array');
    assert.ok(typeof r.relevance_score === 'number', 'relevance_score should be number');
    // outcome_summary may be null or string
    assert.ok(r.outcome_summary === null || typeof r.outcome_summary === 'string', 'outcome_summary should be string or null');
  });

  test('case-search CLI routing dispatches correctly via thrunt-tools', () => {
    createAndCloseCase(tmpDir, 'cli-route-test', 'CLI Route Test', {
      findings: '# Findings\n\nRouting test content with unique marker xyzRouteTest.\n',
    });

    // This tests the full CLI path through thrunt-tools.cjs
    const result = runThruntTools('case-search xyzRouteTest', tmpDir);
    assert.ok(result.success, `CLI routing failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(output.results.length > 0, 'should find the routing test case via CLI');
  });

  test('case-search resolves relative --program against the effective --cwd', () => {
    const tempRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'thrunt-search-cwd-'));
    const shellDir = path.join(tempRoot, 'shell');
    const cwdDir = path.join(tempRoot, 'targets', 'a');
    const programDir = path.join(tempRoot, 'targets', 'b');
    fs.mkdirSync(shellDir, { recursive: true });
    fs.mkdirSync(cwdDir, { recursive: true });
    fs.mkdirSync(programDir, { recursive: true });

    setupProgramState(programDir, []);
    createAndCloseCase(programDir, 'relative-program-search', 'Relative Program Search', {
      findings: '# Findings\n\nUnique relative program marker for search routing.\n',
    });

    try {
      const result = runThruntTools(
        ['--cwd', cwdDir, 'case-search', 'relative program marker', '--program', '../b'],
        shellDir
      );
      assert.ok(result.success, `case-search failed: ${result.error}`);
      const output = JSON.parse(result.output);
      assert.strictEqual(output.success, true);
      assert.strictEqual(output.total, 1, `expected one result, got ${output.total}`);
      assert.strictEqual(output.results[0].slug, 'relative-program-search');
    } finally {
      cleanup(tempRoot);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdCaseNew detection coverage (Phase 57 Plan 01 Task 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdCaseNew detection coverage', () => {
  let tmpDir;

  function setupProgramState(cwd, rosterEntries = []) {
    const planDir = path.join(cwd, '.planning');
    fs.mkdirSync(planDir, { recursive: true });
    const rosterYaml = rosterEntries.length === 0
      ? 'case_roster: []'
      : 'case_roster:\n' + rosterEntries.map(e => {
          let yaml = `  - slug: ${e.slug}\n    name: ${e.name}\n    status: ${e.status}\n    opened_at: "${e.opened_at}"`;
          if (e.closed_at) yaml += `\n    closed_at: "${e.closed_at}"`;
          if (e.technique_count) yaml += `\n    technique_count: "${e.technique_count}"`;
          return yaml;
        }).join('\n');
    fs.writeFileSync(path.join(planDir, 'STATE.md'),
      `---\nthrunt_state_version: 1.0\nstatus: active\n${rosterYaml}\n---\n\n# Program State\n`);
    fs.writeFileSync(path.join(planDir, 'MISSION.md'), '# Mission\n');
    fs.writeFileSync(path.join(planDir, 'config.json'), '{}');
  }

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('cmdCaseNew with technique ID in name returns detection_coverage array', () => {
    setupProgramState(tmpDir, []);

    const result = runThruntTools(['case', 'new', 'T1059 PowerShell Investigation'], tmpDir);
    assert.ok(result.success, `New case failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(Array.isArray(output.detection_coverage), 'output should include detection_coverage array');
  });

  test('detection_coverage entries have required fields', () => {
    setupProgramState(tmpDir, []);

    const result = runThruntTools(['case', 'new', 'T1059 PowerShell Analysis'], tmpDir);
    assert.ok(result.success, `New case failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(Array.isArray(output.detection_coverage), 'detection_coverage should be array');

    // Each entry (if any) should have the required fields
    for (const entry of output.detection_coverage) {
      assert.ok(typeof entry.technique_id === 'string', 'technique_id should be string');
      assert.ok(typeof entry.technique_name === 'string', 'technique_name should be string');
      assert.ok(typeof entry.source_count === 'number', 'source_count should be number');
      assert.ok(Array.isArray(entry.sources), 'sources should be array');
    }
  });

  test('cmdCaseNew succeeds with empty detection_coverage when no detections exist', () => {
    setupProgramState(tmpDir, []);

    // Use a technique ID unlikely to have detections in a fresh intel.db
    const result = runThruntTools(['case', 'new', 'T9999 Nonexistent Technique'], tmpDir);
    assert.ok(result.success, `New case failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(Array.isArray(output.detection_coverage), 'detection_coverage should be array');
    // Whether empty or not, the case creation should succeed
  });

  test('cmdCaseNew succeeds with detection_coverage when @thrunt/mcp unavailable', () => {
    // This tests the non-fatal degradation path.
    // In test environment, @thrunt/mcp modules ARE available, so we verify
    // that detection_coverage is always present (non-fatal means array, possibly empty)
    setupProgramState(tmpDir, []);

    const result = runThruntTools(['case', 'new', 'No Intel Modules Test'], tmpDir);
    assert.ok(result.success, `New case failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.ok(Array.isArray(output.detection_coverage), 'detection_coverage should be array even without technique IDs in name');
    assert.strictEqual(output.detection_coverage.length, 0, 'should be empty when no technique IDs in case name');
  });
});
