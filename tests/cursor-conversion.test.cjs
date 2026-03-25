/**
 * Cursor conversion regression tests.
 *
 * Ensures Cursor frontmatter names are emitted as plain identifiers
 * (without surrounding quotes), so Cursor does not treat quotes as
 * literal parts of skill/subagent names.
 */

process.env.THRUNT_TEST_MODE = '1';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  convertClaudeCommandToCursorSkill,
  convertClaudeAgentToCursorAgent,
} = require('../bin/install.js');

describe('convertClaudeCommandToCursorSkill', () => {
  test('writes unquoted Cursor skill name in frontmatter', () => {
    const input = `---
name: quick
description: Execute a quick task
---

<objective>
Test body
</objective>
`;

    const result = convertClaudeCommandToCursorSkill(input, 'thrunt-quick');
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

    const result = convertClaudeCommandToCursorSkill(input, 'hunt-plan');

    assert.ok(result.includes('/hunt-run 17'), 'slash command remains slash-prefixed');
    assert.ok(result.includes('/thrunt-help'), 'existing slash command is preserved');
    assert.ok(result.includes('thrunt-progress'), 'non-slash thrunt: references still normalize');
    assert.ok(!result.includes('/hunt:run'), 'slash-colon command form is removed');
  });
});

describe('convertClaudeAgentToCursorAgent', () => {
  test('writes unquoted Cursor agent name in frontmatter', () => {
    const input = `---
name: thrunt-hunt-planner
description: Planner agent
tools: Read, Write
color: green
---

<role>
Planner body
</role>
`;

    const result = convertClaudeAgentToCursorAgent(input);
    const nameMatch = result.match(/^name:\s*(.+)$/m);

    assert.ok(nameMatch, 'frontmatter contains name field');
    assert.strictEqual(nameMatch[1], 'thrunt-hunt-planner', 'agent name is plain scalar');
    assert.ok(!result.includes('name: "thrunt-hunt-planner"'), 'quoted agent name is not emitted');
  });
});
