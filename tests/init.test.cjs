/**
 * THRUNT Tools Tests - Init
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runThruntTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('init commands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('init run returns file paths', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');

    const result = runThruntTools('init run 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, '.planning/STATE.md');
    assert.strictEqual(output.huntmap_path, '.planning/HUNTMAP.md');
    assert.strictEqual(output.config_path, '.planning/config.json');
    assert.strictEqual(typeof output.validator_enabled, 'boolean');
  });

  test('init plan exposes plan_check_enabled from canonical workflow.plan_check config', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { plan_check: false } }, null, 2)
    );

    const result = runThruntTools('init plan 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plan_check_enabled, false);
  });

  test('init run exposes validator_enabled from canonical workflow.validator config', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { validator: false } }, null, 2)
    );

    const result = runThruntTools('init run 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.validator_enabled, false);
  });

  test('init plan returns file paths', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Phase Context');
    fs.writeFileSync(path.join(phaseDir, '03-RESEARCH.md'), '# Research Findings');
    fs.writeFileSync(path.join(phaseDir, '03-FINDINGS.md'), '# Verification');
    fs.writeFileSync(path.join(phaseDir, '03-EVIDENCE_REVIEW.md'), '# Evidence Review');

    const result = runThruntTools('init plan 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, '.planning/STATE.md');
    assert.strictEqual(output.huntmap_path, '.planning/HUNTMAP.md');
    assert.strictEqual(output.hypotheses_path, '.planning/HYPOTHESES.md');
    assert.strictEqual(output.context_path, '.planning/phases/03-api/03-CONTEXT.md');
    assert.strictEqual(output.research_path, '.planning/phases/03-api/03-RESEARCH.md');
    assert.strictEqual(output.findings_path, '.planning/phases/03-api/03-FINDINGS.md');
    assert.strictEqual(output.evidence_review_path, '.planning/phases/03-api/03-EVIDENCE_REVIEW.md');
  });

  test('init plan exposes text_mode from config (defaults false)', () => {
    const result = runThruntTools('init plan 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.text_mode, false, 'text_mode should default to false');
  });

  test('init plan exposes text_mode true when set in config', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const existing = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : {};
    const config = { ...existing, workflow: { ...(existing.workflow || {}), text_mode: true } };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = runThruntTools('init plan 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.text_mode, true, 'text_mode should reflect config value');
  });

  test('init progress returns file paths', () => {
    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, '.planning/STATE.md');
    assert.strictEqual(output.huntmap_path, '.planning/HUNTMAP.md');
    assert.strictEqual(output.mission_path, '.planning/MISSION.md');
    assert.strictEqual(output.config_path, '.planning/config.json');
  });

  test('init progress prefers hunt-native document paths when present', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MISSION.md'),
      '# Mission: Suspicious OAuth Program\n\n## Signal\n\nAnalyst lead.\n\n## Desired Outcome\n\nConfirm risky grants.\n\n## Scope\n\n- Tenant A\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap: Suspicious OAuth Program\n\n### Phase 1: Signal Intake\n**Goal**: Triage the lead\n'
    );

    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.mission_path, '.planning/MISSION.md');
    assert.strictEqual(output.mission_source, 'MISSION.md');
    assert.strictEqual(output.huntmap_path, '.planning/HUNTMAP.md');
    assert.strictEqual(output.huntmap_source, 'HUNTMAP.md');
  });

  test('init phase-op returns core and optional phase file paths', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Phase Context');
    fs.writeFileSync(path.join(phaseDir, '03-RESEARCH.md'), '# Research');
    fs.writeFileSync(path.join(phaseDir, '03-FINDINGS.md'), '# Verification');
    fs.writeFileSync(path.join(phaseDir, '03-EVIDENCE_REVIEW.md'), '# Evidence Review');

    const result = runThruntTools('init phase-op 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_path, '.planning/STATE.md');
    assert.strictEqual(output.huntmap_path, '.planning/HUNTMAP.md');
    assert.strictEqual(output.hypotheses_path, '.planning/HYPOTHESES.md');
    assert.strictEqual(output.context_path, '.planning/phases/03-api/03-CONTEXT.md');
    assert.strictEqual(output.research_path, '.planning/phases/03-api/03-RESEARCH.md');
    assert.strictEqual(output.findings_path, '.planning/phases/03-api/03-FINDINGS.md');
    assert.strictEqual(output.evidence_review_path, '.planning/phases/03-api/03-EVIDENCE_REVIEW.md');
  });

  test('init plan detects has_reviews and reviews_path when REVIEWS.md exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-REVIEWS.md'), '# Cross-AI Reviews');

    const result = runThruntTools('init plan 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_reviews, true);
    assert.strictEqual(output.reviews_path, '.planning/phases/03-api/03-REVIEWS.md');
  });

  test('init plan omits optional paths if files missing', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runThruntTools('init plan 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.context_path, undefined);
    assert.strictEqual(output.research_path, undefined);
    assert.strictEqual(output.reviews_path, undefined);
    assert.strictEqual(output.has_reviews, false);
  });

  // ── phase_hypothesis_ids extraction (fix for #684) ──────────────────────────────

  test('init plan extracts phase_hypothesis_ids from HUNTMAP', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap\n\n### Phase 3: API\n**Goal:** Build API\n**Hypotheses**: CP-01, CP-02, CP-03\n**Plans:** 0 plans\n`
    );

    const result = runThruntTools('init plan 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_hypothesis_ids, 'CP-01, CP-02, CP-03');
  });

  test('init plan strips brackets from phase_hypothesis_ids', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap\n\n### Phase 3: API\n**Goal:** Build API\n**Hypotheses**: [CP-01, CP-02]\n**Plans:** 0 plans\n`
    );

    const result = runThruntTools('init plan 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_hypothesis_ids, 'CP-01, CP-02');
  });

  test('init plan returns null phase_hypothesis_ids when Hypotheses line is absent', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap\n\n### Phase 3: API\n**Goal:** Build API\n**Plans:** 0 plans\n`
    );

    const result = runThruntTools('init plan 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_hypothesis_ids, null);
  });

  test('init plan returns null phase_hypothesis_ids when HUNTMAP is absent', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runThruntTools('init plan 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_hypothesis_ids, null);
  });

  test('init run extracts phase_hypothesis_ids from HUNTMAP', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap\n\n### Phase 3: API\n**Goal:** Build API\n**Hypotheses**: EX-01, EX-02\n**Plans:** 1 plans\n`
    );

    const result = runThruntTools('init run 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_hypothesis_ids, 'EX-01, EX-02');
  });

  test('init plan returns null phase_hypothesis_ids when value is TBD', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap\n\n### Phase 3: API\n**Goal:** Build API\n**Hypotheses**: TBD\n**Plans:** 0 plans\n`
    );

    const result = runThruntTools('init plan 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_hypothesis_ids, null, 'TBD placeholder should return null');
  });

  test('init run returns null phase_hypothesis_ids when Hypotheses line is absent', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap\n\n### Phase 3: API\n**Goal:** Build API\n**Plans:** 1 plans\n`
    );

    const result = runThruntTools('init run 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_hypothesis_ids, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HUNTMAP fallback for init plan / hunt-run / validate-findings (#1238)
// ─────────────────────────────────────────────────────────────────────────────

describe('init commands HUNTMAP fallback when phase directory does not exist (#1238)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 1: Foundation Setup\n**Goal:** Bootstrap project\n**Hypotheses**: R-01, R-02\n**Plans:** TBD\n'
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('init plan falls back to HUNTMAP when no phase directory exists', () => {
    const result = runThruntTools('init plan 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true, 'phase_found should be true from HUNTMAP fallback');
    assert.strictEqual(output.phase_dir, null, 'phase_dir should be null (no directory yet)');
    assert.strictEqual(output.phase_number, '1');
    assert.strictEqual(output.phase_name, 'Foundation Setup');
    assert.strictEqual(output.phase_slug, 'foundation-setup');
    assert.strictEqual(output.padded_phase, '01');
  });

  test('init plan falls back to HUNTMAP when HUNTMAP is absent', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'));
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 1: Signal Intake\n**Goal**: Bootstrap the case\n**Hypotheses**: R-01, R-02\n**Plans:** TBD\n'
    );

    const result = runThruntTools('init plan 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.strictEqual(output.phase_number, '1');
    assert.strictEqual(output.phase_name, 'Signal Intake');
    assert.strictEqual(output.phase_slug, 'signal-intake');
    assert.strictEqual(output.huntmap_path, '.planning/HUNTMAP.md');
    assert.strictEqual(output.huntmap_source, 'HUNTMAP.md');
    assert.strictEqual(output.phase_hypothesis_ids, 'R-01, R-02');
  });

  test('init run falls back to HUNTMAP when no phase directory exists', () => {
    const result = runThruntTools('init run 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true, 'phase_found should be true from HUNTMAP fallback');
    assert.strictEqual(output.phase_dir, null, 'phase_dir should be null (no directory yet)');
    assert.strictEqual(output.phase_number, '1');
    assert.strictEqual(output.phase_name, 'Foundation Setup');
    assert.strictEqual(output.phase_slug, 'foundation-setup');
    assert.strictEqual(output.phase_hypothesis_ids, 'R-01, R-02');
  });

  test('init validate-findings falls back to HUNTMAP when no phase directory exists', () => {
    const result = runThruntTools('init validate-findings 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true, 'phase_found should be true from HUNTMAP fallback');
    assert.strictEqual(output.phase_dir, null, 'phase_dir should be null (no directory yet)');
    assert.strictEqual(output.phase_number, '1');
    assert.strictEqual(output.phase_name, 'Foundation Setup');
  });

  test('init plan returns phase_found false when neither directory nor HUNTMAP entry exists', () => {
    const result = runThruntTools('init plan 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, false);
    assert.strictEqual(output.phase_dir, null);
    assert.strictEqual(output.phase_number, null);
    assert.strictEqual(output.phase_name, null);
  });

  test('init plan prefers disk directory over HUNTMAP fallback', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');

    const result = runThruntTools('init plan 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.ok(output.phase_dir !== null, 'phase_dir should point to disk directory');
    assert.ok(output.phase_dir.includes('01-foundation-setup'));
    assert.strictEqual(output.plan_count, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitTodos (INIT-01)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitTodos', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty pending dir returns zero count', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'todos', 'pending'), { recursive: true });

    const result = runThruntTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.deepStrictEqual(output.todos, []);
    assert.strictEqual(output.pending_dir_exists, true);
  });

  test('missing pending dir returns zero count', () => {
    const result = runThruntTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.deepStrictEqual(output.todos, []);
    assert.strictEqual(output.pending_dir_exists, false);
  });

  test('multiple todos with fields are read correctly', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task-1.md'), 'title: Fix bug\narea: backend\ncreated: 2026-02-25');
    fs.writeFileSync(path.join(pendingDir, 'task-2.md'), 'title: Add feature\narea: frontend\ncreated: 2026-02-24');
    fs.writeFileSync(path.join(pendingDir, 'task-3.md'), 'title: Write docs\narea: backend\ncreated: 2026-02-23');

    const result = runThruntTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 3);
    assert.strictEqual(output.todos.length, 3);

    const task1 = output.todos.find(t => t.file === 'task-1.md');
    assert.ok(task1, 'task-1.md should be in todos');
    assert.strictEqual(task1.title, 'Fix bug');
    assert.strictEqual(task1.area, 'backend');
    assert.strictEqual(task1.created, '2026-02-25');
    assert.strictEqual(task1.path, '.planning/todos/pending/task-1.md');
  });

  test('area filter returns only matching todos', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task-1.md'), 'title: Fix bug\narea: backend\ncreated: 2026-02-25');
    fs.writeFileSync(path.join(pendingDir, 'task-2.md'), 'title: Add feature\narea: frontend\ncreated: 2026-02-24');
    fs.writeFileSync(path.join(pendingDir, 'task-3.md'), 'title: Write docs\narea: backend\ncreated: 2026-02-23');

    const result = runThruntTools('init todos backend', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 2);
    assert.strictEqual(output.area_filter, 'backend');
    for (const todo of output.todos) {
      assert.strictEqual(todo.area, 'backend');
    }
  });

  test('area filter miss returns zero count', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task-1.md'), 'title: Fix bug\narea: backend\ncreated: 2026-02-25');

    const result = runThruntTools('init todos nonexistent', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.strictEqual(output.area_filter, 'nonexistent');
  });

  test('malformed file uses defaults', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'broken.md'), 'some random content without fields');

    const result = runThruntTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1);
    const todo = output.todos[0];
    assert.strictEqual(todo.title, 'Untitled');
    assert.strictEqual(todo.area, 'general');
    assert.strictEqual(todo.created, 'unknown');
  });

  test('non-md files are ignored', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    fs.writeFileSync(path.join(pendingDir, 'task.md'), 'title: Real task\narea: dev\ncreated: 2026-01-01');
    fs.writeFileSync(path.join(pendingDir, 'notes.txt'), 'title: Not a task\narea: dev\ncreated: 2026-01-01');

    const result = runThruntTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1);
    assert.strictEqual(output.todos[0].file, 'task.md');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitMilestoneOp (INIT-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitMilestoneOp', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('no phase directories returns zero counts', () => {
    const result = runThruntTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 0);
    assert.strictEqual(output.completed_phases, 0);
    assert.strictEqual(output.all_phases_complete, false);
  });

  test('multiple phases with no summaries', () => {
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-setup');
    const phase2 = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase1, { recursive: true });
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase2, '02-01-PLAN.md'), '# Plan');

    const result = runThruntTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 2);
    assert.strictEqual(output.completed_phases, 0);
    assert.strictEqual(output.all_phases_complete, false);
  });

  test('mix of complete and incomplete phases', () => {
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-setup');
    const phase2 = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase1, { recursive: true });
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(phase2, '02-01-PLAN.md'), '# Plan');

    const result = runThruntTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 2);
    assert.strictEqual(output.completed_phases, 1);
    assert.strictEqual(output.all_phases_complete, false);
  });

  test('all phases complete', () => {
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');

    const result = runThruntTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 1);
    assert.strictEqual(output.completed_phases, 1);
    assert.strictEqual(output.all_phases_complete, true);
  });

  test('archive directory scanning', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'archive', 'v1.0'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'archive', 'v0.9'), { recursive: true });

    const result = runThruntTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.archive_count, 2);
    assert.strictEqual(output.archived_milestones.length, 2);
  });

  test('no archive directory returns empty', () => {
    const result = runThruntTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.archive_count, 0);
    assert.deepStrictEqual(output.archived_milestones, []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitPhaseOp fallback (INIT-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitPhaseOp fallback', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('normal path with existing directory', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Context');
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 3: API\n**Goal:** Build API\n**Plans:** 1 plans\n'
    );

    const result = runThruntTools('init phase-op 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.ok(output.phase_dir.includes('03-api'), 'phase_dir should contain 03-api');
    assert.strictEqual(output.has_context, true);
    assert.strictEqual(output.has_plans, true);
  });

  test('fallback to HUNTMAP when no directory exists', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 5: Widget Builder\n**Goal:** Build widgets\n**Plans:** TBD\n'
    );

    const result = runThruntTools('init phase-op 5', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.strictEqual(output.phase_dir, null);
    assert.strictEqual(output.phase_slug, 'widget-builder');
    assert.strictEqual(output.has_research, false);
    assert.strictEqual(output.has_context, false);
    assert.strictEqual(output.has_plans, false);
  });

  test('prefers current milestone roadmap entry over archived phase with same number', () => {
    const archiveDir = path.join(
      tmpDir,
      '.planning',
      'milestones',
      'v1.2-phases',
      '02-event-parser-and-queue-schema'
    );
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, '02-CONTEXT.md'), '# Archived context');
    fs.writeFileSync(path.join(archiveDir, '02-01-PLAN.md'), '# Archived plan');
    fs.writeFileSync(path.join(archiveDir, '02-FINDINGS.md'), '# Archived verification');

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      `# Huntmap

<details>
<summary>Shipped milestone v1.2</summary>

### Phase 2: Event Parser and Queue Schema
**Goal:** Archived milestone work
</details>

## Milestone v1.3 Current

### Phase 2: Retry Orchestration
**Goal:** Current milestone work
**Plans:** TBD
`
    );

    const result = runThruntTools('init phase-op 2', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true);
    assert.strictEqual(output.phase_dir, null);
    assert.strictEqual(output.phase_name, 'Retry Orchestration');
    assert.strictEqual(output.phase_slug, 'retry-orchestration');
    assert.strictEqual(output.has_context, false);
    assert.strictEqual(output.has_plans, false);
    assert.strictEqual(output.has_findings, false);
  });

  test('neither directory nor roadmap entry returns not found', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n### Phase 1: Setup\n**Goal:** Setup project\n**Plans:** TBD\n'
    );

    const result = runThruntTools('init phase-op 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, false);
    assert.strictEqual(output.phase_dir, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitProgress (INIT-03)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitProgress', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('no phases returns empty state', () => {
    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 0);
    assert.deepStrictEqual(output.phases, []);
    assert.strictEqual(output.current_phase, null);
    assert.strictEqual(output.next_phase, null);
    assert.strictEqual(output.has_work_in_progress, false);
  });

  test('multiple phases with mixed statuses', () => {
    // Phase 01: complete (has plan + summary)
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');

    // Phase 02: in_progress (has plan, no summary)
    const phase2 = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase2, { recursive: true });
    fs.writeFileSync(path.join(phase2, '02-01-PLAN.md'), '# Plan');

    // Phase 03: pending (no plan, no research)
    const phase3 = path.join(tmpDir, '.planning', 'phases', '03-ui');
    fs.mkdirSync(phase3, { recursive: true });
    fs.writeFileSync(path.join(phase3, '03-CONTEXT.md'), '# Context');

    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 3);
    assert.strictEqual(output.completed_count, 1);
    assert.strictEqual(output.in_progress_count, 1);
    assert.strictEqual(output.has_work_in_progress, true);

    assert.strictEqual(output.current_phase.number, '02');
    assert.strictEqual(output.current_phase.status, 'in_progress');

    assert.strictEqual(output.next_phase.number, '03');
    assert.strictEqual(output.next_phase.status, 'pending');

    // Verify phase entries have expected structure
    const p1 = output.phases.find(p => p.number === '01');
    assert.strictEqual(p1.status, 'complete');
    assert.strictEqual(p1.plan_count, 1);
    assert.strictEqual(p1.summary_count, 1);
  });

  test('researched status detected correctly', () => {
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-RESEARCH.md'), '# Research');

    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    const p1 = output.phases.find(p => p.number === '01');
    assert.strictEqual(p1.status, 'researched');
    assert.strictEqual(p1.has_research, true);
    assert.strictEqual(output.current_phase.number, '01');
  });

  test('all phases complete returns no current or next', () => {
    const phase1 = path.join(tmpDir, '.planning', 'phases', '01-setup');
    fs.mkdirSync(phase1, { recursive: true });
    fs.writeFileSync(path.join(phase1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase1, '01-01-SUMMARY.md'), '# Summary');

    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed_count, 1);
    assert.strictEqual(output.current_phase, null);
    assert.strictEqual(output.next_phase, null);
  });

  test('paused_at detected from STATE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Hunt State\n\n**Paused At:** Phase 2, Task 3 — implementing auth\n'
    );

    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.paused_at, 'paused_at should be set');
    assert.ok(output.paused_at.includes('Phase 2, Task 3'), 'paused_at should contain pause location');
  });

  test('no paused_at when STATE.md has no pause line', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Hunt State\n\nSome content without pause.\n'
    );

    const result = runThruntTools('init progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.paused_at, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitQuick (INIT-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitQuick', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('with description generates slug and task_dir with YYMMDD-xxx format', () => {
    const result = runThruntTools('init quick "Fix login bug"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.branch_name, null);
    assert.strictEqual(output.slug, 'fix-login-bug');
    assert.strictEqual(output.description, 'Fix login bug');

    // quick_id must match YYMMDD-xxx (6 digits, dash, 3 base36 chars)
    assert.ok(/^\d{6}-[0-9a-z]{3}$/.test(output.quick_id),
      `quick_id should match YYMMDD-xxx, got: "${output.quick_id}"`);

    // task_dir must use the new ID format
    assert.ok(output.task_dir.startsWith('.planning/quick/'),
      `task_dir should start with .planning/quick/, got: "${output.task_dir}"`);
    assert.ok(output.task_dir.endsWith('-fix-login-bug'),
      `task_dir should end with -fix-login-bug, got: "${output.task_dir}"`);
    assert.ok(/^\.planning\/quick\/\d{6}-[0-9a-z]{3}-fix-login-bug$/.test(output.task_dir),
      `task_dir format wrong: "${output.task_dir}"`);

    // next_num must NOT be present
    assert.ok(!('next_num' in output), 'next_num should not be in output');
  });

  test('without description returns null slug and task_dir', () => {
    const result = runThruntTools('init quick', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, null);
    assert.strictEqual(output.task_dir, null);
    assert.strictEqual(output.description, null);

    // quick_id is still generated even without description
    assert.ok(/^\d{6}-[0-9a-z]{3}$/.test(output.quick_id),
      `quick_id should match YYMMDD-xxx, got: "${output.quick_id}"`);
  });

  test('two rapid calls produce different quick_ids (no collision within 2s window)', () => {
    // Both calls happen within the same test, which is sub-second.
    // They may or may not land in the same 2-second block. We just verify format.
    const r1 = runThruntTools('init quick "Task one"', tmpDir);
    const r2 = runThruntTools('init quick "Task two"', tmpDir);
    assert.ok(r1.success && r2.success);

    const o1 = JSON.parse(r1.output);
    const o2 = JSON.parse(r2.output);

    assert.ok(/^\d{6}-[0-9a-z]{3}$/.test(o1.quick_id));
    assert.ok(/^\d{6}-[0-9a-z]{3}$/.test(o2.quick_id));

    // Directories are distinct because slugs differ
    assert.notStrictEqual(o1.task_dir, o2.task_dir);
  });

  test('long description truncates slug to 40 chars', () => {
    const result = runThruntTools('init quick "This is a very long description that should get truncated to forty characters maximum"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.slug.length <= 40, `Slug should be <= 40 chars, got ${output.slug.length}: "${output.slug}"`);
  });

  test('returns quick branch name when quick_branch_template is configured', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        git: {
          quick_branch_template: 'thrunt/quick-{num}-{slug}',
        },
      }, null, 2)
    );

    const result = runThruntTools('init quick "Fix login bug"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.branch_name, 'branch_name should be set');
    assert.ok(output.branch_name.startsWith('thrunt/quick-'));
    assert.ok(output.branch_name.endsWith('-fix-login-bug'));
    assert.ok(output.branch_name.includes(output.quick_id), 'branch_name should include quick_id');
  });

  test('uses fallback slug in quick branch name when description is omitted', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        git: {
          quick_branch_template: 'thrunt/quick-{quick}-{slug}',
        },
      }, null, 2)
    );

    const result = runThruntTools('init quick', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.branch_name, 'branch_name should be set');
    assert.ok(output.branch_name.endsWith('-quick'), `Expected fallback slug in branch name, got "${output.branch_name}"`);
  });

  test('init quick respects custom planning dir in reported paths', () => {
    fs.mkdirSync(path.join(tmpDir, '.hunt', 'phases'), { recursive: true });

    const result = runThruntTools('init quick "Add caching layer"', tmpDir, { THRUNT_PLANNING_DIR: '.hunt' });
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.quick_dir, '.hunt/quick');
    assert.ok(output.task_dir.startsWith('.hunt/quick/'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitMapEnvironment (INIT-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitMapEnvironment', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('no codebase dir returns empty', () => {
    const result = runThruntTools('init map-environment', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_maps, false);
    assert.deepStrictEqual(output.existing_maps, []);
    assert.strictEqual(output.codebase_dir_exists, false);
  });

  test('with existing maps lists md files only', () => {
    const codebaseDir = path.join(tmpDir, '.planning', 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    fs.writeFileSync(path.join(codebaseDir, 'STACK.md'), '# Stack');
    fs.writeFileSync(path.join(codebaseDir, 'ARCHITECTURE.md'), '# Architecture');
    fs.writeFileSync(path.join(codebaseDir, 'notes.txt'), 'not a markdown file');

    const result = runThruntTools('init map-environment', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_maps, true);
    assert.strictEqual(output.existing_maps.length, 2);
    assert.ok(output.existing_maps.includes('STACK.md'), 'Should include STACK.md');
    assert.ok(output.existing_maps.includes('ARCHITECTURE.md'), 'Should include ARCHITECTURE.md');
  });

  test('empty codebase dir returns no maps', () => {
    const codebaseDir = path.join(tmpDir, '.planning', 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });

    const result = runThruntTools('init map-environment', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_maps, false);
    assert.deepStrictEqual(output.existing_maps, []);
    assert.strictEqual(output.codebase_dir_exists, true);
  });

  test('custom planning dir is respected for codebase path and existence', () => {
    const codebaseDir = path.join(tmpDir, '.hunt', 'codebase');
    fs.mkdirSync(codebaseDir, { recursive: true });
    fs.writeFileSync(path.join(codebaseDir, 'STACK.md'), '# Stack');

    const result = runThruntTools('init map-environment', tmpDir, { THRUNT_PLANNING_DIR: '.hunt' });
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.codebase_dir, '.hunt/codebase');
    assert.strictEqual(output.codebase_dir_exists, true);
    assert.strictEqual(output.has_maps, true);
    assert.deepStrictEqual(output.existing_maps, ['STACK.md']);
  });

  test('map-environment workflow does not list OpenCode under runtimes without Task tool (#1316)', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', 'thrunt-god', 'workflows', 'hunt-map-environment.md'), 'utf8'
    );
    // OpenCode must NOT appear in the "WITHOUT Task tool" / "NOT available" condition
    const withoutLine = workflow.split('\n').find(l =>
      l.includes('NOT available') || l.includes('WITHOUT Task tool')
    );
    assert.ok(withoutLine, 'workflow should have a line about Task tool NOT being available');
    assert.ok(!withoutLine.includes('OpenCode'), 'OpenCode must NOT be listed under runtimes WITHOUT Task tool');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitNewProgram (INIT-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitNewProgram', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('greenfield project with no code', () => {
    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, false);
    assert.strictEqual(output.has_package_file, false);
    assert.strictEqual(output.is_brownfield, false);
    assert.strictEqual(output.needs_codebase_map, false);
  });

  test('brownfield with package.json detected', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_package_file, true);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, true);
  });

  test('brownfield with codebase map does not need map', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(tmpDir, '.planning', 'codebase'), { recursive: true });

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, false);
  });

  test('planning_exists flag is correct', () => {
    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.planning_exists, true);
  });

  test('brownfield with Kotlin files detected (Android project)', () => {
    const srcDir = path.join(tmpDir, 'app', 'src', 'main');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'MainActivity.kt'), 'class MainActivity');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, true);
    assert.strictEqual(output.is_brownfield, true);
  });

  test('brownfield with build.gradle detected (Android/Gradle project)', () => {
    fs.writeFileSync(path.join(tmpDir, 'build.gradle'), 'apply plugin: "com.android.application"');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_package_file, true);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, true);
  });

  test('brownfield with build.gradle.kts detected (Kotlin DSL)', () => {
    fs.writeFileSync(path.join(tmpDir, 'build.gradle.kts'), 'plugins { id("com.android.application") }');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_package_file, true);
    assert.strictEqual(output.is_brownfield, true);
  });

  test('brownfield with pom.xml detected (Maven project)', () => {
    fs.writeFileSync(path.join(tmpDir, 'pom.xml'), '<project></project>');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_package_file, true);
    assert.strictEqual(output.is_brownfield, true);
  });

  test('brownfield with pubspec.yaml detected (Flutter/Dart project)', () => {
    fs.writeFileSync(path.join(tmpDir, 'pubspec.yaml'), 'name: my_app');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_package_file, true);
    assert.strictEqual(output.is_brownfield, true);
  });

  test('brownfield with Dart files detected', () => {
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(libDir, 'main.dart'), 'void main() {}');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, true);
    assert.strictEqual(output.is_brownfield, true);
  });

  test('brownfield with C++ files detected', () => {
    fs.writeFileSync(path.join(tmpDir, 'main.cpp'), 'int main() { return 0; }');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, true);
    assert.strictEqual(output.is_brownfield, true);
  });

  test('brownfield with TSX files detected', () => {
    const srcDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'App.tsx'), 'export function App() { return <div />; }');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, true);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, true);
  });

  test('brownfield with deeply nested JVM files detected', () => {
    const srcDir = path.join(tmpDir, 'app', 'src', 'main', 'java', 'com', 'example', 'app');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'MainActivity.kt'), 'class MainActivity');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, true);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, true);
  });

  test('ignores code that exists only in skipped THRUNT, runtime, and dependency directories', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'codebase'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.claude', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.codex', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'codebase', 'STACK.ts'), 'export const stack = true;');
    fs.writeFileSync(path.join(tmpDir, '.claude', 'agents', 'helper.js'), 'console.log("agent");');
    fs.writeFileSync(path.join(tmpDir, '.codex', 'skills', 'helper.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'demo', 'index.js'), 'module.exports = {};');

    const result = runThruntTools('init new-program', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_existing_code, false);
    assert.strictEqual(output.has_package_file, false);
    assert.strictEqual(output.is_brownfield, false);
    assert.strictEqual(output.needs_codebase_map, false);
  });

  test('custom planning dir is respected for existing codebase map detection', () => {
    fs.mkdirSync(path.join(tmpDir, '.hunt', 'codebase'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.hunt', 'phases'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.hunt', 'codebase', 'STACK.md'), '# Stack');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}');

    const result = runThruntTools('init new-program', tmpDir, { THRUNT_PLANNING_DIR: '.hunt' });
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.planning_exists, true);
    assert.strictEqual(output.mission_path, '.hunt/MISSION.md');
    assert.strictEqual(output.has_codebase_map, true);
    assert.strictEqual(output.is_brownfield, true);
    assert.strictEqual(output.needs_codebase_map, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitNewMilestone (INIT-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitNewMilestone', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns expected fields', () => {
    const result = runThruntTools('init new-milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('current_milestone' in output, 'Should have current_milestone');
    assert.ok('current_milestone_name' in output, 'Should have current_milestone_name');
    assert.ok('researcher_model' in output, 'Should have researcher_model');
    assert.ok('synthesizer_model' in output, 'Should have synthesizer_model');
    assert.ok('huntmap_builder_model' in output, 'Should have huntmap_builder_model');
    assert.ok('commit_docs' in output, 'Should have commit_docs');
    assert.strictEqual(output.mission_path, '.planning/MISSION.md');
    assert.strictEqual(output.huntmap_path, '.planning/HUNTMAP.md');
    assert.strictEqual(output.state_path, '.planning/STATE.md');
  });

  test('file existence flags reflect actual state', () => {
    // Default: no STATE.md, HUNTMAP.md, or MISSION.md
    const result1 = runThruntTools('init new-milestone', tmpDir);
    assert.ok(result1.success, `Command failed: ${result1.error}`);

    const output1 = JSON.parse(result1.output);
    assert.strictEqual(output1.state_exists, false);
    assert.strictEqual(output1.huntmap_exists, false);
    assert.strictEqual(output1.mission_exists, false);

    // Create files and verify flags change
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'), '# Huntmap');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'MISSION.md'), '# Project');

    const result2 = runThruntTools('init new-milestone', tmpDir);
    assert.ok(result2.success, `Command failed: ${result2.error}`);

    const output2 = JSON.parse(result2.output);
    assert.strictEqual(output2.state_exists, true);
    assert.strictEqual(output2.huntmap_exists, true);
    assert.strictEqual(output2.mission_exists, true);
  });

  test('reports latest completed milestone and archive target for reset flow', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MILESTONES.md'),
      '# Milestones\n\n## v1.2 Search Refresh (Shipped: 2026-02-18)\n\n---\n'
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06-refine-search'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '07-polish'), { recursive: true });

    const result = runThruntTools('init new-milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.latest_completed_milestone, 'v1.2');
    assert.strictEqual(output.latest_completed_milestone_name, 'Search Refresh');
    assert.strictEqual(output.phase_dir_count, 2);
    assert.strictEqual(output.phase_archive_path, '.planning/milestones/v1.2-phases');
  });

  test('reset flow metadata is null-safe when no milestones file exists', () => {
    const result = runThruntTools('init new-milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.latest_completed_milestone, null);
    assert.strictEqual(output.latest_completed_milestone_name, null);
    assert.strictEqual(output.phase_dir_count, 0);
    assert.strictEqual(output.phase_archive_path, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findProjectRoot integration — thrunt-tools resolves project root from sub-repo
// ─────────────────────────────────────────────────────────────────────────────

describe('findProjectRoot integration via --cwd', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = createTempProject();
    // Add HUNTMAP.md so init quick doesn't error
    fs.writeFileSync(
      path.join(projectRoot, '.planning', 'HUNTMAP.md'),
      '# Huntmap\n\n## Phase 1: Foundation\n**Goal:** Setup\n'
    );
    // Write sub_repos config
    fs.writeFileSync(
      path.join(projectRoot, '.planning', 'config.json'),
      JSON.stringify({ sub_repos: ['backend', 'frontend'] })
    );
    // Create sub-repo directory
    fs.mkdirSync(path.join(projectRoot, 'backend'));
  });

  afterEach(() => {
    cleanup(projectRoot);
  });

  test('init quick from sub-repo CWD returns project_root pointing to parent', () => {
    const backendDir = path.join(projectRoot, 'backend');
    const result = runThruntTools(['init', 'quick', 'test task', '--cwd', backendDir]);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('project_root' in output, 'Should have project_root');
    assert.strictEqual(output.project_root, projectRoot, 'project_root should be the parent, not the sub-repo');
    assert.ok(output.huntmap_exists, 'Should find HUNTMAP.md at project root');
  });

  test('init quick from project root returns project_root as-is', () => {
    const result = runThruntTools(['init', 'quick', 'test task', '--cwd', projectRoot]);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.project_root, projectRoot);
  });

  test('state load from sub-repo CWD reads project root config', () => {
    // Write STATE.md at project root
    fs.writeFileSync(
      path.join(projectRoot, '.planning', 'STATE.md'),
      '---\ncurrent_phase: 1\nphase_name: Foundation\n---\n# State\n'
    );

    const backendDir = path.join(projectRoot, 'backend');
    const result = runThruntTools(['state', '--cwd', backendDir]);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Should find config from project root, not from backend/
    assert.deepStrictEqual(output.config.sub_repos, ['backend', 'frontend'],
      'Should read sub_repos from project root config');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cmdInitNewCase
// ─────────────────────────────────────────────────────────────────────────────

describe('cmdInitNewCase', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns error when no program exists (no STATE.md)', () => {
    // No STATE.md in .planning/ -> error
    const result = runThruntTools('init new-case', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.program_exists, false, 'program_exists should be false');
    assert.ok(output.error, 'should have error message');
  });

  test('returns context with program_exists true when program exists', () => {
    // Create program STATE.md
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nthrunt_state_version: 1.0\nstatus: executing\ncase_roster: []\n---\n\n# Hunt State\n\n**Status:** Executing\n'
    );

    const result = runThruntTools('init new-case', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.program_exists, true, 'program_exists should be true');
    assert.ok(output.cases_dir, 'should have cases_dir');
    assert.ok(Array.isArray(output.existing_cases), 'should have existing_cases array');
  });

  test('lists existing cases in existing_cases array', () => {
    // Create program STATE.md and a case directory
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '---\nthrunt_state_version: 1.0\nstatus: executing\ncase_roster: []\n---\n\n# Hunt State\n\n**Status:** Executing\n'
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'cases', 'existing-case'), { recursive: true });

    const result = runThruntTools('init new-case', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.ok(output.existing_cases.includes('existing-case'), 'should list existing case');
    assert.strictEqual(output.case_count, 1, 'should have 1 case');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// case commands (new, list, close, status)
// ─────────────────────────────────────────────────────────────────────────────

describe('case commands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Create a program STATE.md with case_roster in frontmatter
    const stateContent = `---
thrunt_state_version: 1.0
status: executing
case_roster: []
---

# Hunt State

**Status:** Executing
`;
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), stateContent);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('case new creates case directory with expected files', () => {
    const result = runThruntTools(['case', 'new', 'Alpha Investigation'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true);
    assert.strictEqual(output.slug, 'alpha-investigation');

    // Check directory structure
    const caseDir = path.join(tmpDir, '.planning', 'cases', 'alpha-investigation');
    assert.ok(fs.existsSync(caseDir), 'case directory should exist');
    assert.ok(fs.existsSync(path.join(caseDir, 'MISSION.md')), 'MISSION.md should exist');
    assert.ok(fs.existsSync(path.join(caseDir, 'HUNTMAP.md')), 'HUNTMAP.md should exist');
    assert.ok(fs.existsSync(path.join(caseDir, 'HYPOTHESES.md')), 'HYPOTHESES.md should exist');
    assert.ok(fs.existsSync(path.join(caseDir, 'STATE.md')), 'STATE.md should exist');
    assert.ok(fs.existsSync(path.join(caseDir, 'QUERIES')), 'QUERIES/ should exist');
    assert.ok(fs.existsSync(path.join(caseDir, 'RECEIPTS')), 'RECEIPTS/ should exist');
  });

  test('case new adds entry to program STATE.md case_roster', () => {
    const result = runThruntTools(['case', 'new', 'Beta Case'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // Read program STATE.md and check roster
    const stateContent = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(stateContent.includes('beta-case'), 'roster should contain case slug');
  });

  test('case new sets .active-case pointer', () => {
    runThruntTools(['case', 'new', 'Gamma Case'], tmpDir);
    const activeCasePath = path.join(tmpDir, '.planning', '.active-case');
    assert.ok(fs.existsSync(activeCasePath), '.active-case should exist');
    const slug = fs.readFileSync(activeCasePath, 'utf-8').trim();
    assert.strictEqual(slug, 'gamma-case');
  });

  test('case new rejects duplicate slugs', () => {
    runThruntTools(['case', 'new', 'Delta'], tmpDir);
    const result = runThruntTools(['case', 'new', 'Delta'], tmpDir);
    // Should fail (process exit 1) or return error in output
    const output = result.success ? JSON.parse(result.output) : null;
    if (output) {
      assert.ok(output.error || output.success === false, 'should indicate error for duplicate slug');
    } else {
      assert.ok(result.error, 'should fail on duplicate slug');
    }
  });

  test('case new rejects existing case directory even when roster is stale', () => {
    const caseDir = path.join(tmpDir, '.planning', 'cases', 'epsilon');
    fs.mkdirSync(caseDir, { recursive: true });
    fs.writeFileSync(path.join(caseDir, 'MISSION.md'), 'sentinel mission');
    fs.writeFileSync(path.join(caseDir, 'STATE.md'), 'sentinel state');

    const result = runThruntTools(['case', 'new', 'Epsilon'], tmpDir);
    const output = result.success ? JSON.parse(result.output) : null;
    assert.ok(output && output.success === false, 'should fail when case directory already exists');
    assert.match(output.error, /Case directory already exists/);
    assert.strictEqual(fs.readFileSync(path.join(caseDir, 'MISSION.md'), 'utf-8'), 'sentinel mission');
    assert.strictEqual(fs.readFileSync(path.join(caseDir, 'STATE.md'), 'utf-8'), 'sentinel state');
  });

  test('case list returns array of cases', () => {
    runThruntTools(['case', 'new', 'List Test One'], tmpDir);
    runThruntTools(['case', 'new', 'List Test Two'], tmpDir);

    const result = runThruntTools(['case', 'list'], tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.total, 2, 'should have 2 cases');
    assert.strictEqual(output.active, 2, 'should have 2 active cases');
    assert.ok(Array.isArray(output.cases), 'cases should be array');
  });

  test('case close updates status to closed', () => {
    runThruntTools(['case', 'new', 'Close Test'], tmpDir);
    const closeResult = runThruntTools(['case', 'close', 'close-test'], tmpDir);
    assert.ok(closeResult.success, `Close failed: ${closeResult.error}`);
    const output = JSON.parse(closeResult.output);
    assert.strictEqual(output.success, true);

    // Verify roster update
    const listResult = runThruntTools(['case', 'list'], tmpDir);
    const listOutput = JSON.parse(listResult.output);
    assert.strictEqual(listOutput.closed, 1, 'should have 1 closed case');
    assert.strictEqual(listOutput.active, 0, 'should have 0 active cases');
  });

  test('case status returns case details', () => {
    runThruntTools(['case', 'new', 'Status Test'], tmpDir);
    const result = runThruntTools(['case', 'status', 'status-test'], tmpDir);
    assert.ok(result.success, `Status failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'status-test');
    assert.strictEqual(output.status, 'active');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// huntmap analyze command
// ─────────────────────────────────────────────────────────────────────────────
