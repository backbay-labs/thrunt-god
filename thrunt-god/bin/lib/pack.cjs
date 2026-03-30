/**
 * Pack — Pack schema, registry discovery, and parameter validation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const runtime = require('./runtime.cjs');
const { PLANNING_DIR_NAME } = require('./core.cjs');

const PACK_SCHEMA_VERSION = '1.0';
const PACK_KINDS = ['technique', 'domain', 'family', 'campaign', 'custom', 'example'];
const PACK_STABILITIES = ['experimental', 'preview', 'stable', 'deprecated'];
const PACK_PARAMETER_TYPES = ['string', 'integer', 'number', 'boolean', 'string_array'];
const ATTACK_ID_PATTERN = /^T\d{4}(?:\.\d{3})?$/i;
const TEMPLATE_PARAMETER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneObject(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.slice() : [value];
}

function sanitizeStringArray(value) {
  return toArray(value)
    .map(item => typeof item === 'string' ? item.trim() : String(item))
    .filter(Boolean);
}

function mergeUniqueStrings(base = [], overlay = []) {
  const result = [];
  const seen = new Set();
  for (const value of [...toArray(base), ...toArray(overlay)]) {
    const normalized = typeof value === 'string' ? value.trim() : String(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function mergeNamedItems(base = [], overlay = [], key) {
  const result = [];
  const indexByKey = new Map();

  for (const item of toArray(base)) {
    result.push(cloneObject(item));
    if (item && item[key]) indexByKey.set(item[key], result.length - 1);
  }

  for (const item of toArray(overlay)) {
    const clone = cloneObject(item);
    const itemKey = clone && clone[key];
    if (!itemKey || !indexByKey.has(itemKey)) {
      result.push(clone);
      if (itemKey) indexByKey.set(itemKey, result.length - 1);
      continue;
    }
    result[indexByKey.get(itemKey)] = clone;
  }

  return result;
}

function mergeObjects(base = {}, overlay = {}) {
  const left = isPlainObject(base) ? cloneObject(base) : {};
  const right = isPlainObject(overlay) ? cloneObject(overlay) : {};
  const result = { ...left };

  for (const [key, value] of Object.entries(right)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeObjects(result[key], value);
    } else {
      result[key] = cloneObject(value);
    }
  }

  return result;
}

function getBuiltInPackRegistryDir() {
  return path.join(__dirname, '..', '..', 'packs');
}

function getProjectPackRegistryDir(cwd) {
  return path.join(cwd, PLANNING_DIR_NAME, 'packs');
}

function getPackRegistryPaths(cwd, options = {}) {
  return {
    built_in: options.builtInDir || getBuiltInPackRegistryDir(),
    local: options.localDir || getProjectPackRegistryDir(cwd),
  };
}

function discoverPackFiles(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) return [];

  const discovered = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'templates' || entry.name.startsWith('.')) continue;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;
      if (entry.name.startsWith('_')) continue;
      discovered.push(fullPath);
    }
  }

  walk(baseDir);
  discovered.sort();
  return discovered;
}

function readPackJson(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    const error = new Error(`Invalid pack JSON in ${filePath}: ${err.message}`);
    error.code = 'INVALID_PACK_JSON';
    throw error;
  }

  if (!isPlainObject(parsed)) {
    const error = new Error(`Invalid pack JSON in ${filePath}: top-level value must be an object`);
    error.code = 'INVALID_PACK_JSON';
    throw error;
  }

  return parsed;
}

function normalizePackParameter(input = {}) {
  return {
    name: typeof input.name === 'string' ? input.name.trim() : null,
    type: typeof input.type === 'string' ? input.type.trim() : 'string',
    description: typeof input.description === 'string' ? input.description.trim() : '',
    required: input.required === true,
    default: input.default,
    enum: sanitizeStringArray(input.enum),
    pattern: typeof input.pattern === 'string' ? input.pattern : null,
    minimum: Number.isFinite(input.minimum) ? Number(input.minimum) : null,
    maximum: Number.isFinite(input.maximum) ? Number(input.maximum) : null,
    min_items: Number.isFinite(input.min_items) ? Math.max(0, Math.trunc(input.min_items)) : null,
    max_items: Number.isFinite(input.max_items) ? Math.max(0, Math.trunc(input.max_items)) : null,
    example: input.example === undefined ? null : input.example,
  };
}

function normalizeTelemetryRequirement(input = {}) {
  return {
    surface: typeof input.surface === 'string' ? input.surface.trim() : null,
    description: typeof input.description === 'string' ? input.description.trim() : '',
    required: input.required !== false,
    connectors: sanitizeStringArray(input.connectors),
    datasets: sanitizeStringArray(input.datasets),
  };
}

function normalizeExecutionTarget(input = {}) {
  return {
    name: typeof input.name === 'string' ? input.name.trim() : null,
    description: typeof input.description === 'string' ? input.description.trim() : '',
    connector: typeof input.connector === 'string' ? input.connector.trim() : null,
    dataset: typeof input.dataset === 'string' ? input.dataset.trim() : null,
    language: typeof input.language === 'string' ? input.language.trim() : 'native',
    query_template: typeof input.query_template === 'string' ? input.query_template.trim() : null,
    notes: sanitizeStringArray(input.notes),
  };
}

function normalizePackExamples(input = {}) {
  return {
    parameters: isPlainObject(input.parameters) ? cloneObject(input.parameters) : {},
    notes: sanitizeStringArray(input.notes),
  };
}

function createPackDefinition(input = {}, options = {}) {
  const publish = isPlainObject(input.publish) ? input.publish : {};
  const requireComplete = options.allowPartial === true
    ? false
    : options.requireComplete !== false;

  const pack = {
    version: typeof input.version === 'string' ? input.version.trim() : PACK_SCHEMA_VERSION,
    id: typeof input.id === 'string' ? input.id.trim() : null,
    kind: typeof input.kind === 'string' ? input.kind.trim() : 'custom',
    title: typeof input.title === 'string' ? input.title.trim() : null,
    description: typeof input.description === 'string' ? input.description.trim() : null,
    stability: typeof input.stability === 'string' ? input.stability.trim() : 'experimental',
    metadata: isPlainObject(input.metadata) ? cloneObject(input.metadata) : {},
    extends: sanitizeStringArray(input.extends),
    attack: sanitizeStringArray(input.attack),
    hypothesis_ids: sanitizeStringArray(input.hypothesis_ids),
    hypothesis_templates: sanitizeStringArray(input.hypothesis_templates),
    required_connectors: sanitizeStringArray(input.required_connectors),
    supported_datasets: sanitizeStringArray(input.supported_datasets),
    parameters: toArray(input.parameters)
      .filter(isPlainObject)
      .map(normalizePackParameter),
    telemetry_requirements: toArray(input.telemetry_requirements)
      .filter(isPlainObject)
      .map(normalizeTelemetryRequirement),
    blind_spots: sanitizeStringArray(input.blind_spots),
    execution_targets: toArray(input.execution_targets)
      .filter(isPlainObject)
      .map(normalizeExecutionTarget),
    scope_defaults: isPlainObject(input.scope_defaults) ? cloneObject(input.scope_defaults) : {},
    execution_defaults: isPlainObject(input.execution_defaults) ? cloneObject(input.execution_defaults) : {},
    examples: normalizePackExamples(input.examples),
    publish: {
      finding_type: typeof publish.finding_type === 'string' ? publish.finding_type.trim() : null,
      expected_outcomes: sanitizeStringArray(publish.expected_outcomes),
      receipt_tags: sanitizeStringArray(publish.receipt_tags),
    },
    notes: sanitizeStringArray(input.notes),
  };

  const validation = validatePackDefinition(pack, { ...options, requireComplete });
  if (!validation.valid) {
    const err = new Error(`Invalid pack definition: ${validation.errors.join('; ')}`);
    err.code = 'INVALID_PACK_DEFINITION';
    err.validation = validation;
    throw err;
  }

  return pack;
}

function validatePackDefinition(pack, options = {}) {
  const errors = [];
  const warnings = [];
  const requireComplete = options.requireComplete !== false;

  if (!isPlainObject(pack)) {
    return { valid: false, errors: ['Pack must be an object'], warnings };
  }

  if (pack.version !== PACK_SCHEMA_VERSION) {
    errors.push(`version must be ${PACK_SCHEMA_VERSION}`);
  }

  if (!pack.id || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(pack.id)) {
    errors.push('id is required and must use lowercase letters, numbers, dots, underscores, or hyphens');
  }

  if (!PACK_KINDS.includes(pack.kind)) {
    errors.push(`kind must be one of: ${PACK_KINDS.join(', ')}`);
  }

  for (const parentId of pack.extends || []) {
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(parentId)) {
      errors.push(`extends contains invalid pack id: ${parentId}`);
    }
    if (parentId === pack.id) {
      errors.push('packs cannot extend themselves');
    }
  }

  if (requireComplete && !pack.title) {
    errors.push('title is required');
  }

  if (requireComplete && !pack.description) {
    errors.push('description is required');
  }

  if (!PACK_STABILITIES.includes(pack.stability)) {
    errors.push(`stability must be one of: ${PACK_STABILITIES.join(', ')}`);
  }

  for (const techniqueId of pack.attack || []) {
    if (!ATTACK_ID_PATTERN.test(techniqueId)) {
      errors.push(`attack contains invalid ATT&CK id: ${techniqueId}`);
    }
  }

  if (requireComplete && pack.kind === 'technique' && (!Array.isArray(pack.attack) || pack.attack.length === 0)) {
    errors.push('technique packs must include at least one ATT&CK technique id in attack');
  }

  if (requireComplete && (!Array.isArray(pack.hypothesis_ids) || pack.hypothesis_ids.length === 0)) {
    errors.push('hypothesis_ids must include at least one hypothesis id');
  }

  if (
    requireComplete &&
    pack.kind === 'technique' &&
    (!Array.isArray(pack.hypothesis_templates) || pack.hypothesis_templates.length === 0)
  ) {
    errors.push('technique packs must include at least one hypothesis template');
  }

  if (requireComplete && (!Array.isArray(pack.required_connectors) || pack.required_connectors.length === 0)) {
    errors.push('required_connectors must include at least one connector id');
  }

  if (requireComplete && (!Array.isArray(pack.supported_datasets) || pack.supported_datasets.length === 0)) {
    errors.push('supported_datasets must include at least one dataset kind');
  }

  if (Array.isArray(pack.supported_datasets)) {
    for (const dataset of pack.supported_datasets) {
      if (!runtime.DATASET_KINDS.includes(dataset)) {
        errors.push(`supported_datasets contains unsupported kind: ${dataset}`);
      }
    }
  }

  const connectorRegistry = options.connectorRegistry || null;
  if (connectorRegistry && typeof connectorRegistry.list === 'function') {
    const knownConnectorIds = new Set(connectorRegistry.list().map(item => item.id));
    for (const connectorId of pack.required_connectors) {
      if (!knownConnectorIds.has(connectorId)) {
        warnings.push(`required_connectors references unknown connector id: ${connectorId}`);
      }
    }
  }

  const seenParameterNames = new Set();
  for (const parameter of pack.parameters) {
    if (!parameter.name || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(parameter.name)) {
      errors.push('parameter names must start with a letter and contain only letters, numbers, and underscores');
      continue;
    }
    if (seenParameterNames.has(parameter.name)) {
      errors.push(`duplicate parameter name: ${parameter.name}`);
    }
    seenParameterNames.add(parameter.name);

    if (!PACK_PARAMETER_TYPES.includes(parameter.type)) {
      errors.push(`parameter ${parameter.name} has unsupported type ${parameter.type}`);
    }
    if (!parameter.description) {
      warnings.push(`parameter ${parameter.name} should include a description`);
    }
    if (parameter.minimum !== null && parameter.maximum !== null && parameter.minimum > parameter.maximum) {
      errors.push(`parameter ${parameter.name} has minimum greater than maximum`);
    }
    if (parameter.min_items !== null && parameter.max_items !== null && parameter.min_items > parameter.max_items) {
      errors.push(`parameter ${parameter.name} has min_items greater than max_items`);
    }
    if (parameter.pattern) {
      try {
        // Validate the regex string now so later validation cannot crash at runtime.
        // eslint-disable-next-line no-new
        new RegExp(parameter.pattern);
      } catch (err) {
        errors.push(`parameter ${parameter.name} has invalid pattern: ${err.message}`);
      }
    }
  }

  if (!isPlainObject(pack.scope_defaults)) {
    errors.push('scope_defaults must be an object');
  }

  if (pack.scope_defaults.time_window) {
    const lookbackMinutes = pack.scope_defaults.time_window.lookback_minutes;
    if (lookbackMinutes !== undefined && (!Number.isFinite(lookbackMinutes) || lookbackMinutes <= 0)) {
      errors.push('scope_defaults.time_window.lookback_minutes must be a positive number when provided');
    }
  }

  if (!isPlainObject(pack.execution_defaults)) {
    errors.push('execution_defaults must be an object');
  }

  if (!isPlainObject(pack.examples)) {
    errors.push('examples must be an object');
  } else if (!isPlainObject(pack.examples.parameters)) {
    errors.push('examples.parameters must be an object');
  }

  if (
    pack.execution_defaults.consistency &&
    !runtime.CONSISTENCY_MODES.includes(pack.execution_defaults.consistency)
  ) {
    errors.push(`execution_defaults.consistency must be one of: ${runtime.CONSISTENCY_MODES.join(', ')}`);
  }

  if (
    pack.execution_defaults.receipt_policy &&
    !runtime.EVIDENCE_POLICIES.includes(pack.execution_defaults.receipt_policy)
  ) {
    errors.push(`execution_defaults.receipt_policy must be one of: ${runtime.EVIDENCE_POLICIES.join(', ')}`);
  }

  if (
    requireComplete &&
    pack.kind === 'technique' &&
    (!Array.isArray(pack.telemetry_requirements) || pack.telemetry_requirements.length === 0)
  ) {
    errors.push('technique packs must include at least one telemetry requirement');
  }

  for (const requirement of pack.telemetry_requirements || []) {
    if (!requirement.surface) {
      errors.push('telemetry requirements must include a surface');
    }
    if (!requirement.description) {
      warnings.push(`telemetry requirement ${requirement.surface || '(unknown)'} should include a description`);
    }
    for (const dataset of requirement.datasets || []) {
      if (!runtime.DATASET_KINDS.includes(dataset)) {
        errors.push(`telemetry requirement ${requirement.surface || '(unknown)'} contains unsupported dataset kind: ${dataset}`);
      }
    }
  }

  if (requireComplete && pack.kind === 'technique' && (!Array.isArray(pack.blind_spots) || pack.blind_spots.length === 0)) {
    errors.push('technique packs must include at least one blind spot');
  }

  if (
    requireComplete &&
    pack.kind === 'technique' &&
    (!Array.isArray(pack.execution_targets) || pack.execution_targets.length === 0)
  ) {
    errors.push('technique packs must include at least one execution target');
  }

  for (const target of pack.execution_targets || []) {
    if (!target.name) {
      errors.push('execution targets must include a name');
    }
    if (!target.description) {
      warnings.push(`execution target ${target.name || '(unknown)'} should include a description`);
    }
    if (!target.connector) {
      errors.push(`execution target ${target.name || '(unknown)'} must include a connector`);
    } else if (pack.required_connectors.length > 0 && !pack.required_connectors.includes(target.connector)) {
      errors.push(`execution target ${target.name || '(unknown)'} uses connector ${target.connector} outside required_connectors`);
    }
    if (!target.dataset) {
      errors.push(`execution target ${target.name || '(unknown)'} must include a dataset`);
    } else {
      if (!runtime.DATASET_KINDS.includes(target.dataset)) {
        errors.push(`execution target ${target.name || '(unknown)'} contains unsupported dataset kind: ${target.dataset}`);
      }
      if (pack.supported_datasets.length > 0 && !pack.supported_datasets.includes(target.dataset)) {
        errors.push(`execution target ${target.name || '(unknown)'} uses dataset ${target.dataset} outside supported_datasets`);
      }
    }
    if (!target.query_template) {
      errors.push(`execution target ${target.name || '(unknown)'} must include a query_template`);
    }
  }

  if (requireComplete && !pack.publish.finding_type) {
    errors.push('publish.finding_type is required');
  }

  if (
    requireComplete &&
    (!Array.isArray(pack.publish.expected_outcomes) || pack.publish.expected_outcomes.length === 0)
  ) {
    errors.push('publish.expected_outcomes must include at least one expected outcome');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : String(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  throw new Error('must be a boolean');
}

function coerceParameterValue(parameter, value) {
  switch (parameter.type) {
    case 'string':
      return typeof value === 'string' ? value : String(value);
    case 'integer': {
      const parsed = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isInteger(parsed)) throw new Error('must be an integer');
      return parsed;
    }
    case 'number': {
      const parsed = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(parsed)) throw new Error('must be a number');
      return parsed;
    }
    case 'boolean':
      return coerceBoolean(value);
    case 'string_array':
      if (Array.isArray(value)) {
        return value.map(item => typeof item === 'string' ? item.trim() : String(item)).filter(Boolean);
      }
      return String(value).split(',').map(item => item.trim()).filter(Boolean);
    default:
      throw new Error(`unsupported parameter type ${parameter.type}`);
  }
}

function validateParameterConstraints(parameter, value) {
  if (parameter.enum.length > 0) {
    const values = Array.isArray(value) ? value.map(String) : [String(value)];
    for (const item of values) {
      if (!parameter.enum.includes(item)) {
        throw new Error(`must be one of: ${parameter.enum.join(', ')}`);
      }
    }
  }

  if (parameter.pattern) {
    const regex = new RegExp(parameter.pattern);
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (!regex.test(String(item))) {
        throw new Error(`must match pattern ${parameter.pattern}`);
      }
    }
  }

  if (typeof value === 'number') {
    if (parameter.minimum !== null && value < parameter.minimum) {
      throw new Error(`must be >= ${parameter.minimum}`);
    }
    if (parameter.maximum !== null && value > parameter.maximum) {
      throw new Error(`must be <= ${parameter.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (parameter.min_items !== null && value.length < parameter.min_items) {
      throw new Error(`must have at least ${parameter.min_items} items`);
    }
    if (parameter.max_items !== null && value.length > parameter.max_items) {
      throw new Error(`must have at most ${parameter.max_items} items`);
    }
  }
}

function validatePackParameters(pack, providedParameters = {}, options = {}) {
  const parameters = isPlainObject(providedParameters) ? providedParameters : {};
  const errors = [];
  const warnings = [];
  const normalized = {};

  const allowUnknown = options.allowUnknown === true;
  const knownNames = new Set(pack.parameters.map(parameter => parameter.name));

  for (const [key] of Object.entries(parameters)) {
    if (!knownNames.has(key) && !allowUnknown) {
      errors.push(`Unknown parameter: ${key}`);
    }
  }

  for (const parameter of pack.parameters) {
    const hasProvidedValue = Object.prototype.hasOwnProperty.call(parameters, parameter.name);
    const rawValue = hasProvidedValue ? parameters[parameter.name] : parameter.default;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (parameter.required) {
        errors.push(`Missing required parameter: ${parameter.name}`);
      }
      continue;
    }

    try {
      const coerced = coerceParameterValue(parameter, rawValue);
      validateParameterConstraints(parameter, coerced);
      normalized[parameter.name] = coerced;
    } catch (err) {
      errors.push(`Invalid parameter ${parameter.name}: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parameters: normalized,
  };
}

function collectTemplateParameters(template) {
  if (typeof template !== 'string' || !template) return [];
  const discovered = [];
  const seen = new Set();

  for (const match of template.matchAll(TEMPLATE_PARAMETER_PATTERN)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    discovered.push(name);
  }

  return discovered;
}

function renderPackTemplate(template, parameters = {}, options = {}) {
  const values = isPlainObject(parameters) ? parameters : {};
  const missing = [];
  const keepMissing = options.keepMissing === true;
  const strict = options.strict !== false;

  const rendered = String(template || '').replace(TEMPLATE_PARAMETER_PATTERN, (_, name) => {
    const value = values[name];
    if (value === undefined || value === null || value === '') {
      if (!missing.includes(name)) missing.push(name);
      return keepMissing ? `{{${name}}}` : '';
    }
    return Array.isArray(value) ? value.join(',') : String(value);
  });

  if (strict && missing.length > 0) {
    const err = new Error(`Missing template parameters: ${missing.join(', ')}`);
    err.code = 'PACK_TEMPLATE_PARAMETERS';
    err.missing = missing;
    throw err;
  }

  return {
    rendered,
    missing,
  };
}

function getPackTemplateUsage(pack) {
  const declaredParameters = new Set((pack.parameters || []).map(parameter => parameter.name));
  const usage = {
    hypotheses: [],
    execution_targets: [],
    all: [],
    undeclared: [],
  };

  const all = new Set();
  const undeclared = new Set();

  for (const template of pack.hypothesis_templates || []) {
    const parameters = collectTemplateParameters(template);
    usage.hypotheses.push({ template, parameters });
    for (const name of parameters) {
      all.add(name);
      if (!declaredParameters.has(name)) undeclared.add(name);
    }
  }

  for (const target of pack.execution_targets || []) {
    const parameters = collectTemplateParameters(target.query_template);
    usage.execution_targets.push({
      name: target.name,
      connector: target.connector,
      dataset: target.dataset,
      parameters,
    });
    for (const name of parameters) {
      all.add(name);
      if (!declaredParameters.has(name)) undeclared.add(name);
    }
  }

  usage.all = [...all];
  usage.undeclared = [...undeclared];
  return usage;
}

function getPackValidation(pack, providedParameters = {}) {
  const validation = validatePackParameters(pack, providedParameters);
  const templateUsage = getPackTemplateUsage(pack);
  const missingTemplateParameters = templateUsage.all.filter(name => (
    validation.parameters[name] === undefined ||
    validation.parameters[name] === null ||
    validation.parameters[name] === ''
  ));

  return {
    ...validation,
    template_usage: templateUsage,
    missing_template_parameters: missingTemplateParameters,
  };
}

function buildPackBootstrap(cwd, packId, providedParameters = {}, options = {}) {
  const resolved = resolvePack(cwd, packId, options);
  if (!resolved.pack) {
    const err = new Error(`Pack ${packId} not found`);
    err.code = 'PACK_NOT_FOUND';
    throw err;
  }

  const validation = getPackValidation(resolved.pack, providedParameters);
  const renderedHypotheses = (resolved.pack.hypothesis_templates || []).map(template => (
    renderPackTemplate(template, validation.parameters, { strict: false, keepMissing: true }).rendered
  ));

  const bootstrap = {
    title: `${resolved.pack.title} Case`,
    summary: resolved.pack.description,
    mission: {
      title: resolved.pack.title,
      description: resolved.pack.description,
      attack: resolved.pack.attack,
      required_connectors: resolved.pack.required_connectors,
      supported_datasets: resolved.pack.supported_datasets,
      scope_defaults: cloneObject(resolved.pack.scope_defaults),
    },
    hypotheses: renderedHypotheses,
    success_criteria: mergeUniqueStrings(
      (resolved.pack.publish?.expected_outcomes || []).map(item => `Produce ${item}`),
      (resolved.pack.telemetry_requirements || []).map(item => `Cover ${item.surface}`)
    ),
    blind_spots: cloneObject(resolved.pack.blind_spots || []),
    execution_targets: (resolved.pack.execution_targets || []).map(target => ({
      name: target.name,
      connector: target.connector,
      dataset: target.dataset,
      language: target.language,
      parameters: collectTemplateParameters(target.query_template),
    })),
    phase_seed: [
      {
        name: `Scope ${resolved.pack.title}`,
        goal: 'Confirm telemetry coverage, time window, and focal entities for the selected pack.',
        operations: [
          ...((resolved.pack.telemetry_requirements || []).map(item => item.surface)),
          'scope calibration',
        ],
      },
      {
        name: `Run ${resolved.pack.title}`,
        goal: 'Execute the pack-backed hunt queries and collect receipts.',
        operations: (resolved.pack.execution_targets || []).map(target => `${target.connector}:${target.name}`),
      },
      {
        name: `Validate ${resolved.pack.title} Findings`,
        goal: 'Validate the resulting claims against expected outcomes and blind spots.',
        operations: mergeUniqueStrings(
          resolved.pack.publish?.expected_outcomes || [],
          (resolved.pack.blind_spots || []).slice(0, 2)
        ),
      },
    ],
  };

  return {
    pack: resolved.pack,
    validation,
    parameters: validation.parameters,
    bootstrap,
  };
}

function buildPackExecutionTargets(cwd, packId, providedParameters = {}, options = {}) {
  const resolved = resolvePack(cwd, packId, options);
  if (!resolved.pack) {
    const err = new Error(`Pack ${packId} not found`);
    err.code = 'PACK_NOT_FOUND';
    throw err;
  }

  const validation = getPackValidation(resolved.pack, providedParameters);
  if (!validation.valid) {
    const err = new Error(`Invalid pack parameters: ${validation.errors.join('; ')}`);
    err.code = 'INVALID_PACK_PARAMETERS';
    err.validation = validation;
    throw err;
  }

  if (validation.template_usage.undeclared.length > 0) {
    const err = new Error(
      `Pack ${packId} references undeclared template parameters: ${validation.template_usage.undeclared.join(', ')}`
    );
    err.code = 'PACK_TEMPLATE_PARAMETERS';
    err.validation = validation;
    throw err;
  }

  if (validation.missing_template_parameters.length > 0) {
    const err = new Error(
      `Pack ${packId} is missing parameters required by templates: ${validation.missing_template_parameters.join(', ')}`
    );
    err.code = 'PACK_TEMPLATE_PARAMETERS';
    err.validation = validation;
    throw err;
  }

  const selectedTargets = options.target
    ? (resolved.pack.execution_targets || []).filter(target => target.name === options.target)
    : (resolved.pack.execution_targets || []);

  if (selectedTargets.length === 0) {
    const err = new Error(
      options.target
        ? `Pack ${packId} has no execution target named ${options.target}`
        : `Pack ${packId} has no execution targets`
    );
    err.code = 'PACK_TARGET_NOT_FOUND';
    throw err;
  }

  const timeWindow = options.start || options.end
    ? {
        start: options.start,
        end: options.end,
      }
    : {
        ...(isPlainObject(resolved.pack.scope_defaults?.time_window) ? resolved.pack.scope_defaults.time_window : {}),
        ...(options.lookback_minutes ? { lookback_minutes: options.lookback_minutes } : {}),
        ...(options.lookback_hours ? { lookback_minutes: options.lookback_hours * 60 } : {}),
      };

  const targets = selectedTargets.map(target => {
    const renderedQuery = renderPackTemplate(target.query_template, validation.parameters, { strict: true });
    const querySpec = runtime.createQuerySpec({
      connector: {
        id: target.connector,
        profile: options.profile || 'default',
        tenant: options.tenant || null,
        region: options.region || null,
      },
      dataset: {
        kind: target.dataset,
      },
      time_window: timeWindow,
      parameters: validation.parameters,
      pagination: {
        mode: options.pagination_mode || 'auto',
        limit: options.limit,
        max_pages: options.max_pages,
      },
      execution: {
        profile: options.profile || 'default',
        timeout_ms: options.timeout_ms,
        max_retries: options.max_retries,
        backoff_ms: options.backoff_ms,
        consistency: options.consistency || resolved.pack.execution_defaults?.consistency,
        dry_run: options.dry_run === true,
      },
      query: {
        language: target.language || 'native',
        statement: renderedQuery.rendered,
      },
      evidence: {
        hypothesis_ids: resolved.pack.hypothesis_ids,
        tags: mergeUniqueStrings(
          resolved.pack.publish?.receipt_tags || [],
          [`pack:${resolved.pack.id}`, `target:${target.name}`]
        ),
        receipt_policy: options.receipt_policy || resolved.pack.execution_defaults?.receipt_policy,
      },
    });

    return {
      name: target.name,
      connector: target.connector,
      dataset: target.dataset,
      language: target.language || 'native',
      query_spec: querySpec,
      query_template_parameters: collectTemplateParameters(target.query_template),
    };
  });

  return {
    pack: resolved.pack,
    validation,
    parameters: validation.parameters,
    targets,
  };
}

function attachPackSource(pack, source, cwd, filePath) {
  const relativePath = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return {
    ...pack,
    source,
    path: relativePath.replace(/\\/g, '/'),
  };
}

function mergePackDefinitions(basePack, overlayPack) {
  const merged = {
    ...cloneObject(basePack),
    ...cloneObject(overlayPack),
    version: overlayPack.version || basePack.version,
    id: overlayPack.id || basePack.id,
    kind: overlayPack.kind || basePack.kind,
    title: overlayPack.title || basePack.title,
    description: overlayPack.description || basePack.description,
    stability: overlayPack.stability || basePack.stability,
    metadata: mergeObjects(basePack.metadata, overlayPack.metadata),
    extends: sanitizeStringArray(overlayPack.extends),
    attack: mergeUniqueStrings(basePack.attack, overlayPack.attack),
    hypothesis_ids: mergeUniqueStrings(basePack.hypothesis_ids, overlayPack.hypothesis_ids),
    hypothesis_templates: mergeUniqueStrings(basePack.hypothesis_templates, overlayPack.hypothesis_templates),
    required_connectors: mergeUniqueStrings(basePack.required_connectors, overlayPack.required_connectors),
    supported_datasets: mergeUniqueStrings(basePack.supported_datasets, overlayPack.supported_datasets),
    parameters: mergeNamedItems(basePack.parameters, overlayPack.parameters, 'name'),
    telemetry_requirements: mergeNamedItems(basePack.telemetry_requirements, overlayPack.telemetry_requirements, 'surface'),
    blind_spots: mergeUniqueStrings(basePack.blind_spots, overlayPack.blind_spots),
    execution_targets: mergeNamedItems(basePack.execution_targets, overlayPack.execution_targets, 'name'),
    scope_defaults: mergeObjects(basePack.scope_defaults, overlayPack.scope_defaults),
    execution_defaults: mergeObjects(basePack.execution_defaults, overlayPack.execution_defaults),
    examples: {
      parameters: mergeObjects(basePack.examples?.parameters, overlayPack.examples?.parameters),
      notes: mergeUniqueStrings(basePack.examples?.notes, overlayPack.examples?.notes),
    },
    publish: {
      finding_type: overlayPack.publish?.finding_type || basePack.publish?.finding_type || null,
      expected_outcomes: mergeUniqueStrings(
        basePack.publish?.expected_outcomes,
        overlayPack.publish?.expected_outcomes
      ),
      receipt_tags: mergeUniqueStrings(basePack.publish?.receipt_tags, overlayPack.publish?.receipt_tags),
    },
    notes: mergeUniqueStrings(basePack.notes, overlayPack.notes),
    source: overlayPack.source || basePack.source,
    path: overlayPack.path || basePack.path,
    composed_from: mergeUniqueStrings(basePack.composed_from || [basePack.id], overlayPack.composed_from || [overlayPack.id]),
  };

  return merged;
}

function resolvePackMap(packMap, options = {}) {
  const connectorRegistry = options.connectorRegistry || null;
  const cache = new Map();

  function resolveOne(packId, stack = []) {
    if (cache.has(packId)) return cache.get(packId);

    const pack = packMap.get(packId);
    if (!pack) {
      const err = new Error(`Pack ${packId} not found while resolving composition`);
      err.code = 'PACK_NOT_FOUND';
      throw err;
    }

    if (stack.includes(packId)) {
      const err = new Error(`Pack composition cycle detected: ${[...stack, packId].join(' -> ')}`);
      err.code = 'PACK_COMPOSITION_CYCLE';
      throw err;
    }

    let resolved = cloneObject(pack);
    let composedFrom = [pack.id];

    for (const parentId of pack.extends || []) {
      const parent = resolveOne(parentId, [...stack, packId]);
      resolved = mergePackDefinitions(parent, resolved);
      composedFrom = mergeUniqueStrings(composedFrom, parent.composed_from || [parent.id]);
    }

    resolved.extends = sanitizeStringArray(pack.extends);
    resolved.composed_from = mergeUniqueStrings(composedFrom, [pack.id]);

    const validation = validatePackDefinition(resolved, { connectorRegistry, requireComplete: true });
    if (!validation.valid) {
      const err = new Error(`Invalid composed pack ${pack.id}: ${validation.errors.join('; ')}`);
      err.code = 'INVALID_COMPOSED_PACK';
      err.validation = validation;
      throw err;
    }

    cache.set(packId, resolved);
    return resolved;
  }

  for (const packId of packMap.keys()) {
    resolveOne(packId);
  }

  return cache;
}

function loadPackRegistry(cwd, options = {}) {
  const registryPaths = getPackRegistryPaths(cwd, options);
  const connectorRegistry = options.connectorRegistry || runtime.createBuiltInConnectorRegistry();
  const packMap = new Map();
  const overrides = [];
  const warnings = [];

  const sources = [
    { name: 'built_in', dir: registryPaths.built_in },
    { name: 'local', dir: registryPaths.local },
  ];

  // Load additional directories from pack_registries config
  if (!options.skipExtraRegistries) {
    const configPath = path.join(cwd, PLANNING_DIR_NAME, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const registries = Array.isArray(config.pack_registries) ? config.pack_registries : [];
        for (const reg of registries) {
          if (!reg.name || !reg.type || !reg.path) continue;
          if (reg.type === 'git') {
            // Git-based registries require cloning -- stub with warning
            warnings.push(`pack_registry "${reg.name}": git-based registries are not yet supported (url: ${reg.url}). Clone the repo locally and use type: "local" instead.`);
            continue;
          }
          if (reg.type === 'local') {
            const resolvedPath = path.isAbsolute(reg.path) ? reg.path : path.join(cwd, reg.path);
            if (fs.existsSync(resolvedPath)) {
              sources.push({ name: reg.name, dir: resolvedPath });
            }
          }
        }
      } catch (_err) {
        // config.json parse error -- ignore silently
      }
    }
  }

  for (const source of sources) {
    const files = discoverPackFiles(source.dir);
    for (const file of files) {
      const rawPack = readPackJson(file);
      const pack = attachPackSource(
        createPackDefinition(rawPack, { connectorRegistry, allowPartial: true }),
        source.name,
        cwd,
        file
      );
      const existing = packMap.get(pack.id);

      if (!existing) {
        packMap.set(pack.id, pack);
        continue;
      }

      if (existing.source === 'built_in' && source.name === 'local') {
        overrides.push({
          id: pack.id,
          replaces: existing.path,
          replacement: pack.path,
        });
        packMap.set(pack.id, pack);
        continue;
      }

      const err = new Error(`Duplicate pack id ${pack.id} in ${existing.path} and ${pack.path}`);
      err.code = 'DUPLICATE_PACK_ID';
      throw err;
    }
  }

  const resolvedPackMap = resolvePackMap(packMap, { connectorRegistry });

  // Check for deprecated packs
  for (const pack of resolvedPackMap.values()) {
    if (pack.stability === 'deprecated') {
      const replacedBy = pack.metadata?.replaced_by;
      const msg = replacedBy
        ? `Pack "${pack.id}" is deprecated. Replaced by: ${replacedBy}`
        : `Pack "${pack.id}" is deprecated.`;
      warnings.push(msg);
    }
  }

  const packs = [...resolvedPackMap.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.id.localeCompare(b.id);
  });

  return {
    packs,
    overrides,
    warnings,
    paths: registryPaths,
  };
}

function resolvePack(cwd, packId, options = {}) {
  const registry = loadPackRegistry(cwd, options);
  const pack = registry.packs.find(item => item.id === packId) || null;
  return { pack, registry };
}

function getPackFolderForKind(kind) {
  switch (kind) {
    case 'technique': return 'techniques';
    case 'domain': return 'domains';
    case 'family': return 'families';
    case 'campaign': return 'campaigns';
    case 'custom':
    case 'example':
    default:
      return 'custom';
  }
}

function generateTestFixture(pack) {
  const exampleParameters = pack.examples?.parameters || {};
  const hasExamples = isPlainObject(exampleParameters) && Object.keys(exampleParameters).length > 0;

  return {
    pack_id: pack.id,
    parameters: hasExamples ? { ...exampleParameters } : {},
    expected: {
      bootstrap_ok: true,
      render_ok: pack.execution_targets.length > 0,
      target_count: pack.execution_targets.length,
      template_parameters_resolved: true,
      no_undeclared_parameters: true,
    },
  };
}

function generateTestFile(pack) {
  const slug = pack.id.includes('.') ? pack.id.split('.').slice(1).join('-') : pack.id;
  return `'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const packLib = require(path.join(__dirname, '..', '..', 'thrunt-god', 'bin', 'lib', 'pack.cjs'));

describe('${pack.id}', () => {
  const fixture = require('./${slug}.fixture.json');
  const cwd = path.join(__dirname, '..', '..');

  test('pack loads from registry', () => {
    const registry = packLib.loadPackRegistry(cwd);
    const pack = registry.packs.find(p => p.id === fixture.pack_id);
    assert.ok(pack, 'Pack should be in registry');
  });

  test('bootstrap succeeds with example parameters', () => {
    const result = packLib.buildPackBootstrap(cwd, fixture.pack_id, fixture.parameters);
    assert.ok(result.bootstrap, 'Bootstrap should succeed');
  });

  test('execution targets render with example parameters', () => {
    const result = packLib.buildPackExecutionTargets(
      cwd, fixture.pack_id, fixture.parameters, { profile: 'default' }
    );
    assert.strictEqual(result.targets.length, fixture.expected.target_count);
  });

  test('no undeclared template parameters', () => {
    const registry = packLib.loadPackRegistry(cwd);
    const pack = registry.packs.find(p => p.id === fixture.pack_id);
    const usage = packLib.getPackTemplateUsage(pack);
    assert.deepStrictEqual(usage.undeclared, []);
  });
});
`;
}

function writeTestArtifacts(cwd, pack) {
  const slug = pack.id.includes('.') ? pack.id.split('.').slice(1).join('-') : pack.id;
  const testsDir = path.join(cwd, PLANNING_DIR_NAME, 'packs', 'tests');
  fs.mkdirSync(testsDir, { recursive: true });

  const fixture = generateTestFixture(pack);
  const fixturePath = path.join(testsDir, `${slug}.fixture.json`);
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n');

  const testContent = generateTestFile(pack);
  const testPath = path.join(testsDir, `${slug}.test.cjs`);
  fs.writeFileSync(testPath, testContent);

  return {
    fixture_path: path.relative(cwd, fixturePath),
    test_path: path.relative(cwd, testPath),
  };
}

function getMockResponseDir() {
  return path.join(__dirname, '..', '..', 'data', 'mock-responses');
}

function loadMockResponse(connectorId) {
  const mockDir = getMockResponseDir();
  const filePath = path.join(mockDir, `${connectorId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

module.exports = {
  PACK_SCHEMA_VERSION,
  PACK_KINDS,
  PACK_STABILITIES,
  PACK_PARAMETER_TYPES,
  getBuiltInPackRegistryDir,
  getProjectPackRegistryDir,
  getPackRegistryPaths,
  discoverPackFiles,
  createPackDefinition,
  validatePackDefinition,
  validatePackParameters,
  collectTemplateParameters,
  renderPackTemplate,
  getPackTemplateUsage,
  getPackValidation,
  buildPackBootstrap,
  buildPackExecutionTargets,
  mergePackDefinitions,
  loadPackRegistry,
  resolvePack,
  getPackFolderForKind,
  generateTestFixture,
  generateTestFile,
  writeTestArtifacts,
  getMockResponseDir,
  loadMockResponse,
};
