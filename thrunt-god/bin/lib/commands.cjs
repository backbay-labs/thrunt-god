/**
 * Commands — Standalone utility commands
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { safeReadFile, loadConfig, isGitIgnored, execGit, normalizePhaseName, comparePhaseNum, getArchivedPhaseDirs, generateSlugInternal, getMilestoneInfo, getMilestonePhaseFilter, resolveModelInternal, stripShippedMilestones, extractCurrentMilestone, planningDir, planningPaths, toPosixPath, output, error, findPhaseInternal, extractOneLinerFromBody, getHuntmapPhaseInternal, getHuntmapDocInfo } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { MODEL_PROFILES } = require('./model-profiles.cjs');

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

    if ((key === 'hypothesis' || key === 'tag') && args[i + 1] && !args[i + 1].startsWith('--')) {
      const target = key === 'hypothesis' ? options.hypothesis_ids : options.tags;
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
      const result = await runtime.executeQuerySpec(target.query_spec, registry, { cwd, config });
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

function getPackFolderForKind(kind) {
  switch (kind) {
    case 'technique':
      return 'techniques';
    case 'domain':
      return 'domains';
    case 'family':
      return 'families';
    case 'campaign':
      return 'campaigns';
    case 'example':
      return 'examples';
    case 'custom':
    default:
      return 'custom';
  }
}

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
    const exampleParameters = pack.examples?.parameters || {};
    let bootstrap_ok = false;
    let render_ok = pack.execution_targets.length === 0;

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
          packLib.buildPackExecutionTargets(cwd, pack.id, exampleParameters, {
            profile: 'default',
          });
          render_ok = true;
        } catch (err) {
          errors.push(`render-targets: ${err.message}`);
        }
      }
    }

    results.push({
      id: pack.id,
      source: pack.source,
      valid: errors.length === 0,
      bootstrap_ok,
      render_ok,
      errors,
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
  const packDir = path.join(packLib.getProjectPackRegistryDir(cwd), getPackFolderForKind(kind));
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
  if (isGitIgnored(cwd, '.planning')) {
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
  const filesToStage = files && files.length > 0 ? files : ['.planning/'];
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
  cmdRuntimeListConnectors,
  cmdRuntimeDoctor,
  cmdRuntimeSmoke,
  cmdRuntimeExecute,
  cmdCommit,
  cmdCommitToSubrepo,
  cmdSummaryExtract,
  cmdWebsearch,
  cmdProgressRender,
  cmdTodoComplete,
  cmdTodoMatchPhase,
  cmdScaffold,
  cmdStats,
};
