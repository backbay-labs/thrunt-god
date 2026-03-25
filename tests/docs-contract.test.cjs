const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf-8');
}

describe('public docs contract', () => {
  test('top-level localized READMEs use validator, not verifier', () => {
    const readmes = [
      ['README.zh-CN.md'],
      ['README.ko-KR.md'],
      ['README.ja-JP.md'],
    ];

    for (const segments of readmes) {
      const content = readRepoFile(...segments);
      assert.doesNotMatch(content, /workflow\.verifier/, `${segments.join('/')} should not publish workflow.verifier`);
      assert.match(content, /workflow\.validator/, `${segments.join('/')} should publish workflow.validator`);
    }
  });

  test('public config examples use canonical discuss_mode values', () => {
    const files = [
      ['docs', 'USER-GUIDE.md'],
      ['docs', 'ja-JP', 'USER-GUIDE.md'],
      ['docs', 'ko-KR', 'USER-GUIDE.md'],
      ['docs', 'pt-BR', 'CONFIGURATION.md'],
    ];

    for (const segments of files) {
      const content = readRepoFile(...segments);
      assert.doesNotMatch(content, /"discuss_mode": "standard"/, `${segments.join('/')} should not use legacy discuss_mode "standard"`);
      assert.doesNotMatch(content, /\| `workflow\.discuss_mode` \| `standard`/, `${segments.join('/')} should not document legacy discuss_mode "standard"`);
      assert.match(content, /discuss_mode/, `${segments.join('/')} should still document discuss_mode`);
    }
  });

  test('user guides no longer publish invalid resolve_model_ids examples', () => {
    const files = [
      ['docs', 'USER-GUIDE.md'],
      ['docs', 'ja-JP', 'USER-GUIDE.md'],
      ['docs', 'ko-KR', 'USER-GUIDE.md'],
    ];

    for (const segments of files) {
      const content = readRepoFile(...segments);
      assert.doesNotMatch(content, /"resolve_model_ids": "anthropic"/, `${segments.join('/')} should not publish invalid resolve_model_ids value`);
    }
  });

  test('workflow terminology stays validation-oriented in primary docs and prompts', () => {
    const checks = [
      { segments: ['docs', 'FEATURES.md'], absent: [/Work Verification/, /Post-Execution Verification/, /verification debt/] },
      { segments: ['docs', 'ko-KR', 'FEATURES.md'], absent: [/Work Verification/, /Post-Execution Verification/, /Verification Debt Tracking/] },
      { segments: ['docs', 'COMMANDS.md'], absent: [/needs verification/, /multi-step planning, or verification/] },
      { segments: ['docs', 'ARCHITECTURE.md'], absent: [/How to verify different artifact types/, /project initialization/, /Specialized verification templates/] },
      { segments: ['agents', 'thrunt-findings-validator.md'], absent: [/phase verifier/, /Goal-backward verification/] },
      { segments: ['agents', 'thrunt-hunt-checker.md'], absent: [/executor or verifier/, /Goal-backward verification/] },
      { segments: ['agents', 'thrunt-hunt-planner.md'], absent: [/goal-backward verification/] },
      { segments: ['agents', 'thrunt-ui-researcher.md'], absent: [/Ready for Verification/, /Needs verification/] },
      { segments: ['agents', 'thrunt-intel-advisor.md'], absent: [/Needs verification/] },
      { segments: ['agents', 'thrunt-query-writer.md'], absent: [/Needs verification/] },
      { segments: ['agents', 'thrunt-telemetry-executor.md'], absent: [/tracked for the verifier to catch/] },
      { segments: ['thrunt-god', 'workflows', 'transition.md'], absent: [/verification debt/, /Outstanding verification items/] },
      { segments: ['thrunt-god', 'workflows', 'audit-evidence.md'], absent: [/verification files/, /verification items/, /human verification/] },
      { segments: ['thrunt-god', 'workflows', 'node-repair.md'], absent: [/task verification/, /Re-run verification/] },
      { segments: ['thrunt-god', 'workflows', 'findings-validation.md'], absent: [/verification subagent/, /Goal-backward verification/, /human verification items/] },
      { segments: ['thrunt-god', 'workflows', 'progress.md'], absent: [/Verification Debt/] },
      { segments: ['thrunt-god', 'templates', 'phase-prompt.md'], absent: [/Goal-backward verification/, /Verification subagent/, /Visual verification/] },
      { segments: ['thrunt-god', 'references', 'validation-patterns.md'], absent: [/verification subagent/, /Human Verification Required/, /^# Verification Patterns/m] },
    ];

    for (const { segments, absent } of checks) {
      const content = readRepoFile(...segments);
      for (const pattern of absent) {
        assert.doesNotMatch(content, pattern, `${segments.join('/')} should not contain ${pattern}`);
      }
    }
  });

  test('pack docs describe the registry layout, precedence, and CLI surface', () => {
    const architecture = readRepoFile('docs', 'ARCHITECTURE.md');
    const commands = readRepoFile('docs', 'COMMANDS.md');
    const features = readRepoFile('docs', 'FEATURES.md');
    const registryReadme = readRepoFile('thrunt-god', 'packs', 'README.md');

    assert.match(architecture, /### Pack Registry Layer/);
    assert.match(architecture, /`thrunt-god\/packs\/`/);
    assert.match(architecture, /`\.planning\/packs\/`/);
    assert.match(architecture, /Local packs override built-in packs/i);
    assert.match(architecture, /ATT&CK mapping through `attack` ids/);
    assert.match(architecture, /pack composition/i);
    assert.match(architecture, /foundations\/?/i);

    assert.match(commands, /node thrunt-tools\.cjs pack list/);
    assert.match(commands, /node thrunt-tools\.cjs pack show <pack-id>/);
    assert.match(commands, /node thrunt-tools\.cjs pack bootstrap <pack-id>/);
    assert.match(commands, /node thrunt-tools\.cjs pack validate <pack-id>/);
    assert.match(commands, /node thrunt-tools\.cjs pack render-targets <pack-id>/);
    assert.match(commands, /node thrunt-tools\.cjs pack lint/);
    assert.match(commands, /node thrunt-tools\.cjs pack test/);
    assert.match(commands, /node thrunt-tools\.cjs pack init <pack-id>/);

    assert.match(features, /ATT&CK-oriented hunt packs/i);
    assert.match(features, /domain packs/i);
    assert.match(features, /family/i);
    assert.match(features, /pack lint/i);
    assert.match(features, /pack test/i);
    assert.match(features, /pack init/i);
    assert.match(features, /T1059/);
    assert.match(features, /pack list/);

    assert.match(registryReadme, /`thrunt-god\/packs\/`/);
    assert.match(registryReadme, /`\.planning\/packs\/`/);
    assert.match(registryReadme, /foundations\//i);
    assert.match(registryReadme, /domain packs/i);
    assert.match(registryReadme, /family/i);
    assert.match(registryReadme, /example parameters/i);
    assert.match(registryReadme, /pack lint/i);
    assert.match(registryReadme, /pack test/i);
    assert.match(registryReadme, /pack init/i);
    assert.match(registryReadme, /override built-in packs/i);
    assert.match(registryReadme, /T1078/);
  });

  test('runtime certification docs describe doctor, smoke, and profile smoke specs', () => {
    const commands = readRepoFile('docs', 'COMMANDS.md');
    const architecture = readRepoFile('docs', 'ARCHITECTURE.md');
    const features = readRepoFile('docs', 'FEATURES.md');
    const configuration = readRepoFile('docs', 'CONFIGURATION.md');
    const huntRun = readRepoFile('commands', 'hunt', 'run.md');

    assert.match(commands, /node thrunt-tools\.cjs runtime doctor/);
    assert.match(commands, /node thrunt-tools\.cjs runtime smoke/);
    assert.match(commands, /smoke_test/i);

    assert.match(architecture, /connector certification/i);
    assert.match(architecture, /readiness score/i);
    assert.match(architecture, /smoke test/i);

    assert.match(features, /runtime doctor/i);
    assert.match(features, /runtime smoke/i);
    assert.match(features, /readiness score/i);

    assert.match(configuration, /smoke_test/i);
    assert.match(configuration, /FROM logs-\* \| LIMIT 1/);
    assert.match(configuration, /runtime doctor/i);

    assert.match(huntRun, /runtime doctor/i);
  });
});
