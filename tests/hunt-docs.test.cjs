const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf-8');
}

describe('hunt docs', () => {
  test('README describes hunt-native docs as the only active artifact set', () => {
    const readme = readRepoFile('README.md');

    assert.match(readme, /Every query, receipt, and finding is a file/);
    assert.doesNotMatch(readme, /Legacy mirrors/);
    assert.match(readme, /\/hunt:new-program \[--skeleton\]/);
    assert.match(readme, /\/hunt:map-environment \[--skeleton\]/);
  });

  test('hunt bootstrap workflow writes hunt-native artifacts directly', () => {
    const workflow = readRepoFile('thrunt-god', 'workflows', 'hunt-bootstrap.md');

    assert.match(workflow, /Write or update in this exact order/);
    assert.match(workflow, /`\.planning\/environment\/ENVIRONMENT\.md`/);
    assert.match(workflow, /`\.planning\/STATE\.md`/);
    assert.doesNotMatch(workflow, /Legacy Mirrors/);
    assert.match(workflow, /Create `\.planning\/QUERIES\/` and `\.planning\/RECEIPTS\/` as empty directories only during bootstrap/);
    assert.match(workflow, /Do not invent sample query logs, sample receipts, or mark any phase\/plan complete during bootstrap/);
    assert.match(workflow, /If `--skeleton` is present/);
    assert.match(workflow, /do not ask additional follow-up questions/);
    assert.match(workflow, /Do not simulate example telemetry, example detections, example query logs, or example receipts/);
    assert.match(workflow, /write the full bootstrap artifact set, including `STATE\.md` and `environment\/ENVIRONMENT\.md`/);
    assert.match(workflow, /Do not generate or update `CLAUDE\.md` during hunt bootstrap/);
    assert.doesNotMatch(workflow, /generate-claude-md/);
  });

  test('hunt:new-program uses program-specific environment-first templates', () => {
    const command = readRepoFile('commands', 'hunt', 'new-program.md');

    assert.match(command, /argument-hint: "\[--auto\] \[--skeleton\]"/);
    assert.match(command, /`--skeleton` - Scaffold the hunt program only/);
    assert.match(command, /hunt-program-huntmap\.md/);
    assert.match(command, /Drive the conversation through `\.planning\/environment\/ENVIRONMENT\.md` and the operator toolchain/);
    assert.match(command, /Create `\.planning\/QUERIES\/` and `\.planning\/RECEIPTS\/` as empty directories only/);
    assert.match(command, /leave unknown values as `TBD` instead of inventing sample content/);
  });

  test('program huntmap template starts with environment and tool validation phases', () => {
    const template = readRepoFile('thrunt-god', 'templates', 'hunt-program-huntmap.md');

    assert.match(template, /Phase 1: Environment Mapping/);
    assert.match(template, /Phase 2: Tool & Access Validation/);
    assert.match(template, /Do not write sample query logs or sample receipts during bootstrap/);
    assert.match(template, /\| 1\. Environment Mapping \| 0\/1 \| Not started \| - \|/);
  });

  test('environment map template captures tooling and access inventory', () => {
    const template = readRepoFile('thrunt-god', 'templates', 'environment-map.md');

    assert.match(template, /Replace `TBD` only with confirmed operator-provided facts/);
    assert.match(template, /\*\*Program \/ case:\*\* TBD/);
    assert.match(template, /## Tooling And Access/);
    assert.match(template, /\| Endpoint \| TBD \| TBD \| TBD \| TBD \|/);
    assert.match(template, /\| Workflow \| Tool \| Auth \/ Access Path \| Notes \|/);
    assert.match(template, /## Open Questions/);
  });

  test('map-environment command and workflow support scaffold-only mode', () => {
    const command = readRepoFile('commands', 'hunt', 'map-environment.md');
    const workflow = readRepoFile('thrunt-god', 'workflows', 'hunt-map-environment.md');

    assert.match(command, /argument-hint: "\[--skeleton\]"/);
    assert.match(command, /`--skeleton` - Scaffold `ENVIRONMENT\.md` with `TBD` markers only/);
    assert.match(command, /do not populate simulated values/);
    assert.match(workflow, /Never invent or simulate environment details/);
    assert.match(workflow, /If `--skeleton` is present/);
    assert.match(workflow, /do not ask placeholder follow-up questions/);
    assert.match(workflow, /Create or refresh `\.planning\/environment\/ENVIRONMENT\.md` as a blank scaffold using `TBD` markers/);
  });

  test('hunt templates and help surface manual scaffold guidance', () => {
    const missionTemplate = readRepoFile('thrunt-god', 'templates', 'mission.md');
    const hypothesesTemplate = readRepoFile('thrunt-god', 'templates', 'hypotheses.md');
    const successTemplate = readRepoFile('thrunt-god', 'templates', 'success-criteria.md');
    const stateTemplate = readRepoFile('thrunt-god', 'templates', 'hunt-state.md');
    const helpWorkflow = readRepoFile('thrunt-god', 'workflows', 'hunt-help.md');

    assert.match(missionTemplate, /Unknown facts should remain `TBD`/);
    assert.match(hypothesesTemplate, /Unknown facts should remain `TBD`/);
    assert.match(successTemplate, /Unknown gates should remain `TBD`/);
    assert.match(stateTemplate, /Unknown state details should remain `TBD`/);
    assert.match(helpWorkflow, /\/hunt:new-program \[--auto\] \[--skeleton\]/);
    assert.match(helpWorkflow, /\/hunt:map-environment \[--skeleton\]/);
    assert.match(helpWorkflow, /\/hunt:new-program --skeleton/);
  });

  test('hunt command docs center hunt artifacts only', () => {
    const planCommand = readRepoFile('commands', 'hunt', 'plan.md');
    const validateCommand = readRepoFile('commands', 'hunt', 'validate-findings.md');

    assert.match(planCommand, /`HUNTMAP\.md` remains the source of truth/);
    assert.match(validateCommand, /`FINDINGS\.md` and `EVIDENCE_REVIEW\.md` remain the source of truth/);
    assert.doesNotMatch(planCommand, /ROADMAP\.md/);
    assert.doesNotMatch(validateCommand, /VERIFICATION\.md/);
  });

  test('hunt workflows describe hunt artifacts as canonical surfaces', () => {
    const helpWorkflow = readRepoFile('thrunt-god', 'workflows', 'help.md');
    const shapeWorkflow = readRepoFile('thrunt-god', 'workflows', 'hunt-shape-hypothesis.md');
    const runWorkflow = readRepoFile('thrunt-god', 'workflows', 'hunt-run.md');

    assert.match(helpWorkflow, /THRUNT is a threat-hunting orchestration system\./);
    assert.match(shapeWorkflow, /Convert vague suspicion into explicit hunt hypotheses/);
    assert.doesNotMatch(runWorkflow, /legacy/);
  });
});
