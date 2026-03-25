const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf-8');
}

describe('dispatcher bridge docs', () => {
  test('thrunt do command advertises hunt and THRUNT routing', () => {
    const command = readRepoFile('commands', 'thrunt', 'do.md');

    assert.match(command, /Route freeform text to the right hunt or THRUNT command automatically/);
    assert.match(command, /which `\/thrunt:\*` or `\/hunt:\*` command to run/);
  });

  test('do workflow prioritizes hunt-native routing when appropriate', () => {
    const workflow = readRepoFile('thrunt-god', 'workflows', 'do.md');

    assert.match(workflow, /HAS_HUNT_DOCS=false/);
    assert.match(workflow, /prefer `\/hunt:\*` routes whenever the text plausibly matches threat hunting work/);
    assert.match(workflow, /`\/hunt:new-case`/);
    assert.match(workflow, /`\/hunt:map-environment`/);
    assert.match(workflow, /`\/hunt:validate-findings`/);
    assert.match(workflow, /Use `\/hunt:new-case` for a single signal, incident, or investigation thread/);
  });

  test('thrunt help reference explains the hunt bridge', () => {
    const help = readRepoFile('thrunt-god', 'workflows', 'help.md');

    assert.match(help, /THRUNT is a threat-hunting orchestration system\./);
    assert.match(help, /## Hunt Flow/);
    assert.match(help, /## THRUNT Utilities/);
    assert.match(help, /`\/thrunt:do`/);
  });
});
