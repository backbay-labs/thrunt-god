/**
 * THRUNT Agent Frontmatter Tests
 *
 * Validates that all agent .md files have correct frontmatter fields:
 * - Anti-heredoc instruction present in file-writing agents
 * - skills: field absent from all agents (breaks Gemini CLI)
 * - Commented hooks: pattern in file-writing agents
 * - Spawn type consistency across workflows
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const WORKFLOWS_DIR = path.join(__dirname, '..', 'thrunt-god', 'workflows');
const COMMANDS_DIR = path.join(__dirname, '..', 'commands', 'thrunt');

const ALL_AGENTS = fs.readdirSync(AGENTS_DIR)
  .filter(f => f.startsWith('thrunt-') && f.endsWith('.md'))
  .map(f => f.replace('.md', ''));

const FILE_WRITING_AGENTS = ALL_AGENTS.filter(name => {
  const content = fs.readFileSync(path.join(AGENTS_DIR, name + '.md'), 'utf-8');
  const toolsMatch = content.match(/^tools:\s*(.+)$/m);
  return toolsMatch && toolsMatch[1].includes('Write');
});

const READ_ONLY_AGENTS = ALL_AGENTS.filter(name => !FILE_WRITING_AGENTS.includes(name));

// ─── Anti-Heredoc Instruction ────────────────────────────────────────────────

describe('HDOC: anti-heredoc instruction', () => {
  for (const agent of FILE_WRITING_AGENTS) {
    test(`${agent} has anti-heredoc instruction`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      assert.ok(
        content.includes("never use `Bash(cat << 'EOF')` or heredoc"),
        `${agent} missing anti-heredoc instruction`
      );
    });
  }

  test('no active heredoc patterns in any agent file', () => {
    for (const agent of ALL_AGENTS) {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      // Match actual heredoc commands (not references in anti-heredoc instruction)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip lines that are part of the anti-heredoc instruction or markdown code fences
        if (line.includes('never use') || line.includes('NEVER') || line.trim().startsWith('```')) continue;
        // Check for actual heredoc usage instructions
        if (/^cat\s+<<\s*'?EOF'?\s*>/.test(line.trim())) {
          assert.fail(`${agent}:${i + 1} has active heredoc pattern: ${line.trim()}`);
        }
      }
    }
  });
});

// ─── Skills Frontmatter ──────────────────────────────────────────────────────

describe('SKILL: skills frontmatter absent', () => {
  for (const agent of ALL_AGENTS) {
    test(`${agent} does not have skills: in frontmatter`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      assert.ok(
        !frontmatter.includes('skills:'),
        `${agent} has skills: in frontmatter — skills: breaks Gemini CLI and must be removed`
      );
    });
  }
});

// ─── Hooks Frontmatter ───────────────────────────────────────────────────────

describe('HOOK: hooks frontmatter pattern', () => {
  for (const agent of FILE_WRITING_AGENTS) {
    test(`${agent} has commented hooks pattern`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      assert.ok(
        frontmatter.includes('# hooks:'),
        `${agent} missing commented hooks: pattern in frontmatter`
      );
    });
  }

  for (const agent of READ_ONLY_AGENTS) {
    test(`${agent} (read-only) does not need hooks`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      // Read-only agents may or may not have hooks — just verify they parse
      assert.ok(frontmatter.includes('name:'), `${agent} has valid frontmatter`);
    });
  }
});

// ─── Spawn Type Consistency ──────────────────────────────────────────────────

describe('SPAWN: spawn type consistency', () => {
  test('no "First, read agent .md" workaround pattern remains', () => {
    const dirs = [WORKFLOWS_DIR, COMMANDS_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const hasWorkaround = content.includes('First, read ~/.claude/agents/thrunt-');
        assert.ok(
          !hasWorkaround,
          `${file} still has "First, read agent .md" workaround — use named subagent_type instead`
        );
      }
    }
  });

  test('named agent spawns use correct agent names', () => {
    const validAgentTypes = new Set([
      ...ALL_AGENTS,
      'general-purpose',  // Allowed for orchestrator spawns
    ]);

    const dirs = [WORKFLOWS_DIR, COMMANDS_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const matches = content.matchAll(/subagent_type="([^"]+)"/g);
        for (const match of matches) {
          const agentType = match[1];
          assert.ok(
            validAgentTypes.has(agentType),
            `${file} references unknown agent type: ${agentType}`
          );
        }
      }
    }
  });

  test('diagnose-issues uses thrunt-incident-debugger (not general-purpose)', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'diagnose-issues.md'), 'utf-8'
    );
    assert.ok(
      content.includes('subagent_type="thrunt-incident-debugger"'),
      'diagnose-issues should spawn thrunt-incident-debugger, not general-purpose'
    );
  });

  test('workflows spawning named agents have <available_agent_types> listing (#1357)', () => {
    // After /clear, Claude Code re-reads workflow instructions but loses agent
    // context. Without an <available_agent_types> section, the orchestrator may
    // fall back to general-purpose, silently breaking agent capabilities.
    // PR #1139 added this to hunt-plan and hunt-run but missed all other
    // workflows that spawn named THRUNT agents.
    const dirs = [WORKFLOWS_DIR, COMMANDS_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        // Find all named subagent_type references (excluding general-purpose)
        const matches = [...content.matchAll(/subagent_type="([^"]+)"/g)];
        const namedAgents = matches
          .map(m => m[1])
          .filter(t => t !== 'general-purpose');

        if (namedAgents.length === 0) continue;

        // Workflow spawns named agents — must have <available_agent_types>
        assert.ok(
          content.includes('<available_agent_types>'),
          `${file} spawns named agents (${[...new Set(namedAgents)].join(', ')}) ` +
          `but has no <available_agent_types> section — after /clear, the ` +
          `orchestrator may fall back to general-purpose (#1357)`
        );

        // Every spawned agent type must appear in the listing
        for (const agent of new Set(namedAgents)) {
          const agentTypesMatch = content.match(
            /<available_agent_types>([\s\S]*?)<\/available_agent_types>/
          );
          assert.ok(
            agentTypesMatch,
            `${file} has malformed <available_agent_types> section`
          );
          assert.ok(
            agentTypesMatch[1].includes(agent),
            `${file} spawns ${agent} but does not list it in <available_agent_types>`
          );
        }
      }
    }
  });

  test('hunt-run has Copilot sequential fallback in runtime_compatibility', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'hunt-run.md'), 'utf-8'
    );
    assert.ok(
      content.includes('sequential inline execution'),
      'hunt-run must document sequential inline execution as Copilot fallback'
    );
    assert.ok(
      content.includes('spot-check'),
      'hunt-run must have spot-check fallback for completion detection'
    );
  });
});

// ─── Required Frontmatter Fields ─────────────────────────────────────────────

describe('AGENT: required frontmatter fields', () => {
  for (const agent of ALL_AGENTS) {
    test(`${agent} has name, description, tools, color`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      assert.ok(frontmatter.includes('name:'), `${agent} missing name:`);
      assert.ok(frontmatter.includes('description:'), `${agent} missing description:`);
      assert.ok(frontmatter.includes('tools:'), `${agent} missing tools:`);
      assert.ok(frontmatter.includes('color:'), `${agent} missing color:`);
    });
  }
});

// ─── CLAUDE.md Compliance ───────────────────────────────────────────────────

describe('CLAUDEMD: CLAUDE.md compliance enforcement', () => {
  test('thrunt-hunt-checker has Dimension 10: CLAUDE.md Compliance', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-hunt-checker.md'), 'utf-8');
    assert.ok(
      content.includes('Dimension 10: CLAUDE.md Compliance'),
      'thrunt-hunt-checker must have Dimension 10 for CLAUDE.md compliance checking'
    );
    assert.ok(
      content.includes('claude_md_compliance'),
      'thrunt-hunt-checker must use claude_md_compliance as dimension identifier'
    );
  });

  test('thrunt-query-writer has CLAUDE.md enforcement directive', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-query-writer.md'), 'utf-8');
    assert.ok(
      content.includes('CLAUDE.md enforcement'),
      'thrunt-query-writer must enforce CLAUDE.md directives during research'
    );
    assert.ok(
      content.includes('Mission Constraints (from CLAUDE.md)'),
      'thrunt-query-writer must output a Project Constraints section from CLAUDE.md'
    );
  });

  test('thrunt-telemetry-executor has CLAUDE.md enforcement directive', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-telemetry-executor.md'), 'utf-8');
    assert.ok(
      content.includes('CLAUDE.md enforcement'),
      'thrunt-telemetry-executor must enforce CLAUDE.md directives during execution'
    );
    assert.ok(
      content.includes('CLAUDE.md rule — it takes precedence over plan instructions'),
      'thrunt-telemetry-executor must specify CLAUDE.md precedence over plan instructions'
    );
  });

  test('all three agents read CLAUDE.md in project_context', () => {
    const agents = ['thrunt-hunt-checker', 'thrunt-query-writer', 'thrunt-telemetry-executor'];
    for (const agent of agents) {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      assert.ok(
        content.includes('Read `./CLAUDE.md`'),
        `${agent} must read ./CLAUDE.md in project_context section`
      );
    }
  });
});

// ─── Verification Data-Flow and Environment Audit (#1245) ────────────────────

describe('VERIFY: data-flow trace, environment audit, and behavioral spot-checks', () => {
  test('thrunt-findings-validator has Step 4b: Data-Flow Trace', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-findings-validator.md'), 'utf-8');
    assert.ok(
      content.includes('Step 4b: Data-Flow Trace'),
      'thrunt-findings-validator must have Step 4b for data-flow tracing'
    );
    assert.ok(
      content.includes('HOLLOW'),
      'thrunt-findings-validator must define HOLLOW status for wired-but-disconnected artifacts'
    );
    assert.ok(
      content.includes('DISCONNECTED'),
      'thrunt-findings-validator must define DISCONNECTED status for missing data sources'
    );
  });

  test('thrunt-findings-validator has Step 7b: Behavioral Spot-Checks', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-findings-validator.md'), 'utf-8');
    assert.ok(
      content.includes('Step 7b: Behavioral Spot-Checks'),
      'thrunt-findings-validator must have Step 7b for behavioral spot-checks'
    );
    assert.ok(
      content.includes('SKIP'),
      'thrunt-findings-validator spot-checks must support SKIP status for untestable items'
    );
  });

  test('thrunt-findings-validator FINDINGS.md template includes data-flow and spot-check sections', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-findings-validator.md'), 'utf-8');
    assert.ok(
      content.includes('Data-Flow Trace (Level 4)'),
      'FINDINGS.md template must include Data-Flow Trace section'
    );
    assert.ok(
      content.includes('Behavioral Spot-Checks'),
      'FINDINGS.md template must include Behavioral Spot-Checks section'
    );
  });

  test('thrunt-findings-validator success criteria include data-flow and spot-checks', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-findings-validator.md'), 'utf-8');
    assert.ok(
      content.includes('Data-flow trace (Level 4)'),
      'success criteria must include data-flow trace step'
    );
    assert.ok(
      content.includes('Behavioral spot-checks run'),
      'success criteria must include behavioral spot-checks step'
    );
  });

  test('thrunt-query-writer has Step 2.6: Environment Availability Audit', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-query-writer.md'), 'utf-8');
    assert.ok(
      content.includes('Step 2.6: Environment Availability Audit'),
      'thrunt-query-writer must have Step 2.6 for environment availability auditing'
    );
    assert.ok(
      content.includes('Environment Availability'),
      'thrunt-query-writer must include Environment Availability section in RESEARCH.md template'
    );
  });

  test('thrunt-query-writer success criteria include environment audit', () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, 'thrunt-query-writer.md'), 'utf-8');
    assert.ok(
      content.includes('Environment availability audited'),
      'success criteria must include environment availability audit step'
    );
  });
});

// ─── Discussion Log ──────────────────────────────────────────────────────────

describe('DISCUSS: discussion log generation', () => {
  test('shape-hypothesis workflow references DISCUSSION-LOG.md generation', () => {
    const content = fs.readFileSync(
      path.join(WORKFLOWS_DIR, 'hunt-shape-hypothesis.md'), 'utf-8'
    );
    assert.ok(
      content.includes('DISCUSSION-LOG.md'),
      'shape-hypothesis must reference DISCUSSION-LOG.md generation'
    );
    assert.ok(
      content.includes('Audit trail only'),
      'shape-hypothesis must mark discussion log as audit-only'
    );
  });

  test('discussion-log template exists', () => {
    const templatePath = path.join(__dirname, '..', 'thrunt-god', 'templates', 'discussion-log.md');
    assert.ok(
      fs.existsSync(templatePath),
      'discussion-log.md template must exist'
    );
    const content = fs.readFileSync(templatePath, 'utf-8');
    assert.ok(
      content.includes('Do not use as input to planning'),
      'template must contain audit-only notice'
    );
  });
});

// ─── Worktree Permission Mode (#1334) ───────────────────────────────────────

describe('PERM: worktree agents have permissionMode: acceptEdits', () => {
  // Agents spawned with isolation="worktree" need permissionMode: acceptEdits
  // to avoid per-directory edit permission prompts in the worktree path.
  // See: anthropics/claude-code#29110, anthropics/claude-code#28041
  const WORKTREE_AGENTS = ['thrunt-telemetry-executor', 'thrunt-incident-debugger'];

  for (const agent of WORKTREE_AGENTS) {
    test(`${agent} has permissionMode: acceptEdits`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      assert.ok(
        frontmatter.includes('permissionMode: acceptEdits'),
        `${agent} must have permissionMode: acceptEdits — worktree agents need this to avoid ` +
        `per-directory edit permission prompts (see #1334)`
      );
    });
  }

  test('worktree-spawned agents are covered', () => {
    // Verify that agents referenced with isolation="worktree" in workflows
    // are included in the WORKTREE_AGENTS list above
    const dirs = [WORKFLOWS_DIR, COMMANDS_DIR];
    const worktreeAgentTypes = new Set();

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        // Find patterns like: subagent_type="thrunt-telemetry-executor" ... isolation="worktree"
        // These can span multiple lines in Task() calls
        const taskBlocks = content.match(/Task\([^)]*isolation="worktree"[^)]*\)/gs) || [];
        for (const block of taskBlocks) {
          const typeMatch = block.match(/subagent_type="([^"]+)"/);
          if (typeMatch) {
            worktreeAgentTypes.add(typeMatch[1]);
          }
        }
      }
    }

    for (const agentType of worktreeAgentTypes) {
      assert.ok(
        WORKTREE_AGENTS.includes(agentType),
        `${agentType} is spawned with isolation="worktree" but not in WORKTREE_AGENTS list — ` +
        `add permissionMode: acceptEdits to its frontmatter and update this test`
      );
    }
  });
});
