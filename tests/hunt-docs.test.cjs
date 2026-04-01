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
    assert.match(readme, /Bootstrap fills confirmed fields immediately\./);
    assert.match(readme, /`TBD` only marks live environment or operator-supplied facts that are still unknown\./);
    assert.doesNotMatch(readme, /Legacy mirrors/);
    assert.match(readme, /\/hunt:new-program/);
    assert.match(readme, /\/hunt:map-environment/);
    assert.doesNotMatch(readme, /--skeleton/);
  });

  test('hunt bootstrap workflow writes hunt-native artifacts directly', () => {
    const workflow = readRepoFile('thrunt-god', 'workflows', 'hunt-bootstrap.md');

    assert.match(workflow, /Write or update in this exact order/);
    assert.match(workflow, /`\.planning\/environment\/ENVIRONMENT\.md`/);
    assert.match(workflow, /`\.planning\/STATE\.md`/);
    assert.doesNotMatch(workflow, /Legacy Mirrors/);
    assert.match(workflow, /Create `\.planning\/QUERIES\/` and `\.planning\/RECEIPTS\/` as empty directories only during bootstrap/);
    assert.match(workflow, /Do not invent sample query logs, sample receipts, or mark any phase\/plan complete during bootstrap/);
    assert.match(workflow, /Bootstrap should default to honest scaffolding/);
    assert.match(workflow, /do not ask additional follow-up questions/);
    assert.match(workflow, /Use `TBD` for missing tenants, tools, query paths, retention windows, entities, owners, and constraints/);
    assert.match(workflow, /Do not simulate example telemetry, example detections, example query logs, or example receipts/);
    assert.match(workflow, /Do not leave bracketed template placeholders in the generated files; replace every unknown with `TBD`/);
    assert.match(workflow, /Do not create query-log or receipt files during bootstrap/);
    assert.match(workflow, /Do not leave bootstrap-known fields as `TBD` after writing the files/);
    assert.match(workflow, /`MISSION\.md` title should use the confirmed program name/);
    assert.match(workflow, /`MISSION\.md` title should use the confirmed case name or signal label/);
    assert.match(workflow, /`STATE\.md` should start at `Phase: 1 of 5 \(Environment Mapping\)`/);
    assert.match(workflow, /`STATE\.md` should start at `Phase: 1 of 5 \(Signal Intake\)`/);
    assert.match(workflow, /`STATE\.md` should start at `Status: Ready to plan`/);
    assert.match(workflow, /Write the full bootstrap artifact set, including `STATE\.md` and `environment\/ENVIRONMENT\.md`/);
    assert.match(workflow, /Do not generate or update `CLAUDE\.md` during hunt bootstrap/);
    assert.doesNotMatch(workflow, /generate-claude-md/);
    assert.doesNotMatch(workflow, /--skeleton/);
  });

  test('hunt:new-program uses program-specific environment-first templates', () => {
    const command = readRepoFile('commands', 'hunt', 'new-program.md');

    assert.match(command, /argument-hint: "\[--auto\]"/);
    assert.match(command, /hunt-program-huntmap\.md/);
    assert.match(command, /Drive the conversation through `\.planning\/environment\/ENVIRONMENT\.md` and the operator toolchain/);
    assert.match(command, /Create `\.planning\/QUERIES\/` and `\.planning\/RECEIPTS\/` as empty directories only/);
    assert.match(command, /Do not load query-log or receipt templates during bootstrap/);
    assert.match(command, /Default behavior is scaffold-first/);
    assert.match(command, /Confirmed bootstrap facts such as the program name, mode, opened date, and initial phase\/status must be filled immediately/);
    assert.match(command, /Do not leave bootstrap-known fields as `TBD` after writing the files/);
    assert.doesNotMatch(command, /query-log\.md/);
    assert.doesNotMatch(command, /receipt\.md/);
    assert.doesNotMatch(command, /--skeleton/);
  });

  test('program huntmap template starts with environment and tool validation phases', () => {
    const template = readRepoFile('thrunt-god', 'templates', 'hunt-program-huntmap.md');

    assert.match(template, /Phase 1: Environment Mapping/);
    assert.match(template, /Phase 2: Tool & Access Validation/);
    assert.match(template, /# Huntmap: TBD/);
    assert.doesNotMatch(template, /\[Program Name\]/);
    assert.match(template, /Do not write sample query logs or sample receipts during bootstrap/);
    assert.match(template, /\| 1\. Environment Mapping \| 0\/1 \| Not started \| - \|/);
  });

  test('hunt:new-case also stays scaffold-first and avoids runtime query template bias', () => {
    const command = readRepoFile('commands', 'hunt', 'new-case.md');
    const template = readRepoFile('thrunt-god', 'templates', 'huntmap.md');

    assert.match(command, /Bootstrap should only scaffold the case/);
    assert.match(command, /Create `\.planning\/QUERIES\/` and `\.planning\/RECEIPTS\/` as empty directories only/);
    assert.match(command, /Do not load query-log or receipt templates during bootstrap/);
    assert.match(command, /Default behavior is scaffold-first/);
    assert.match(command, /Confirmed bootstrap facts such as the case name, mode, opened date, and initial phase\/status must be filled immediately/);
    assert.match(command, /Do not leave bootstrap-known fields as `TBD` after writing the files/);
    assert.doesNotMatch(command, /query-log\.md/);
    assert.doesNotMatch(command, /receipt\.md/);

    assert.match(template, /# Huntmap: TBD/);
    assert.match(template, /Clarify the incoming signal, scope boundaries, and known constraints/);
    assert.match(template, /Execute the first evidence collection wave/);
    assert.doesNotMatch(template, /\[Observable condition\]/);
    assert.doesNotMatch(template, /\[Brief description\]/);
  });

  test('environment map template captures tooling and access inventory', () => {
    const template = readRepoFile('thrunt-god', 'templates', 'environment-map.md');

    assert.match(template, /Replace `TBD` only with confirmed facts from workspace evidence or operator input/);
    assert.match(template, /\*\*Program \/ case:\*\* TBD/);
    assert.match(template, /## Tooling And Access/);
    assert.match(template, /\| Endpoint \| TBD \| TBD \| TBD \| TBD \|/);
    assert.match(template, /\| Workflow \| Tool \| Auth \/ Access Path \| Notes \|/);
    assert.match(template, /## Open Questions/);
  });

  test('map-environment command and workflow default to confirmed-facts-only mapping', () => {
    const command = readRepoFile('commands', 'hunt', 'map-environment.md');
    const workflow = readRepoFile('thrunt-god', 'workflows', 'hunt-map-environment.md');

    assert.match(command, /Default behavior is to preserve confirmed facts and leave unknown values as `TBD`/);
    assert.match(command, /Confirmed environment facts should replace existing `TBD` markers immediately/);
    assert.match(command, /Replace `TBD` only where live workspace evidence or direct operator input confirms the fact/);
    assert.doesNotMatch(command, /--skeleton/);
    assert.match(workflow, /Never invent or simulate environment details/);
    assert.match(workflow, /If confirmed facts are sparse or absent/);
    assert.match(workflow, /Ask direct follow-up questions only when the user is clearly mapping the environment live/);
    assert.match(workflow, /Do not ask placeholder follow-up questions/);
    assert.match(workflow, /Create or refresh `\.planning\/environment\/ENVIRONMENT\.md` as a blank scaffold using `TBD` markers/);
    assert.doesNotMatch(workflow, /--skeleton/);
  });

  test('hunt templates and help surface default honest scaffolding guidance', () => {
    const missionTemplate = readRepoFile('thrunt-god', 'templates', 'mission.md');
    const hypothesesTemplate = readRepoFile('thrunt-god', 'templates', 'hypotheses.md');
    const successTemplate = readRepoFile('thrunt-god', 'templates', 'success-criteria.md');
    const stateTemplate = readRepoFile('thrunt-god', 'templates', 'hunt-state.md');
    const helpWorkflow = readRepoFile('thrunt-god', 'workflows', 'hunt-help.md');

    assert.match(missionTemplate, /Unknown facts should remain `TBD`/);
    assert.match(missionTemplate, /Bootstrap should always replace the mission title, mode, opened date, and any confirmed signal or desired outcome before writing the file/);
    assert.match(hypothesesTemplate, /Unknown facts should remain `TBD`/);
    assert.match(hypothesesTemplate, /Bootstrap should always replace the document title with the confirmed program or case name before writing the file/);
    assert.match(successTemplate, /Unknown gates should remain `TBD`/);
    assert.match(successTemplate, /Bootstrap should always replace the document title with the confirmed program or case name before writing the file/);
    assert.match(stateTemplate, /Unknown state details should remain `TBD`/);
    assert.match(stateTemplate, /Bootstrap should replace the mission reference date, active signal, current focus, phase, plan, status, and last activity whenever those facts are already known/);
    assert.match(missionTemplate, /# Mission: TBD/);
    assert.match(hypothesesTemplate, /# Hypotheses: TBD/);
    assert.match(successTemplate, /# Success Criteria: TBD/);
    assert.match(stateTemplate, /Phase: TBD/);
    assert.doesNotMatch(missionTemplate, /\[Program or Case Name\]/);
    assert.doesNotMatch(missionTemplate, /Example:/);
    assert.doesNotMatch(hypothesesTemplate, /### HYP-01:/);
    assert.doesNotMatch(successTemplate, /\[Observable condition\]/);
    assert.doesNotMatch(stateTemplate, /\[time window\]/);
    assert.match(helpWorkflow, /Bootstrap should fill known fields immediately\. `TBD` is only for facts the operator has not confirmed yet\./);
    assert.match(helpWorkflow, /\/hunt:new-program \[--auto\]/);
    assert.match(helpWorkflow, /\/hunt:map-environment/);
    assert.doesNotMatch(helpWorkflow, /--skeleton/);
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
