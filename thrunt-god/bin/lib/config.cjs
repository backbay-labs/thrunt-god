/**
 * Config — Planning config CRUD operations
 */

const fs = require('fs');
const path = require('path');
const { output, error, planningRoot } = require('./core.cjs');
const { validateAuthProfile } = require('./runtime.cjs');
const {
  VALID_PROFILES,
  getAgentToModelMapForProfile,
  formatAgentToModelMapAsTable,
} = require('./model-profiles.cjs');

const VALID_CONFIG_KEYS = new Set([
  'mode', 'granularity', 'parallelization', 'commit_docs', 'model_profile',
  'resolve_model_ids', 'context_window',
  'search_gitignored', 'brave_search', 'firecrawl', 'exa_search',
  'workflow.research', 'workflow.plan_check', 'workflow.validator',
  'workflow.nyquist_validation', 'workflow.ui_phase', 'workflow.ui_safety_gate',
  'workflow.auto_advance', 'workflow.node_repair', 'workflow.node_repair_budget',
  'workflow.text_mode',
  'workflow.research_before_questions',
  'workflow.discuss_mode',
  'workflow.skip_discuss',
  'workflow._auto_chain_active',
  'git.branching_strategy', 'git.phase_branch_template', 'git.milestone_branch_template', 'git.quick_branch_template',
  'planning.commit_docs', 'planning.search_gitignored',
  'hooks.context_warnings', 'hooks.workflow_guard',
  'connector_profiles',
]);

/**
 * Check whether a config key path is valid.
 * Supports exact matches from VALID_CONFIG_KEYS plus dynamic patterns
 * like `agent_skills.<agent-type>` where the sub-key is freeform.
 */
function isValidConfigKey(keyPath) {
  if (VALID_CONFIG_KEYS.has(keyPath)) return true;
  // Allow agent_skills.<agent-type> with any agent type string
  if (/^agent_skills\.[a-zA-Z0-9_-]+$/.test(keyPath)) return true;
  // Allow connector_profiles.<connector-id>.<profile-name> as full profile writes
  if (/^connector_profiles\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(keyPath)) return true;
  return false;
}

const CONFIG_KEY_SUGGESTIONS = {
  'workflow.nyquist_validation_enabled': 'workflow.nyquist_validation',
  'agents.nyquist_validation_enabled': 'workflow.nyquist_validation',
  'nyquist.validation_enabled': 'workflow.nyquist_validation',
  'hooks.research_questions': 'workflow.research_before_questions',
  'workflow.research_questions': 'workflow.research_before_questions',
  'workflow.verifier': 'workflow.validator',
  'verifier': 'workflow.validator',
};

function validateKnownConfigKeyPath(keyPath) {
  const suggested = CONFIG_KEY_SUGGESTIONS[keyPath];
  if (suggested) {
    error(`Unknown config key: ${keyPath}. Did you mean ${suggested}?`);
  }
}

const CONFIG_VALUE_RULES = {
  mode: { type: 'enum', values: ['interactive', 'yolo'] },
  granularity: { type: 'enum', values: ['coarse', 'standard', 'fine'] },
  parallelization: { type: 'boolean' },
  commit_docs: { type: 'boolean' },
  model_profile: { type: 'enum', values: VALID_PROFILES },
  resolve_model_ids: { type: 'enum', values: [false, true, 'omit'] },
  context_window: { type: 'number', integer: true, min: 1 },
  search_gitignored: { type: 'boolean' },
  brave_search: { type: 'boolean' },
  firecrawl: { type: 'boolean' },
  exa_search: { type: 'boolean' },
  'workflow.research': { type: 'boolean' },
  'workflow.plan_check': { type: 'boolean' },
  'workflow.validator': { type: 'boolean' },
  'workflow.nyquist_validation': { type: 'boolean' },
  'workflow.ui_phase': { type: 'boolean' },
  'workflow.ui_safety_gate': { type: 'boolean' },
  'workflow.auto_advance': { type: 'boolean' },
  'workflow.node_repair': { type: 'boolean' },
  'workflow.node_repair_budget': { type: 'number', integer: true, min: 0 },
  'workflow.text_mode': { type: 'boolean' },
  'workflow.research_before_questions': { type: 'boolean' },
  'workflow.discuss_mode': { type: 'enum', values: ['discuss', 'assumptions'] },
  'workflow.skip_discuss': { type: 'boolean' },
  'workflow._auto_chain_active': { type: 'boolean' },
  'git.branching_strategy': { type: 'enum', values: ['none', 'phase', 'milestone'] },
  'planning.commit_docs': { type: 'boolean' },
  'planning.search_gitignored': { type: 'boolean' },
  'hooks.context_warnings': { type: 'boolean' },
  'hooks.workflow_guard': { type: 'boolean' },
};

function normalizeLegacyConfigSchema(config) {
  if (!config || typeof config !== 'object') return false;

  let changed = false;

  if (Object.prototype.hasOwnProperty.call(config, 'verifier')) {
    if (!Object.prototype.hasOwnProperty.call(config, 'validator')) {
      config.validator = config.verifier;
    }
    delete config.verifier;
    changed = true;
  }

  if (config.workflow && typeof config.workflow === 'object') {
    if (Object.prototype.hasOwnProperty.call(config.workflow, 'verifier')) {
      if (!Object.prototype.hasOwnProperty.call(config.workflow, 'validator')) {
        config.workflow.validator = config.workflow.verifier;
      }
      delete config.workflow.verifier;
      changed = true;
    }

    if (config.workflow.discuss_mode === 'standard') {
      config.workflow.discuss_mode = 'discuss';
      changed = true;
    }
  }

  return changed;
}

function normalizeLegacyChoiceSchema(choices) {
  if (!choices || typeof choices !== 'object') return;

  if (Object.prototype.hasOwnProperty.call(choices, 'verifier')) {
    error('Legacy config key "verifier" is no longer supported in config-new-program. Use "workflow.validator" instead.');
  }

  if (choices.workflow && typeof choices.workflow === 'object') {
    if (Object.prototype.hasOwnProperty.call(choices.workflow, 'verifier')) {
      error('Legacy config key "workflow.verifier" is no longer supported in config-new-program. Use "workflow.validator" instead.');
    }

    if (choices.workflow.discuss_mode === 'standard') {
      choices.workflow.discuss_mode = 'discuss';
    }
  }
}

function formatValidValues(values) {
  return values.map(v => JSON.stringify(v)).join(', ');
}

function normalizeAndValidateConfigValue(keyPath, value) {
  if (/^connector_profiles\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(keyPath)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      error(`Invalid value for ${keyPath}: expected object auth profile, received ${JSON.stringify(value)}`);
    }
    const [, connectorId, profileName] = keyPath.split('.');
    const validation = validateAuthProfile({
      name: profileName,
      connector_id: connectorId,
      ...value,
    });
    if (!validation.valid) {
      error(`Invalid value for ${keyPath}: ${validation.errors.join('; ')}`);
    }
    return value;
  }

  if (keyPath === 'workflow.discuss_mode' && value === 'standard') {
    value = 'discuss';
  }

  const rule = CONFIG_VALUE_RULES[keyPath];
  if (!rule) return value;

  if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') {
      error(`Invalid value for ${keyPath}: expected boolean, received ${JSON.stringify(value)}`);
    }
    return value;
  }

  if (rule.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      error(`Invalid value for ${keyPath}: expected number, received ${JSON.stringify(value)}`);
    }
    if (rule.integer && !Number.isInteger(value)) {
      error(`Invalid value for ${keyPath}: expected integer, received ${JSON.stringify(value)}`);
    }
    if (rule.min !== undefined && value < rule.min) {
      error(`Invalid value for ${keyPath}: expected value >= ${rule.min}, received ${JSON.stringify(value)}`);
    }
    return value;
  }

  if (rule.type === 'enum') {
    if (!rule.values.includes(value)) {
      error(`Invalid value for ${keyPath}: ${JSON.stringify(value)}. Valid values: ${formatValidValues(rule.values)}`);
    }
    return value;
  }

  return value;
}

function validateMaterializedConfig(config) {
  const checks = [
    ['mode', config.mode],
    ['granularity', config.granularity],
    ['parallelization', config.parallelization],
    ['commit_docs', config.commit_docs],
    ['model_profile', config.model_profile],
    ['resolve_model_ids', config.resolve_model_ids],
    ['context_window', config.context_window],
    ['search_gitignored', config.search_gitignored],
    ['brave_search', config.brave_search],
    ['firecrawl', config.firecrawl],
    ['exa_search', config.exa_search],
    ['workflow.research', config.workflow?.research],
    ['workflow.plan_check', config.workflow?.plan_check],
    ['workflow.validator', config.workflow?.validator],
    ['workflow.nyquist_validation', config.workflow?.nyquist_validation],
    ['workflow.ui_phase', config.workflow?.ui_phase],
    ['workflow.ui_safety_gate', config.workflow?.ui_safety_gate],
    ['workflow.auto_advance', config.workflow?.auto_advance],
    ['workflow.node_repair', config.workflow?.node_repair],
    ['workflow.node_repair_budget', config.workflow?.node_repair_budget],
    ['workflow.text_mode', config.workflow?.text_mode],
    ['workflow.research_before_questions', config.workflow?.research_before_questions],
    ['workflow.discuss_mode', config.workflow?.discuss_mode],
    ['workflow.skip_discuss', config.workflow?.skip_discuss],
    ['git.branching_strategy', config.git?.branching_strategy],
    ['planning.commit_docs', config.planning?.commit_docs],
    ['planning.search_gitignored', config.planning?.search_gitignored],
    ['hooks.context_warnings', config.hooks?.context_warnings],
    ['hooks.workflow_guard', config.hooks?.workflow_guard],
  ];

  for (const [keyPath, value] of checks) {
    if (value !== undefined) {
      normalizeAndValidateConfigValue(keyPath, value);
    }
  }

  if (config.connector_profiles !== undefined) {
    if (!config.connector_profiles || typeof config.connector_profiles !== 'object' || Array.isArray(config.connector_profiles)) {
      error('Invalid value for connector_profiles: expected object');
    }

    for (const [connectorId, profiles] of Object.entries(config.connector_profiles)) {
      if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
        error(`Invalid value for connector_profiles.${connectorId}: expected object of profiles`);
      }

      for (const [profileName, profile] of Object.entries(profiles)) {
        normalizeAndValidateConfigValue(`connector_profiles.${connectorId}.${profileName}`, profile);
      }
    }
  }
}

/**
 * Build a fully-materialized config object for a new program.
 *
 * Merges (increasing priority):
 *   1. Hardcoded defaults — every key that loadConfig() resolves, plus mode/granularity
 *   2. User-level defaults from ~/.thrunt/defaults.json (if present)
 *   3. userChoices — the settings the user explicitly selected during /hunt:new-program
 *
 * Uses the canonical `git` namespace for branching keys (consistent with VALID_CONFIG_KEYS
 * and the settings workflow). loadConfig() handles both flat and nested formats, so this
 * is compatible with existing projects that have flat keys.
 *
 * Returns a plain object — does NOT write any files.
 */
function buildNewProgramConfig(userChoices) {
  const choices = userChoices || {};
  const homedir = require('os').homedir();

  // Detect API key availability
  const braveKeyFile = path.join(homedir, '.thrunt', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));
  const firecrawlKeyFile = path.join(homedir, '.thrunt', 'firecrawl_api_key');
  const hasFirecrawl = !!(process.env.FIRECRAWL_API_KEY || fs.existsSync(firecrawlKeyFile));
  const exaKeyFile = path.join(homedir, '.thrunt', 'exa_api_key');
  const hasExaSearch = !!(process.env.EXA_API_KEY || fs.existsSync(exaKeyFile));

  // Load user-level defaults from ~/.thrunt/defaults.json if available
  const globalDefaultsPath = path.join(homedir, '.thrunt', 'defaults.json');
  let userDefaults = {};
  try {
    if (fs.existsSync(globalDefaultsPath)) {
      let shouldRewriteDefaults = false;
      userDefaults = JSON.parse(fs.readFileSync(globalDefaultsPath, 'utf-8'));
      // Migrate deprecated "depth" key to "granularity"
      if ('depth' in userDefaults && !('granularity' in userDefaults)) {
        const depthToGranularity = { quick: 'coarse', standard: 'standard', comprehensive: 'fine' };
        userDefaults.granularity = depthToGranularity[userDefaults.depth] || userDefaults.depth;
        delete userDefaults.depth;
        shouldRewriteDefaults = true;
      }
      if (normalizeLegacyConfigSchema(userDefaults)) {
        shouldRewriteDefaults = true;
      }
      if (shouldRewriteDefaults) {
        try {
          fs.writeFileSync(globalDefaultsPath, JSON.stringify(userDefaults, null, 2), 'utf-8');
        } catch { /* intentionally empty */ }
      }
    }
  } catch {
    // Ignore malformed global defaults
  }

  normalizeLegacyChoiceSchema(choices);

  const hardcoded = {
    model_profile: 'balanced',
    commit_docs: true,
    parallelization: true,
    search_gitignored: false,
    brave_search: hasBraveSearch,
    firecrawl: hasFirecrawl,
    exa_search: hasExaSearch,
    git: {
      branching_strategy: 'none',
      phase_branch_template: 'thrunt/phase-{phase}-{slug}',
      milestone_branch_template: 'thrunt/{milestone}-{slug}',
      quick_branch_template: null,
    },
    workflow: {
      research: true,
      plan_check: true,
      validator: true,
      nyquist_validation: true,
      auto_advance: false,
      node_repair: true,
      node_repair_budget: 2,
      ui_phase: true,
      ui_safety_gate: true,
      text_mode: false,
      research_before_questions: false,
      discuss_mode: 'discuss',
      skip_discuss: false,
    },
    hooks: {
      context_warnings: true,
    },
    connector_profiles: {},
    agent_skills: {},
  };

  // Three-level deep merge: hardcoded <- userDefaults <- choices
  const config = {
    ...hardcoded,
    ...userDefaults,
    ...choices,
    git: {
      ...hardcoded.git,
      ...(userDefaults.git || {}),
      ...(choices.git || {}),
    },
    workflow: {
      ...hardcoded.workflow,
      ...(userDefaults.workflow || {}),
      ...(choices.workflow || {}),
    },
    hooks: {
      ...hardcoded.hooks,
      ...(userDefaults.hooks || {}),
      ...(choices.hooks || {}),
    },
    connector_profiles: {
      ...hardcoded.connector_profiles,
      ...(userDefaults.connector_profiles || {}),
      ...(choices.connector_profiles || {}),
    },
    agent_skills: {
      ...hardcoded.agent_skills,
      ...(userDefaults.agent_skills || {}),
      ...(choices.agent_skills || {}),
    },
  };

  validateMaterializedConfig(config);
  return config;
}

/**
 * Command: create a fully-materialized .planning/config.json for a new program.
 *
 * Accepts user-chosen settings as a JSON string (the keys the user explicitly
 * configured during /hunt:new-program). All remaining keys are filled from
 * hardcoded defaults and optional ~/.thrunt/defaults.json.
 *
 * Idempotent: if config.json already exists, returns { created: false }.
 */
function cmdConfigNewProgram(cwd, choicesJson, raw) {
  const planningBase = planningRoot(cwd);
  const configPath = path.join(planningBase, 'config.json');

  // Idempotent: don't overwrite existing config
  if (fs.existsSync(configPath)) {
    output({ created: false, reason: 'already_exists' }, raw, 'exists');
    return;
  }

  // Parse user choices
  let userChoices = {};
  if (choicesJson && choicesJson.trim() !== '') {
    try {
      userChoices = JSON.parse(choicesJson);
    } catch (err) {
      error('Invalid JSON for config-new-program: ' + err.message);
    }
  }

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningBase)) {
      fs.mkdirSync(planningBase, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  const config = buildNewProgramConfig(userChoices);

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    output({ created: true, path: '.planning/config.json' }, raw, 'created');
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}

/**
 * Ensures the config file exists (creates it if needed).
 *
 * Does not call `output()`, so can be used as one step in a command without triggering `exit(0)` in
 * the happy path. But note that `error()` will still `exit(1)` out of the process.
 */
function ensureConfigFile(cwd) {
  const planningBase = planningRoot(cwd);
  const configPath = path.join(planningBase, 'config.json');

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningBase)) {
      fs.mkdirSync(planningBase, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    return { created: false, reason: 'already_exists' };
  }

  const config = buildNewProgramConfig({});

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { created: true, path: '.planning/config.json' };
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

/**
 * Command to ensure the config file exists (creates it if needed).
 *
 * Note that this exits the process (via `output()`) even in the happy path; use
 * `ensureConfigFile()` directly if you need to avoid this.
 */
function cmdConfigEnsureSection(cwd, raw) {
  const ensureConfigFileResult = ensureConfigFile(cwd);
  if (ensureConfigFileResult.created) {
    output(ensureConfigFileResult, raw, 'created');
  } else {
    output(ensureConfigFileResult, raw, 'exists');
  }
}

/**
 * Sets a value in the config file, allowing nested values via dot notation (e.g.,
 * "workflow.research").
 *
 * Does not call `output()`, so can be used as one step in a command without triggering `exit(0)` in
 * the happy path. But note that `error()` will still `exit(1)` out of the process.
 */
function setConfigValue(cwd, keyPath, parsedValue) {
  const configPath = path.join(planningRoot(cwd), 'config.json');

  // Load existing config or start with empty object
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    error('Failed to read config.json: ' + err.message);
  }

  // Set nested value using dot notation (e.g., "workflow.research")
  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  const previousValue = current[keys[keys.length - 1]]; // Capture previous value before overwriting
  current[keys[keys.length - 1]] = parsedValue;

  // Write back
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { updated: true, key: keyPath, value: parsedValue, previousValue };
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}

/**
 * Command to set a value in the config file, allowing nested values via dot notation (e.g.,
 * "workflow.research").
 *
 * Note that this exits the process (via `output()`) even in the happy path; use `setConfigValue()`
 * directly if you need to avoid this.
 */
function cmdConfigSet(cwd, keyPath, value, raw) {
  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }

  validateKnownConfigKeyPath(keyPath);

  if (!isValidConfigKey(keyPath)) {
    error(`Unknown config key: "${keyPath}". Valid keys: ${[...VALID_CONFIG_KEYS].sort().join(', ')}, agent_skills.<agent-type>`);
  }

  // Parse value (handle booleans, numbers, and JSON arrays/objects)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);
  else if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
    try { parsedValue = JSON.parse(value); } catch { /* keep as string */ }
  }

  parsedValue = normalizeAndValidateConfigValue(keyPath, parsedValue);

  const setConfigValueResult = setConfigValue(cwd, keyPath, parsedValue);
  output(setConfigValueResult, raw, `${keyPath}=${parsedValue}`);
}

function cmdConfigGet(cwd, keyPath, raw) {
  const configPath = path.join(planningRoot(cwd), 'config.json');

  if (!keyPath) {
    error('Usage: config-get <key.path>');
  }

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      error('No config.json found at ' + configPath);
    }
  } catch (err) {
    if (err.message.startsWith('No config.json')) throw err;
    error('Failed to read config.json: ' + err.message);
  }

  // Traverse dot-notation path (e.g., "workflow.auto_advance")
  const keys = keyPath.split('.');
  let current = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      error(`Key not found: ${keyPath}`);
    }
    current = current[key];
  }

  if (current === undefined) {
    error(`Key not found: ${keyPath}`);
  }

  output(current, raw, String(current));
}

/**
 * Command to set the model profile in the config file.
 *
 * Note that this exits the process (via `output()`) even in the happy path.
 */
function cmdConfigSetModelProfile(cwd, profile, raw) {
  if (!profile) {
    error(`Usage: config-set-model-profile <${VALID_PROFILES.join('|')}>`);
  }

  const normalizedProfile = profile.toLowerCase().trim();
  if (!VALID_PROFILES.includes(normalizedProfile)) {
    error(`Invalid profile '${profile}'. Valid profiles: ${VALID_PROFILES.join(', ')}`);
  }

  // Ensure config exists (create if needed)
  ensureConfigFile(cwd);

  // Set the model profile in the config
  const { previousValue } = setConfigValue(cwd, 'model_profile', normalizedProfile, raw);
  const previousProfile = previousValue || 'balanced';

  // Build result value / message and return
  const agentToModelMap = getAgentToModelMapForProfile(normalizedProfile);
  const result = {
    updated: true,
    profile: normalizedProfile,
    previousProfile,
    agentToModelMap,
  };
  const rawValue = getCmdConfigSetModelProfileResultMessage(
    normalizedProfile,
    previousProfile,
    agentToModelMap
  );
  output(result, raw, rawValue);
}

/**
 * Returns the message to display for the result of the `config-set-model-profile` command when
 * displaying raw output.
 */
function getCmdConfigSetModelProfileResultMessage(
  normalizedProfile,
  previousProfile,
  agentToModelMap
) {
  const agentToModelTable = formatAgentToModelMapAsTable(agentToModelMap);
  const didChange = previousProfile !== normalizedProfile;
  const paragraphs = didChange
    ? [
        `✓ Model profile set to: ${normalizedProfile} (was: ${previousProfile})`,
        'Agents will now use:',
        agentToModelTable,
        'Next spawned agents will use the new profile.',
      ]
    : [
        `✓ Model profile is already set to: ${normalizedProfile}`,
        'Agents are using:',
        agentToModelTable,
      ];
  return paragraphs.join('\n\n');
}

module.exports = {
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigGet,
  cmdConfigSetModelProfile,
  cmdConfigNewProgram,
};
