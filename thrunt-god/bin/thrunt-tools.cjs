#!/usr/bin/env node

/**
 * THRUNT Tools — CLI utility for THRUNT workflow operations
 *
 * Replaces repetitive inline bash patterns across ~50 THRUNT command/workflow/agent files.
 * Centralizes: config parsing, model resolution, phase lookup, git commits, summary validation.
 *
 * Usage: node thrunt-tools.cjs <command> [args] [--raw] [--pick <field>]
 *
 * Atomic Commands:
 *   state load                         Load workspace config + state
 *   state json                         Output STATE.md frontmatter as JSON
 *   state update <field> <value>       Update a STATE.md field
 *   state get [section]                Get STATE.md content or section
 *   state patch --field val ...        Batch update STATE.md fields
 *   state begin-phase --phase N --name S --plans C  Update STATE.md for new phase start
 *   state signal-waiting --type T --question Q --options "A|B" --phase P  Write WAITING.json signal
 *   state signal-resume                Remove WAITING.json signal
 *   resolve-model <agent-type>         Get model for agent based on profile
 *   find-phase <phase>                 Find phase directory by number
 *   commit <message> [--files f1 f2] [--no-verify]   Commit planning docs
 *   commit-to-subrepo <msg> --files f1 f2  Route commits to sub-repos
 *   validate-summary <path>            Validate a SUMMARY.md file
 *   generate-slug <text>               Convert text to URL-safe slug
 *   current-timestamp [format]         Get timestamp (full|date|filename)
 *   list-todos [area]                  Count and enumerate pending todos
 *   check-path-exists <path>           Check file/directory existence
 *   pack list                          List packs from the built-in and local registries
 *   pack show <pack-id>                Show a resolved pack definition
 *   pack bootstrap <pack-id>           Build pack-driven hunt bootstrap content
 *   pack validate <pack-id>            Validate pack parameters
 *   pack render-targets <pack-id>      Render pack execution targets into QuerySpecs
 *   pack lint [<pack-id>]              Lint shipped or local packs against authoring policy
 *   pack test [<pack-id>]              Smoke-test packs using example parameters
 *   pack init <pack-id>                Scaffold a local pack under .planning/packs/
 *     [--param key=value] [--params '{json}']
 *   pack create [options]              Interactively create a new hunt pack with guided 8-step flow
 *     [--non-interactive] [--kind <type>] [--id <id>] [--attack <ids>]
 *     [--extends <ids>] [--connectors <ids>] [--output <path>] [--dry-run]
 *   init connector <id>                Scaffold a new connector adapter with tests and Docker boilerplate
 *   runtime list-connectors            List built-in runtime connector capabilities
 *   runtime doctor [<connector-id>]    Score connector readiness and preflight config
 *   runtime smoke [<connector-id>]     Run live connector smoke tests
 *   runtime execute --connector ID --query "..."   Execute a connector-backed hunt query
 *   runtime execute --pack <pack-id>   Execute one or more pack-backed hunt targets
 *   config-ensure-section              Initialize .planning/config.json
 *   history-digest                     Aggregate all SUMMARY.md data
 *   summary-extract <path> [--fields]  Extract structured data from SUMMARY.md
 *   state-snapshot                     Structured parse of STATE.md
 *   phase-plan-index <phase>           Index plans with waves and status
 *   websearch <query>                  Search web via Brave API (if configured)
 *     [--limit N] [--freshness day|week|month]
 *
 * Metrics:
 *   metrics summary                    Aggregate hunt metrics summary
 *   metrics list [--type hunt|pack|promotion] [--connector ID] [--pack ID] [--hypothesis ID] [--limit N]
 *
 * Scoring:
 *   score summary                      Show scores for all entities
 *   score entity <type> <id>           Show detailed score for one entity
 *
 * Feedback:
 *   feedback submit --entity-type T --entity-id ID --type TYPE [--annotation "..."] [--adjustment N] [--analyst NAME]
 *   feedback list [--entity-type T] [--entity-id ID] [--type TYPE] [--limit N]
 *
 * Recommendations:
 *   recommend packs [--limit N] [--min-score S]       Ranked pack recommendations
 *   recommend connectors [--limit N] [--min-score S]  Ranked connector recommendations
 *   recommend hypotheses [--limit N] [--min-score S]  Ranked hypothesis recommendations
 *   planning-hints                                     Aggregate planning hints from scores
 *
 * Phase Operations:
 *   phase next-decimal <phase>         Calculate next decimal phase number
 *   phase add <description> [--id ID]  Append new phase to HUNTMAP.md + create dir
 *   phase insert <after> <description> Insert decimal phase after existing
 *   phase remove <phase> [--force]     Remove phase, renumber all subsequent
 *   phase complete <phase>             Mark phase done, update state + HUNTMAP.md
 *
 * Huntmap Operations:
 *   huntmap get-phase <phase>          Extract phase section from HUNTMAP.md
 *   huntmap analyze                    Full huntmap parse with disk status
 *   huntmap update-plan-progress <N>   Update progress table row from disk (PLAN vs SUMMARY counts)
 *
 * Hypotheses Operations:
 *   hypotheses mark-complete <ids>     Mark hypothesis IDs complete in HYPOTHESES.md
 *                                      Accepts: HYP-01,HYP-02 or HYP-01 HYP-02 or [HYP-01, HYP-02]
 *
 * Milestone Operations:
 *   milestone complete <version>       Archive milestone, create MILESTONES.md
 *     [--name <name>]
 *     [--archive-phases]               Move phase dirs to milestones/vX.Y-phases/
 *
 * Validation:
 *   validate consistency               Check phase numbering, disk/huntmap sync
 *   validate health [--repair]         Check .planning/ integrity, optionally repair
 *   validate agents                    Check THRUNT agent installation status
 *
 * Progress:
 *   progress [json|table|bar]          Render progress in various formats
 *
 * Todos:
 *   todo complete <filename>           Move todo from pending to completed
 *
 * Evidence Audit:
 *   audit-evidence                      Scan all phases for unresolved evidence review and findings items
 *   evidence render-checkpoint --file <path> Render the current evidence checkpoint block
 *
 * Scaffolding:
 *   scaffold context --phase <N>       Create CONTEXT.md template
 *   scaffold evidence-review --phase <N> Create EVIDENCE_REVIEW.md template
 *   scaffold findings --phase <N>      Create FINDINGS.md template
 *   scaffold phase-dir --phase <N>     Create phase directory
 *     --name <name>
 *
 * Frontmatter CRUD:
 *   frontmatter get <file> [--field k] Extract frontmatter as JSON
 *   frontmatter set <file> --field k   Update single frontmatter field
 *     --value jsonVal
 *   frontmatter merge <file>           Merge JSON into frontmatter
 *     --data '{json}'
 *   frontmatter validate <file>        Validate required fields
 *     --schema plan|summary|findings
 *
 * Validation Suite:
 *   validate summary <path>            Check a SUMMARY.md file
 *   validate plan-structure <file>     Check PLAN.md structure + tasks
 *   validate phase-completeness <phase> Check all plans have summaries
 *   validate references <file>         Check @-refs + paths resolve
 *   validate commits <h1> [h2] ...     Batch validate commit hashes
 *   validate artifacts <plan-file>     Check must_haves.artifacts
 *   validate key-links <plan-file>     Check must_haves.key_links
 *
 * Template Fill:
 *   template fill summary --phase N    Create pre-filled SUMMARY.md
 *     [--plan M] [--name "..."]
 *     [--fields '{json}']
 *   template fill plan --phase N       Create pre-filled PLAN.md
 *     [--plan M] [--type execute|tdd]
 *     [--wave N] [--fields '{json}']
 *   template fill findings             Create pre-filled FINDINGS.md
 *     --phase N [--fields '{json}']
 *   template fill evidence-review      Create pre-filled EVIDENCE_REVIEW.md
 *     --phase N [--fields '{json}']
 *
 * State Progression:
 *   state advance-plan                 Increment plan counter
 *   state record-metric --phase N      Record execution metrics
 *     --plan M --duration Xmin
 *     [--tasks N] [--files N]
 *   state update-progress              Recalculate progress bar
 *   state add-decision --summary "..."  Add decision to STATE.md
 *     [--phase N] [--rationale "..."]
 *     [--summary-file path] [--rationale-file path]
 *   state add-blocker --text "..."     Add blocker
 *     [--text-file path]
 *   state resolve-blocker --text "..." Remove blocker
 *   state record-session               Update session continuity
 *     --stopped-at "..."
 *     [--resume-file path]
 *
 * Compound Commands (workflow-specific initialization):
 *   init run <phase>                    All context for the run workflow
 *   init plan <phase>                   All context for the plan workflow
 *   init new-program                    All context for the program bootstrap workflow
 *   init new-milestone                  All context for the next program cycle workflow
 *   init quick <description>            All context for quick workflow
 *   init resume                         All context for resume-program workflow
 *   init validate-findings <phase>      All context for the findings validation workflow
 *   init phase-op <phase>               Generic phase operation context
 *   init todos [area]                   All context for todo workflows
 *   init milestone-op                   All context for milestone operations
 *   init map-environment                All context for environment mapping
 *   init progress                       All context for progress workflow
 */

const fs = require('fs');
const path = require('path');
const core = require('./lib/core.cjs');
const { error, findProjectRoot, getActiveWorkstream } = core;
const state = require('./lib/state.cjs');
const phase = require('./lib/phase.cjs');
const huntmap = require('./lib/huntmap.cjs');
const validate = require('./lib/validate.cjs');
const config = require('./lib/config.cjs');
const template = require('./lib/template.cjs');
const milestone = require('./lib/milestone.cjs');
const commands = require('./lib/commands.cjs');
const init = require('./lib/init.cjs');
const frontmatter = require('./lib/frontmatter.cjs');
const profilePipeline = require('./lib/profile-pipeline.cjs');
const profileOutput = require('./lib/profile-output.cjs');
const workstream = require('./lib/workstream.cjs');
const telemetry = require('./lib/telemetry.cjs');
const scoring = require('./lib/scoring.cjs');
const recommend = require('./lib/recommend.cjs');

// ─── Arg parsing helpers ──────────────────────────────────────────────────────

/**
 * Extract named --flag <value> pairs from an args array.
 * Returns an object mapping flag names to their values (null if absent).
 * Flags listed in `booleanFlags` are treated as boolean (no value consumed).
 *
 * parseNamedArgs(args, 'phase', 'plan')        → { phase: '3', plan: '1' }
 * parseNamedArgs(args, [], ['amend', 'force'])  → { amend: true, force: false }
 */
function parseNamedArgs(args, valueFlags = [], booleanFlags = []) {
  const result = {};
  for (const flag of valueFlags) {
    const idx = args.indexOf(`--${flag}`);
    result[flag] = idx !== -1 && args[idx + 1] !== undefined && !args[idx + 1].startsWith('--')
      ? args[idx + 1]
      : null;
  }
  for (const flag of booleanFlags) {
    result[flag] = args.includes(`--${flag}`);
  }
  return result;
}

/**
 * Collect all tokens after --flag until the next --flag or end of args.
 * Handles multi-word values like --name Foo Bar Version 1.
 * Returns null if the flag is absent.
 */
function parseMultiwordArg(args, flag) {
  const idx = args.indexOf(`--${flag}`);
  if (idx === -1) return null;
  const tokens = [];
  for (let i = idx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    tokens.push(args[i]);
  }
  return tokens.length > 0 ? tokens.join(' ') : null;
}

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Optional cwd override for sandboxed subagents running outside project root.
  let cwd = process.cwd();
  const cwdEqArg = args.find(arg => arg.startsWith('--cwd='));
  const cwdIdx = args.indexOf('--cwd');
  if (cwdEqArg) {
    const value = cwdEqArg.slice('--cwd='.length).trim();
    if (!value) error('Missing value for --cwd');
    args.splice(args.indexOf(cwdEqArg), 1);
    cwd = path.resolve(value);
  } else if (cwdIdx !== -1) {
    const value = args[cwdIdx + 1];
    if (!value || value.startsWith('--')) error('Missing value for --cwd');
    args.splice(cwdIdx, 2);
    cwd = path.resolve(value);
  }

  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    error(`Invalid --cwd: ${cwd}`);
  }

  // Resolve worktree root: in a linked worktree, .planning/ lives in the main worktree.
  // However, in monorepo worktrees where the subdirectory itself owns .planning/,
  // skip worktree resolution — the CWD is already the correct project root.
  const { resolveWorktreeRoot } = require('./lib/core.cjs');
  if (!fs.existsSync(path.join(cwd, core.PLANNING_DIR_NAME))) {
    const worktreeRoot = resolveWorktreeRoot(cwd);
    if (worktreeRoot !== cwd) {
      cwd = worktreeRoot;
    }
  }

  // Optional workstream override for parallel milestone work.
  // Priority: --ws flag > THRUNT_WORKSTREAM env var > active-workstream file > null (flat mode)
  const wsEqArg = args.find(arg => arg.startsWith('--ws='));
  const wsIdx = args.indexOf('--ws');
  let ws = null;
  if (wsEqArg) {
    ws = wsEqArg.slice('--ws='.length).trim();
    if (!ws) error('Missing value for --ws');
    args.splice(args.indexOf(wsEqArg), 1);
  } else if (wsIdx !== -1) {
    ws = args[wsIdx + 1];
    if (!ws || ws.startsWith('--')) error('Missing value for --ws');
    args.splice(wsIdx, 2);
  } else if (process.env.THRUNT_WORKSTREAM) {
    ws = process.env.THRUNT_WORKSTREAM.trim();
  } else {
    ws = getActiveWorkstream(cwd);
  }
  // Validate workstream name to prevent path traversal attacks.
  if (ws && !/^[a-zA-Z0-9_-]+$/.test(ws)) {
    error('Invalid workstream name: must be alphanumeric, hyphens, and underscores only');
  }
  // Set env var so all modules (planningDir, planningPaths) auto-resolve workstream paths
  if (ws) {
    process.env.THRUNT_WORKSTREAM = ws;
  }

  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  // --pick <name>: extract a single field from JSON output (replaces jq dependency).
  // Supports dot-notation (e.g., --pick workflow.research) and bracket notation
  // for arrays (e.g., --pick directories[-1]).
  const pickIdx = args.indexOf('--pick');
  let pickField = null;
  if (pickIdx !== -1) {
    pickField = args[pickIdx + 1];
    if (!pickField || pickField.startsWith('--')) error('Missing value for --pick');
    args.splice(pickIdx, 2);
  }

  const command = args[0];

  if (!command) {
    error('Usage: thrunt-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]\nCommands: state, resolve-model, find-phase, commit, validate-summary, validate, frontmatter, template, generate-slug, current-timestamp, list-todos, check-path-exists, pack, runtime, config-ensure-section, config-new-program, init, workstream');
  }

  // Multi-repo guard: resolve project root for commands that read/write .planning/.
  // Skip for pure-utility commands that don't touch .planning/ to avoid unnecessary
  // filesystem traversal on every invocation.
  const SKIP_ROOT_RESOLUTION = new Set([
    'generate-slug', 'current-timestamp', 'check-path-exists',
    'validate-summary', 'template', 'frontmatter',
  ]);
  if (!SKIP_ROOT_RESOLUTION.has(command)) {
    cwd = findProjectRoot(cwd);
  }

  // When --pick is active, intercept stdout to extract the requested field.
  if (pickField) {
    const origWriteSync = fs.writeSync;
    const chunks = [];
    fs.writeSync = function (fd, data, ...rest) {
      if (fd === 1) { chunks.push(String(data)); return; }
      return origWriteSync.call(fs, fd, data, ...rest);
    };
    const cleanup = () => {
      fs.writeSync = origWriteSync;
      const captured = chunks.join('');
      let jsonStr = captured;
      if (jsonStr.startsWith('@file:')) {
        jsonStr = fs.readFileSync(jsonStr.slice(6), 'utf-8');
      }
      try {
        const obj = JSON.parse(jsonStr);
        const value = extractField(obj, pickField);
        const result = value === null || value === undefined ? '' : String(value);
        origWriteSync.call(fs, 1, result);
      } catch {
        origWriteSync.call(fs, 1, captured);
      }
    };
    try {
      await runCommand(command, args, cwd, raw);
      cleanup();
    } catch (e) {
      fs.writeSync = origWriteSync;
      throw e;
    }
    return;
  }

  await runCommand(command, args, cwd, raw);
}

/**
 * Extract a field from an object using dot-notation and bracket syntax.
 * Supports: 'field', 'parent.child', 'arr[-1]', 'arr[0]'
 */
function extractField(obj, fieldPath) {
  const parts = fieldPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const bracketMatch = part.match(/^(.+?)\[(-?\d+)]$/);
    if (bracketMatch) {
      const key = bracketMatch[1];
      const index = parseInt(bracketMatch[2], 10);
      current = current[key];
      if (!Array.isArray(current)) return undefined;
      current = index < 0 ? current[current.length + index] : current[index];
    } else {
      current = current[part];
    }
  }
  return current;
}

async function runCommand(command, args, cwd, raw) {
  switch (command) {
    case 'state': {
      const subcommand = args[1];
      if (subcommand === 'json') {
        state.cmdStateJson(cwd, raw);
      } else if (subcommand === 'update') {
        state.cmdStateUpdate(cwd, args[2], args[3]);
      } else if (subcommand === 'get') {
        state.cmdStateGet(cwd, args[2], raw);
      } else if (subcommand === 'patch') {
        const patches = {};
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i].replace(/^--/, '');
          const value = args[i + 1];
          if (key && value !== undefined) {
            patches[key] = value;
          }
        }
        state.cmdStatePatch(cwd, patches, raw);
      } else if (subcommand === 'advance-plan') {
        state.cmdStateAdvancePlan(cwd, raw);
      } else if (subcommand === 'record-metric') {
        const { phase: p, plan, duration, tasks, files } = parseNamedArgs(args, ['phase', 'plan', 'duration', 'tasks', 'files']);
        state.cmdStateRecordMetric(cwd, { phase: p, plan, duration, tasks, files }, raw);
      } else if (subcommand === 'update-progress') {
        state.cmdStateUpdateProgress(cwd, raw);
      } else if (subcommand === 'add-decision') {
        const { phase: p, summary, 'summary-file': summary_file, rationale, 'rationale-file': rationale_file } = parseNamedArgs(args, ['phase', 'summary', 'summary-file', 'rationale', 'rationale-file']);
        state.cmdStateAddDecision(cwd, { phase: p, summary, summary_file, rationale: rationale || '', rationale_file }, raw);
      } else if (subcommand === 'add-blocker') {
        const { text, 'text-file': text_file } = parseNamedArgs(args, ['text', 'text-file']);
        state.cmdStateAddBlocker(cwd, { text, text_file }, raw);
      } else if (subcommand === 'resolve-blocker') {
        state.cmdStateResolveBlocker(cwd, parseNamedArgs(args, ['text']).text, raw);
      } else if (subcommand === 'record-session') {
        const { 'stopped-at': stopped_at, 'resume-file': resume_file } = parseNamedArgs(args, ['stopped-at', 'resume-file']);
        state.cmdStateRecordSession(cwd, { stopped_at, resume_file: resume_file || 'None' }, raw);
      } else if (subcommand === 'begin-phase') {
        const { phase: p, name, plans } = parseNamedArgs(args, ['phase', 'name', 'plans']);
        state.cmdStateBeginPhase(cwd, p, name, plans !== null ? parseInt(plans, 10) : null, raw);
      } else if (subcommand === 'signal-waiting') {
        const { type, question, options, phase: p } = parseNamedArgs(args, ['type', 'question', 'options', 'phase']);
        state.cmdSignalWaiting(cwd, type, question, options, p, raw);
      } else if (subcommand === 'signal-resume') {
        state.cmdSignalResume(cwd, raw);
      } else {
        state.cmdStateLoad(cwd, raw);
      }
      break;
    }

    case 'resolve-model': {
      commands.cmdResolveModel(cwd, args[1], raw);
      break;
    }

    case 'find-phase': {
      phase.cmdFindPhase(cwd, args[1], raw);
      break;
    }

    case 'commit': {
      const amend = args.includes('--amend');
      const noVerify = args.includes('--no-verify');
      const filesIndex = args.indexOf('--files');
      // Collect all positional args between command name and first flag,
      // then join them — handles both quoted ("multi word msg") and
      // unquoted (multi word msg) invocations from different shells
      const endIndex = filesIndex !== -1 ? filesIndex : args.length;
      const messageArgs = args.slice(1, endIndex).filter(a => !a.startsWith('--'));
      const message = messageArgs.join(' ') || undefined;
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
      commands.cmdCommit(cwd, message, files, raw, amend, noVerify);
      break;
    }

    case 'commit-to-subrepo': {
      const message = args[1];
      const filesIndex = args.indexOf('--files');
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
      commands.cmdCommitToSubrepo(cwd, message, files, raw);
      break;
    }

    case 'validate-summary': {
      const summaryPath = args[1];
      const countIndex = args.indexOf('--check-count');
      const checkCount = countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
      validate.cmdValidateSummary(cwd, summaryPath, checkCount, raw);
      break;
    }

    case 'template': {
      const subcommand = args[1];
      if (subcommand === 'select') {
        template.cmdTemplateSelect(cwd, args[2], raw);
      } else if (subcommand === 'fill') {
        const templateType = args[2];
        const { phase, plan, name, type, wave, fields: fieldsRaw } = parseNamedArgs(args, ['phase', 'plan', 'name', 'type', 'wave', 'fields']);
        let fields = {};
        if (fieldsRaw) {
          const { safeJsonParse } = require('./lib/security.cjs');
          const result = safeJsonParse(fieldsRaw, { label: '--fields' });
          if (!result.ok) error(result.error);
          fields = result.value;
        }
        template.cmdTemplateFill(cwd, templateType, {
          phase, plan, name, fields,
          type: type || 'execute',
          wave: wave || '1',
        }, raw);
      } else {
        error('Unknown template subcommand. Available: select, fill');
      }
      break;
    }

    case 'frontmatter': {
      const subcommand = args[1];
      const file = args[2];
      if (subcommand === 'get') {
        frontmatter.cmdFrontmatterGet(cwd, file, parseNamedArgs(args, ['field']).field, raw);
      } else if (subcommand === 'set') {
        const { field, value } = parseNamedArgs(args, ['field', 'value']);
        frontmatter.cmdFrontmatterSet(cwd, file, field, value !== null ? value : undefined, raw);
      } else if (subcommand === 'merge') {
        frontmatter.cmdFrontmatterMerge(cwd, file, parseNamedArgs(args, ['data']).data, raw);
      } else if (subcommand === 'validate') {
        frontmatter.cmdFrontmatterValidate(cwd, file, parseNamedArgs(args, ['schema']).schema, raw);
      } else {
        error('Unknown frontmatter subcommand. Available: get, set, merge, validate');
      }
      break;
    }

    case 'generate-slug': {
      commands.cmdGenerateSlug(args[1], raw);
      break;
    }

    case 'current-timestamp': {
      commands.cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    }

    case 'list-todos': {
      commands.cmdListTodos(cwd, args[1], raw);
      break;
    }

    case 'check-path-exists': {
      commands.cmdCheckPathExists(cwd, args[1], raw);
      break;
    }

    case 'pack': {
      const subcommand = args[1];
      if (subcommand === 'list') {
        await commands.cmdPackList(cwd, raw);
      } else if (subcommand === 'show') {
        await commands.cmdPackShow(cwd, args[2], raw);
      } else if (subcommand === 'bootstrap') {
        await commands.cmdPackBootstrap(cwd, args.slice(2), raw);
      } else if (subcommand === 'validate') {
        await commands.cmdPackValidate(cwd, args.slice(2), raw);
      } else if (subcommand === 'render-targets') {
        await commands.cmdPackRenderTargets(cwd, args.slice(2), raw);
      } else if (subcommand === 'lint') {
        await commands.cmdPackLint(cwd, args.slice(2), raw);
      } else if (subcommand === 'test') {
        await commands.cmdPackTest(cwd, args.slice(2), raw);
      } else if (subcommand === 'init') {
        await commands.cmdPackInit(cwd, args.slice(2), raw);
      } else if (subcommand === 'create') {
        await commands.cmdPackCreate(cwd, args.slice(2), raw);
      } else if (subcommand === 'promote') {
        await commands.cmdPackPromote(cwd, args.slice(2), raw);
      } else {
        error('Unknown pack subcommand. Available: list, show, bootstrap, validate, render-targets, lint, test, init, create, promote');
      }
      break;
    }

    case 'runtime': {
      const subcommand = args[1];
      if (subcommand === 'list-connectors') {
        await commands.cmdRuntimeListConnectors(cwd, raw);
      } else if (subcommand === 'doctor') {
        await commands.cmdRuntimeDoctor(cwd, args.slice(2), raw);
      } else if (subcommand === 'smoke') {
        await commands.cmdRuntimeSmoke(cwd, args.slice(2), raw);
      } else if (subcommand === 'execute') {
        await commands.cmdRuntimeExecute(cwd, args.slice(2), raw);
      } else {
        error('Unknown runtime subcommand. Available: list-connectors, doctor, smoke, execute');
      }
      break;
    }

    case 'config-ensure-section': {
      config.cmdConfigEnsureSection(cwd, raw);
      break;
    }

    case 'config-set': {
      config.cmdConfigSet(cwd, args[1], args[2], raw);
      break;
    }

    case "config-set-model-profile": {
      config.cmdConfigSetModelProfile(cwd, args[1], raw);
      break;
    }

    case 'config-get': {
      config.cmdConfigGet(cwd, args[1], raw);
      break;
    }

    case 'config-new-program': {
      config.cmdConfigNewProgram(cwd, args[1], raw);
      break;
    }

    case 'agent-skills': {
      init.cmdAgentSkills(cwd, args[1], raw);
      break;
    }

    case 'history-digest': {
      commands.cmdHistoryDigest(cwd, raw);
      break;
    }

    case 'phases': {
      const subcommand = args[1];
      if (subcommand === 'list') {
        const typeIndex = args.indexOf('--type');
        const phaseIndex = args.indexOf('--phase');
        const options = {
          type: typeIndex !== -1 ? args[typeIndex + 1] : null,
          phase: phaseIndex !== -1 ? args[phaseIndex + 1] : null,
          includeArchived: args.includes('--include-archived'),
        };
        phase.cmdPhasesList(cwd, options, raw);
      } else {
        error('Unknown phases subcommand. Available: list');
      }
      break;
    }

    case 'huntmap': {
      const subcommand = args[1];
      if (subcommand === 'get-phase') {
        huntmap.cmdHuntmapGetPhase(cwd, args[2], raw);
      } else if (subcommand === 'analyze') {
        huntmap.cmdHuntmapAnalyze(cwd, raw);
      } else if (subcommand === 'update-plan-progress') {
        huntmap.cmdHuntmapUpdatePlanProgress(cwd, args[2], raw);
      } else {
        error('Unknown huntmap subcommand. Available: get-phase, analyze, update-plan-progress');
      }
      break;
    }

    case 'hypotheses': {
      const subcommand = args[1];
      if (subcommand === 'mark-complete') {
        milestone.cmdHypothesesMarkComplete(cwd, args.slice(2), raw);
      } else {
        error('Unknown hypotheses subcommand. Available: mark-complete');
      }
      break;
    }

    case 'phase': {
      const subcommand = args[1];
      if (subcommand === 'next-decimal') {
        phase.cmdPhaseNextDecimal(cwd, args[2], raw);
      } else if (subcommand === 'add') {
        const idIdx = args.indexOf('--id');
        let customId = null;
        const descArgs = [];
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--id' && i + 1 < args.length) {
            customId = args[i + 1];
            i++; // skip value
          } else {
            descArgs.push(args[i]);
          }
        }
        phase.cmdPhaseAdd(cwd, descArgs.join(' '), raw, customId);
      } else if (subcommand === 'insert') {
        phase.cmdPhaseInsert(cwd, args[2], args.slice(3).join(' '), raw);
      } else if (subcommand === 'remove') {
        const forceFlag = args.includes('--force');
        phase.cmdPhaseRemove(cwd, args[2], { force: forceFlag }, raw);
      } else if (subcommand === 'complete') {
        phase.cmdPhaseComplete(cwd, args[2], raw);
      } else {
        error('Unknown phase subcommand. Available: next-decimal, add, insert, remove, complete');
      }
      break;
    }

    case 'milestone': {
      const subcommand = args[1];
      if (subcommand === 'complete') {
        const milestoneName = parseMultiwordArg(args, 'name');
        const archivePhases = args.includes('--archive-phases');
        milestone.cmdMilestoneComplete(cwd, args[2], { name: milestoneName, archivePhases }, raw);
      } else {
        error('Unknown milestone subcommand. Available: complete');
      }
      break;
    }

    case 'validate': {
      const subcommand = args[1];
      if (subcommand === 'summary') {
        const countIndex = args.indexOf('--check-count');
        const checkCount = countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
        validate.cmdValidateSummary(cwd, args[2], checkCount, raw);
      } else if (subcommand === 'plan-structure') {
        validate.cmdValidatePlanStructure(cwd, args[2], raw);
      } else if (subcommand === 'phase-completeness') {
        validate.cmdValidatePhaseCompleteness(cwd, args[2], raw);
      } else if (subcommand === 'references') {
        validate.cmdValidateReferences(cwd, args[2], raw);
      } else if (subcommand === 'commits') {
        validate.cmdValidateCommits(cwd, args.slice(2), raw);
      } else if (subcommand === 'artifacts') {
        validate.cmdValidateArtifacts(cwd, args[2], raw);
      } else if (subcommand === 'key-links') {
        validate.cmdValidateKeyLinks(cwd, args[2], raw);
      } else if (subcommand === 'consistency') {
        validate.cmdValidateConsistency(cwd, raw);
      } else if (subcommand === 'health') {
        const repairFlag = args.includes('--repair');
        validate.cmdValidateHealth(cwd, { repair: repairFlag }, raw);
      } else if (subcommand === 'agents') {
        validate.cmdValidateAgents(cwd, raw);
      } else {
        error('Unknown validate subcommand. Available: summary, plan-structure, phase-completeness, references, commits, artifacts, key-links, consistency, health, agents');
      }
      break;
    }

    case 'progress': {
      const subcommand = args[1] || 'json';
      commands.cmdProgressRender(cwd, subcommand, raw);
      break;
    }

    case 'audit-evidence': {
      const evidence = require('./lib/evidence.cjs');
      evidence.cmdAuditEvidence(cwd, raw);
      break;
    }

    case 'evidence': {
      const subcommand = args[1];
      const evidence = require('./lib/evidence.cjs');
      if (subcommand === 'render-checkpoint') {
        const options = parseNamedArgs(args, ['file']);
        evidence.cmdRenderEvidenceCheckpoint(cwd, options, raw);
      } else if (subcommand === 'review') {
        const review = require('./lib/review.cjs');
        const options = parseNamedArgs(args, ['phase', 'format'], ['force']);
        review.cmdEvidenceReview(cwd, options, raw);
      } else {
        error('Unknown evidence subcommand. Available: render-checkpoint, review');
      }
      break;
    }

    case 'bundle': {
      const subcommand = args[1];
      const bundle = require('./lib/bundle.cjs');
      if (subcommand === 'export') {
        const options = parseNamedArgs(args, ['phase', 'output', 'since', 'until'], ['redact']);
        bundle.cmdBundleExport(cwd, options, raw);
      } else if (subcommand === 'verify') {
        bundle.cmdBundleVerify(cwd, args[2], raw);
      } else {
        error('Unknown bundle subcommand. Available: export, verify');
      }
      break;
    }

    case 'detection': {
      const subcommand = args[1];
      const detection = require('./lib/detection.cjs');
      if (subcommand === 'map') {
        const options = parseNamedArgs(args, ['phase', 'finding', 'format'], []);
        detection.cmdDetectionMap(cwd, options, raw);
      } else if (subcommand === 'list') {
        const options = parseNamedArgs(args, ['phase', 'status', 'format'], []);
        detection.cmdDetectionList(cwd, options, raw);
      } else if (subcommand === 'generate') {
        const options = parseNamedArgs(args, ['phase', 'candidate', 'format'], []);
        detection.cmdDetectionGenerate(cwd, options, raw);
      } else if (subcommand === 'backtest') {
        const options = parseNamedArgs(args, ['phase', 'candidate'], []);
        detection.cmdDetectionBacktest(cwd, options, raw);
      } else if (subcommand === 'promote') {
        const options = parseNamedArgs(args, ['phase', 'candidate', 'promoted-by'], ['approve']);
        detection.cmdDetectionPromote(cwd, options, raw);
      } else if (subcommand === 'reject') {
        const options = parseNamedArgs(args, ['candidate', 'reason'], []);
        detection.cmdDetectionReject(cwd, options, raw);
      } else if (subcommand === 'status') {
        const options = parseNamedArgs(args, ['phase'], []);
        detection.cmdDetectionStatus(cwd, options, raw);
      } else {
        error('Unknown detection subcommand. Available: map, list, generate, backtest, promote, reject, status');
      }
      break;
    }

    case 'metrics': {
      const subcommand = args[1];
      if (subcommand === 'summary') {
        telemetry.cmdMetricsSummary(cwd, raw);
      } else if (subcommand === 'list') {
        telemetry.cmdMetricsList(cwd, args.slice(2), raw);
      } else {
        error('Unknown metrics subcommand. Available: summary, list');
      }
      break;
    }

    case 'score': {
      const subcommand = args[1];
      if (subcommand === 'summary') {
        scoring.cmdScoreSummary(cwd, raw);
      } else if (subcommand === 'entity') {
        scoring.cmdScoreEntity(cwd, args[2], args[3], raw);
      } else {
        error('Unknown score subcommand. Available: summary, entity <type> <id>');
      }
      break;
    }

    case 'feedback': {
      const subcommand = args[1];
      if (subcommand === 'submit') {
        scoring.cmdFeedbackSubmit(cwd, args.slice(2), raw);
      } else if (subcommand === 'list') {
        scoring.cmdFeedbackList(cwd, args.slice(2), raw);
      } else {
        error('Unknown feedback subcommand. Available: submit, list');
      }
      break;
    }

    case 'recommend': {
      const entityType = args[1];
      if (['packs', 'connectors', 'hypotheses'].includes(entityType)) {
        recommend.cmdRecommend(cwd, entityType, args.slice(2), raw);
      } else {
        error('Unknown recommend target. Available: packs, connectors, hypotheses');
      }
      break;
    }

    case 'planning-hints': {
      recommend.cmdPlanningHints(cwd, raw);
      break;
    }

    case 'stats': {
      const subcommand = args[1] || 'json';
      commands.cmdStats(cwd, subcommand, raw);
      break;
    }

    case 'todo': {
      const subcommand = args[1];
      if (subcommand === 'complete') {
        commands.cmdTodoComplete(cwd, args[2], raw);
      } else if (subcommand === 'match-phase') {
        commands.cmdTodoMatchPhase(cwd, args[2], raw);
      } else {
        error('Unknown todo subcommand. Available: complete, match-phase');
      }
      break;
    }

    case 'scaffold': {
      const scaffoldType = args[1];
      const scaffoldOptions = {
        phase: parseNamedArgs(args, ['phase']).phase,
        name: parseMultiwordArg(args, 'name'),
      };
      commands.cmdScaffold(cwd, scaffoldType, scaffoldOptions, raw);
      break;
    }

    case 'init': {
      const workflow = args[1];
      switch (workflow) {
        case 'run':
          init.cmdInitRun(cwd, args[2], raw);
          break;
        case 'plan':
          init.cmdInitPlan(cwd, args[2], raw);
          break;
        case 'new-program':
          init.cmdInitNewProgram(cwd, raw);
          break;
        case 'new-milestone':
          init.cmdInitNewMilestone(cwd, raw);
          break;
        case 'quick':
          init.cmdInitQuick(cwd, args.slice(2).join(' '), raw);
          break;
        case 'resume':
          init.cmdInitResume(cwd, raw);
          break;
        case 'validate-findings':
          init.cmdInitValidateFindings(cwd, args[2], raw);
          break;
        case 'phase-op':
          init.cmdInitPhaseOp(cwd, args[2], raw);
          break;
        case 'todos':
          init.cmdInitTodos(cwd, args[2], raw);
          break;
        case 'milestone-op':
          init.cmdInitMilestoneOp(cwd, raw);
          break;
        case 'map-environment':
          init.cmdInitMapEnvironment(cwd, raw);
          break;
        case 'progress':
          init.cmdInitProgress(cwd, raw);
          break;
        case 'manager':
          init.cmdInitManager(cwd, raw);
          break;
        case 'new-workspace':
          init.cmdInitNewWorkspace(cwd, raw);
          break;
        case 'list-workspaces':
          init.cmdInitListWorkspaces(cwd, raw);
          break;
        case 'remove-workspace':
          init.cmdInitRemoveWorkspace(cwd, args[2], raw);
          break;
        case 'connector':
          await commands.cmdInitConnector(cwd, args.slice(2), raw);
          break;
        default:
          error(`Unknown init workflow: ${workflow}\nAvailable: run, plan, new-program, new-milestone, quick, resume, validate-findings, phase-op, todos, milestone-op, map-environment, progress, manager, new-workspace, list-workspaces, remove-workspace, connector`);
      }
      break;
    }

    case 'phase-plan-index': {
      phase.cmdPhasePlanIndex(cwd, args[1], raw);
      break;
    }

    case 'state-snapshot': {
      state.cmdStateSnapshot(cwd, raw);
      break;
    }

    case 'summary-extract': {
      const summaryPath = args[1];
      const fieldsIndex = args.indexOf('--fields');
      const fields = fieldsIndex !== -1 ? args[fieldsIndex + 1].split(',') : null;
      commands.cmdSummaryExtract(cwd, summaryPath, fields, raw);
      break;
    }

    case 'websearch': {
      const query = args[1];
      const limitIdx = args.indexOf('--limit');
      const freshnessIdx = args.indexOf('--freshness');
      await commands.cmdWebsearch(query, {
        limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10,
        freshness: freshnessIdx !== -1 ? args[freshnessIdx + 1] : null,
      }, raw);
      break;
    }

    // ─── Profiling Pipeline ────────────────────────────────────────────────

    case 'scan-sessions': {
      const pathIdx = args.indexOf('--path');
      const sessionsPath = pathIdx !== -1 ? args[pathIdx + 1] : null;
      const verboseFlag = args.includes('--verbose');
      const jsonFlag = args.includes('--json');
      await profilePipeline.cmdScanSessions(sessionsPath, { verbose: verboseFlag, json: jsonFlag }, raw);
      break;
    }

    case 'extract-messages': {
      const sessionIdx = args.indexOf('--session');
      const sessionId = sessionIdx !== -1 ? args[sessionIdx + 1] : null;
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
      const pathIdx = args.indexOf('--path');
      const sessionsPath = pathIdx !== -1 ? args[pathIdx + 1] : null;
      const projectArg = args[1];
      if (!projectArg || projectArg.startsWith('--')) {
        error('Usage: thrunt-tools extract-messages <project> [--session <id>] [--limit N] [--path <dir>]\nRun scan-sessions first to see available projects.');
      }
      await profilePipeline.cmdExtractMessages(projectArg, { sessionId, limit }, raw, sessionsPath);
      break;
    }

    case 'profile-sample': {
      const pathIdx = args.indexOf('--path');
      const sessionsPath = pathIdx !== -1 ? args[pathIdx + 1] : null;
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 150;
      const maxPerIdx = args.indexOf('--max-per-project');
      const maxPerProject = maxPerIdx !== -1 ? parseInt(args[maxPerIdx + 1], 10) : null;
      const maxCharsIdx = args.indexOf('--max-chars');
      const maxChars = maxCharsIdx !== -1 ? parseInt(args[maxCharsIdx + 1], 10) : 500;
      await profilePipeline.cmdProfileSample(sessionsPath, { limit, maxPerProject, maxChars }, raw);
      break;
    }

    // ─── Profile Output ──────────────────────────────────────────────────

    case 'write-profile': {
      const inputIdx = args.indexOf('--input');
      const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : null;
      if (!inputPath) error('--input <analysis-json-path> is required');
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      profileOutput.cmdWriteProfile(cwd, { input: inputPath, output: outputPath }, raw);
      break;
    }

    case 'profile-questionnaire': {
      const answersIdx = args.indexOf('--answers');
      const answers = answersIdx !== -1 ? args[answersIdx + 1] : null;
      profileOutput.cmdProfileQuestionnaire({ answers }, raw);
      break;
    }

    case 'generate-dev-preferences': {
      const analysisIdx = args.indexOf('--analysis');
      const analysisPath = analysisIdx !== -1 ? args[analysisIdx + 1] : null;
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      const stackIdx = args.indexOf('--stack');
      const stack = stackIdx !== -1 ? args[stackIdx + 1] : null;
      profileOutput.cmdGenerateDevPreferences(cwd, { analysis: analysisPath, output: outputPath, stack }, raw);
      break;
    }

    case 'generate-claude-profile': {
      const analysisIdx = args.indexOf('--analysis');
      const analysisPath = analysisIdx !== -1 ? args[analysisIdx + 1] : null;
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      const globalFlag = args.includes('--global');
      profileOutput.cmdGenerateClaudeProfile(cwd, { analysis: analysisPath, output: outputPath, global: globalFlag }, raw);
      break;
    }

    case 'generate-claude-md': {
      const outputIdx = args.indexOf('--output');
      const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;
      const autoFlag = args.includes('--auto');
      const forceFlag = args.includes('--force');
      profileOutput.cmdGenerateClaudeMd(cwd, { output: outputPath, auto: autoFlag, force: forceFlag }, raw);
      break;
    }

    case 'workstream': {
      const subcommand = args[1];
      if (subcommand === 'create') {
        const migrateNameIdx = args.indexOf('--migrate-name');
        const noMigrate = args.includes('--no-migrate');
        workstream.cmdWorkstreamCreate(cwd, args[2], {
          migrate: !noMigrate,
          migrateName: migrateNameIdx !== -1 ? args[migrateNameIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'list') {
        workstream.cmdWorkstreamList(cwd, raw);
      } else if (subcommand === 'status') {
        workstream.cmdWorkstreamStatus(cwd, args[2], raw);
      } else if (subcommand === 'complete') {
        workstream.cmdWorkstreamComplete(cwd, args[2], {}, raw);
      } else if (subcommand === 'set') {
        workstream.cmdWorkstreamSet(cwd, args[2], raw);
      } else if (subcommand === 'get') {
        workstream.cmdWorkstreamGet(cwd, raw);
      } else if (subcommand === 'progress') {
        workstream.cmdWorkstreamProgress(cwd, raw);
      } else {
        error('Unknown workstream subcommand. Available: create, list, status, complete, set, get, progress');
      }
      break;
    }

    default:
      error(`Unknown command: ${command}`);
  }
}

main();
