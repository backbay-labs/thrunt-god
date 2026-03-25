const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf-8');
}

describe('resume and manager workflow bridge docs', () => {
  test('resume-work and manager commands advertise THRUNT-aware behavior', () => {
    const resumeCommand = readRepoFile('commands', 'thrunt', 'resume-work.md');
    const managerCommand = readRepoFile('commands', 'thrunt', 'manager.md');

    assert.match(resumeCommand, /project or hunt work/);
    assert.match(resumeCommand, /resume the active workflow seamlessly/);
    assert.match(managerCommand, /project or hunt phases/);
    assert.match(managerCommand, /MISSION\.md/);
    assert.match(managerCommand, /HUNTMAP\.md/);
  });

  test('resume-program workflow branches on hunt-native planning docs', () => {
    const resumeWorkflow = readRepoFile('thrunt-god', 'workflows', 'resume-program.md');

    assert.match(resumeWorkflow, /`huntmap_source`/);
    assert.match(resumeWorkflow, /`mission_source`/);
    assert.match(resumeWorkflow, /`WORKFLOW_MODE`/);
    assert.match(resumeWorkflow, /`hunt` when `huntmap_source` is `HUNTMAP\.md` or `mission_source` is `MISSION\.md`/);
    assert.match(resumeWorkflow, /`\/hunt:new-case`/);
    assert.match(resumeWorkflow, /`\/hunt:new-program`/);
    assert.match(resumeWorkflow, /`\/hunt:shape-hypothesis \{phase\}`/);
    assert.match(resumeWorkflow, /`\/hunt:plan \{phase\}`/);
    assert.match(resumeWorkflow, /`\/hunt:run \{phase\}`/);
    assert.match(resumeWorkflow, /`\/hunt:validate-findings \{phase\}`/);
    assert.match(resumeWorkflow, /`\/hunt:publish`/);
  });

  test('manager workflow surfaces THRUNT routing and publish flow', () => {
    const managerWorkflow = readRepoFile('thrunt-god', 'workflows', 'manager.md');

    assert.match(managerWorkflow, /`mission_source`/);
    assert.match(managerWorkflow, /`huntmap_source`/);
    assert.match(managerWorkflow, /`WORKFLOW_MODE`/);
    assert.match(managerWorkflow, /\[HUNT or THRUNT\] ► MANAGER/);
    assert.match(managerWorkflow, /`\/hunt:shape-hypothesis \{PHASE_NUM\}`/);
    assert.match(managerWorkflow, /`commands\/hunt\/plan\.md`/);
    assert.match(managerWorkflow, /`commands\/hunt\/run\.md`/);
    assert.match(managerWorkflow, /`\/hunt:validate-findings`/);
    assert.match(managerWorkflow, /`\/hunt:publish`/);
  });
});
