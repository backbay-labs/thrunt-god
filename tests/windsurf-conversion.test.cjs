/**
 * Windsurf conversion regression tests.
 *
 * Ensures Windsurf frontmatter names are emitted as plain identifiers
 * (without surrounding quotes), so Windsurf does not treat quotes as
 * literal parts of skill/subagent names.
 */

process.env.THRUNT_TEST_MODE = '1';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  convertClaudeCommandToWindsurfSkill,
  convertClaudeAgentToWindsurfAgent,
  convertClaudeToWindsurfMarkdown,
} = require('../bin/install.js');

describe('convertClaudeCommandToWindsurfSkill', () => {
  test('writes unquoted Windsurf skill name in frontmatter', () => {
    const input = `---
name: quick
description: Execute a quick task
---

<objective>
Test body
</objective>
`;

    const result = convertClaudeCommandToWindsurfSkill(input, 'thrunt-quick');
    const nameMatch = result.match(/^name:\s*(.+)$/m);

    assert.ok(nameMatch, 'frontmatter contains name field');
    assert.strictEqual(nameMatch[1], 'thrunt-quick', 'skill name is plain scalar');
    assert.ok(!result.includes('name: "thrunt-quick"'), 'quoted skill name is not emitted');
  });

  test('preserves slash for slash commands in markdown body', () => {
    const input = `---
name: hunt:plan
description: Plan a phase
---

Next:
/hunt:run 17
/thrunt-help
thrunt:progress
`;

    const result = convertClaudeCommandToWindsurfSkill(input, 'hunt-plan');
    // Slash commands: /hunt:run -> /hunt-run
    assert.ok(result.includes('/hunt-run 17'), 'slash command thrunt: -> thrunt-');
    assert.ok(result.includes('/thrunt-help'), '/thrunt-help preserved');
    assert.ok(result.includes('thrunt-progress'), 'bare thrunt: -> thrunt-');
  });

  test('includes windsurf_skill_adapter block', () => {
    const input = `---
name: test
description: A test skill
---

Body content.
`;

    const result = convertClaudeCommandToWindsurfSkill(input, 'thrunt-test');
    assert.ok(result.includes('<windsurf_skill_adapter>'), 'adapter header present');
    assert.ok(result.includes('</windsurf_skill_adapter>'), 'adapter footer present');
    assert.ok(result.includes('Shell'), 'Shell tool mentioned');
    assert.ok(result.includes('StrReplace'), 'StrReplace tool mentioned');
  });
});

describe('convertClaudeAgentToWindsurfAgent', () => {
  test('converts agent frontmatter with unquoted name', () => {
    const input = `---
name: thrunt-bugfix
description: "Fix bugs automatically"
color: blue
skills:
  - debug
  - test
---

Agent body content.
`;

    const result = convertClaudeAgentToWindsurfAgent(input);
    const nameMatch = result.match(/^name:\s*(.+)$/m);
    assert.ok(nameMatch, 'name field present');
    assert.strictEqual(nameMatch[1], 'thrunt-bugfix', 'agent name is plain scalar');
    // Should strip unsupported fields
    assert.ok(!result.includes('color:'), 'color field stripped');
    assert.ok(!result.includes('skills:'), 'skills field stripped');
  });
});

describe('convertClaudeToWindsurfMarkdown', () => {
  test('replaces Claude Code brand with Windsurf', () => {
    const input = 'Claude Code is a great tool for development.';
    const result = convertClaudeToWindsurfMarkdown(input);
    assert.ok(result.includes('Windsurf'), 'brand replaced');
    assert.ok(!result.includes('Claude Code'), 'original brand removed');
  });

  test('replaces CLAUDE.md with .windsurf/rules/', () => {
    const input = 'See `CLAUDE.md` for configuration. Also check ./CLAUDE.md file.';
    const result = convertClaudeToWindsurfMarkdown(input);
    assert.ok(result.includes('.windsurf/rules/'), 'CLAUDE.md replaced');
  });

  test('replaces .claude/skills/ with .windsurf/skills/', () => {
    const input = 'Skills are stored in .claude/skills/ directory.';
    const result = convertClaudeToWindsurfMarkdown(input);
    assert.ok(result.includes('.windsurf/skills/'), 'skills path replaced');
  });

  test('replaces Bash( with Shell( and Edit( with StrReplace(', () => {
    const input = 'Use Bash(command) and Edit(file) tools.';
    const result = convertClaudeToWindsurfMarkdown(input);
    assert.ok(result.includes('Shell('), 'Bash -> Shell');
    assert.ok(result.includes('StrReplace('), 'Edit -> StrReplace');
  });

  test('replaces $ARGUMENTS with {{THRUNT_ARGS}}', () => {
    const input = 'Pass $ARGUMENTS to the command.';
    const result = convertClaudeToWindsurfMarkdown(input);
    assert.ok(result.includes('{{THRUNT_ARGS}}'), '$ARGUMENTS replaced');
  });

  test('removes classifyHandoffIfNeeded workarounds', () => {
    const input = '**Known Claude Code bug (classifyHandoffIfNeeded):** Some workaround text here\nNext line.';
    const result = convertClaudeToWindsurfMarkdown(input);
    assert.ok(!result.includes('classifyHandoffIfNeeded'), 'workaround removed');
  });
});
