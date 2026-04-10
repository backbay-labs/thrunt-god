/**
 * Commands — Standalone utility commands
 */
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { safeReadFile, loadConfig, isGitIgnored, execGit, normalizePhaseName, comparePhaseNum, getArchivedPhaseDirs, generateSlugInternal, getMilestoneInfo, getMilestonePhaseFilter, resolveModelInternal, stripShippedMilestones, extractCurrentMilestone, planningDir, planningRoot, planningPaths, toPosixPath, output, error, findPhaseInternal, extractOneLinerFromBody, getHuntmapPhaseInternal, getHuntmapDocInfo, getActiveCase, setActiveCase, PLANNING_DIR_NAME } = require('./core.cjs');
const { extractFrontmatter, spliceFrontmatter, reconstructFrontmatter } = require('./frontmatter.cjs');
const { addCaseToRoster, updateCaseInRoster, getCaseRoster } = require('./state.cjs');
const { MODEL_PROFILES } = require('./model-profiles.cjs');

const TECHNIQUE_ID_RE = /T\d{4}(?:\.\d{3})?/gi;

// Lazy-require db.cjs: better-sqlite3 native module may not be available in all environments
// (e.g., install manifest tests that copy files to temp dirs without node_modules)
let dbModule;
try {
  dbModule = require('./db.cjs');
} catch {
  dbModule = null;
}
const { openProgramDb, indexCase, searchCases, findTechniqueOverlap, extractTechniqueIds } = dbModule || {};

// Lazy-require @thrunt/mcp modules: may not be available in all environments
let intelModule, coverageModule;
try {
  intelModule = require('../../../apps/mcp/lib/intel.cjs');
  coverageModule = require('../../../apps/mcp/lib/coverage.cjs');
} catch {
  intelModule = null;
  coverageModule = null;
}

// Lazy-require tenant module to avoid circular deps at load time
function getTenant() { return require('./tenant.cjs'); }

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectPackHuntExecutionIds(results = []) {
  return results
    .map(item =>
      (item && item.artifacts && item.artifacts.telemetry && item.artifacts.telemetry.hunt_execution_id) ||
      (item && item.result && item.result.metadata && item.result.metadata.hunt_execution_id) ||
      null
    )
    .filter(Boolean);
}

function extractTechniqueIdsFallback(text) {
  if (!text) return [];

  if (extractTechniqueIds) {
    return extractTechniqueIds(text);
  }

  const matches = text.match(TECHNIQUE_ID_RE) || [];
  return [...new Set(matches.map(id => id.toUpperCase()))];
}

function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const result = { slug };
  output(result, raw, slug);
}

function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdListTodos(cwd, area, raw) {
  const pendingDir = path.join(planningDir(cwd), 'todos', 'pending');

  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);

        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: toPosixPath(path.relative(cwd, path.join(pendingDir, file))),
        });
      } catch { /* intentionally empty */ }
    }
  } catch { /* intentionally empty */ }

  const result = { count, todos };
  output(result, raw, count.toString());
}

function cmdCheckPathExists(cwd, targetPath, raw) {
  if (!targetPath) {
    error('path required for existence check');
  }

  // Reject null bytes and validate path does not contain traversal attempts
  if (targetPath.includes('\0')) {
    error('path contains null bytes');
  }

  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

function cmdHistoryDigest(cwd, raw) {
  const phasesDir = planningPaths(cwd).phases;
  const digest = { phases: {}, decisions: [], tech_stack: new Set() };

  // Collect all phase directories: archived + current
  const allPhaseDirs = [];

  // Add archived phases first (oldest milestones first)
  const archived = getArchivedPhaseDirs(cwd);
  for (const a of archived) {
    allPhaseDirs.push({ name: a.name, fullPath: a.fullPath, milestone: a.milestone });
  }

  // Add current phases
  if (fs.existsSync(phasesDir)) {
    try {
      const currentDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
      for (const dir of currentDirs) {
        allPhaseDirs.push({ name: dir, fullPath: path.join(phasesDir, dir), milestone: null });
      }
    } catch { /* intentionally empty */ }
  }

  if (allPhaseDirs.length === 0) {
    digest.tech_stack = [];
    output(digest, raw);
    return;
  }

  try {
    for (const { name: dir, fullPath: dirPath } of allPhaseDirs) {
      const summaries = fs.readdirSync(dirPath).filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content);

          const phaseNum = fm.phase || dir.split('-')[0];

          if (!digest.phases[phaseNum]) {
            digest.phases[phaseNum] = {
              name: fm.name || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set(),
              affects: new Set(),
              patterns: new Set(),
            };
          }

          // Merge provides
          if (fm['dependency-graph'] && fm['dependency-graph'].provides) {
            fm['dependency-graph'].provides.forEach(p => digest.phases[phaseNum].provides.add(p));
          } else if (fm.provides) {
            fm.provides.forEach(p => digest.phases[phaseNum].provides.add(p));
          }

          // Merge affects
          if (fm['dependency-graph'] && fm['dependency-graph'].affects) {
            fm['dependency-graph'].affects.forEach(a => digest.phases[phaseNum].affects.add(a));
          }

          // Merge patterns
          if (fm['patterns-established']) {
            fm['patterns-established'].forEach(p => digest.phases[phaseNum].patterns.add(p));
          }

          // Merge decisions
          if (fm['key-decisions']) {
            fm['key-decisions'].forEach(d => {
              digest.decisions.push({ phase: phaseNum, decision: d });
            });
          }

          // Merge tech stack
          if (fm['tech-stack'] && fm['tech-stack'].added) {
            fm['tech-stack'].added.forEach(t => digest.tech_stack.add(typeof t === 'string' ? t : t.name));
          }

        } catch (e) {
          // Skip malformed summaries
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.phases).forEach(p => {
      digest.phases[p].provides = [...digest.phases[p].provides];
      digest.phases[p].affects = [...digest.phases[p].affects];
      digest.phases[p].patterns = [...digest.phases[p].patterns];
    });
    digest.tech_stack = [...digest.tech_stack];

    output(digest, raw);
  } catch (e) {
    error('Failed to generate history digest: ' + e.message);
  }
}

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  const model = resolveModelInternal(cwd, agentType);

  const agentModels = MODEL_PROFILES[agentType];
  const result = agentModels
    ? { model, profile }
    : { model, profile, unknown_agent: true };
  output(result, raw, model);
}

function parseRuntimeArgs(args = []) {
  const options = {
    parameters: {},
    hypothesis_ids: [],
    tags: [],
    iocs: [],
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);

    if (key === 'dry-run') {
      options.dry_run = true;
      continue;
    }

    if (key === 'param' && args[i + 1] && !args[i + 1].startsWith('--')) {
      const rawPair = args[i + 1];
      const eq = rawPair.indexOf('=');
      if (eq === -1) {
        error(`runtime execute --param requires key=value, received ${rawPair}`);
      }
      const name = rawPair.slice(0, eq);
      const value = rawPair.slice(eq + 1);
      if (!name) {
        error(`runtime execute --param requires key=value, received ${rawPair}`);
      }
      options.parameters[name] = value;
      i += 1;
      continue;
    }

    if ((key === 'hypothesis' || key === 'tag' || key === 'ioc') && args[i + 1] && !args[i + 1].startsWith('--')) {
      const target = key === 'hypothesis' ? options.hypothesis_ids : key === 'tag' ? options.tags : options.iocs;
      target.push(args[i + 1]);
      i += 1;
      continue;
    }

    if (args[i + 1] && !args[i + 1].startsWith('--')) {
      options[key.replace(/-/g, '_')] = args[i + 1];
      i += 1;
      continue;
    }

    options[key.replace(/-/g, '_')] = true;
  }

  return options;
}

function coerceRuntimeValue(value) {
  if (value === undefined || value === null) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function parsePackArgs(args = []) {
  const options = {
    parameters: {},
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);

    if (key === 'param' && args[i + 1] && !args[i + 1].startsWith('--')) {
      const rawPair = args[i + 1];
      const eq = rawPair.indexOf('=');
      if (eq === -1) {
        error(`pack validate --param requires key=value, received ${rawPair}`);
      }
      const name = rawPair.slice(0, eq);
      const value = rawPair.slice(eq + 1);
      if (!name) {
        error(`pack validate --param requires key=value, received ${rawPair}`);
      }
      options.parameters[name] = value;
      i += 1;
      continue;
    }

    if (args[i + 1] && !args[i + 1].startsWith('--')) {
      options[key.replace(/-/g, '_')] = args[i + 1];
      i += 1;
      continue;
    }
  }

  return options;
}

function extractPackProvidedParameters(options = {}) {
  let extraParameters = {};
  if (options.params) {
    const { safeJsonParse } = require('./security.cjs');
    const result = safeJsonParse(options.params, { label: '--params' });
    if (!result.ok) error(result.error);
    if (!isPlainObject(result.value)) {
      error('--params must be a JSON object');
    }
    extraParameters = result.value;
  }

  return {
    ...extraParameters,
    ...Object.fromEntries(
      Object.entries(options.parameters || {}).map(([key, value]) => [key, coerceRuntimeValue(value)])
    ),
  };
}

function getRuntimeConnectorArg(args = []) {
  return args[0] && !args[0].startsWith('--') ? args[0] : null;
}

function getTypedRuntimeParameters(options = {}) {
  return Object.fromEntries(
    Object.entries(options.parameters || {}).map(([key, value]) => [key, coerceRuntimeValue(value)])
  );
}

function buildRuntimeCertificationOptions(args = [], options = {}) {
  return {
    connectorId: getRuntimeConnectorArg(args) || options.connector || null,
    profile: options.profile || null,
    dataset: options.dataset || null,
    language: options.language || null,
    query: options.query || null,
    start: options.start || null,
    end: options.end || null,
    lookback_minutes: options.lookback_minutes ? parseInt(options.lookback_minutes, 10) : undefined,
    lookback_hours: options.lookback_hours ? parseInt(options.lookback_hours, 10) : undefined,
    pagination_mode: options.pagination_mode || null,
    limit: options.limit ? parseInt(options.limit, 10) : undefined,
    max_pages: options.max_pages ? parseInt(options.max_pages, 10) : undefined,
    parameters: getTypedRuntimeParameters(options),
  };
}

async function cmdRuntimeListConnectors(cwd, raw) {
  const runtime = require('./runtime.cjs');
  const registry = runtime.createBuiltInConnectorRegistry();
  output({ connectors: registry.list() }, raw);
}

async function cmdRuntimeDoctor(cwd, args, raw) {
  const runtime = require('./runtime.cjs');
  const config = loadConfig(cwd);
  const parsed = parseRuntimeArgs(args);
  const options = buildRuntimeCertificationOptions(args, parsed);
  const configuredConnectorIds = Object.keys(config.connector_profiles || {});

  if (parsed.live === true && !options.connectorId && configuredConnectorIds.length === 0) {
    error('runtime doctor --live requires at least one configured connector profile or an explicit connector id');
  }

  const report = await runtime.assessRuntimeReadiness(config, {
    connector_ids: options.connectorId ? [options.connectorId] : null,
    configured_only: parsed.live === true && !options.connectorId,
    live: parsed.live === true,
    profile: options.profile,
    dataset: options.dataset,
    language: options.language,
    query: options.query,
    start: options.start,
    end: options.end,
    lookback_minutes: options.lookback_minutes,
    lookback_hours: options.lookback_hours,
    pagination_mode: options.pagination_mode,
    limit: options.limit,
    max_pages: options.max_pages,
    parameters: options.parameters,
    env: process.env,
    cwd,
  });

  output(report, raw);
}

async function cmdDoctorConnectors(cwd, args, raw) {
  const { discoverPlugins } = require('./plugin-registry.cjs');
  const { validateConnectorAdapter } = require('./connector-sdk.cjs');
  const config = loadConfig(cwd);

  // Discover all plugins (built-in + installed)
  const registry = discoverPlugins({ cwd, config, includeBuiltIn: true });
  const allPlugins = registry.listPlugins();

  const results = [];

  for (const pluginInfo of allPlugins) {
    const connectorId = pluginInfo.connector_id;
    const adapter = registry.get(connectorId);
    const checks = [];

    // Check 1: Adapter registered
    checks.push({
      check: 'adapter_registered',
      pass: adapter !== null && adapter !== undefined,
      detail: adapter ? 'Adapter found in registry' : 'Adapter not found',
    });

    if (!adapter) {
      results.push({ connector_id: connectorId, source: pluginInfo.source, checks, pass: false });
      continue;
    }

    // Check 2: Adapter validation
    const adapterValidation = validateConnectorAdapter(adapter);
    checks.push({
      check: 'adapter_valid',
      pass: adapterValidation.valid,
      detail: adapterValidation.valid ? 'Adapter structure valid' : adapterValidation.errors.join('; '),
    });

    // Check 3: Manifest cross-check (for non-built-in plugins)
    if (pluginInfo.source !== 'built-in' && pluginInfo.manifest_path) {
      const manifestResult = require('./plugin-registry.cjs').loadPluginManifest(
        require('path').dirname(pluginInfo.manifest_path)
      );
      if (manifestResult.valid) {
        const manifest = manifestResult.manifest;
        const caps = adapter.capabilities || {};
        const mismatches = [];
        for (const at of (manifest.auth_types || [])) {
          if (!caps.auth_types?.includes(at)) mismatches.push(`auth_type '${at}'`);
        }
        for (const dk of (manifest.dataset_kinds || [])) {
          if (!caps.dataset_kinds?.includes(dk)) mismatches.push(`dataset_kind '${dk}'`);
        }
        checks.push({
          check: 'manifest_cross_check',
          pass: mismatches.length === 0,
          detail: mismatches.length === 0 ? 'Capabilities match manifest' : `Mismatches: ${mismatches.join(', ')}`,
        });
      } else {
        checks.push({
          check: 'manifest_cross_check',
          pass: false,
          detail: `Manifest invalid: ${manifestResult.errors.join('; ')}`,
        });
      }
    }

    // Check 4: Capabilities completeness
    const caps = adapter.capabilities || {};
    const hasRequired = caps.id && caps.display_name && Array.isArray(caps.auth_types) && Array.isArray(caps.dataset_kinds);
    checks.push({
      check: 'capabilities_complete',
      pass: !!hasRequired,
      detail: hasRequired ? 'All required capability fields present' : 'Missing required capability fields',
    });

    const allPass = checks.every(c => c.pass);
    results.push({
      connector_id: connectorId,
      source: pluginInfo.source,
      version: pluginInfo.version,
      checks,
      pass: allPass,
    });
  }

  const summary = {
    total: results.length,
    passing: results.filter(r => r.pass).length,
    failing: results.filter(r => !r.pass).length,
    connectors: results,
  };

  output(summary, raw);
}

async function cmdRuntimeSmoke(cwd, args, raw) {
  const runtime = require('./runtime.cjs');
  const config = loadConfig(cwd);
  const parsed = parseRuntimeArgs(args);
  const options = buildRuntimeCertificationOptions(args, parsed);
  const configuredConnectorIds = Object.keys(config.connector_profiles || {});

  if (!options.connectorId && configuredConnectorIds.length === 0) {
    error('runtime smoke requires an explicit connector id or at least one configured connector profile');
  }

  const report = await runtime.assessRuntimeReadiness(config, {
    connector_ids: options.connectorId ? [options.connectorId] : null,
    configured_only: !options.connectorId,
    live: true,
    profile: options.profile,
    dataset: options.dataset,
    language: options.language,
    query: options.query,
    start: options.start,
    end: options.end,
    lookback_minutes: options.lookback_minutes,
    lookback_hours: options.lookback_hours,
    pagination_mode: options.pagination_mode,
    limit: options.limit,
    max_pages: options.max_pages,
    parameters: options.parameters,
    env: process.env,
    cwd,
  });

  output(report, raw);
}

async function cmdRuntimeExecute(cwd, args, raw) {
  const runtime = require('./runtime.cjs');
  const telemetry = require('./telemetry.cjs');
  const config = loadConfig(cwd);
  const options = parseRuntimeArgs(args);

  if (options.pack) {
    const packLib = require('./pack.cjs');
    const executionPlan = packLib.buildPackExecutionTargets(
      cwd,
      options.pack,
      options.parameters || {},
      {
        target: options.target || null,
        profile: options.profile || 'default',
        tenant: options.tenant || null,
        region: options.region || null,
        start: options.start || null,
        end: options.end || null,
        lookback_minutes: options.lookback_minutes ? parseInt(options.lookback_minutes, 10) : undefined,
        lookback_hours: options.lookback_hours ? parseInt(options.lookback_hours, 10) : undefined,
        pagination_mode: options.pagination_mode || 'auto',
        limit: options.limit ? parseInt(options.limit, 10) : undefined,
        max_pages: options.max_pages ? parseInt(options.max_pages, 10) : undefined,
        timeout_ms: options.timeout_ms ? parseInt(options.timeout_ms, 10) : undefined,
        max_retries: options.max_retries ? parseInt(options.max_retries, 10) : undefined,
        backoff_ms: options.backoff_ms ? parseInt(options.backoff_ms, 10) : undefined,
        consistency: options.consistency || undefined,
        receipt_policy: options.receipt_policy || undefined,
        dry_run: options.dry_run === true,
      }
    );

    const registry = runtime.createBuiltInConnectorRegistry();
    const results = [];

    for (const target of executionPlan.targets) {
      const result = await runtime.executeQuerySpec(target.query_spec, registry, {
        cwd,
        config,
        artifacts: {
          pack_id: executionPlan.pack.id,
        },
      });
      results.push({
        target: target.name,
        connector: target.connector,
        dataset: target.dataset,
        query_spec: target.query_spec,
        result: result.envelope,
        artifacts: result.artifacts,
        pagination: result.pagination,
      });
    }

    try {
      telemetry.recordPackExecution(
        cwd,
        executionPlan.pack.id,
        executionPlan.pack.version || null,
        executionPlan.targets.map(target => ({
          connector_id: target.connector,
          dataset_kind: target.dataset,
        })),
        results.map(item => ({
          status: item.result.status,
          counts: item.result.counts,
          timing: item.result.timing,
        })),
        {
          hunt_execution_ids: collectPackHuntExecutionIds(results),
        }
      );
    } catch {
      // Telemetry failures must not break pack execution output.
    }

    output({
      pack: {
        id: executionPlan.pack.id,
        title: executionPlan.pack.title,
        path: executionPlan.pack.path,
        target_count: executionPlan.targets.length,
      },
      parameters: executionPlan.parameters,
      results,
    }, raw);
    return;
  }

  if (!options.connector) {
    error('runtime execute requires --connector <id>');
  }
  if (!options.query) {
    error('runtime execute requires --query "<statement>"');
  }

  const parameters = getTypedRuntimeParameters(options);

  const spec = runtime.createQuerySpec({
    connector: {
      id: options.connector,
      profile: options.profile || 'default',
      tenant: options.tenant || null,
      region: options.region || null,
    },
    dataset: {
      kind: options.dataset || 'events',
      name: options.dataset_name || null,
    },
    time_window: options.start || options.end
      ? { start: options.start, end: options.end }
      : { lookback_minutes: options.lookback_minutes ? parseInt(options.lookback_minutes, 10) : 60 },
    parameters,
    pagination: {
      mode: options.pagination_mode || 'auto',
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      max_pages: options.max_pages ? parseInt(options.max_pages, 10) : undefined,
    },
    execution: {
      profile: options.profile || 'default',
      timeout_ms: options.timeout_ms ? parseInt(options.timeout_ms, 10) : undefined,
      max_retries: options.max_retries ? parseInt(options.max_retries, 10) : undefined,
      backoff_ms: options.backoff_ms ? parseInt(options.backoff_ms, 10) : undefined,
      consistency: options.consistency || undefined,
      dry_run: options.dry_run === true,
    },
    query: {
      language: options.language || 'native',
      statement: options.query,
    },
    evidence: {
      hypothesis_ids: options.hypothesis_ids,
      tags: options.tags,
      receipt_policy: options.receipt_policy || undefined,
    },
  });

  const registry = runtime.createBuiltInConnectorRegistry();
  const result = await runtime.executeQuerySpec(spec, registry, { cwd, config });
  output({
    connector: options.connector,
    profile: options.profile || 'default',
    result: result.envelope,
    artifacts: result.artifacts,
    pagination: result.pagination,
  }, raw);
}

async function cmdRuntimeDispatch(cwd, args, raw) {
  const dispatch = require('./dispatch.cjs');
  const runtime = require('./runtime.cjs');
  const config = loadConfig(cwd);
  const options = parseRuntimeArgs(args);

  // Parse dispatch-specific flags
  const tenantIds = options.tenants ? String(options.tenants).split(',').map(s => s.trim()) : null;
  const rawTags = options.tags;
  const tags = rawTags && typeof rawTags === 'string'
    ? rawTags.split(',').map(s => s.trim())
    : Array.isArray(rawTags) && rawTags.length > 0 ? rawTags : null;
  const all = options.all === true;
  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : undefined;

  // Require at least one targeting flag
  if (!tenantIds && !tags && !all) {
    error('runtime dispatch requires --tenants <ids>, --tags <tags>, or --all');
  }

  // Resolve targets
  const resolveOpts = { exclude_disabled: true };
  if (tenantIds) resolveOpts.tenant_ids = tenantIds;
  if (tags) resolveOpts.tags = tags;
  if (options.connector) resolveOpts.connector_id = options.connector;

  const targets = dispatch.resolveTenantTargets(config, resolveOpts);
  if (targets.length === 0) {
    error('No tenants matched the specified filters');
  }

  // Build base spec
  let baseSpec;
  if (options.pack) {
    const packLib = require('./pack.cjs');
    const executionPlan = packLib.buildPackExecutionTargets(cwd, options.pack, options.parameters || {}, {
      profile: 'default',
      start: options.start || null,
      end: options.end || null,
    });
    if (executionPlan.targets.length === 0) {
      error('Pack produced no execution targets');
    }
    baseSpec = executionPlan.targets[0].query_spec;
  } else {
    if (!options.connector) error('runtime dispatch requires --connector <id> (or --pack)');
    if (!options.query) error('runtime dispatch requires --query "<statement>" (or --pack)');
    const parameters = getTypedRuntimeParameters(options);
    baseSpec = runtime.createQuerySpec({
      connector: {
        id: options.connector,
        profile: options.profile || 'default',
      },
      query: {
        language: options.language || 'native',
        statement: options.query,
      },
      parameters,
      time_window: options.start || options.end
        ? { start: options.start, end: options.end }
        : { lookback_minutes: options.lookback_minutes ? parseInt(options.lookback_minutes, 10) : 60 },
      execution: {
        timeout_ms: options.timeout_ms ? parseInt(options.timeout_ms, 10) : undefined,
        max_retries: options.max_retries ? parseInt(options.max_retries, 10) : undefined,
      },
    });
  }

  const registry = runtime.createBuiltInConnectorRegistry();
  const result = await dispatch.dispatchMultiTenant(baseSpec, targets, registry, config, {
    concurrency,
    cwd,
  });

  output(result, raw);
}

async function cmdRuntimeAggregate(cwd, args, raw) {
  const dispatch = require('./dispatch.cjs');
  const runtime = require('./runtime.cjs');
  const aggregation = require('./aggregation.cjs');
  const evidence = require('./evidence.cjs');
  const config = loadConfig(cwd);
  const options = parseRuntimeArgs(args);

  // Parse dispatch-specific flags
  const tenantIds = options.tenants ? String(options.tenants).split(',').map(s => s.trim()) : null;
  const rawTags = options.tags;
  const tags = rawTags && typeof rawTags === 'string'
    ? rawTags.split(',').map(s => s.trim())
    : Array.isArray(rawTags) && rawTags.length > 0 ? rawTags : null;
  const all = options.all === true;
  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : undefined;

  if (!tenantIds && !tags && !all) {
    error('runtime aggregate requires --tenants <ids>, --tags <tags>, or --all');
  }

  const resolveOpts = { exclude_disabled: true };
  if (tenantIds) resolveOpts.tenant_ids = tenantIds;
  if (tags) resolveOpts.tags = tags;
  if (options.connector) resolveOpts.connector_id = options.connector;

  const targets = dispatch.resolveTenantTargets(config, resolveOpts);
  if (targets.length === 0) {
    error('No tenants matched the specified filters');
  }

  let baseSpec;
  if (options.pack) {
    const packLib = require('./pack.cjs');
    const executionPlan = packLib.buildPackExecutionTargets(cwd, options.pack, options.parameters || {}, {
      profile: 'default',
      start: options.start || null,
      end: options.end || null,
    });
    if (executionPlan.targets.length === 0) {
      error('Pack produced no execution targets');
    }
    baseSpec = executionPlan.targets[0].query_spec;
  } else {
    if (!options.connector) error('runtime aggregate requires --connector <id> (or --pack)');
    if (!options.query) error('runtime aggregate requires --query "<statement>" (or --pack)');
    const parameters = getTypedRuntimeParameters(options);
    baseSpec = runtime.createQuerySpec({
      connector: { id: options.connector, profile: options.profile || 'default' },
      query: { language: options.language || 'native', statement: options.query },
      parameters,
      time_window: options.start || options.end
        ? { start: options.start, end: options.end }
        : { lookback_minutes: options.lookback_minutes ? parseInt(options.lookback_minutes, 10) : 60 },
      execution: {
        timeout_ms: options.timeout_ms ? parseInt(options.timeout_ms, 10) : undefined,
        max_retries: options.max_retries ? parseInt(options.max_retries, 10) : undefined,
      },
    });
  }

  const registry = runtime.createBuiltInConnectorRegistry();
  const result = await dispatch.dispatchMultiTenant(baseSpec, targets, registry, config, {
    concurrency,
    cwd,
  });

  const aggregated = aggregation.aggregateResults(result);
  const correlations = aggregation.correlateFindings(result.tenant_results, {
    cluster_window_minutes: config?.dispatch?.cluster_window_minutes,
  });

  let artifacts = null;
  try {
    artifacts = evidence.writeMultiTenantArtifacts(cwd, result, {
      tenant_isolation_mode: config?.tenant_isolation_mode,
    });
  } catch (_) {
    // evidence writing is best-effort
  }

  output({ ...result, aggregated, correlations, artifacts }, raw);
}

async function cmdRuntimeHeatmap(cwd, args, raw) {
  const dispatch = require('./dispatch.cjs');
  const runtime = require('./runtime.cjs');
  const aggregation = require('./aggregation.cjs');
  const evidence = require('./evidence.cjs');
  const heatmapLib = require('./heatmap.cjs');
  const config = loadConfig(cwd);
  const options = parseRuntimeArgs(args);

  // Parse dispatch-specific flags
  const tenantIds = options.tenants ? String(options.tenants).split(',').map(s => s.trim()) : null;
  const rawTags = options.tags;
  const tags = rawTags && typeof rawTags === 'string'
    ? rawTags.split(',').map(s => s.trim())
    : Array.isArray(rawTags) && rawTags.length > 0 ? rawTags : null;
  const all = options.all === true;
  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : undefined;

  if (!tenantIds && !tags && !all) {
    error('runtime heatmap requires --tenants <ids>, --tags <tags>, or --all');
  }

  const resolveOpts = { exclude_disabled: true };
  if (tenantIds) resolveOpts.tenant_ids = tenantIds;
  if (tags) resolveOpts.tags = tags;
  if (options.connector) resolveOpts.connector_id = options.connector;

  const targets = dispatch.resolveTenantTargets(config, resolveOpts);
  if (targets.length === 0) {
    error('No tenants matched the specified filters');
  }

  let baseSpec;
  let packMeta = null;
  if (options.pack) {
    const packLib = require('./pack.cjs');
    const executionPlan = packLib.buildPackExecutionTargets(cwd, options.pack, options.parameters || {}, {
      profile: 'default',
      start: options.start || null,
      end: options.end || null,
    });
    if (executionPlan.targets.length === 0) {
      error('Pack produced no execution targets');
    }
    baseSpec = executionPlan.targets[0].query_spec;
    // Extract pack metadata for technique inference
    try {
      packMeta = packLib.loadPackManifest(cwd, options.pack);
    } catch (_) {
      packMeta = null;
    }
  } else {
    if (!options.connector) error('runtime heatmap requires --connector <id> (or --pack)');
    if (!options.query) error('runtime heatmap requires --query "<statement>" (or --pack)');
    const parameters = getTypedRuntimeParameters(options);
    baseSpec = runtime.createQuerySpec({
      connector: { id: options.connector, profile: options.profile || 'default' },
      query: { language: options.language || 'native', statement: options.query },
      parameters,
      time_window: options.start || options.end
        ? { start: options.start, end: options.end }
        : { lookback_minutes: options.lookback_minutes ? parseInt(options.lookback_minutes, 10) : 60 },
      execution: {
        timeout_ms: options.timeout_ms ? parseInt(options.timeout_ms, 10) : undefined,
        max_retries: options.max_retries ? parseInt(options.max_retries, 10) : undefined,
      },
    });
  }

  const registry = runtime.createBuiltInConnectorRegistry();
  const result = await dispatch.dispatchMultiTenant(baseSpec, targets, registry, config, {
    concurrency,
    cwd,
  });

  const aggregated = aggregation.aggregateResults(result);
  const correlations = aggregation.correlateFindings(result.tenant_results, {
    cluster_window_minutes: config?.dispatch?.cluster_window_minutes,
  });

  // Infer techniques and build heatmap
  const techniques = heatmapLib.inferTechniques({
    pack_attack: packMeta?.attack,
    tenant_results: result.tenant_results,
  });
  const heatmapData = heatmapLib.buildHeatmapFromResults(result, techniques);
  const heatmapArtifacts = heatmapLib.writeHeatmapArtifacts(cwd, heatmapData);

  output({ ...result, aggregated, correlations, heatmap: heatmapData, heatmap_artifacts: heatmapArtifacts }, raw);
}

async function cmdPackList(cwd, raw) {
  const pack = require('./pack.cjs');
  const registry = pack.loadPackRegistry(cwd);
  output({
    packs: registry.packs.map(item => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      stability: item.stability,
      source: item.source,
      required_connectors: item.required_connectors,
      supported_datasets: item.supported_datasets,
    })),
    overrides: registry.overrides,
    paths: registry.paths,
  }, raw);
}

async function cmdPackShow(cwd, packId, raw) {
  if (!packId) {
    error('pack show requires <pack-id>');
  }

  const pack = require('./pack.cjs');
  const resolved = pack.resolvePack(cwd, packId);
  if (!resolved.pack) {
    output({ found: false, pack_id: packId }, raw, '');
    return;
  }

  output({
    found: true,
    pack: resolved.pack,
  }, raw);
}

async function cmdPackBootstrap(cwd, args, raw) {
  const packId = args[0];
  if (!packId) {
    error('pack bootstrap requires <pack-id>');
  }

  const packLib = require('./pack.cjs');
  const options = parsePackArgs(args.slice(1));
  const resolved = packLib.resolvePack(cwd, packId);
  if (!resolved.pack) {
    output({ found: false, pack_id: packId }, raw, '');
    return;
  }

  const providedParameters = extractPackProvidedParameters(options);
  const bootstrap = packLib.buildPackBootstrap(cwd, packId, providedParameters);
  output({
    found: true,
    valid: bootstrap.validation.valid,
    pack_id: bootstrap.pack.id,
    pack_path: bootstrap.pack.path,
    parameters: bootstrap.parameters,
    errors: bootstrap.validation.errors,
    missing_template_parameters: bootstrap.validation.missing_template_parameters,
    template_usage: bootstrap.validation.template_usage,
    bootstrap: bootstrap.bootstrap,
  }, raw);
}

async function cmdPackValidate(cwd, args, raw) {
  const packId = args[0];
  if (!packId) {
    error('pack validate requires <pack-id>');
  }

  const packLib = require('./pack.cjs');
  const options = parsePackArgs(args.slice(1));
  const resolved = packLib.resolvePack(cwd, packId);
  if (!resolved.pack) {
    output({ valid: false, found: false, pack_id: packId, errors: ['Pack not found'] }, raw, 'false');
    return;
  }

  const providedParameters = extractPackProvidedParameters(options);

  const validation = packLib.validatePackParameters(resolved.pack, providedParameters);
  output({
    valid: validation.valid,
    found: true,
    pack_id: resolved.pack.id,
    pack_path: resolved.pack.path,
    parameters: validation.parameters,
    errors: validation.errors,
    warnings: validation.warnings,
  }, raw, validation.valid ? 'true' : 'false');
}

async function cmdPackRenderTargets(cwd, args, raw) {
  const packId = args[0];
  if (!packId) {
    error('pack render-targets requires <pack-id>');
  }

  const packLib = require('./pack.cjs');
  const options = parsePackArgs(args.slice(1));
  const resolved = packLib.resolvePack(cwd, packId);
  if (!resolved.pack) {
    output({ valid: false, found: false, pack_id: packId, errors: ['Pack not found'] }, raw, 'false');
    return;
  }

  const providedParameters = extractPackProvidedParameters(options);

  try {
    const rendered = packLib.buildPackExecutionTargets(cwd, packId, providedParameters, {
      target: options.target || null,
      profile: options.profile || 'default',
      tenant: options.tenant || null,
      region: options.region || null,
      start: options.start || null,
      end: options.end || null,
      lookback_minutes: options.lookback_minutes ? parseInt(options.lookback_minutes, 10) : undefined,
      lookback_hours: options.lookback_hours ? parseInt(options.lookback_hours, 10) : undefined,
      pagination_mode: options.pagination_mode || 'auto',
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      max_pages: options.max_pages ? parseInt(options.max_pages, 10) : undefined,
      timeout_ms: options.timeout_ms ? parseInt(options.timeout_ms, 10) : undefined,
      max_retries: options.max_retries ? parseInt(options.max_retries, 10) : undefined,
      backoff_ms: options.backoff_ms ? parseInt(options.backoff_ms, 10) : undefined,
      consistency: options.consistency || undefined,
      receipt_policy: options.receipt_policy || undefined,
      dry_run: options.dry_run === true,
    });

    output({
      valid: true,
      found: true,
      pack_id: rendered.pack.id,
      pack_path: rendered.pack.path,
      parameters: rendered.parameters,
      query_specs: rendered.targets,
    }, raw, 'true');
  } catch (err) {
    output({
      valid: false,
      found: true,
      pack_id: resolved.pack.id,
      pack_path: resolved.pack.path,
      parameters: err.validation?.parameters || {},
      errors: err.validation?.errors || [err.message],
      missing_template_parameters: err.validation?.missing_template_parameters || [],
    }, raw, 'false');
  }
}

// getPackFolderForKind consolidated in pack.cjs — use packLib.getPackFolderForKind(kind)

function formatPackTitle(packId) {
  return packId
    .split('.')
    .slice(1)
    .join(' ')
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || packId;
}

async function cmdPackLint(cwd, args, raw) {
  const packLib = require('./pack.cjs');
  const packId = args[0] && !args[0].startsWith('--') ? args[0] : null;

  let registry;
  try {
    registry = packLib.loadPackRegistry(cwd);
  } catch (err) {
    output({ valid: false, found: true, errors: [err.message], packs: [] }, raw, 'false');
    return;
  }

  const selectedPacks = packId
    ? registry.packs.filter(item => item.id === packId)
    : registry.packs;

  if (packId && selectedPacks.length === 0) {
    output({ valid: false, found: false, pack_id: packId, errors: ['Pack not found'] }, raw, 'false');
    return;
  }

  const results = selectedPacks.map(pack => {
    const errors = [];
    const templateUsage = packLib.getPackTemplateUsage(pack);
    const exampleParameters = pack.examples?.parameters || {};

    if (templateUsage.undeclared.length > 0) {
      errors.push(`Undeclared template parameters: ${templateUsage.undeclared.join(', ')}`);
    }
    if (!isPlainObject(exampleParameters) || Object.keys(exampleParameters).length === 0) {
      errors.push('Missing examples.parameters');
    }

    return {
      id: pack.id,
      source: pack.source,
      path: pack.path,
      valid: errors.length === 0,
      errors,
    };
  });

  const valid = results.every(item => item.valid);
  output({
    valid,
    found: true,
    pack_id: packId,
    packs: results,
  }, raw, valid ? 'true' : 'false');
}

async function cmdPackTest(cwd, args, raw) {
  const packLib = require('./pack.cjs');
  const packId = args[0] && !args[0].startsWith('--') ? args[0] : null;

  // Parse flags
  const verbose = args.includes('--verbose');
  const mockData = args.includes('--mock-data');
  const coverage = args.includes('--coverage');
  const validateOnly = args.includes('--validate-only');

  let registry;
  try {
    registry = packLib.loadPackRegistry(cwd);
  } catch (err) {
    output({ valid: false, found: true, errors: [err.message], packs: [] }, raw, 'false');
    return;
  }

  const selectedPacks = packId
    ? registry.packs.filter(item => item.id === packId)
    : registry.packs;

  if (packId && selectedPacks.length === 0) {
    output({ valid: false, found: false, pack_id: packId, errors: ['Pack not found'] }, raw, 'false');
    return;
  }

  const results = [];
  for (const pack of selectedPacks) {
    const errors = [];
    const warnings = [];
    const exampleParameters = pack.examples?.parameters || {};
    let bootstrap_ok = false;
    let render_ok = pack.execution_targets.length === 0;
    let verbose_output = null;
    let mock_data_output = null;
    let coverage_output = null;

    // Schema validation (always runs)
    const schemaValidation = packLib.validatePackDefinition(pack);
    if (!schemaValidation.valid) {
      errors.push(...schemaValidation.errors.map(e => `schema: ${e}`));
    }
    if (schemaValidation.warnings) {
      warnings.push(...schemaValidation.warnings);
    }

    // If validate-only, skip bootstrap and render
    if (validateOnly) {
      results.push({
        id: pack.id,
        source: pack.source,
        valid: errors.length === 0,
        validate_only: true,
        errors,
        warnings,
      });
      continue;
    }

    if (!isPlainObject(exampleParameters) || Object.keys(exampleParameters).length === 0) {
      errors.push('Missing examples.parameters');
    } else {
      try {
        packLib.buildPackBootstrap(cwd, pack.id, exampleParameters);
        bootstrap_ok = true;
      } catch (err) {
        errors.push(`bootstrap: ${err.message}`);
      }

      if (pack.execution_targets.length > 0) {
        try {
          const renderResult = packLib.buildPackExecutionTargets(cwd, pack.id, exampleParameters, {
            profile: 'default',
          });
          render_ok = true;

          // Verbose: show rendered queries
          if (verbose) {
            verbose_output = renderResult.targets.map(t => ({
              name: t.name,
              connector: t.connector,
              language: t.language,
              rendered_query: t.query_spec.query.statement,
            }));
          }

          // Mock data: validate against mock response fixtures
          if (mockData) {
            mock_data_output = [];
            for (const target of renderResult.targets) {
              const mockResponse = packLib.loadMockResponse(target.connector);
              const entry = {
                target: target.name,
                connector: target.connector,
                has_mock: !!mockResponse,
                checks: {},
              };

              if (mockResponse) {
                // Check 1: rendered query has no unresolved placeholders
                const unresolvedMatch = target.query_spec.query.statement.match(/\{\{[^}]+\}\}/g);
                entry.checks.no_unresolved_placeholders = !unresolvedMatch;
                if (unresolvedMatch) {
                  errors.push(`mock-data(${target.name}): unresolved placeholders: ${unresolvedMatch.join(', ')}`);
                }

                // Check 2: declared entity types appear in mock response field names
                const entityTypes = (pack.scope_defaults?.entities || []);
                const fieldNames = mockResponse.mock_response.results.length > 0
                  ? Object.keys(mockResponse.mock_response.results[0]).map(k => k.toLowerCase())
                  : [];
                const entityFieldMatches = entityTypes.map(entity => ({
                  entity,
                  found: fieldNames.some(f => f.includes(entity.replace('-', '_').replace('-', ''))),
                }));
                entry.checks.entity_field_alignment = entityFieldMatches;
              }

              mock_data_output.push(entry);
            }
          }
        } catch (err) {
          errors.push(`render-targets: ${err.message}`);
        }
      }

      // Mock data: check bootstrap phase_seed and receipt_tags (independent of render)
      if (mockData && bootstrap_ok) {
        try {
          const bootstrapResult = packLib.buildPackBootstrap(cwd, pack.id, exampleParameters);
          const phaseSeed = bootstrapResult.bootstrap?.phase_seed;
          if (!phaseSeed) {
            errors.push('mock-data: bootstrap phase_seed is missing');
          }

          const receiptTags = pack.publish?.receipt_tags || [];
          const hasPackTag = receiptTags.some(t => t.includes(pack.id));
          if (!hasPackTag) {
            warnings.push(`mock-data: publish.receipt_tags does not contain pack ID "${pack.id}"`);
          }
        } catch (err) {
          // Already caught above
        }
      }
    }

    // Coverage report
    if (coverage) {
      const templateUsage = packLib.getPackTemplateUsage(pack);

      // Telemetry coverage
      const telemetryCoverage = (pack.telemetry_requirements || []).map(req => {
        const coveredByTargets = (pack.execution_targets || []).some(t =>
          req.connectors.includes(t.connector)
        );
        return { surface: req.surface, connectors: req.connectors, covered: coveredByTargets };
      });

      // Connector coverage
      const connectorTargetCounts = {};
      for (const target of pack.execution_targets || []) {
        connectorTargetCounts[target.connector] = (connectorTargetCounts[target.connector] || 0) + 1;
      }
      const connectorCoverage = (pack.required_connectors || []).map(c => ({
        connector: c,
        targets: connectorTargetCounts[c] || 0,
        covered: (connectorTargetCounts[c] || 0) > 0,
      }));

      // Entity coverage
      const allTargetQueries = (pack.execution_targets || []).map(t => t.query_template || '').join(' ').toLowerCase();
      const entityCoverage = (pack.scope_defaults?.entities || []).map(entity => ({
        entity,
        covered: allTargetQueries.includes(entity.replace('-', '_')) || allTargetQueries.includes(entity),
      }));

      // Template parameter coverage
      const parameterTargetCounts = {};
      for (const targetUsage of templateUsage.execution_targets) {
        for (const param of targetUsage.parameters) {
          parameterTargetCounts[param] = (parameterTargetCounts[param] || 0) + 1;
        }
      }
      const parameterCoverage = (pack.parameters || []).map(p => ({
        parameter: p.name,
        used_in_targets: parameterTargetCounts[p.name] || 0,
        covered: (parameterTargetCounts[p.name] || 0) > 0,
      }));

      coverage_output = {
        telemetry: telemetryCoverage,
        connectors: connectorCoverage,
        entities: entityCoverage,
        parameters: parameterCoverage,
      };
    }

    results.push({
      id: pack.id,
      source: pack.source,
      valid: errors.length === 0,
      bootstrap_ok,
      render_ok,
      errors,
      warnings,
      ...(verbose_output ? { verbose: verbose_output } : {}),
      ...(mock_data_output ? { mock_data: mock_data_output } : {}),
      ...(coverage_output ? { coverage: coverage_output } : {}),
    });
  }

  const valid = results.every(item => item.valid);
  output({
    valid,
    found: true,
    pack_id: packId,
    packs: results,
  }, raw, valid ? 'true' : 'false');
}

async function cmdPackInit(cwd, args, raw) {
  const packId = args[0];
  if (!packId) {
    error('pack init requires <pack-id>');
  }

  const packLib = require('./pack.cjs');
  const options = parsePackArgs(args.slice(1));
  const kind = options.kind || 'custom';

  if (!packLib.PACK_KINDS.includes(kind)) {
    error(`pack init kind must be one of: ${packLib.PACK_KINDS.join(', ')}`);
  }

  const templatePath = path.join(packLib.getBuiltInPackRegistryDir(), 'templates', '_pack-template.json');
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  const title = options.title || formatPackTitle(packId);
  const slugSource = packId.includes('.') ? packId.split('.').slice(1).join('-') : packId;
  const slug = generateSlugInternal(slugSource) || 'new-pack';
  const packDir = path.join(packLib.getProjectPackRegistryDir(cwd), packLib.getPackFolderForKind(kind));
  const outputPath = path.join(packDir, `${slug}.json`);

  if (fs.existsSync(outputPath)) {
    error(`pack init target already exists: ${toPosixPath(path.relative(cwd, outputPath))}`);
  }

  const scaffold = {
    ...template,
    id: packId,
    kind,
    title,
    description: options.description || `Local ${kind} pack for ${title}.`,
    stability: options.stability || 'experimental',
    metadata: {
      ...(isPlainObject(template.metadata) ? template.metadata : {}),
      generated_by: 'pack init',
    },
    publish: {
      ...(isPlainObject(template.publish) ? template.publish : {}),
      finding_type: options.finding_type || slug.replace(/-/g, '_'),
      expected_outcomes: [options.expected_outcome || `${slug.replace(/-/g, '_')}_outcome`],
      receipt_tags: [`pack:${packId}`],
    },
    notes: [
      `Generated by pack init on ${new Date().toISOString()}. Replace placeholder content before publication.`,
    ],
  };

  if (options.extends) {
    scaffold.extends = String(options.extends).split(',').map(item => item.trim()).filter(Boolean);
  }

  if (kind === 'technique') {
    const attackId = options.attack || 'T1078';
    scaffold.attack = [attackId];
    scaffold.hypothesis_templates = [
      `Suspicious activity matching ATT&CK technique ${attackId} warrants investigation.`,
    ];
    scaffold.telemetry_requirements = [
      {
        surface: 'replace_me',
        description: 'Replace with the required telemetry surface.',
        connectors: scaffold.required_connectors,
        datasets: scaffold.supported_datasets,
      },
    ];
    scaffold.blind_spots = ['Replace with the known blind spots for this technique pack.'];
    scaffold.execution_targets = [
      {
        name: 'Replace Me',
        description: 'Replace with the first execution target.',
        connector: scaffold.required_connectors[0],
        dataset: scaffold.supported_datasets[0],
        language: 'native',
        query_template: 'replace_me {{tenant}}',
      },
    ];
  } else {
    scaffold.attack = [];
    scaffold.hypothesis_templates = [];
    scaffold.telemetry_requirements = [];
    scaffold.blind_spots = [];
    scaffold.execution_targets = [];
  }

  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(scaffold, null, 2)}\n`);

  output({
    created: true,
    pack_id: packId,
    path: toPosixPath(path.relative(cwd, outputPath)),
    pack: scaffold,
  }, raw);
}

/**
 * Create a new pack via the interactive 8-step flow or non-interactive flags.
 * thrunt pack create [options]
 */
async function cmdPackCreate(cwd, args, raw) {
  const packAuthor = require('./pack-author.cjs');

  // Parse flags
  const flags = {
    dryRun: false,
    nonInteractive: false,
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);

    if (key === 'dry-run') { flags.dryRun = true; continue; }
    if (key === 'non-interactive') { flags.nonInteractive = true; continue; }

    const nextVal = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;

    if (key === 'kind' && nextVal) { flags.kind = nextVal; i++; continue; }
    if (key === 'id' && nextVal) { flags.id = nextVal; i++; continue; }
    if (key === 'title' && nextVal) { flags.title = nextVal; i++; continue; }
    if (key === 'description' && nextVal) { flags.description = nextVal; i++; continue; }
    if (key === 'attack' && nextVal) { flags.attack = nextVal; i++; continue; }
    if (key === 'extends' && nextVal) { flags.extends = nextVal; i++; continue; }
    if (key === 'connectors' && nextVal) { flags.connectors = nextVal; i++; continue; }
    if (key === 'datasets' && nextVal) { flags.datasets = nextVal; i++; continue; }
    if (key === 'hypothesis' && nextVal) { flags.hypothesis = nextVal; i++; continue; }
    if (key === 'output' && nextVal) { flags.output = nextVal; i++; continue; }
    if (key === 'stability' && nextVal) { flags.stability = nextVal; i++; continue; }
  }

  try {
    let result;
    if (flags.nonInteractive) {
      result = packAuthor.buildPackFromFlags(cwd, flags);
    } else {
      result = await packAuthor.runPackAuthor(cwd, {
        dryRun: flags.dryRun,
        output: flags.output,
      });
    }
    output(result, raw);
  } catch (err) {
    error(err.message || String(err));
  }
}

function cmdCommit(cwd, message, files, raw, amend, noVerify) {
  if (!message && !amend) {
    error('commit message required');
  }

  // Sanitize commit message: strip invisible chars and injection markers
  // that could hijack agent context when commit messages are read back
  if (message) {
    const { sanitizeForPrompt } = require('./security.cjs');
    message = sanitizeForPrompt(message);
  }

  const config = loadConfig(cwd);

  // Check commit_docs config
  if (!config.commit_docs) {
    const result = { committed: false, hash: null, reason: 'skipped_commit_docs_false' };
    output(result, raw, 'skipped');
    return;
  }

  // Check if .planning is gitignored
  if (isGitIgnored(cwd, PLANNING_DIR_NAME)) {
    const result = { committed: false, hash: null, reason: 'skipped_gitignored' };
    output(result, raw, 'skipped');
    return;
  }

  // Ensure branching strategy branch exists before first commit (#1278).
  // Pre-execution workflows (discuss, plan, research) commit artifacts but the branch
  // was previously only created during hunt-run — too late.
  if (config.branching_strategy && config.branching_strategy !== 'none') {
    let branchName = null;
    if (config.branching_strategy === 'phase') {
      // Determine which phase we're committing for from the file paths
      const phaseMatch = (files || []).join(' ').match(/(\d+)-/);
      if (phaseMatch) {
        const phaseNum = phaseMatch[1];
        const phaseInfo = findPhaseInternal(cwd, phaseNum);
        if (phaseInfo) {
          branchName = config.phase_branch_template
            .replace('{phase}', phaseInfo.phase_number)
            .replace('{slug}', phaseInfo.phase_slug || 'phase');
        }
      }
    } else if (config.branching_strategy === 'milestone') {
      const milestone = getMilestoneInfo(cwd);
      if (milestone && milestone.version) {
        branchName = config.milestone_branch_template
          .replace('{milestone}', milestone.version)
          .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone');
      }
    }
    if (branchName) {
      const currentBranch = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (currentBranch.exitCode === 0 && currentBranch.stdout.trim() !== branchName) {
        // Create branch if it doesn't exist, or switch to it if it does
        const create = execGit(cwd, ['checkout', '-b', branchName]);
        if (create.exitCode !== 0) {
          execGit(cwd, ['checkout', branchName]);
        }
      }
    }
  }

  // Stage files
  const filesToStage = files && files.length > 0 ? files : [`${PLANNING_DIR_NAME}/`];
  for (const file of filesToStage) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) {
      // File was deleted/moved — stage the deletion
      execGit(cwd, ['rm', '--cached', '--ignore-unmatch', file]);
    } else {
      execGit(cwd, ['add', file]);
    }
  }

  // Commit (--no-verify skips pre-commit hooks, used by parallel executor agents)
  const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
  if (noVerify) commitArgs.push('--no-verify');
  const commitResult = execGit(cwd, commitArgs);
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      const result = { committed: false, hash: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
    const result = { committed: false, hash: null, reason: 'nothing_to_commit', error: commitResult.stderr };
    output(result, raw, 'nothing');
    return;
  }

  // Get short hash
  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  const result = { committed: true, hash, reason: 'committed' };
  output(result, raw, hash || 'committed');
}

function cmdCommitToSubrepo(cwd, message, files, raw) {
  if (!message) {
    error('commit message required');
  }

  const config = loadConfig(cwd);
  const subRepos = config.sub_repos;

  if (!subRepos || subRepos.length === 0) {
    error('no sub_repos configured in .planning/config.json');
  }

  if (!files || files.length === 0) {
    error('--files required for commit-to-subrepo');
  }

  // Group files by sub-repo prefix
  const grouped = {};
  const unmatched = [];
  for (const file of files) {
    const match = subRepos.find(repo => file.startsWith(repo + '/'));
    if (match) {
      if (!grouped[match]) grouped[match] = [];
      grouped[match].push(file);
    } else {
      unmatched.push(file);
    }
  }

  if (unmatched.length > 0) {
    process.stderr.write(`Warning: ${unmatched.length} file(s) did not match any sub-repo prefix: ${unmatched.join(', ')}\n`);
  }

  const repos = {};
  for (const [repo, repoFiles] of Object.entries(grouped)) {
    const repoCwd = path.join(cwd, repo);

    // Stage files (strip sub-repo prefix for paths relative to that repo)
    for (const file of repoFiles) {
      const relativePath = file.slice(repo.length + 1);
      execGit(repoCwd, ['add', relativePath]);
    }

    // Commit
    const commitResult = execGit(repoCwd, ['commit', '-m', message]);
    if (commitResult.exitCode !== 0) {
      if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
        repos[repo] = { committed: false, hash: null, files: repoFiles, reason: 'nothing_to_commit' };
        continue;
      }
      repos[repo] = { committed: false, hash: null, files: repoFiles, reason: 'error', error: commitResult.stderr };
      continue;
    }

    // Get hash
    const hashResult = execGit(repoCwd, ['rev-parse', '--short', 'HEAD']);
    const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
    repos[repo] = { committed: true, hash, files: repoFiles };
  }

  const result = {
    committed: Object.values(repos).some(r => r.committed),
    repos,
    unmatched: unmatched.length > 0 ? unmatched : undefined,
  };
  output(result, raw, Object.entries(repos).map(([r, v]) => `${r}:${v.hash || 'skip'}`).join(' '));
}

function cmdSummaryExtract(cwd, summaryPath, fields, raw) {
  if (!summaryPath) {
    error('summary-path required for summary-extract');
  }

  const fullPath = path.join(cwd, summaryPath);

  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Parse key-decisions into structured format
  const parseDecisions = (decisionsList) => {
    if (!decisionsList || !Array.isArray(decisionsList)) return [];
    return decisionsList.map(d => {
      const colonIdx = d.indexOf(':');
      if (colonIdx > 0) {
        return {
          summary: d.substring(0, colonIdx).trim(),
          rationale: d.substring(colonIdx + 1).trim(),
        };
      }
      return { summary: d, rationale: null };
    });
  };

  // Build full result
  const fullResult = {
    path: summaryPath,
    one_liner: fm['one-liner'] || extractOneLinerFromBody(content) || null,
    key_files: fm['key-files'] || [],
    tech_added: (fm['tech-stack'] && fm['tech-stack'].added) || [],
    patterns: fm['patterns-established'] || [],
    decisions: parseDecisions(fm['key-decisions']),
    hypotheses_completed: fm['hypotheses-completed'] || [],
  };

  // If fields specified, filter to only those fields
  if (fields && fields.length > 0) {
    const filtered = { path: summaryPath };
    for (const field of fields) {
      if (fullResult[field] !== undefined) {
        filtered[field] = fullResult[field];
      }
    }
    output(filtered, raw);
    return;
  }

  output(fullResult, raw);
}

async function cmdWebsearch(query, options, raw) {
  const apiKey = process.env.BRAVE_API_KEY;

  if (!apiKey) {
    // No key = silent skip, agent falls back to built-in WebSearch
    output({ available: false, reason: 'BRAVE_API_KEY not set' }, raw, '');
    return;
  }

  if (!query) {
    output({ available: false, error: 'Query required' }, raw, '');
    return;
  }

  const params = new URLSearchParams({
    q: query,
    count: String(options.limit || 10),
    country: 'us',
    search_lang: 'en',
    text_decorations: 'false'
  });

  if (options.freshness) {
    params.set('freshness', options.freshness);
  }

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      }
    );

    if (!response.ok) {
      output({ available: false, error: `API error: ${response.status}` }, raw, '');
      return;
    }

    const data = await response.json();

    const results = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age || null
    }));

    output({
      available: true,
      query,
      count: results.length,
      results
    }, raw, results.map(r => `${r.title}\n${r.url}\n${r.description}`).join('\n\n'));
  } catch (err) {
    output({ available: false, error: err.message }, raw, '');
  }
}

function cmdProgressRender(cwd, format, raw) {
  const phasesDir = planningPaths(cwd).phases;
  const roadmapPath = planningPaths(cwd).huntmap;
  const milestone = getMilestoneInfo(cwd);

  const phases = [];
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)*)-?(.*)/);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalPlans += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      phases.push({ number: phaseNum, name: phaseName, plans, summaries, status });
    }
  } catch { /* intentionally empty */ }

  const percent = totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;

  if (format === 'table') {
    // Render markdown table
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)\n\n`;
    out += `| Phase | Name | Plans | Status |\n`;
    out += `|-------|------|-------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    }
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalPlans }, raw, text);
  } else {
    // JSON format
    output({
      milestone_version: milestone.version,
      milestone_name: milestone.name,
      phases,
      total_plans: totalPlans,
      total_summaries: totalSummaries,
      percent,
    }, raw);
  }
}

/**
 * Match pending todos against a phase's goal/name/hypotheses.
 * Returns todos with relevance scores based on keyword, area, and file overlap.
 * Used by shape-hypothesis to surface relevant todos before scope-setting.
 */
function cmdTodoMatchPhase(cwd, phase, raw) {
  if (!phase) { error('phase required for todo match-phase'); }

  const pendingDir = path.join(planningDir(cwd), 'todos', 'pending');
  const todos = [];

  // Load pending todos
  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);
        const filesMatch = content.match(/^files:\s*(.+)$/m);
        const body = content.replace(/^(title|area|files|created|priority):.*$/gm, '').trim();

        todos.push({
          file,
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: areaMatch ? areaMatch[1].trim() : 'general',
          files: filesMatch ? filesMatch[1].trim().split(/[,\s]+/).filter(Boolean) : [],
          body: body.slice(0, 200), // first 200 chars for context
        });
      } catch {}
    }
  } catch {}

  if (todos.length === 0) {
    output({ phase, matches: [], todo_count: 0 }, raw);
    return;
  }

  // Load phase goal/name from HUNTMAP
  const phaseInfo = getHuntmapPhaseInternal(cwd, phase);
  const phaseName = phaseInfo ? (phaseInfo.phase_name || '') : '';
  const phaseGoal = phaseInfo ? (phaseInfo.goal || '') : '';
  const phaseSection = phaseInfo ? (phaseInfo.section || '') : '';

  // Build keyword set from phase name + goal + section text
  const phaseText = `${phaseName} ${phaseGoal} ${phaseSection}`.toLowerCase();
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'are', 'was', 'has', 'have', 'been', 'not', 'but', 'all', 'can', 'into', 'each', 'when', 'any', 'use', 'new']);
  const phaseKeywords = new Set(
    phaseText.split(/[\s\-_/.,;:()\[\]{}|]+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2 && !stopWords.has(w))
  );

  // Find phase directory to get expected file paths
  const phaseInfoDisk = findPhaseInternal(cwd, phase);
  const phasePlans = [];
  if (phaseInfoDisk && phaseInfoDisk.found) {
    try {
      const phaseDir = path.join(cwd, phaseInfoDisk.directory);
      const planFiles = fs.readdirSync(phaseDir).filter(f => f.endsWith('-PLAN.md'));
      for (const pf of planFiles) {
        try {
          const planContent = fs.readFileSync(path.join(phaseDir, pf), 'utf-8');
          const fmFiles = planContent.match(/files_modified:\s*\[([^\]]*)\]/);
          if (fmFiles) {
            phasePlans.push(...fmFiles[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean));
          }
        } catch {}
      }
    } catch {}
  }

  // Score each todo for relevance
  const matches = [];
  for (const todo of todos) {
    let score = 0;
    const reasons = [];

    // Keyword match: todo title/body terms in phase text
    const todoWords = `${todo.title} ${todo.body}`.toLowerCase()
      .split(/[\s\-_/.,;:()\[\]{}|]+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2 && !stopWords.has(w));

    const matchedKeywords = todoWords.filter(w => phaseKeywords.has(w));
    if (matchedKeywords.length > 0) {
      score += Math.min(matchedKeywords.length * 0.2, 0.6);
      reasons.push(`keywords: ${[...new Set(matchedKeywords)].slice(0, 5).join(', ')}`);
    }

    // Area match: todo area appears in phase text
    if (todo.area !== 'general' && phaseText.includes(todo.area.toLowerCase())) {
      score += 0.3;
      reasons.push(`area: ${todo.area}`);
    }

    // File match: todo files overlap with phase plan files
    if (todo.files.length > 0 && phasePlans.length > 0) {
      const fileOverlap = todo.files.filter(f =>
        phasePlans.some(pf => pf.includes(f) || f.includes(pf))
      );
      if (fileOverlap.length > 0) {
        score += 0.4;
        reasons.push(`files: ${fileOverlap.slice(0, 3).join(', ')}`);
      }
    }

    if (score > 0) {
      matches.push({
        file: todo.file,
        title: todo.title,
        area: todo.area,
        score: Math.round(score * 100) / 100,
        reasons,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  output({ phase, matches, todo_count: todos.length }, raw);
}

function cmdTodoComplete(cwd, filename, raw) {
  if (!filename) {
    error('filename required for todo complete');
  }

  const pendingDir = path.join(planningDir(cwd), 'todos', 'pending');
  const completedDir = path.join(planningDir(cwd), 'todos', 'completed');
  const sourcePath = path.join(pendingDir, filename);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename}`);
  }

  // Ensure completed directory exists
  fs.mkdirSync(completedDir, { recursive: true });

  // Read, add completion timestamp, move
  let content = fs.readFileSync(sourcePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  content = `completed: ${today}\n` + content;

  fs.writeFileSync(path.join(completedDir, filename), content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

function cmdScaffold(cwd, type, options, raw) {
  const { phase, name } = options;
  const padded = phase ? normalizePhaseName(phase) : '00';
  const today = new Date().toISOString().split('T')[0];
  const contextCommand = '/hunt:shape-hypothesis';

  // Find phase directory
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const phaseDir = phaseInfo ? path.join(cwd, phaseInfo.directory) : null;

  if (phase && !phaseDir && type !== 'phase-dir') {
    error(`Phase ${phase} directory not found`);
  }

  let filePath, content;

  switch (type) {
    case 'context': {
      filePath = path.join(phaseDir, `${padded}-CONTEXT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Context\n\n## Decisions\n\n_Decisions will be captured during ${contextCommand} ${phase}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'evidence-review': {
      filePath = path.join(phaseDir, `${padded}-EVIDENCE_REVIEW.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: needs_more_evidence\nverdict: Needs more evidence\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Evidence Review\n\n## Publishability Verdict\n\nNeeds more evidence\n\n## Evidence Quality Checks\n\n| Check | Status | Notes |\n|-------|--------|-------|\n| Receipts exist for material claims | Fail | |\n| Contradictory evidence captured | Pass | |\n| Scope boundaries documented | Pass | |\n| Confidence stated | Fail | |\n| Chain of custody captured | Fail | |\n\n## Contradictory Evidence\n\n- [receipt or observation]\n\n## Blind Spots\n\n- [gap]\n\n## Follow-Up Needed\n\n- [next action]\n`;
      break;
    }
    case 'findings': {
      filePath = path.join(phaseDir, `${padded}-FINDINGS.md`);
      content = `---\nphase: "${padded}"\nname: "${name || phaseInfo?.phase_name || 'Unnamed'}"\ncreated: ${today}\nstatus: inconclusive\nconfidence: Low\n---\n\n# Phase ${phase}: ${name || phaseInfo?.phase_name || 'Unnamed'} — Findings\n\n## Executive Summary\n\n[2-5 sentences on what is currently believed and why]\n\n## Hypothesis Verdicts\n\n| Hypothesis | Verdict | Confidence | Evidence |\n|------------|---------|------------|----------|\n| HYP-01 | Inconclusive | Low | [receipt ids] |\n\n## Impacted Scope\n\n- [users]\n- [hosts]\n- [tenants]\n- [apps]\n\n## What We Know\n\n- [fact with receipt]\n\n## What We Do Not Know\n\n- [gap]\n\n## Recommended Action\n\n- [publish, escalate, continue hunting, tune detection]\n`;
      break;
    }
    case 'phase-dir': {
      if (!phase || !name) {
        error('phase and name required for phase-dir scaffold');
      }
      const slug = generateSlugInternal(name);
      const dirName = `${padded}-${slug}`;
      const phasesParent = planningPaths(cwd).phases;
      fs.mkdirSync(phasesParent, { recursive: true });
      const dirPath = path.join(phasesParent, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      output({ created: true, directory: toPosixPath(path.relative(cwd, dirPath)), path: dirPath }, raw, dirPath);
      return;
    }
    default:
      error(`Unknown scaffold type: ${type}. Available: context, evidence-review, findings, phase-dir`);
  }

  if (fs.existsSync(filePath)) {
    output({ created: false, reason: 'already_exists', path: filePath }, raw, 'exists');
    return;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  const relPath = toPosixPath(path.relative(cwd, filePath));
  output({ created: true, path: relPath }, raw, relPath);
}

function cmdStats(cwd, format, raw) {
  const phasesDir = planningPaths(cwd).phases;
  const roadmapPath = planningPaths(cwd).huntmap;
  const reqPath = planningPaths(cwd).hypotheses;
  const statePath = planningPaths(cwd).state;
  const milestone = getMilestoneInfo(cwd);
  const isDirInMilestone = getMilestonePhaseFilter(cwd);

  // Phase & plan stats (reuse progress pattern)
  const phasesByNumber = new Map();
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const roadmapContent = extractCurrentMilestone(fs.readFileSync(roadmapPath, 'utf-8'), cwd);
    const headingPattern = /#{2,4}\s*Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
    let match;
    while ((match = headingPattern.exec(roadmapContent)) !== null) {
      phasesByNumber.set(match[1], {
        number: match[1],
        name: match[2].replace(/\(INSERTED\)/i, '').trim(),
        plans: 0,
        summaries: 0,
        status: 'Not Started',
      });
    }
  } catch { /* intentionally empty */ }

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(isDirInMilestone)
      .sort((a, b) => comparePhaseNum(a, b));

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)-?(.*)/i);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalPlans += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Not Started';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      const existing = phasesByNumber.get(phaseNum);
      phasesByNumber.set(phaseNum, {
        number: phaseNum,
        name: existing?.name || phaseName,
        plans,
        summaries,
        status,
      });
    }
  } catch { /* intentionally empty */ }

  const phases = [...phasesByNumber.values()].sort((a, b) => comparePhaseNum(a.number, b.number));
  const completedPhases = phases.filter(p => p.status === 'Complete').length;
  const planPercent = totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;
  const percent = phases.length > 0 ? Math.min(100, Math.round((completedPhases / phases.length) * 100)) : 0;

  // Hypotheses stats
  let hypothesesTotal = 0;
  let hypothesesComplete = 0;
  try {
    if (fs.existsSync(reqPath)) {
      const reqContent = fs.readFileSync(reqPath, 'utf-8');
      const checked = reqContent.match(/^- \[x\] \*\*/gm);
      const unchecked = reqContent.match(/^- \[ \] \*\*/gm);
      hypothesesComplete = checked ? checked.length : 0;
      hypothesesTotal = hypothesesComplete + (unchecked ? unchecked.length : 0);
    }
  } catch { /* intentionally empty */ }

  // Last activity from STATE.md
  let lastActivity = null;
  try {
    if (fs.existsSync(statePath)) {
      const stateContent = fs.readFileSync(statePath, 'utf-8');
      const activityMatch = stateContent.match(/^last_activity:\s*(.+)$/im)
        || stateContent.match(/\*\*Last Activity:\*\*\s*(.+)/i)
        || stateContent.match(/^Last Activity:\s*(.+)$/im)
        || stateContent.match(/^Last activity:\s*(.+)$/im);
      if (activityMatch) lastActivity = activityMatch[1].trim();
    }
  } catch { /* intentionally empty */ }

  // Git stats
  let gitCommits = 0;
  let gitFirstCommitDate = null;
  const commitCount = execGit(cwd, ['rev-list', '--count', 'HEAD']);
  if (commitCount.exitCode === 0) {
    gitCommits = parseInt(commitCount.stdout, 10) || 0;
  }
  const rootHash = execGit(cwd, ['rev-list', '--max-parents=0', 'HEAD']);
  if (rootHash.exitCode === 0 && rootHash.stdout) {
    const firstCommit = rootHash.stdout.split('\n')[0].trim();
    const firstDate = execGit(cwd, ['show', '-s', '--format=%as', firstCommit]);
    if (firstDate.exitCode === 0) {
      gitFirstCommitDate = firstDate.stdout || null;
    }
  }

  const result = {
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases,
    phases_completed: completedPhases,
    phases_total: phases.length,
    total_plans: totalPlans,
    total_summaries: totalSummaries,
    percent,
    plan_percent: planPercent,
    hypotheses_total: hypothesesTotal,
    hypotheses_complete: hypothesesComplete,
    git_commits: gitCommits,
    git_first_commit_date: gitFirstCommitDate,
    last_activity: lastActivity,
  };

  if (format === 'table') {
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name} \u2014 Statistics\n\n`;
    out += `**Progress:** [${bar}] ${completedPhases}/${phases.length} phases (${percent}%)\n`;
    if (totalPlans > 0) {
      out += `**Plans:** ${totalSummaries}/${totalPlans} complete (${planPercent}%)\n`;
    }
    out += `**Phases:** ${completedPhases}/${phases.length} complete\n`;
    if (hypothesesTotal > 0) {
      out += `**Hypotheses:** ${hypothesesComplete}/${hypothesesTotal} complete\n`;
    }
    out += '\n';
    out += `| Phase | Name | Plans | Completed | Status |\n`;
    out += `|-------|------|-------|-----------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.plans} | ${p.summaries} | ${p.status} |\n`;
    }
    if (gitCommits > 0) {
      out += `\n**Git:** ${gitCommits} commits`;
      if (gitFirstCommitDate) out += ` (since ${gitFirstCommitDate})`;
      out += '\n';
    }
    if (lastActivity) out += `**Last activity:** ${lastActivity}\n`;
    output({ rendered: out }, raw, out);
  } else {
    output(result, raw);
  }
}

// ---------------------------------------------------------------------------
// Connector Scaffolding
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe interpolation into JavaScript source code.
 * Prevents injection via single quotes, double quotes, and backslashes.
 */
function escapeJsString(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/**
 * Render a template string by replacing {{#IF_KEY}}...{{/IF_KEY}} block
 * conditionals and {{KEY}} simple substitutions.
 */
function renderTemplate(template, vars) {
  let result = template;
  // Block conditionals: {{#IF_KEY}}content{{/IF_KEY}}
  result = result.replace(/\{\{#IF_(\w+)\}\}([\s\S]*?)\{\{\/IF_\1\}\}/g, (_, key, content) => {
    return vars[key] ? content : '';
  });
  // Simple substitution: {{KEY}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
  });
  return result;
}

/**
 * Convert snake_case or lower_case to PascalCase.
 * e.g. crowdstrike_falcon -> CrowdStrikeFalcon
 */
function toPascalCase(str) {
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Parse CLI flags for init connector command.
 * Handles repeatable flags and comma-separated values.
 */
function parseConnectorArgs(args = []) {
  const options = {
    authTypes: [],
    datasetKinds: [],
    languages: [],
    paginationModes: [],
    docsUrl: null,
    dockerImage: null,
    dockerPort: null,
    noDocker: false,
    noSmoke: false,
    outputDir: null,
    dryRun: false,
    raw: false,
    displayName: null,
  };

  const repeatableFlags = new Set(['auth', 'datasets', 'languages', 'pagination']);

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);

    if (key === 'no-docker') { options.noDocker = true; continue; }
    if (key === 'no-smoke') { options.noSmoke = true; continue; }
    if (key === 'dry-run') { options.dryRun = true; continue; }
    if (key === 'raw') { options.raw = true; continue; }

    const nextVal = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;

    if (key === 'display-name' && nextVal) { options.displayName = nextVal; i++; continue; }
    if (key === 'docs-url' && nextVal) { options.docsUrl = nextVal; i++; continue; }
    if (key === 'docker-image' && nextVal) { options.dockerImage = nextVal; i++; continue; }
    if (key === 'docker-port' && nextVal) { options.dockerPort = nextVal; i++; continue; }
    if (key === 'output-dir' && nextVal) { options.outputDir = nextVal; i++; continue; }

    if (key === 'auth' && nextVal) {
      options.authTypes.push(...nextVal.split(',').map(v => v.trim()).filter(Boolean));
      i++;
      continue;
    }
    if (key === 'datasets' && nextVal) {
      options.datasetKinds.push(...nextVal.split(',').map(v => v.trim()).filter(Boolean));
      i++;
      continue;
    }
    if (key === 'languages' && nextVal) {
      options.languages.push(...nextVal.split(',').map(v => v.trim()).filter(Boolean));
      i++;
      continue;
    }
    if (key === 'pagination' && nextVal) {
      options.paginationModes.push(...nextVal.split(',').map(v => v.trim()).filter(Boolean));
      i++;
      continue;
    }
  }

  return options;
}

/**
 * Derive a title-cased display name from snake_case connector id.
 * e.g. crowdstrike_edr -> Crowdstrike Edr
 */
function toTitleCase(str) {
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Scaffold a new connector adapter with tests and Docker boilerplate.
 * thrunt-tools init connector <id> [flags]
 */
async function cmdInitConnector(cwd, args, raw) {
  const runtime = require('./runtime.cjs');
  const connectorTemplatesDir = path.join(__dirname, '../../templates/connector');

  // --- 4a: Argument parsing + interactive mode ---

  let connectorId = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const cliOptions = parseConnectorArgs(args.slice(connectorId ? 1 : 0));

  // Merge raw flag from CLI
  if (cliOptions.raw) raw = true;

  if (!connectorId) {
    // Interactive mode
    const { createInterface } = require('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stderr });

    try {
      connectorId = (await rl.question('  Connector ID (lowercase, underscores): ')).trim();
      const displayNameInput = await rl.question(`  Display name [${toTitleCase(connectorId || 'my_connector')}]: `);
      cliOptions.displayName = displayNameInput.trim() || null;

      const authInput = await rl.question('  Auth types (comma-separated) [api_key]: ');
      if (authInput.trim()) cliOptions.authTypes = authInput.split(',').map(v => v.trim()).filter(Boolean);

      const datasetsInput = await rl.question('  Dataset kinds (comma-separated) [events]: ');
      if (datasetsInput.trim()) cliOptions.datasetKinds = datasetsInput.split(',').map(v => v.trim()).filter(Boolean);

      const langsInput = await rl.question('  Query language(s) (comma-separated) [api]: ');
      if (langsInput.trim()) cliOptions.languages = langsInput.split(',').map(v => v.trim()).filter(Boolean);

      const paginationInput = await rl.question('  Pagination mode(s) (comma-separated) [none]: ');
      if (paginationInput.trim()) cliOptions.paginationModes = paginationInput.split(',').map(v => v.trim()).filter(Boolean);

      const docsInput = await rl.question('  API docs URL (optional): ');
      if (docsInput.trim()) cliOptions.docsUrl = docsInput.trim();

      const dockerInput = (await rl.question('  Include Docker integration tests? [y/N]: ')).trim().toLowerCase();
      if (dockerInput === 'y' || dockerInput === 'yes') {
        cliOptions.dockerImage = (await rl.question('    Docker image (e.g. vendor/product:tag): ')).trim();
        cliOptions.dockerPort = (await rl.question('    Container port: ')).trim();
      }

      const smokeInput = (await rl.question('  Include smoke spec? [Y/n]: ')).trim().toLowerCase();
      cliOptions.noSmoke = smokeInput === 'n' || smokeInput === 'no';
    } finally {
      rl.close();
    }
  }

  // --- 4b: Input validation ---

  if (!connectorId || !/^[a-z][a-z0-9_]*$/.test(connectorId)) {
    error(`connector ID must match /^[a-z][a-z0-9_]*$/ (lowercase, underscores, starts with letter). Got: ${connectorId || '(empty)'}`);
  }

  // Collision check against built-in connectors
  const builtInRegistry = runtime.createBuiltInConnectorRegistry();
  if (builtInRegistry.has(connectorId)) {
    const builtIns = builtInRegistry.list().map(c => c.id).join(', ');
    error(`connector ID '${connectorId}' collides with a built-in connector. Built-in IDs: ${builtIns}`);
  }

  // Apply defaults
  const authTypes = cliOptions.authTypes.length > 0 ? cliOptions.authTypes : ['api_key'];
  const datasetKinds = cliOptions.datasetKinds.length > 0 ? cliOptions.datasetKinds : ['events'];
  const languages = cliOptions.languages.length > 0 ? cliOptions.languages : ['api'];
  const paginationModes = cliOptions.paginationModes.length > 0 ? cliOptions.paginationModes : ['none'];
  const displayName = cliOptions.displayName || toTitleCase(connectorId);
  const docsUrl = cliOptions.docsUrl || null;
  const dockerImage = cliOptions.dockerImage || null;
  const dockerPort = cliOptions.dockerPort || null;
  const noDocker = cliOptions.noDocker || false;
  const noSmoke = cliOptions.noSmoke || false;
  const dryRun = cliOptions.dryRun || false;
  const force = args.includes('--force');
  const outputDir = cliOptions.outputDir ? path.resolve(cwd, cliOptions.outputDir) : cwd;

  // Path containment: output directory must be within project root
  if (!outputDir.startsWith(cwd + path.sep) && outputDir !== cwd) {
    error(`output directory must be within project root. Got: ${outputDir}`);
  }

  // Validate enum values
  const invalidAuth = authTypes.filter(a => !runtime.AUTH_TYPES.includes(a));
  if (invalidAuth.length > 0) {
    error(`Invalid auth type(s): ${invalidAuth.join(', ')}. Valid values: ${runtime.AUTH_TYPES.join(', ')}`);
  }

  const invalidDatasets = datasetKinds.filter(d => !runtime.DATASET_KINDS.includes(d));
  if (invalidDatasets.length > 0) {
    error(`Invalid dataset kind(s): ${invalidDatasets.join(', ')}. Valid values: ${runtime.DATASET_KINDS.join(', ')}`);
  }

  const invalidPagination = paginationModes.filter(p => !runtime.PAGINATION_MODES.includes(p));
  if (invalidPagination.length > 0) {
    error(`Invalid pagination mode(s): ${invalidPagination.join(', ')}. Valid values: ${runtime.PAGINATION_MODES.join(', ')}`);
  }

  // Docker flag validation
  if (dockerImage && !dockerPort) {
    error('--docker-image requires --docker-port');
  }
  if (dockerPort && !dockerImage) {
    error('--docker-port requires --docker-image');
  }
  if (noDocker && dockerImage) {
    error('--no-docker and --docker-image are conflicting flags');
  }

  const hasDocker = Boolean(dockerImage && dockerPort && !noDocker);
  const hasSmoke = !noSmoke;

  // --- 4c: Template variable computation ---

  const functionName = toPascalCase(connectorId);
  const envPrefix = connectorId.toUpperCase();
  const authTypesArray = JSON.stringify(authTypes).replace(/"/g, "'");
  const datasetKindsArray = JSON.stringify(datasetKinds).replace(/"/g, "'");
  const languagesArray = JSON.stringify(languages).replace(/"/g, "'");
  const paginationModesArray = JSON.stringify(paginationModes).replace(/"/g, "'");
  const docsUrlVal = docsUrl ? `'${escapeJsString(docsUrl)}'` : 'null';
  const safeDisplayName = escapeJsString(displayName);
  const dateStr = new Date().toISOString().split('T')[0];
  const datasetKindsFirst = datasetKinds[0];
  const languagesFirst = languages[0];
  const smokeQuery = '* | head 1';

  // Auto-assign Docker host port by scanning existing docker-compose.yml
  let dockerHostPort = 19300;
  if (hasDocker) {
    const composeFile = path.join(outputDir, 'tests/integration/docker-compose.yml');
    if (fs.existsSync(composeFile)) {
      const composeContent = fs.readFileSync(composeFile, 'utf8');
      const portMatches = [...composeContent.matchAll(/- "(\d+):/g)];
      const existingPorts = portMatches
        .map(m => parseInt(m[1], 10))
        .filter(p => p >= 19000 && p < 20000);
      if (existingPorts.length > 0) {
        dockerHostPort = Math.max(...existingPorts) + 1;
      }
    }
  }

  const vars = {
    CONNECTOR_ID: connectorId,
    CONNECTOR_DISPLAY_NAME: safeDisplayName,
    CONNECTOR_FUNCTION_NAME: functionName,
    AUTH_TYPES_ARRAY: authTypesArray,
    AUTH_TYPES_FIRST: authTypes[0],
    DATASET_KINDS_ARRAY: datasetKindsArray,
    DATASET_KINDS_FIRST: datasetKindsFirst,
    LANGUAGES_ARRAY: languagesArray,
    LANGUAGES_FIRST: languagesFirst,
    PAGINATION_MODES_ARRAY: paginationModesArray,
    DOCS_URL: docsUrlVal,
    ENV_PREFIX: envPrefix,
    DATE: dateStr,
    HAS_DOCKER: hasDocker,
    DOCKER_IMAGE: dockerImage || '',
    DOCKER_PORT: dockerPort || '',
    DOCKER_HOST_PORT: String(dockerHostPort),
    HAS_SMOKE: hasSmoke,
    SMOKE_QUERY: smokeQuery,
  };

  // --- 4d: File generation manifest ---

  const manifest = [];

  // Always generated
  manifest.push({
    path: path.join(outputDir, 'thrunt-god/bin/lib/connectors', `${connectorId}.cjs`),
    templateFile: 'adapter.cjs.tmpl',
    mode: 'create',
    label: `thrunt-god/bin/lib/connectors/${connectorId}.cjs`,
  });
  manifest.push({
    path: path.join(outputDir, 'tests', `connectors-${connectorId}.test.cjs`),
    templateFile: 'unit-test.cjs.tmpl',
    mode: 'create',
    label: `tests/connectors-${connectorId}.test.cjs`,
  });
  manifest.push({
    path: path.join(outputDir, 'docs/connectors', `${connectorId}.md`),
    templateFile: 'README.md.tmpl',
    mode: 'create',
    label: `docs/connectors/${connectorId}.md`,
  });

  // Docker-related (conditional)
  if (hasDocker) {
    manifest.push({
      path: path.join(outputDir, 'tests/integration', `${connectorId}.integration.test.cjs`),
      templateFile: 'integration-test.cjs.tmpl',
      mode: 'create',
      label: `tests/integration/${connectorId}.integration.test.cjs`,
    });
    manifest.push({
      path: path.join(outputDir, 'tests/integration/docker-compose.yml'),
      templateFile: 'docker-compose.yml.tmpl',
      mode: 'append',
      label: 'tests/integration/docker-compose.yml (append)',
    });
    manifest.push({
      path: path.join(outputDir, 'tests/integration/fixtures/seed-data.cjs'),
      templateFile: 'seed-data.cjs.tmpl',
      mode: 'append-before-exports',
      label: 'tests/integration/fixtures/seed-data.cjs (append)',
    });
    manifest.push({
      path: path.join(outputDir, 'tests/integration/helpers.cjs'),
      templateFile: 'helpers-entry.cjs.tmpl',
      mode: 'append-to-helpers',
      label: 'tests/integration/helpers.cjs (append)',
    });
  }

  // --- 4e: Dry-run mode ---

  if (dryRun) {
    output({
      dry_run: true,
      connector_id: connectorId,
      files: manifest.map(item => ({
        path: toPosixPath(path.relative(outputDir, item.path)),
        template: item.templateFile,
        mode: item.mode,
      })),
    }, raw);
    return;
  }

  // --- 4f: Overwrite protection ---

  if (!force) {
    const conflicting = manifest
      .filter(item => item.mode === 'create' && fs.existsSync(item.path))
      .map(item => toPosixPath(path.relative(outputDir, item.path)));
    if (conflicting.length > 0) {
      error(`CONNECTOR_FILE_EXISTS: the following files already exist: ${conflicting.join(', ')}. Use --force to overwrite.`);
    }
  }

  // --- 4g: File writing ---

  const generatedPaths = [];

  for (const item of manifest) {
    const tmplPath = path.join(connectorTemplatesDir, item.templateFile);
    const tmplContent = fs.readFileSync(tmplPath, 'utf8');
    const rendered = renderTemplate(tmplContent, vars);
    const dir = path.dirname(item.path);

    if (item.mode === 'create') {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(item.path, rendered);
      generatedPaths.push(item.path);
    } else if (item.mode === 'append') {
      // Append to docker-compose.yml
      if (!fs.existsSync(item.path)) {
        error(`Cannot append to ${item.path}: file does not exist`);
      }
      const existing = fs.readFileSync(item.path, 'utf8');
      fs.writeFileSync(item.path, existing + '\n' + rendered);
      generatedPaths.push(item.path);
    } else if (item.mode === 'append-before-exports') {
      // Insert seed function before module.exports in seed-data.cjs
      if (!fs.existsSync(item.path)) {
        error(`Cannot append to ${item.path}: file does not exist`);
      }
      let existing = fs.readFileSync(item.path, 'utf8');
      const exportIdx = existing.lastIndexOf('module.exports');
      if (exportIdx === -1) {
        // No module.exports found, just append at end
        existing = existing + '\n' + rendered + '\n';
      } else {
        existing = existing.slice(0, exportIdx) + rendered + '\n' + existing.slice(exportIdx);
      }
      // Also add the function name to the exports object
      const seedFnName = `seed${functionName}`;
      existing = existing.replace(
        /module\.exports\s*=\s*\{/,
        `module.exports = {\n  ${seedFnName},`
      );
      fs.writeFileSync(item.path, existing);
      generatedPaths.push(item.path);
    } else if (item.mode === 'append-to-helpers') {
      // Add URL constant and export entry to helpers.cjs
      if (!fs.existsSync(item.path)) {
        error(`Cannot append to ${item.path}: file does not exist`);
      }
      let existing = fs.readFileSync(item.path, 'utf8');
      const exportIdx = existing.lastIndexOf('module.exports');
      const constName = `${envPrefix}_URL`;
      if (exportIdx === -1) {
        existing = existing + '\n' + rendered + '\n';
      } else {
        existing = existing.slice(0, exportIdx) + rendered + existing.slice(exportIdx);
      }
      // Add constant to module.exports block
      existing = existing.replace(
        /module\.exports\s*=\s*\{/,
        `module.exports = {\n  ${constName},`
      );
      fs.writeFileSync(item.path, existing);
      generatedPaths.push(item.path);
    }
  }

  // --- 4g: Post-scaffold contract validation ---

  let validationResult = null;
  try {
    const adapterPath = path.join(outputDir, 'thrunt-god/bin/lib/connectors', `${connectorId}.cjs`);
    // Clear require cache in case a previous scaffold run cached something
    delete require.cache[require.resolve(adapterPath)];
    const adapterModule = require(adapterPath);
    const factoryFn = adapterModule[`create${functionName}Adapter`];
    if (typeof factoryFn !== 'function') {
      validationResult = { valid: false, errors: [`create${functionName}Adapter is not a function`], warnings: [] };
    } else {
      const adapter = factoryFn();
      validationResult = runtime.validateConnectorAdapter(adapter);
    }
  } catch (err) {
    validationResult = { valid: false, errors: [`Failed to load generated adapter: ${err.message}`], warnings: [] };
  }

  // --- 4h: Output ---

  output({
    created: true,
    connector_id: connectorId,
    files_generated: generatedPaths.map(p => toPosixPath(path.relative(outputDir, p))),
    contract_validation: validationResult,
    next_steps: [
      `Fill in prepareQuery() with your API endpoint and request body format`,
      `Fill in normalizeResponse() with your response parser and entity mappings`,
      `Add the adapter to createBuiltInConnectorRegistry() in thrunt-god/bin/lib/runtime.cjs:`,
      `  const { create${functionName}Adapter } = require('./connectors/${connectorId}.cjs');`,
      `Run: node --test tests/connectors-${connectorId}.test.cjs`,
    ],
  }, raw);
}

async function cmdPackPromote(cwd, args, raw) {
  const packLib = require('./pack.cjs');
  const packId = args[0];

  if (!packId) {
    error('pack promote requires <pack-id>');
  }

  // Load registry to find the pack
  let registry;
  try {
    registry = packLib.loadPackRegistry(cwd);
  } catch (err) {
    output({ promoted: false, errors: [err.message] }, raw, 'false');
    return;
  }

  const pack = registry.packs.find(p => p.id === packId);
  if (!pack) {
    output({ promoted: false, errors: [`Pack "${packId}" not found in registry`] }, raw, 'false');
    return;
  }

  // Must be local source
  if (pack.source !== 'local') {
    output({ promoted: false, errors: [`Pack "${packId}" is already ${pack.source} (only local packs can be promoted)`] }, raw, 'false');
    return;
  }

  // Must be stable
  if (pack.stability !== 'stable') {
    output({ promoted: false, errors: [`Pack "${packId}" has stability "${pack.stability}" (only "stable" packs can be promoted)`] }, raw, 'false');
    return;
  }

  // Full validation
  const validation = packLib.validatePackDefinition(pack);
  if (!validation.valid) {
    output({ promoted: false, errors: validation.errors.map(e => `validation: ${e}`) }, raw, 'false');
    return;
  }

  // Template usage check
  const usage = packLib.getPackTemplateUsage(pack);
  if (usage.undeclared.length > 0) {
    output({ promoted: false, errors: [`Undeclared template parameters: ${usage.undeclared.join(', ')}`] }, raw, 'false');
    return;
  }

  // Build target directory
  const folder = packLib.getPackFolderForKind(pack.kind);
  const slug = packId.includes('.') ? packId.split('.').slice(1).join('-') : packId;
  const destDir = path.join(packLib.getBuiltInPackRegistryDir(), folder);
  const destPath = path.join(destDir, `${slug}.json`);

  // Read source pack JSON (from the local file), update source field
  const sourcePath = path.join(cwd, pack.path);
  const sourceContent = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));

  // Write to built-in directory (copy, not move)
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify(sourceContent, null, 2) + '\n');

  const relDest = path.relative(cwd, destPath);
  output({
    promoted: true,
    pack_id: packId,
    source: pack.path,
    destination: toPosixPath(relDest),
    kind: pack.kind,
    folder,
  }, raw, toPosixPath(relDest));
}

// ─── Replay CLI Commands ─────────────────────────────────────────────────────

async function cmdRuntimeReplay(cwd, args, raw) {
  const replay = require('./replay.cjs');
  const runtime = require('./runtime.cjs');
  const telemetry = require('./telemetry.cjs');
  const config = loadConfig(cwd);
  const options = parseRuntimeArgs(args);

  if (!options.source) {
    error('runtime replay requires --source <QRY-...|RCT-...|PE-...>');
  }

  // Determine source type from ID prefix
  let sourceType;
  if (options.source.startsWith('QRY-')) {
    sourceType = 'query';
  } else if (options.source.startsWith('RCT-')) {
    sourceType = 'receipt';
  } else if (options.source.startsWith('PE-')) {
    sourceType = 'pack_execution';
  } else {
    error(`Unrecognized source ID prefix: "${options.source}". Expected QRY-..., RCT-..., or PE-...`);
  }

  // Build mutations from args
  const mutations = {};
  if (options.start && options.end) {
    mutations.time_window = { mode: 'absolute', start: options.start, end: options.end };
  } else if (options.shift) {
    mutations.time_window = { mode: 'shift', shift_ms: replay.parseShiftDuration(options.shift) };
  } else if (options.lookback_minutes) {
    mutations.time_window = { mode: 'lookback', lookback_minutes: parseInt(options.lookback_minutes, 10) };
  }

  if (options.connector) {
    mutations.connector = { id: options.connector };
  }

  if (options.iocs && options.iocs.length > 0) {
    const parsedIocs = options.iocs.map(pair => {
      const eq = pair.indexOf('=');
      if (eq === -1) {
        error(`--ioc requires type=value format, received "${pair}"`);
      }
      return { type: pair.slice(0, eq), value: pair.slice(eq + 1) };
    });
    mutations.ioc_injection = {
      mode: options.ioc_mode || 'append',
      iocs: parsedIocs,
    };
  }

  // Build diff config
  const diffConfig = {
    enabled: options.diff === true,
    mode: options.diff_mode || 'full',
  };

  // Build evidence lineage
  const evidenceLineage = {
    original_query_ids: [options.source],
    replay_reason: options.reason || 'CLI replay',
  };

  // Create replay spec
  const replaySpec = replay.createReplaySpec({
    source: { type: sourceType, ids: [options.source] },
    mutations,
    diff: diffConfig,
    evidence: { lineage: evidenceLineage },
  });

  // Resolve original source
  const resolved = replay.resolveReplaySource(cwd, replaySpec.source);
  const validResolved = resolved.filter(r => r.original_spec);
  if (validResolved.length === 0) {
    const warnings = resolved.flatMap(r => r.warnings || []);
    error(`Could not resolve source: ${options.source}${warnings.length ? ' (' + warnings.join('; ') + ')' : ''}`);
  }
  if (diffConfig.enabled && validResolved.some(r => !r.original_envelope)) {
    error('runtime replay --diff requires source artifacts that include an original result summary');
  }

  // Apply mutations to each resolved spec
  const mutatedSpecs = validResolved.map(r => replay.applyMutations(r.original_spec, replaySpec.mutations));

  // Dry run: output mutated specs and return
  if (options.dry_run) {
    output({
      replay_id: replaySpec.replay_id,
      dry_run: true,
      source: options.source,
      source_type: sourceType,
      mutations: replaySpec.mutations,
      diff: diffConfig,
      mutated_specs: mutatedSpecs,
    }, raw);
    return;
  }

  // Execute each mutated spec
  const registry = runtime.createBuiltInConnectorRegistry();
  const results = [];

  for (const mutatedSpec of mutatedSpecs) {
    const result = await runtime.executeQuerySpec(mutatedSpec, registry, {
      cwd,
      config,
      artifacts: {
        lineage: {
          ...evidenceLineage,
          replay_id: replaySpec.replay_id,
          mutations_applied: Object.keys(replaySpec.mutations).filter(k => replaySpec.mutations[k]),
        },
      },
    });
    results.push(result);
  }

  // Diff if enabled
  let diffResult = null;
  if (diffConfig.enabled && results.length > 0) {
    const originalResolved = validResolved[0];
    const originalEnvelope = originalResolved.original_envelope;
    let effectiveDiffMode = diffConfig.mode;
    let diffNote = null;

    if (originalResolved.baseline_detail_level === 'summary' && diffConfig.mode !== 'counts_only') {
      if (diffConfig.mode === 'entities_only') {
        error('runtime replay --diff-mode entities_only requires a source with original entity details');
      }
      effectiveDiffMode = 'counts_only';
      diffNote = 'Original source recorded only aggregate result summary; computed counts_only diff.';
    }

    const replayEnvelope = results[0].envelope || {
      query_id: mutatedSpecs[0].query_id,
      connector: mutatedSpecs[0].connector,
      time_window: mutatedSpecs[0].time_window,
      counts: { events: 0, entities: 0 },
      entities: [],
      status: 'unknown',
    };

    try {
      diffResult = replay.buildDiff(originalEnvelope, replayEnvelope, effectiveDiffMode);
      if (diffNote) {
        diffResult.requested_mode = diffConfig.mode;
        diffResult.note = diffNote;
      }
    } catch (e) {
      diffResult = { error: e.message, fallback: 'counts_only' };
    }

    // Write diff artifact
    if (diffResult && !diffResult.error) {
      const paths = planningPaths(cwd);
      fs.mkdirSync(paths.queries, { recursive: true });
      const diffPath = path.join(paths.queries, `DIFF-${replaySpec.replay_id}.json`);
      fs.writeFileSync(diffPath, JSON.stringify(diffResult, null, 2));
    }
  }

  // Record telemetry
  try {
    const firstResult = results[0] || {};
    telemetry.recordReplayExecution(cwd, replaySpec, {
      events: firstResult.envelope && firstResult.envelope.counts && firstResult.envelope.counts.events || 0,
      entities: firstResult.envelope && firstResult.envelope.counts && firstResult.envelope.counts.entities || 0,
      status: firstResult.envelope && firstResult.envelope.status || 'unknown',
    });
  } catch {
    // Telemetry failures must not break replay output
  }

  output({
    replay_id: replaySpec.replay_id,
    source: options.source,
    source_type: sourceType,
    mutations: replaySpec.mutations,
    diff: diffResult,
    results: results.map(r => ({
      result: r.envelope,
      artifacts: r.artifacts,
      pagination: r.pagination,
    })),
  }, raw);
}

async function cmdReplayList(cwd, args, raw) {
  const options = parseRuntimeArgs(args);
  const paths = planningPaths(cwd);
  const metricsDir = path.join(paths.planning, 'METRICS');

  if (!fs.existsSync(metricsDir)) {
    output({ replays: [], total: 0 }, raw);
    return;
  }

  const files = fs.readdirSync(metricsDir).filter(f => f.startsWith('RE-') && f.endsWith('.json'));
  const records = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(metricsDir, file), 'utf-8');
      const record = JSON.parse(content);
      records.push(record);
    } catch {
      // Skip malformed files
    }
  }

  // Filter by --source if provided
  let filtered = records;
  if (options.source) {
    filtered = records.filter(r => {
      const ids = r.original_query_ids || [];
      const srcId = (r.source && r.source.ids) || [];
      return ids.includes(options.source) || srcId.includes(options.source);
    });
  }

  // Sort by timestamp descending
  filtered.sort((a, b) => {
    const ta = a.timestamp || '';
    const tb = b.timestamp || '';
    return tb.localeCompare(ta);
  });

  // Apply limit
  const limit = options.limit ? parseInt(options.limit, 10) : 20;
  const limited = filtered.slice(0, limit);

  output({
    replays: limited.map(r => ({
      replay_execution_id: r.replay_execution_id,
      replay_id: r.replay_id,
      timestamp: r.timestamp,
      source: r.source,
      original_query_ids: r.original_query_ids,
      mutation_types: r.mutation_types,
      diff_mode: r.diff_mode,
      results_summary: r.results_summary,
    })),
    total: filtered.length,
  }, raw);
}

async function cmdReplayDiff(cwd, args, raw) {
  const paths = planningPaths(cwd);

  // Extract replay ID from first non-flag arg
  let replayId = null;
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      replayId = arg;
      break;
    }
  }

  if (!replayId) {
    error('replay diff requires a replay ID (RPL-...) as argument');
  }

  const diffPath = path.join(paths.queries, `DIFF-${replayId}.json`);
  if (!fs.existsSync(diffPath)) {
    error(`No diff found for ${replayId}`);
  }

  let diffData;
  try {
    diffData = JSON.parse(fs.readFileSync(diffPath, 'utf-8'));
  } catch (e) {
    error(`Failed to parse diff file: ${e.message}`);
  }

  // Build human-readable summary
  const summary = [];
  if (diffData.baseline && diffData.replay) {
    summary.push(`Baseline: ${diffData.baseline.query_id || 'unknown'} (${diffData.baseline.status || 'unknown'})`);
    summary.push(`Replay:   ${diffData.replay.query_id || 'unknown'} (${diffData.replay.status || 'unknown'})`);
  }
  if (diffData.delta) {
    const d = diffData.delta;
    if (d.events) {
      summary.push(`Events: +${d.events.added} -${d.events.removed} =${d.events.unchanged}`);
    }
    if (d.entities) {
      const added = Array.isArray(d.entities.added) ? d.entities.added.length : d.entities.added || 0;
      const removed = Array.isArray(d.entities.removed) ? d.entities.removed.length : d.entities.removed || 0;
      const unchanged = d.entities.unchanged || 0;
      summary.push(`Entities: +${added} -${removed} =${unchanged}`);
    }
  }
  if (diffData.summary) {
    summary.push(diffData.summary);
  }

  output({
    replay_id: replayId,
    diff: diffData,
    human_summary: summary.join('\n'),
  }, raw, summary.join('\n'));
}

// ─── Tenant command delegates ────────────────────────────────────────────────

async function cmdTenantList(cwd, raw) { return getTenant().cmdTenantList(cwd, raw); }
async function cmdTenantStatus(cwd, tenantId, raw) { return getTenant().cmdTenantStatus(cwd, tenantId, raw); }
async function cmdTenantAdd(cwd, args, raw) { return getTenant().cmdTenantAdd(cwd, args, raw); }
async function cmdTenantDisable(cwd, tenantId, raw) { return getTenant().cmdTenantDisable(cwd, tenantId, raw); }
async function cmdTenantEnable(cwd, tenantId, raw) { return getTenant().cmdTenantEnable(cwd, tenantId, raw); }
async function cmdTenantDoctor(cwd, args, raw) { return getTenant().cmdTenantDoctor(cwd, args, raw); }

// ─── Connector ecosystem CLI commands ──────────────────────────────────────────

/**
 * List all installed connectors (built-in + plugins) with provenance info.
 * Usage: thrunt connectors list [--raw]
 */
async function cmdConnectorsList(cwd, raw) {
  const { discoverPlugins } = require('./plugin-registry.cjs');
  const config = loadConfig(cwd);

  const registry = discoverPlugins({ cwd, config, includeBuiltIn: true });
  const allPlugins = registry.listPlugins();

  const list = allPlugins.map(info => {
    const adapter = registry.get(info.connector_id);
    return {
      id: info.connector_id,
      display_name: (adapter && adapter.capabilities && adapter.capabilities.display_name) || info.connector_id,
      source: info.source,
      version: info.version,
      package_name: info.package_name,
    };
  });

  // Sort: built-in first, then alphabetical by id
  list.sort((a, b) => {
    if (a.source === 'built-in' && b.source !== 'built-in') return -1;
    if (a.source !== 'built-in' && b.source === 'built-in') return 1;
    return a.id.localeCompare(b.id);
  });

  output({ connectors: list, count: list.length }, raw);
}

/**
 * Search npm registry for available connectors.
 * Usage: thrunt connectors search <term> [--raw]
 */
async function cmdConnectorsSearch(cwd, args, raw) {
  const term = args[0];
  if (!term) {
    error('search term required. Usage: thrunt connectors search <term>');
  }

  try {
    let jsonResult;
    try {
      const stdout = execFileSync('npm', ['search', 'thrunt-connector', term, '--json', '--long'], {
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      jsonResult = JSON.parse(stdout);
    } catch (_parseErr) {
      // JSON parse failed — try non-JSON fallback
      try {
        const stdout = execFileSync('npm', ['search', 'thrunt-connector', term], {
          encoding: 'utf8',
          timeout: 15000,
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        // Non-JSON output — return as raw text
        output({ term, results: [], count: 0, raw_output: stdout.trim() }, raw);
        return;
      } catch (_fallbackErr) {
        output({ term, results: [], count: 0, error: 'npm search failed -- check network connection' }, raw);
        return;
      }
    }

    // Filter to only results whose name or keywords include 'thrunt-connector'
    const filtered = (Array.isArray(jsonResult) ? jsonResult : [])
      .filter(pkg => {
        const name = pkg.name || '';
        const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : [];
        return name.includes('thrunt-connector') || keywords.some(k => k.includes('thrunt-connector'));
      })
      .map(pkg => ({
        name: pkg.name,
        description: pkg.description || '',
        version: pkg.version || '',
        date: pkg.date || '',
        keywords: pkg.keywords || [],
      }));

    output({ term, results: filtered, count: filtered.length }, raw);
  } catch (_err) {
    output({ term, results: [], count: 0, error: 'npm search failed -- check network connection' }, raw);
  }
}

/**
 * Scaffold a standalone connector plugin project from the starter template.
 * Usage: thrunt connectors init <id> [flags]
 */
async function cmdConnectorsInit(cwd, args, raw) {
  const runtime = require('./runtime.cjs');
  const pluginTemplatesDir = path.join(__dirname, '../../templates/connector-plugin');

  // --- Argument parsing ---
  let connectorId = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const cliOptions = parseConnectorArgs(args.slice(connectorId ? 1 : 0));

  if (cliOptions.raw) raw = true;

  // --- Input validation ---
  if (!connectorId || !/^[a-z][a-z0-9_]*$/.test(connectorId)) {
    error(`connector ID must match /^[a-z][a-z0-9_]*$/ (lowercase, underscores, starts with letter). Got: ${connectorId || '(empty)'}`);
  }

  // Collision check against built-in connectors
  const builtInRegistry = runtime.createBuiltInConnectorRegistry();
  if (builtInRegistry.has(connectorId)) {
    const builtIns = builtInRegistry.list().map(c => c.id).join(', ');
    error(`connector ID '${connectorId}' collides with a built-in connector. Built-in IDs: ${builtIns}`);
  }

  // Apply defaults
  const authTypes = cliOptions.authTypes.length > 0 ? cliOptions.authTypes : ['api_key'];
  const datasetKinds = cliOptions.datasetKinds.length > 0 ? cliOptions.datasetKinds : ['events'];
  const languages = cliOptions.languages.length > 0 ? cliOptions.languages : ['api'];
  const paginationModes = cliOptions.paginationModes.length > 0 ? cliOptions.paginationModes : ['none'];
  const displayName = cliOptions.displayName || toTitleCase(connectorId);
  const dryRun = cliOptions.dryRun || false;
  const force = args.includes('--force');
  const scoped = args.includes('--scoped');
  const outputBaseDir = cliOptions.outputDir ? path.resolve(cwd, cliOptions.outputDir) : cwd;

  // Path containment: output directory must be within project root
  if (!outputBaseDir.startsWith(cwd + path.sep) && outputBaseDir !== cwd) {
    error(`output directory must be within project root. Got: ${outputBaseDir}`);
  }

  // Determine package name
  const packageName = scoped
    ? `@thrunt/connector-${connectorId}`
    : `thrunt-connector-${connectorId}`;

  // SDK version from root package.json
  const pkgJson = require('../../../package.json');
  const versionParts = pkgJson.version.split('.');
  const sdkVersion = `^${versionParts[0]}.${versionParts[1]}.0`;

  // Compute template variables
  const functionName = toPascalCase(connectorId);
  const envPrefix = connectorId.toUpperCase();
  const authTypesArray = JSON.stringify(authTypes).replace(/"/g, "'");
  const datasetKindsArray = JSON.stringify(datasetKinds).replace(/"/g, "'");
  const languagesArray = JSON.stringify(languages).replace(/"/g, "'");
  const paginationModesArray = JSON.stringify(paginationModes).replace(/"/g, "'");
  const docsUrl = cliOptions.docsUrl ? `'${escapeJsString(cliOptions.docsUrl)}'` : 'null';
  const safeDisplayName = escapeJsString(displayName);
  const dateStr = new Date().toISOString().split('T')[0];

  const vars = {
    CONNECTOR_ID: connectorId,
    CONNECTOR_DISPLAY_NAME: safeDisplayName,
    CONNECTOR_FUNCTION_NAME: functionName,
    AUTH_TYPES_ARRAY: authTypesArray,
    AUTH_TYPES_FIRST: authTypes[0],
    DATASET_KINDS_ARRAY: datasetKindsArray,
    DATASET_KINDS_FIRST: datasetKinds[0],
    LANGUAGES_ARRAY: languagesArray,
    LANGUAGES_FIRST: languages[0],
    PAGINATION_MODES_ARRAY: paginationModesArray,
    DOCS_URL: docsUrl,
    ENV_PREFIX: envPrefix,
    DATE: dateStr,
    PACKAGE_NAME: packageName,
    SDK_VERSION: sdkVersion,
    AUTH_TYPES_ARRAY_JSON: JSON.stringify(authTypes),
    DATASET_KINDS_ARRAY_JSON: JSON.stringify(datasetKinds),
    LANGUAGES_ARRAY_JSON: JSON.stringify(languages),
    PAGINATION_MODES_ARRAY_JSON: JSON.stringify(paginationModes),
  };

  // Output directory: <base>/thrunt-connector-<id>
  const outputDir = path.join(outputBaseDir, `thrunt-connector-${connectorId}`);

  // Build file manifest by scanning template directory
  const manifest = [];

  function scanTemplateDir(dir, relPrefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanTemplateDir(fullPath, path.join(relPrefix, entry.name));
      } else if (entry.name.endsWith('.tmpl')) {
        const outputName = entry.name.replace(/\.tmpl$/, '');
        const relOutputPath = path.join(relPrefix, outputName);
        manifest.push({
          path: path.join(outputDir, relOutputPath),
          templateFile: fullPath,
          relPath: relOutputPath,
        });
      }
    }
  }
  scanTemplateDir(pluginTemplatesDir, '');

  // --- Dry-run mode ---
  if (dryRun) {
    output({
      dry_run: true,
      connector_id: connectorId,
      package_name: packageName,
      output_dir: outputDir,
      files: manifest.map(item => ({
        path: item.relPath,
        template: path.basename(item.templateFile),
      })),
    }, raw);
    return;
  }

  // --- Overwrite protection ---
  if (!force) {
    const conflicting = manifest
      .filter(item => fs.existsSync(item.path))
      .map(item => item.relPath);
    if (conflicting.length > 0) {
      error(`CONNECTOR_FILE_EXISTS: the following files already exist: ${conflicting.join(', ')}. Use --force to overwrite.`);
    }
  }

  // --- File writing ---
  const generatedPaths = [];

  for (const item of manifest) {
    const tmplContent = fs.readFileSync(item.templateFile, 'utf8');
    const rendered = renderTemplate(tmplContent, vars);
    const dir = path.dirname(item.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(item.path, rendered);
    generatedPaths.push(item.relPath);
  }

  output({
    connector_id: connectorId,
    package_name: packageName,
    output_dir: outputDir,
    files: generatedPaths,
  }, raw);
}

// ─── Case commands ───────────────────────────────────────────────────────────

function buildStateDocument(frontmatter, body) {
  return `---\n${reconstructFrontmatter(frontmatter)}\n---\n\n${body.trimEnd()}\n`;
}

function buildCaseStateBody(title, opts = {}) {
  const status = opts.status || 'Active';
  const activeSignal = opts.activeSignal || `${title} opened for investigation`;
  const currentFocus = opts.currentFocus || 'Initial triage and evidence collection';
  const lastActivity = opts.lastActivity || status;
  const scope = opts.scope || 'Validate the case signal, collect first evidence, and decide the next investigation step.';
  const confidence = opts.confidence || 'Low';
  const blockers = opts.blockers || 'None.';

  return [
    `# Case: ${title}`,
    '',
    '## Current Position',
    '',
    `**Active signal:** ${activeSignal}`,
    `**Current focus:** ${currentFocus}`,
    'Phase: 1 of 1',
    'Plan: 1 of 1',
    `Status: ${status}`,
    `Last activity: ${lastActivity}`,
    '',
    '### Current Scope',
    '',
    scope,
    '',
    '### Confidence',
    '',
    confidence,
    '',
    '### Blockers',
    '',
    blockers,
    '',
  ].join('\n');
}

function titleizeSlug(slug) {
  return String(slug || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractMissionContext(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let body = raw.trim();
  body = body.replace(/^#\s+.+$/m, '').trim();
  body = body.replace(/^#{2,}\s+/gm, '');
  body = body.replace(/\*\*/g, '');
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return paragraphs.slice(0, 2).join('\n\n');
}

function buildCaseMissionContent(title, openedAt, opts = {}) {
  const owner = opts.owner || '_unassigned_';
  const status = opts.status || 'Active';
  const signal = opts.signal || '_Describe the initial signal or hypothesis._';
  const desiredOutcome = opts.desiredOutcome || '_What does success look like for this case?_';
  const scope = opts.scope || '_Define the boundaries of the investigation._';
  return [
    `# ${title}`,
    '',
    '**Mode:** case',
    `**Opened:** ${openedAt}`,
    `**Owner:** ${owner}`,
    `**Status:** ${status}`,
    '',
    '## Signal',
    '',
    signal,
    '',
    '## Desired Outcome',
    '',
    desiredOutcome,
    '',
    '## Scope',
    '',
    scope,
    '',
  ].join('\n');
}

function parseActivityDate(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const date = new Date(match[0]);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCaseActivityDate(caseStatePath, rosterEntry = {}) {
  if (fs.existsSync(caseStatePath)) {
    try {
      const content = fs.readFileSync(caseStatePath, 'utf-8');
      const fm = extractFrontmatter(content);
      const activityMatch = content.match(/^last_activity:\s*(.+)$/im)
        || content.match(/^Last Activity:\s*(.+)$/im)
        || content.match(/^Last activity:\s*(.+)$/im);
      const explicitActivity = fm.last_activity || (activityMatch ? activityMatch[1].trim() : null);
      const explicitDate = parseActivityDate(explicitActivity);
      if (explicitDate) {
        return explicitDate;
      }

      const stat = fs.statSync(caseStatePath);
      if (!Number.isNaN(stat.mtime.getTime())) {
        return stat.mtime;
      }
    } catch {
      // Fall back to roster timestamps below.
    }
  }

  return parseActivityDate(rosterEntry.last_activity || rosterEntry.opened_at);
}

function replaceCaseStateLine(content, patterns, replacement) {
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      return content.replace(pattern, replacement);
    }
  }
  return content;
}

function updateCaseStateBody(content, opts = {}) {
  let next = content;
  if (!/## Current Position/m.test(content)) {
    if (opts.activeSignal) {
      next = replaceCaseStateLine(next, [/^\*\*Active signal:\*\* .+$/m], `**Active signal:** ${opts.activeSignal}`);
    }
    if (opts.currentFocus) {
      next = replaceCaseStateLine(next, [/^\*\*Current focus:\*\* .+$/m], `**Current focus:** ${opts.currentFocus}`);
    }
    if (opts.status) {
      next = replaceCaseStateLine(next, [/^Status:\s*.+$/m, /^\*\*Status:\*\*\s*.+$/m], match => (
        match.startsWith('**Status:**') ? `**Status:** ${opts.status}` : `Status: ${opts.status}`
      ));
    }
    if (opts.lastActivity) {
      next = replaceCaseStateLine(next, [/^Last activity:\s*.+$/m, /^\*\*Last activity:\*\*\s*.+$/m], match => (
        match.startsWith('**Last activity:**') ? `**Last activity:** ${opts.lastActivity}` : `Last activity: ${opts.lastActivity}`
      ));
    }
    return next;
  }

  if (opts.activeSignal && /\*\*Active signal:\*\* .+/m.test(next)) {
    next = next.replace(/\*\*Active signal:\*\* .+/m, `**Active signal:** ${opts.activeSignal}`);
  }
  if (opts.currentFocus && /\*\*Current focus:\*\* .+/m.test(next)) {
    next = next.replace(/\*\*Current focus:\*\* .+/m, `**Current focus:** ${opts.currentFocus}`);
  }
  if (opts.status && /^Status:\s*.+$/m.test(next)) {
    next = next.replace(/^Status:\s*.+$/m, `Status: ${opts.status}`);
  }
  if (opts.lastActivity) {
    if (/^Last activity:\s*.+$/m.test(next)) {
      next = next.replace(/^Last activity:\s*.+$/m, `Last activity: ${opts.lastActivity}`);
    } else if (/^Status:\s*.+$/m.test(next)) {
      next = next.replace(/^Status:\s*.+$/m, match => `${match}\nLast activity: ${opts.lastActivity}`);
    }
  }
  return next;
}

function cmdCaseNew(cwd, name, options, raw) {
  if (!name) {
    error('Case name required. Usage: case new <name>');
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) {
    error('Invalid case name — must contain at least one alphanumeric character');
  }

  // Check slug uniqueness
  const roster = getCaseRoster(cwd);
  if (roster.some(c => c.slug === slug)) {
    output({ success: false, error: `Case slug "${slug}" already exists` }, raw);
    return;
  }

  const root = planningRoot(cwd);

  // Validate program STATE.md exists before creating case artifacts
  const programState = path.join(root, 'STATE.md');
  if (!fs.existsSync(programState)) {
    error('Program not initialized. Run `thrunt new-program` first.');
  }

  const caseDir = path.join(root, 'cases', slug);
  if (fs.existsSync(caseDir)) {
    error(`Case directory already exists: cases/${slug}`);
  }
  fs.mkdirSync(caseDir, { recursive: true });

  const today = new Date().toISOString().split('T')[0];

  // Create MISSION.md (required by VS Code store for case discovery).
  // parseMission requires bold metadata fields and ## Signal, ## Desired Outcome, ## Scope sections.
  const missionContent = buildCaseMissionContent(name, today, { signal: options.signal });
  fs.writeFileSync(path.join(caseDir, 'MISSION.md'), missionContent, 'utf-8');

  const huntmapFm = `---\ntitle: ${name}\nstatus: active\ncreated: ${today}\n---\n\n`;
  const huntmapBody = `# Huntmap\n\n## Hypotheses\n\nSee HYPOTHESES.md\n`;
  fs.writeFileSync(path.join(caseDir, 'HUNTMAP.md'), huntmapFm + huntmapBody, 'utf-8');

  fs.writeFileSync(path.join(caseDir, 'HYPOTHESES.md'), `# Hypotheses\n\n_No hypotheses yet._\n`, 'utf-8');

  const caseStateFm = {
    title: name,
    status: 'active',
    opened_at: today,
    technique_ids: [],
  };
  const caseStateBody = buildCaseStateBody(name, {
    activeSignal: `${name} opened for investigation`,
    currentFocus: 'Initial triage and evidence collection',
    lastActivity: `Opened ${today}`,
  });
  fs.writeFileSync(path.join(caseDir, 'STATE.md'), buildStateDocument(caseStateFm, caseStateBody), 'utf-8');

  // Create QUERIES/ and RECEIPTS/ directories
  fs.mkdirSync(path.join(caseDir, 'QUERIES'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'RECEIPTS'), { recursive: true });

  // Add to program roster
  addCaseToRoster(cwd, { slug, name, status: 'active', opened_at: today, technique_count: '0' });

  // Set active case pointer
  setActiveCase(cwd, slug);

  // Auto-search past cases for similar signals (silent failure)
  let past_case_matches = [];
  if (dbModule) try {
    const db = openProgramDb(cwd);
    if (db) {
      try {
        // Search using case name — OR-join words for broader FTS matching
        const nameTokens = name.split(/\s+/).filter(w => w.length > 1);
        const ftsQuery = nameTokens.length > 1 ? nameTokens.join(' OR ') : name;
        const nameResults = searchCases(db, ftsQuery, { limit: 5 });
        // Also check technique overlap from case name
        const techIds = extractTechniqueIds(name);
        let overlapResults = [];
        if (techIds.length > 0) {
          // Also include sub-technique variants (T1059 -> T1059.xxx) for broader matching
          const expanded = new Set(techIds);
          for (const tid of techIds) {
            // If parent ID (no dot), find any sub-techniques in the DB
            if (!tid.includes('.')) {
              try {
                const subs = db.prepare('SELECT DISTINCT technique_id FROM case_techniques WHERE technique_id LIKE ?').all(tid + '.%');
                for (const s of subs) expanded.add(s.technique_id);
              } catch { /* ignore */ }
            }
          }
          overlapResults = findTechniqueOverlap(db, [...expanded]);
        }
        // Merge: name matches first, then technique overlaps not already in name results
        const seen = new Set(nameResults.map(r => r.slug));
        past_case_matches = [
          ...nameResults,
          ...overlapResults.filter(r => !seen.has(r.slug))
        ].slice(0, 5);
      } finally {
        db.close();
      }
    }
  } catch {
    past_case_matches = [];
  }

  // Auto-detect coverage for technique IDs in case name (silent failure)
  let detection_coverage = [];
  if (intelModule && coverageModule) try {
    const techIds = extractTechniqueIds(name);
    if (techIds.length > 0) {
      const intelDb = intelModule.openIntelDb();
      try {
        for (const tid of techIds) {
          const result = coverageModule.compareDetections(intelDb, tid);
          if (result && result.technique_id) {
            detection_coverage.push({
              technique_id: result.technique_id,
              technique_name: result.technique_name,
              source_count: result.source_count,
              sources: result.sources.map(s => s.format),
            });
          }
        }
      } finally {
        intelDb.close();
      }
    }
  } catch {
    detection_coverage = [];
  }

  const caseDirRel = toPosixPath(path.relative(cwd, caseDir));
  output({ success: true, slug, name, case_dir: caseDirRel, message: `Case created: ${slug}`, past_case_matches, detection_coverage }, raw);
}

function cmdCaseList(cwd, raw) {
  const roster = getCaseRoster(cwd);
  output({
    cases: roster,
    total: roster.length,
    active: roster.filter(c => c.status === 'active').length,
    closed: roster.filter(c => c.status === 'closed').length,
  }, raw);
}

function validateCaseSlug(slug, { usageMessage, invalidTraversalMessage = 'Invalid case slug' } = {}) {
  if (!slug) {
    error(usageMessage || 'Case slug required.');
  }
  if (/[/\\]/.test(slug) || slug === '.' || slug === '..') {
    error(invalidTraversalMessage);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    error('Invalid case slug: must be alphanumeric, hyphens, and underscores only');
  }
  return slug;
}

function cmdCaseClose(cwd, slug, raw) {
  validateCaseSlug(slug, { usageMessage: 'Case slug required. Usage: case close <slug>' });

  const closedAt = new Date().toISOString().split('T')[0];
  const root = planningRoot(cwd);
  const caseDir = path.join(root, 'cases', slug);
  const caseStatePath = path.join(caseDir, 'STATE.md');
  let techniqueIds = [];

  // Update case-level STATE.md
  if (fs.existsSync(caseStatePath)) {
    const content = fs.readFileSync(caseStatePath, 'utf-8');
    const fm = extractFrontmatter(content);
    fm.status = 'closed';
    fm.closed_at = closedAt;
    let newContent = spliceFrontmatter(content, fm);
    newContent = updateCaseStateBody(newContent, {
      status: 'Closed',
      currentFocus: 'Closed and ready for follow-up as needed',
      lastActivity: `Closed ${closedAt}`,
    });
    fs.writeFileSync(caseStatePath, newContent, 'utf-8');
  }

  // Index case artifacts into program.db (non-fatal)
  if (dbModule) try {
    const db = openProgramDb(cwd);
    if (db) {
      try {
        indexCase(db, slug, caseDir);
        techniqueIds = readCaseTechniqueIds(caseDir, slug, db);
      } finally {
        db.close();
      }
    }
  } catch (err) {
    // Non-fatal: case is closed even if indexing fails
    if (!raw) console.error(`Warning: case indexing failed: ${err.message}`);
  }

  if (techniqueIds.length === 0) {
    techniqueIds = readCaseTechniqueIds(caseDir, slug, null);
  }

  persistCaseStateTechniqueIds(caseStatePath, techniqueIds);

  // Update program roster
  updateCaseInRoster(cwd, slug, {
    status: 'closed',
    closed_at: closedAt,
    technique_count: String(techniqueIds.length),
  });

  // Clear active case if it matches
  const activeCase = getActiveCase(cwd);
  if (activeCase === slug) {
    setActiveCase(cwd, null);
  }

  output({ success: true, slug, message: `Case closed: ${slug}` }, raw);
}

function cmdCaseStatus(cwd, slug, raw) {
  let targetSlug = slug;
  if (!targetSlug) {
    targetSlug = getActiveCase(cwd);
    if (!targetSlug) {
      error('No case specified and no active case. Usage: case status <slug>');
    }
  }

  const roster = getCaseRoster(cwd);
  const entry = roster.find(c => c.slug === targetSlug);
  if (!entry) {
    output({ error: `Case "${targetSlug}" not found in roster` }, raw);
    return;
  }

  const activeCase = getActiveCase(cwd);
  output({
    slug: entry.slug,
    name: entry.name,
    status: entry.status,
    opened_at: entry.opened_at,
    closed_at: entry.closed_at || null,
    technique_count: entry.technique_count || '0',
    is_active: entry.slug === activeCase,
  }, raw);
}

// ─── Case search ─────────────────────────────────────────────────────────────

function cmdCaseSearch(cwd, query, options, raw) {
  if (!query) {
    output({ success: false, error: 'Query required. Usage: thrunt-tools case-search <query>' }, raw);
    return;
  }

  const searchCwd = options.program || cwd;
  let db;
  if (dbModule) {
    try {
      db = openProgramDb(searchCwd);
    } catch {
      db = null;
    }
  }

  if (!db) {
    output({ success: true, query, results: [], total: 0, message: 'No program database found' }, raw);
    return;
  }

  try {
    const limit = options.limit || 10;
    let results = searchCases(db, query, { limit });

    // If --technique specified, filter results to those with matching techniques
    if (options.technique) {
      const techIds = Array.isArray(options.technique) ? options.technique : [options.technique];
      const overlap = findTechniqueOverlap(db, techIds);
      const overlapMap = new Map(overlap.map(o => [o.slug, o]));
      // Filter to only results with technique overlap
      results = results.filter(r => overlapMap.has(r.slug));
      // Enrich with overlap data
      results = results.map(r => ({
        ...r,
        technique_overlap: (overlapMap.get(r.slug)?.overlapping_techniques || '').split(',').filter(Boolean),
      }));
    }

    // For results without explicit technique enrichment, fetch technique data
    if (!options.technique) {
      results = results.map(r => {
        const caseRow = db.prepare('SELECT id FROM case_index WHERE slug = ?').get(r.slug);
        if (caseRow) {
          const techs = db.prepare('SELECT technique_id FROM case_techniques WHERE case_id = ?').all(caseRow.id);
          return { ...r, technique_overlap: techs.map(t => t.technique_id) };
        }
        return { ...r, technique_overlap: [] };
      });
    }

    output({
      success: true,
      query,
      results: results.map(r => ({
        slug: r.slug,
        name: r.name,
        status: r.status,
        opened_at: r.opened_at || null,
        closed_at: r.closed_at || null,
        match_snippet: r.match_snippet,
        technique_overlap: r.technique_overlap || [],
        outcome_summary: r.outcome_summary || null,
        relevance_score: r.relevance_score,
      })),
      total: results.length,
    }, raw);
  } finally {
    db.close();
  }
}

// ─── Program commands ────────────────────────────────────────────────────────

function readCaseArtifactTechniqueIds(caseDir) {
  let combined = '';
  const findingsPath = path.join(caseDir, 'FINDINGS.md');
  if (fs.existsSync(findingsPath)) {
    combined += fs.readFileSync(findingsPath, 'utf-8') + '\n';
  }
  const hypothesesPath = path.join(caseDir, 'HYPOTHESES.md');
  if (fs.existsSync(hypothesesPath)) {
    combined += fs.readFileSync(hypothesesPath, 'utf-8') + '\n';
  }

  return combined ? extractTechniqueIdsFallback(combined) : [];
}

function readCaseStateTechniqueIds(caseStatePath) {
  if (!fs.existsSync(caseStatePath)) return [];

  const content = fs.readFileSync(caseStatePath, 'utf-8');
  const fm = extractFrontmatter(content);
  if (!Array.isArray(fm.technique_ids) || fm.technique_ids.length === 0) return [];

  return [...new Set(
    fm.technique_ids
      .map(id => String(id || '').trim().toUpperCase())
      .filter(Boolean)
  )];
}

function persistCaseStateTechniqueIds(caseStatePath, techniqueIds) {
  if (!fs.existsSync(caseStatePath)) return;

  const content = fs.readFileSync(caseStatePath, 'utf-8');
  const fm = extractFrontmatter(content);
  fm.technique_ids = [...new Set(
    (techniqueIds || [])
      .map(id => String(id || '').trim().toUpperCase())
      .filter(Boolean)
  )];
  fs.writeFileSync(caseStatePath, spliceFrontmatter(content, fm), 'utf-8');
}

function readIndexedCaseTechniqueIds(db, slug) {
  if (!db) return [];

  const rows = db.prepare(`
    SELECT ct.technique_id
    FROM case_techniques ct
    JOIN case_index ci ON ci.id = ct.case_id
    WHERE ci.slug = ?
    ORDER BY ct.technique_id
  `).all(slug);

  return rows.map(row => row.technique_id).filter(Boolean);
}

function readCaseTechniqueIds(caseDir, slug, db) {
  const caseStatePath = path.join(caseDir, 'STATE.md');
  let techniqueIds = readCaseStateTechniqueIds(caseStatePath);

  if (techniqueIds.length === 0) {
    techniqueIds = readIndexedCaseTechniqueIds(db, slug);
  }

  if (techniqueIds.length === 0) {
    techniqueIds = readCaseArtifactTechniqueIds(caseDir);
  }

  return [...new Set(techniqueIds.map(id => String(id).trim().toUpperCase()).filter(Boolean))];
}

function cmdProgramRollup(cwd, raw) {
  const roster = getCaseRoster(cwd);
  const root = planningRoot(cwd);
  const statePath = planningPaths(cwd).programState;

  if (!fs.existsSync(statePath)) {
    error('No program STATE.md found. Run new-program first.');
  }

  const allTechniques = new Set();
  const today = new Date();
  const STALE_DAYS = 14;
  const events = [];
  let caseDb = null;

  if (openProgramDb) {
    const dbPath = path.join(root, 'program.db');
    if (fs.existsSync(dbPath)) {
      try {
        caseDb = openProgramDb(cwd);
      } catch {
        caseDb = null;
      }
    }
  }

  try {
    // Enrich roster entries with technique data and stale detection
    const enriched = roster.map(entry => {
      const caseDir = path.join(root, 'cases', entry.slug);
      const caseStatePath = path.join(caseDir, 'STATE.md');
      const techniqueIds = readCaseTechniqueIds(caseDir, entry.slug, caseDb);

      for (const t of techniqueIds) allTechniques.add(t);

      // Determine stale status
      let isStale = false;
      if (entry.status === 'active') {
        const activityDate = getCaseActivityDate(caseStatePath, entry);
        if (activityDate) {
          const diffDays = Math.floor((today - activityDate) / (1000 * 60 * 60 * 24));
          if (diffDays > STALE_DAYS) isStale = true;
        }
      }

      // Collect timeline events
      if (entry.opened_at) {
        events.push({ date: entry.opened_at, text: `Opened: ${entry.name}` });
      }
      if (entry.closed_at) {
        events.push({ date: entry.closed_at, text: `Closed: ${entry.name}` });
      }

      const displayStatus = isStale ? 'stale' : entry.status;
      return { ...entry, techniqueIds, isStale, displayStatus };
    });

    // Compute counts
    const activeCount = enriched.filter(e => e.status === 'active' && !e.isStale).length;
    const staleCount = enriched.filter(e => e.isStale).length;
    const closedCount = enriched.filter(e => e.status === 'closed').length;
    const uniqueCount = allTechniques.size;

    // Build case table
    const tableRows = enriched.map(e => {
      const tc = e.techniqueIds.length || e.technique_count || '0';
      return `| ${e.slug} | ${e.name} | ${e.displayStatus} | ${e.opened_at || '-'} | ${e.closed_at || '-'} | ${tc} |`;
    }).join('\n');

    // Build coverage gaps
    let coverageSection;
    if (allTechniques.size === 0) {
      coverageSection = 'No technique data available.';
    } else {
      const sorted = [...allTechniques].sort();
      coverageSection = `Techniques covered: ${sorted.join(', ')}`;
    }

    // Build timeline (last 10 events, chronological)
    events.sort((a, b) => a.date.localeCompare(b.date));
    const timelineEvents = events.slice(-10);
    const timelineSection = timelineEvents.length > 0
      ? timelineEvents.map(e => `- ${e.date}: ${e.text}`).join('\n')
      : 'No case events yet.';

    // Generate rollup body
    const rollupBody = `## Case Summary

**Cases:** ${activeCount} active, ${closedCount} closed, ${staleCount} stale | **Techniques:** ${uniqueCount} unique across all cases

| Slug | Name | Status | Opened | Closed | Techniques |
|------|------|--------|--------|--------|------------|
${tableRows}

### Coverage Gaps

${coverageSection}

### Timeline

${timelineSection}
`;

    // Write to program STATE.md: preserve frontmatter, replace body
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    const fm = extractFrontmatter(stateContent);
    const yamlStr = reconstructFrontmatter(fm);
    const newContent = `---\n${yamlStr}\n---\n\n${rollupBody}`;
    fs.writeFileSync(statePath, newContent, 'utf-8');

    output({
      success: true,
      total: roster.length,
      active: activeCount,
      closed: closedCount,
      stale: staleCount,
      techniques: uniqueCount,
    }, raw);
  } finally {
    if (caseDb) caseDb.close();
  }
}

// ─── Migration commands ─────────────────────────────────────────────────────

function cmdMigrateCase(cwd, slug, raw) {
  // Validation
  validateCaseSlug(slug, {
    usageMessage: 'Case slug required. Usage: migrate-case <slug>',
    invalidTraversalMessage: 'Invalid case slug for migration',
  });

  // Pre-flight checks
  const baseDir = planningRoot(cwd);
  const caseDir = path.join(baseDir, 'cases', slug);

  if (fs.existsSync(caseDir)) {
    error('Case directory already exists: cases/' + slug);
  }
  if (!fs.existsSync(path.join(baseDir, 'STATE.md'))) {
    error('No program found. Run new-program first.');
  }

  // Artifact list (case-scoped, to be moved)
  const toMove = [
    { name: 'HUNTMAP.md', type: 'file' },
    { name: 'HYPOTHESES.md', type: 'file' },
    { name: 'SUCCESS_CRITERIA.md', type: 'file' },
    { name: 'FINDINGS.md', type: 'file' },
    { name: 'EVIDENCE_REVIEW.md', type: 'file' },
    { name: 'phases', type: 'dir' },
    { name: 'QUERIES', type: 'dir' },
    { name: 'RECEIPTS', type: 'dir' },
    { name: 'MANIFESTS', type: 'dir' },
    { name: 'DETECTIONS', type: 'dir' },
    { name: 'published', type: 'dir' },
  ];

  // Migration with rollback
  fs.mkdirSync(caseDir, { recursive: true });
  const filesMoved = [];
  const rollbackMigration = (reason) => {
    for (const name of filesMoved) {
      try { fs.renameSync(path.join(caseDir, name), path.join(baseDir, name)); } catch (_e) { /* best effort */ }
    }
    try { fs.rmSync(caseDir, { recursive: true }); } catch (_e) { /* best effort */ }
    error('Migration failed (rolled back): ' + reason);
  };

  const openedAt = new Date().toISOString().split('T')[0];
  const caseTitle = titleizeSlug(slug);
  try {
    for (const item of toMove) {
      const src = path.join(baseDir, item.name);
      if (fs.existsSync(src)) {
        const dest = path.join(caseDir, item.name);
        fs.renameSync(src, dest);
        filesMoved.push(item.name);
      }
    }

    // Create case-level STATE.md
    const caseStatePath = path.join(caseDir, 'STATE.md');
    if (!fs.existsSync(caseStatePath)) {
      const caseFm = {
        title: caseTitle,
        status: 'active',
        opened_at: openedAt,
        technique_ids: [],
      };
      const caseBody = buildCaseStateBody(slug, {
        activeSignal: `${slug} migrated from flat .planning/ layout`,
        currentFocus: 'Resume triage from migrated artifacts',
        lastActivity: `Migrated ${openedAt}`,
        scope: 'Review migrated artifacts and normalize any remaining case state for continued investigation.',
      });
      fs.writeFileSync(caseStatePath, buildStateDocument(caseFm, caseBody), 'utf-8');
    }

    const caseMissionPath = path.join(caseDir, 'MISSION.md');
    if (!fs.existsSync(caseMissionPath)) {
      const rootMissionPath = path.join(baseDir, 'MISSION.md');
      const missionContext = fs.existsSync(rootMissionPath)
        ? extractMissionContext(fs.readFileSync(rootMissionPath, 'utf-8'))
        : '';
      const signal = missionContext
        ? `This case was migrated from the flat .planning/ layout.\n\nExisting mission context: ${missionContext}`
        : 'This case was migrated from the flat .planning/ layout.';
      const desiredOutcome = 'Resume the migrated investigation without losing existing context or artifacts.';
      const scope = 'Review the migrated case artifacts, validate current hypotheses, and continue triage from the child case directory.';
      fs.writeFileSync(caseMissionPath, buildCaseMissionContent(caseTitle, openedAt, { signal, desiredOutcome, scope }), 'utf-8');
    }

    // Update program roster
    const techniqueCount = String(readCaseTechniqueIds(caseDir, slug, null).length);
    addCaseToRoster(cwd, {
      slug,
      name: caseTitle,
      status: 'active',
      opened_at: openedAt,
      technique_count: techniqueCount,
    });
  } catch (err) {
    rollbackMigration(err.message);
    return;
  }

  // Set active case pointer
  try { setActiveCase(cwd, slug); } catch (_e) { /* non-fatal */ }

  // Output result
  output({
    success: true,
    slug,
    case_dir: toPosixPath(path.relative(cwd, caseDir)),
    files_moved: filesMoved,
    message: 'Migrated to cases/' + slug + ' (' + filesMoved.length + ' artifacts moved)',
  }, raw);
}

module.exports = {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdCheckPathExists,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdPackList,
  cmdPackShow,
  cmdPackBootstrap,
  cmdPackValidate,
  cmdPackRenderTargets,
  cmdPackLint,
  cmdPackTest,
  cmdPackInit,
  cmdPackCreate,
  cmdPackPromote,
  cmdRuntimeListConnectors,
  cmdRuntimeDoctor,
  cmdDoctorConnectors,
  cmdRuntimeSmoke,
  cmdRuntimeExecute,
  cmdRuntimeDispatch,
  cmdRuntimeAggregate,
  cmdRuntimeHeatmap,
  cmdRuntimeReplay,
  cmdReplayList,
  cmdReplayDiff,
  parseRuntimeArgs,
  cmdCommit,
  cmdCommitToSubrepo,
  cmdSummaryExtract,
  cmdWebsearch,
  cmdProgressRender,
  cmdTodoComplete,
  cmdTodoMatchPhase,
  cmdScaffold,
  cmdStats,
  cmdInitConnector,
  cmdTenantList,
  cmdTenantStatus,
  cmdTenantAdd,
  cmdTenantDisable,
  cmdTenantEnable,
  cmdTenantDoctor,
  cmdConnectorsList,
  cmdConnectorsSearch,
  cmdConnectorsInit,
  escapeJsString,
  renderTemplate,
  cmdCaseNew,
  cmdCaseList,
  cmdCaseClose,
  cmdCaseStatus,
  cmdCaseSearch,
  cmdProgramRollup,
  cmdMigrateCase,
};
