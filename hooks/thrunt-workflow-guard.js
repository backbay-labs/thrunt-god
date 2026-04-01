#!/usr/bin/env node
// thrunt-hook-version: {{THRUNT_VERSION}}
// THRUNT Workflow Guard — PreToolUse hook
// Detects when Claude attempts file edits outside a THRUNT workflow context
// (no active /thrunt: command or Task subagent) and injects an advisory warning.
//
// This is a SOFT guard — it advises, not blocks. The edit still proceeds.
// The warning nudges Claude to use /thrunt:quick or /thrunt:fast instead of
// making direct edits that bypass state tracking.
//
// Enable via config: hooks.workflow_guard: true (default: false)
// Only triggers on Write/Edit tool calls to non-.planning/ files.

const fs = require('fs');
const path = require('path');
const PLANNING_DIR_NAME = process.env.THRUNT_PLANNING_DIR || '.planning';

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;

    // Only guard Write and Edit tool calls
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    // Check if we're inside a THRUNT workflow (Task subagent or /thrunt: command)
    // Subagents have a session_id that differs from the parent
    // and typically have a description field set by the orchestrator
    if (data.tool_input?.is_subagent || data.session_type === 'task') {
      process.exit(0);
    }

    // Check the file being edited
    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

    // Allow edits to the configured planning directory (THRUNT state management)
    if (filePath.includes(`${PLANNING_DIR_NAME}/`) || filePath.includes(`${PLANNING_DIR_NAME}\\`)) {
      process.exit(0);
    }

    // Allow edits to common config/docs files that don't need THRUNT tracking
    const allowedPatterns = [
      /\.gitignore$/,
      /\.env/,
      /CLAUDE\.md$/,
      /AGENTS\.md$/,
      /GEMINI\.md$/,
      /settings\.json$/,
    ];
    if (allowedPatterns.some(p => p.test(filePath))) {
      process.exit(0);
    }

    // Check if workflow guard is enabled
    const cwd = data.cwd || process.cwd();
    const configPath = path.join(cwd, PLANNING_DIR_NAME, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config.hooks?.workflow_guard) {
          process.exit(0); // Guard disabled (default)
        }
      } catch (e) {
        process.exit(0);
      }
    } else {
      process.exit(0); // No THRUNT project — don't guard
    }

    // If we get here: THRUNT project, guard enabled, file edit outside the planning dir,
    // not in a subagent context. Inject advisory warning.
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `⚠️ WORKFLOW ADVISORY: You're editing ${path.basename(filePath)} directly without a THRUNT command. ` +
          'This edit will not be tracked in STATE.md or produce a SUMMARY.md. ' +
          'Consider using /thrunt:fast for trivial fixes or /thrunt:quick for larger changes ' +
          'to maintain project state tracking. ' +
          'If this is intentional (e.g., user explicitly asked for a direct edit), proceed normally.'
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});
