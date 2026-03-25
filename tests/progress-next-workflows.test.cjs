const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf-8');
}

describe('progress and next workflow bridge docs', () => {
  test('thrunt progress and next commands advertise hunt-aware routing', () => {
    const progressCommand = readRepoFile('commands', 'thrunt', 'progress.md');
    const nextCommand = readRepoFile('commands', 'thrunt', 'next.md');

    assert.match(progressCommand, /Check project or hunt progress/);
    assert.match(progressCommand, /active hunt or THRUNT workflow/);
    assert.match(nextCommand, /active hunt or THRUNT workflow/);
    assert.match(nextCommand, /`MISSION\.md`, `HUNTMAP\.md`/);
  });

  test('progress workflow branches on hunt-native planning docs', () => {
    const progressWorkflow = readRepoFile('thrunt-god', 'workflows', 'progress.md');

    assert.match(progressWorkflow, /`huntmap_source`/);
    assert.match(progressWorkflow, /`mission_source`/);
    assert.match(progressWorkflow, /`hunt` when `huntmap_source` is `HUNTMAP\.md` or `mission_source` is `MISSION\.md`/);
    assert.match(progressWorkflow, /Route A\.H/);
    assert.match(progressWorkflow, /`\/hunt:plan \{phase\}`/);
    assert.match(progressWorkflow, /`\/hunt:run \{phase\}`/);
    assert.match(progressWorkflow, /`\/hunt:validate-findings \{phase\}`/);
    assert.match(progressWorkflow, /`\/hunt:publish`/);
    assert.match(progressWorkflow, /`\/hunt:new-case`/);
  });

  test('next workflow auto-advances into hunt-native commands when in THRUNT mode', () => {
    const nextWorkflow = readRepoFile('thrunt-god', 'workflows', 'next.md');

    assert.match(nextWorkflow, /init progress/);
    assert.match(nextWorkflow, /`WORKFLOW_MODE`/);
    assert.match(nextWorkflow, /`hunt` when `huntmap_source` is `HUNTMAP\.md` or `mission_source` is `MISSION\.md`/);
    assert.match(nextWorkflow, /`\/hunt:new-case`/);
    assert.match(nextWorkflow, /`\/hunt:shape-hypothesis`/);
    assert.match(nextWorkflow, /`\/hunt:plan <next-phase>`/);
    assert.match(nextWorkflow, /`\/hunt:run <current-phase>`/);
    assert.match(nextWorkflow, /`\/hunt:validate-findings <current-phase>`/);
    assert.match(nextWorkflow, /`\/hunt:publish`/);
  });
});
