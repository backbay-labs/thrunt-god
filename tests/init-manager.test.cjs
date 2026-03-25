/**
 * THRUNT Tools Tests - Init Manager
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runThruntTools, createTempProject, cleanup } = require('./helpers.cjs');

// Helper: write a minimal HUNTMAP.md with phases
function writeRoadmap(tmpDir, phases) {
  const sections = phases.map(p => {
    let section = `### Phase ${p.number}: ${p.name}\n\n**Goal:** ${p.goal || 'Do the thing'}\n`;
    if (p.depends_on) section += `**Depends on:** ${p.depends_on}\n`;
    return section;
  }).join('\n');

  const checklist = phases.map(p => {
    const mark = p.complete ? 'x' : ' ';
    return `- [${mark}] **Phase ${p.number}: ${p.name}**`;
  }).join('\n');

  const content = `# Huntmap\n\n## Progress\n\n${checklist}\n\n${sections}`;
  fs.writeFileSync(path.join(tmpDir, '.planning', 'HUNTMAP.md'), content);
}

// Helper: write a minimal STATE.md
function writeState(tmpDir) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '---\nstatus: active\n---\n# State\n');
}

// Helper: scaffold a phase directory with specific artifacts
function scaffoldPhase(tmpDir, num, opts = {}) {
  const padded = String(num).padStart(2, '0');
  const slug = opts.slug || 'test-phase';
  const dir = path.join(tmpDir, '.planning', 'phases', `${padded}-${slug}`);
  fs.mkdirSync(dir, { recursive: true });

  if (opts.context) fs.writeFileSync(path.join(dir, `${padded}-CONTEXT.md`), '# Context');
  if (opts.research) fs.writeFileSync(path.join(dir, `${padded}-RESEARCH.md`), '# Research');
  if (opts.plans) {
    for (let i = 1; i <= opts.plans; i++) {
      const planPad = String(i).padStart(2, '0');
      fs.writeFileSync(path.join(dir, `${padded}-${planPad}-PLAN.md`), `# Plan ${i}`);
    }
  }
  if (opts.summaries) {
    for (let i = 1; i <= opts.summaries; i++) {
      const sumPad = String(i).padStart(2, '0');
      fs.writeFileSync(path.join(dir, `${padded}-${sumPad}-SUMMARY.md`), `# Summary ${i}`);
    }
  }

  return dir;
}

describe('init manager', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('fails without HUNTMAP.md', () => {
    writeState(tmpDir);
    const result = runThruntTools('init manager', tmpDir);
    assert.ok(!result.success);
    assert.ok(result.error.includes('HUNTMAP.md'));
  });

  test('fails with hunt-aware roadmap hint when MISSION.md exists but HUNTMAP.md is missing', () => {
    writeState(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MISSION.md'),
      '# Mission: OAuth Hunt\n\n## Signal\n\nLead\n\n## Desired Outcome\n\nConfirm\n\n## Scope\n\n- Tenant\n'
    );

    const result = runThruntTools('init manager', tmpDir);
    assert.ok(!result.success);
    assert.ok(result.error.includes('HUNTMAP.md'));
    assert.ok(result.error.includes('/hunt:new-case'));
  });

  test('fails without STATE.md', () => {
    writeRoadmap(tmpDir, [{ number: '1', name: 'Setup' }]);
    const result = runThruntTools('init manager', tmpDir);
    assert.ok(!result.success);
    assert.ok(result.error.includes('STATE.md'));
  });

  test('fails with hunt-aware state hint when HUNTMAP.md exists but STATE.md is missing', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap: Threat Hunt\n\n## Progress\n\n- [ ] **Phase 1: Signal Intake**\n\n### Phase 1: Signal Intake\n\n**Goal:** Triage the lead\n'
    );

    const result = runThruntTools('init manager', tmpDir);
    assert.ok(!result.success);
    assert.ok(result.error.includes('STATE.md'));
    assert.ok(result.error.includes('/hunt:new-case'));
  });

  test('returns basic structure with phases', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation' },
      { number: '2', name: 'API Layer' },
      { number: '3', name: 'UI' },
    ]);

    const result = runThruntTools('init manager', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 3);
    assert.strictEqual(output.completed_count, 0);
    assert.strictEqual(output.huntmap_exists, true);
    assert.strictEqual(output.state_exists, true);
    assert.ok(Array.isArray(output.phases));
    assert.ok(Array.isArray(output.recommended_actions));
  });

  test('accepts HUNTMAP.md as the active roadmap source', () => {
    writeState(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap: Threat Hunt\n\n## Progress\n\n- [ ] **Phase 1: Signal Intake**\n\n### Phase 1: Signal Intake\n\n**Goal**: Triage the lead\n'
    );

    const result = runThruntTools('init manager', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 1);
    assert.strictEqual(output.workflow_mode, 'hunt');
    assert.strictEqual(output.huntmap_source, 'HUNTMAP.md');
  });

  test('emits hunt-native commands in recommended_actions when HUNTMAP.md is active', () => {
    writeState(tmpDir);
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'HUNTMAP.md'),
      '# Huntmap: Threat Hunt\n\n## Progress\n\n- [ ] **Phase 1: Signal Intake**\n- [ ] **Phase 2: Pivot Scope**\n- [ ] **Phase 3: Telemetry Sweep**\n\n### Phase 1: Signal Intake\n\n**Goal:** Shape the lead\n\n### Phase 2: Pivot Scope\n\n**Goal:** Plan the hunt\n\n### Phase 3: Telemetry Sweep\n\n**Goal:** Run the hunt\n'
    );

    scaffoldPhase(tmpDir, 1, { slug: 'signal-intake', context: true, plans: 1 });
    scaffoldPhase(tmpDir, 2, { slug: 'pivot-scope', context: true });

    const result = runThruntTools('init manager', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.workflow_mode, 'hunt');
    assert.strictEqual(output.recommended_actions[0].command, '/hunt:run 1');
    assert.strictEqual(output.recommended_actions[1].command, '/hunt:plan 2');
    assert.strictEqual(output.recommended_actions[2].command, '/hunt:shape-hypothesis 3');
  });

  test('detects disk status correctly for each phase state', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Complete Phase', complete: true },
      { number: '2', name: 'Planned Phase' },
      { number: '3', name: 'Discussed Phase' },
      { number: '4', name: 'Empty Phase' },
      { number: '5', name: 'Not Started' },
    ]);

    // Phase 1: complete (plans + matching summaries)
    scaffoldPhase(tmpDir, 1, { slug: 'complete-phase', context: true, plans: 2, summaries: 2 });
    // Phase 2: planned (plans, no summaries)
    scaffoldPhase(tmpDir, 2, { slug: 'planned-phase', context: true, plans: 3 });
    // Phase 3: discussed (context only)
    scaffoldPhase(tmpDir, 3, { slug: 'discussed-phase', context: true });
    // Phase 4: empty directory
    scaffoldPhase(tmpDir, 4, { slug: 'empty-phase' });
    // Phase 5: no directory at all

    const result = runThruntTools('init manager', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phases[0].disk_status, 'complete');
    assert.strictEqual(output.phases[1].disk_status, 'planned');
    assert.strictEqual(output.phases[2].disk_status, 'discussed');
    assert.strictEqual(output.phases[3].disk_status, 'empty');
    assert.strictEqual(output.phases[4].disk_status, 'no_directory');
  });

  test('dependency satisfaction: deps on complete phases = satisfied', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation', complete: true },
      { number: '2', name: 'Depends on 1', depends_on: 'Phase 1' },
    ]);
    scaffoldPhase(tmpDir, 1, { slug: 'foundation', plans: 1, summaries: 1 });

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.strictEqual(output.phases[0].deps_satisfied, true);
    assert.strictEqual(output.phases[1].deps_satisfied, true);
  });

  test('dependency satisfaction: deps on incomplete phases = not satisfied', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation' },
      { number: '2', name: 'Depends on 1', depends_on: 'Phase 1' },
    ]);

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.strictEqual(output.phases[0].deps_satisfied, true); // no deps
    assert.strictEqual(output.phases[1].deps_satisfied, false); // phase 1 not complete
  });

  test('sliding window: only first undiscussed phase is next to discuss', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation' },
      { number: '2', name: 'API Layer' },
      { number: '3', name: 'UI' },
    ]);

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    // Only phase 1 should be discussable
    assert.strictEqual(output.phases[0].is_next_to_discuss, true);
    assert.strictEqual(output.phases[1].is_next_to_discuss, false);
    assert.strictEqual(output.phases[2].is_next_to_discuss, false);

    // Only recommendation should be discuss phase 1
    assert.strictEqual(output.recommended_actions.length, 1);
    assert.strictEqual(output.workflow_mode, 'hunt');
    assert.strictEqual(output.recommended_actions[0].action, 'discuss');
    assert.strictEqual(output.recommended_actions[0].phase, '1');
    assert.strictEqual(output.recommended_actions[0].command, '/hunt:shape-hypothesis 1');
  });

  test('sliding window: after discussing N, plan N + discuss N+1', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation' },
      { number: '2', name: 'API Layer' },
      { number: '3', name: 'UI' },
    ]);

    // Phase 1 discussed
    scaffoldPhase(tmpDir, 1, { slug: 'foundation', context: true });

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    // Phase 1 is discussed, phase 2 is next to discuss
    assert.strictEqual(output.phases[0].is_next_to_discuss, false);
    assert.strictEqual(output.phases[1].is_next_to_discuss, true);
    assert.strictEqual(output.phases[2].is_next_to_discuss, false);

    // Should recommend plan phase 1 AND discuss phase 2
    const phase1Rec = output.recommended_actions.find(r => r.phase === '1');
    const phase2Rec = output.recommended_actions.find(r => r.phase === '2');
    assert.strictEqual(phase1Rec.action, 'plan');
    assert.strictEqual(phase2Rec.action, 'discuss');
  });

  test('sliding window: full pipeline — execute N, plan N+1, discuss N+2', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation', complete: true },
      { number: '2', name: 'API Layer' },
      { number: '3', name: 'Auth' },
      { number: '4', name: 'UI' },
      { number: '5', name: 'Polish' },
    ]);

    scaffoldPhase(tmpDir, 1, { slug: 'foundation', plans: 1, summaries: 1 });
    scaffoldPhase(tmpDir, 2, { slug: 'api-layer', context: true, plans: 2 }); // planned
    scaffoldPhase(tmpDir, 3, { slug: 'auth', context: true }); // discussed

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    // Phase 4 is first undiscussed
    assert.strictEqual(output.phases[3].is_next_to_discuss, true);
    assert.strictEqual(output.phases[4].is_next_to_discuss, false);

    // Recommendations: execute 2, plan 3, discuss 4
    assert.strictEqual(output.recommended_actions[0].action, 'execute');
    assert.strictEqual(output.recommended_actions[0].phase, '2');
    assert.strictEqual(output.recommended_actions[1].action, 'plan');
    assert.strictEqual(output.recommended_actions[1].phase, '3');
    assert.strictEqual(output.recommended_actions[2].action, 'discuss');
    assert.strictEqual(output.recommended_actions[2].phase, '4');
  });

  test('recommendation ordering: execute > plan > discuss', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Complete', complete: true },
      { number: '2', name: 'Ready to Execute' },
      { number: '3', name: 'Ready to Plan' },
      { number: '4', name: 'Ready to Discuss' },
    ]);

    scaffoldPhase(tmpDir, 1, { slug: 'complete', plans: 1, summaries: 1 });
    scaffoldPhase(tmpDir, 2, { slug: 'ready-to-execute', context: true, plans: 2 });
    scaffoldPhase(tmpDir, 3, { slug: 'ready-to-plan', context: true });

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.ok(output.recommended_actions.length >= 3);
    assert.strictEqual(output.recommended_actions[0].action, 'execute');
    assert.strictEqual(output.recommended_actions[0].phase, '2');
    assert.strictEqual(output.recommended_actions[1].action, 'plan');
    assert.strictEqual(output.recommended_actions[1].phase, '3');
    assert.strictEqual(output.recommended_actions[2].action, 'discuss');
    assert.strictEqual(output.recommended_actions[2].phase, '4');
  });

  test('blocked phases not recommended', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'In Progress' },
      { number: '2', name: 'Blocked', depends_on: 'Phase 1' },
    ]);

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    // Phase 2 should not appear in recommendations (blocked by phase 1)
    const phase2Rec = output.recommended_actions.find(r => r.phase === '2');
    assert.strictEqual(phase2Rec, undefined);
  });

  test('all phases complete sets all_complete flag', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Done', complete: true },
      { number: '2', name: 'Also Done', complete: true },
    ]);
    scaffoldPhase(tmpDir, 1, { slug: 'done', plans: 1, summaries: 1 });
    scaffoldPhase(tmpDir, 2, { slug: 'also-done', plans: 1, summaries: 1 });

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.strictEqual(output.all_complete, true);
    assert.strictEqual(output.recommended_actions.length, 0);
  });

  test('WAITING.json detected when present', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [{ number: '1', name: 'Test' }]);

    const waiting = { type: 'decision', phase: '1', question: 'Pick one' };
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'WAITING.json'),
      JSON.stringify(waiting)
    );

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.deepStrictEqual(output.waiting_signal, waiting);
  });

  test('phase fields include goal and depends_on from roadmap', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation', goal: 'Set up the base' },
      { number: '2', name: 'API', goal: 'Build endpoints', depends_on: 'Phase 1' },
    ]);

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.strictEqual(output.phases[0].goal, 'Set up the base');
    assert.strictEqual(output.phases[0].depends_on, null);
    assert.strictEqual(output.phases[1].goal, 'Build endpoints');
    assert.strictEqual(output.phases[1].depends_on, 'Phase 1');
  });

  test('display_name truncates long phase names', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Short' },
      { number: '2', name: 'Exactly Twenty Chars' },
      { number: '3', name: 'This Name Is Way Too Long For The Table' },
    ]);

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.strictEqual(output.phases[0].display_name, 'Short');
    assert.strictEqual(output.phases[1].display_name, 'Exactly Twenty Chars');
    assert.strictEqual(output.phases[2].display_name, 'This Name Is Way To…');
    assert.strictEqual(output.phases[2].display_name.length, 20);
    // Full name is preserved
    assert.strictEqual(output.phases[2].name, 'This Name Is Way Too Long For The Table');
  });

  test('activity detection: recent file = active', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [{ number: '1', name: 'Active Phase' }]);

    // Scaffold with a file — it will have current mtime (within 5 min)
    scaffoldPhase(tmpDir, 1, { slug: 'active-phase', context: true });

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    assert.strictEqual(output.phases[0].is_active, true);
    assert.ok(output.phases[0].last_activity !== null);
  });

  test('conflict filter: blocks dependent phase execute when dep is active', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation', complete: true },
      { number: '2', name: 'API Layer', depends_on: 'Phase 1' },
      { number: '3', name: 'Auth', depends_on: 'Phase 2' },
    ]);

    // Phase 2: partial (actively executing — has 2 plans, 1 summary)
    scaffoldPhase(tmpDir, 2, { slug: 'api-layer', context: true, plans: 2, summaries: 1 });
    // Phase 3: planned and deps would be met if Phase 2 were complete, but it's not
    scaffoldPhase(tmpDir, 3, { slug: 'auth', context: true, plans: 1 });

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    // Phase 2 is partial — should NOT appear as execute recommendation (already running)
    // Phase 3 deps_satisfied is false (Phase 2 not complete) — also no recommendation
    const execRecs = output.recommended_actions.filter(r => r.action === 'execute');
    assert.strictEqual(execRecs.length, 0);
  });

  test('conflict filter: allows independent phase execute in parallel', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [
      { number: '1', name: 'Foundation', complete: true },
      { number: '2', name: 'API Layer', depends_on: 'Phase 1' },
      { number: '3', name: 'Notifications' }, // no deps — independent
    ]);

    // Phase 2: partial (actively executing)
    scaffoldPhase(tmpDir, 2, { slug: 'api-layer', context: true, plans: 2, summaries: 1 });
    // Phase 3: planned, no deps — independent of Phase 2
    scaffoldPhase(tmpDir, 3, { slug: 'notifications', context: true, plans: 1 });

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    // Phase 3 is independent of Phase 2 — should be recommended for execution
    const execRecs = output.recommended_actions.filter(r => r.action === 'execute');
    assert.strictEqual(execRecs.length, 1);
    assert.strictEqual(execRecs[0].phase, '3');
  });

  test('output includes project_root field', () => {
    writeState(tmpDir);
    writeRoadmap(tmpDir, [{ number: '1', name: 'Test' }]);

    const result = runThruntTools('init manager', tmpDir);
    const output = JSON.parse(result.output);

    // macOS resolves /var → /private/var; normalize both sides
    assert.strictEqual(fs.realpathSync(output.project_root), fs.realpathSync(tmpDir));
  });
});
