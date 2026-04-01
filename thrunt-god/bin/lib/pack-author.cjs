/**
 * Pack Author — Interactive 8-step pack authoring engine.
 *
 * Provides both an interactive flow (runPackAuthor) and a non-interactive
 * flag-based builder (buildPackFromFlags) for creating hunt packs.
 *
 * Entry point: `thrunt pack create`
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createInterface } = require('node:readline/promises');

const packLib = require('./pack.cjs');
const mitreData = require('./mitre-data.cjs');
const queryStarters = require('./query-starters.cjs');

// ─── Constants ───────────────────────────────────────────────────────────────

const HYPOTHESIS_QUALITY_WORDS = [
  'is', 'are', 'was', 'were', 'indicates', 'suggests', 'compromised',
  'used', 'using', 'modifying', 'accessing', 'executing', 'exploiting',
  'abusing', 'leveraging', 'targeting', 'attempting', 'performing',
  'conducting', 'establishing', 'creating', 'deleting', 'moving',
  'escalating', 'exfiltrating', 'persisting', 'evading', 'discovering',
  'collecting',
];

const DATASET_KINDS = [
  'events', 'alerts', 'entities', 'identity',
  'endpoint', 'cloud', 'email', 'other',
];

const CONNECTOR_LANGUAGES = {
  splunk: 'spl',
  elastic: 'esql',
  sentinel: 'kql',
  opensearch: 'sql',
  defender_xdr: 'kql',
  crowdstrike: 'fql',
  okta: 'api',
  m365: 'odata',
  aws: 'api',
  gcp: 'logging-filter',
};

const CONNECTOR_DESCRIPTIONS = {
  splunk: 'SPL queries against indexed data',
  elastic: 'ES|QL / EQL against Elastic',
  sentinel: 'KQL against Log Analytics',
  opensearch: 'SQL / DSL queries',
  defender_xdr: 'Advanced Hunting KQL',
  crowdstrike: 'Falcon Query Language',
  okta: 'Okta System Log API',
  m365: 'Microsoft Graph API',
  aws: 'AWS CloudTrail/CloudWatch',
  gcp: 'Cloud Logging filter',
};

const CONNECTOR_IDS = Object.keys(CONNECTOR_LANGUAGES);

const PACK_KIND_DESCRIPTIONS = {
  technique: 'Maps to a single MITRE ATT&CK technique',
  domain: 'Composes techniques and foundations for a threat domain',
  family: 'Cross-domain campaign playbook (extends multiple domain packs)',
  campaign: 'Focused investigation for a specific threat campaign',
  custom: 'Freeform pack for specialized use cases',
};

const TEMPLATE_PARAMETER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Generate a pack ID from kind and title.
 * For technique packs, uses the ATT&CK ID: technique.t<attackId>-<slug>
 * For others: <kind>.<slug>
 */
function generatePackId(kind, title, attackId) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (kind === 'technique' && attackId) {
    const normalizedAttackId = attackId.toLowerCase().replace(/\./g, '-');
    return `technique.${normalizedAttackId}-${slug}`;
  }
  return `${kind}.${slug}`;
}

/**
 * Map pack kind to output directory name.
 * Re-exported from pack.cjs (canonical source).
 */
const { getPackFolderForKind } = require('./pack.cjs');

/**
 * Validate a hypothesis template for quality.
 * Returns { valid: boolean, errors: string[] }
 */
function validateHypothesis(text) {
  const errors = [];

  if (!text || typeof text !== 'string') {
    return { valid: false, errors: ['Hypothesis text is required'] };
  }

  const trimmed = text.trim();

  // Minimum length check
  if (trimmed.length < 20) {
    errors.push(`Hypothesis must be at least 20 characters (got ${trimmed.length})`);
  }

  // Actionability check: must contain at least one quality word
  const lowerText = trimmed.toLowerCase();
  const hasQualityWord = HYPOTHESIS_QUALITY_WORDS.some(word => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    return pattern.test(lowerText);
  });
  if (!hasQualityWord) {
    errors.push('Hypothesis should contain an actionable verb (e.g., "indicates", "suggests", "compromised", "used", "executing")');
  }

  // Validate template parameter placeholders
  const paramPattern = /{{\s*([^}]*)\s*}}/g;
  let match;
  while ((match = paramPattern.exec(trimmed)) !== null) {
    const paramName = match[1].trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(paramName)) {
      errors.push(`Invalid template parameter name: {{${paramName}}}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Prompt for a line of input with optional default value.
 */
async function promptLine(rl, prompt, defaultValue) {
  const suffix = defaultValue !== undefined && defaultValue !== null
    ? ` [${defaultValue}]`
    : '';
  const answer = await rl.question(`  ${prompt}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed || (defaultValue !== undefined ? String(defaultValue) : '');
}

/**
 * Prompt for a numbered choice from a list of options.
 * Returns the selected value.
 */
async function promptChoice(rl, prompt, options) {
  console.log(`  ${prompt}`);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (typeof opt === 'object' && opt.label) {
      console.log(`    [${i + 1}] ${opt.value}  -- ${opt.label}`);
    } else {
      console.log(`    [${i + 1}] ${opt}`);
    }
  }
  const answer = await rl.question('  Choice: ');
  const idx = parseInt(answer.trim(), 10) - 1;
  if (idx >= 0 && idx < options.length) {
    const opt = options[idx];
    return typeof opt === 'object' && opt.value !== undefined ? opt.value : opt;
  }
  // Default to first option
  const first = options[0];
  return typeof first === 'object' && first.value !== undefined ? first.value : first;
}

/**
 * Prompt for multi-select from a numbered list.
 * Returns array of selected values.
 */
async function promptMultiSelect(rl, prompt, options) {
  console.log(`  ${prompt}`);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (typeof opt === 'object' && opt.label) {
      console.log(`    [${i + 1}] ${opt.value}  -- ${opt.label}`);
    } else {
      console.log(`    [${i + 1}] ${opt}`);
    }
  }
  const answer = await rl.question('  Select (comma-separated): ');
  const parts = answer.split(',').map(s => s.trim()).filter(Boolean);
  const selected = [];

  for (const part of parts) {
    const num = parseInt(part, 10);
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      const opt = options[num - 1];
      const val = typeof opt === 'object' && opt.value !== undefined ? opt.value : opt;
      if (!selected.includes(val)) selected.push(val);
    }
  }

  return selected;
}

/**
 * Prompt for yes/no confirmation.
 * Returns boolean.
 */
async function promptYesNo(rl, prompt, defaultYes = false) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await rl.question(`  ${prompt} (${hint}): `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) return defaultYes;
  return trimmed === 'y' || trimmed === 'yes';
}

// ─── Step Functions ──────────────────────────────────────────────────────────

/**
 * Step 1/8: Pack Type
 * Show numbered list of pack kinds with descriptions.
 * Returns selected kind string.
 */
async function stepPackType(rl) {
  console.log('\n  Step 1/8: Pack Type');
  console.log('  > What kind of pack are you creating?');

  // Exclude 'example' from interactive selection
  const kinds = packLib.PACK_KINDS.filter(k => k !== 'example');
  const options = kinds.map(k => ({
    value: k,
    label: PACK_KIND_DESCRIPTIONS[k] || k,
  }));

  const kind = await promptChoice(rl, '', options);
  console.log(`  Selected: ${kind}`);
  return kind;
}

/**
 * Step 2/8: Identity
 * Prompt for title, description, stability, and pack ID.
 * Returns { id, title, description, stability }
 */
async function stepIdentity(rl, kind) {
  console.log('\n  Step 2/8: Identity');

  const title = await promptLine(rl, '> Pack title');
  if (!title) throw new Error('Pack title is required');

  const description = await promptLine(rl, '> Pack description');
  if (!description) throw new Error('Pack description is required');

  const stability = await promptLine(rl, '> Stability', 'experimental');

  const autoId = generatePackId(kind, title);
  const id = await promptLine(rl, `> Pack ID`, autoId);

  return { id, title, description, stability };
}

/**
 * Step 3/8: MITRE ATT&CK Mapping (technique packs only)
 * Interactive ATT&CK technique picker loop.
 * Returns string[] of selected ATT&CK technique IDs.
 */
async function stepAttackMapping(rl) {
  console.log('\n  Step 3/8: MITRE ATT&CK Mapping');
  console.log('  Search by ATT&CK ID (T1078), name, or tactic (Initial Access).');

  const allSelected = [];
  let addMore = true;

  while (addMore) {
    const query = await promptLine(rl, '> Search techniques');
    if (!query) {
      if (allSelected.length > 0) break;
      console.log('  Please enter a search query.');
      continue;
    }

    // Determine search mode
    let results;
    const tactics = mitreData.getAllTactics();
    const matchedTactic = tactics.find(t => t.toLowerCase() === query.toLowerCase());

    if (matchedTactic) {
      results = mitreData.filterByTactic(matchedTactic);
    } else {
      results = mitreData.searchTechniques(query);
    }

    if (results.length === 0) {
      console.log('  No techniques found. Try a different search.');
      continue;
    }

    // Display results (limit to 20 for readability)
    const displayResults = results.slice(0, 20);
    console.log(`  Results (${results.length} found${results.length > 20 ? ', showing first 20' : ''}):`);
    for (let i = 0; i < displayResults.length; i++) {
      const t = displayResults[i];
      const tacticsStr = t.tactic || '';
      const parentStr = t.parent_id ? ` (sub of ${t.parent_id})` : '';
      console.log(`    [${i + 1}] ${t.id}  ${t.name} (${tacticsStr})${parentStr}`);
    }

    const selectInput = await promptLine(rl, '> Select techniques (comma-separated, or "a" for all)');
    const selected = mitreData.parseMultiSelect(selectInput, displayResults);

    for (const tid of selected) {
      if (!allSelected.includes(tid)) {
        allSelected.push(tid);
        console.log(`  Added: ${tid}`);
      }
    }

    if (allSelected.length > 0) {
      console.log(`  Current selection: ${allSelected.join(', ')}`);
      addMore = await promptYesNo(rl, '> Add more techniques?', false);
    }
  }

  if (allSelected.length === 0) {
    throw new Error('Technique packs require at least one ATT&CK technique ID');
  }

  return allSelected;
}

/**
 * Step 4/8: Pack Composition (domain/family/campaign only)
 * Load pack registry, show available packs for extension.
 * Returns string[] of parent pack IDs.
 */
async function stepComposition(rl, kind, cwd) {
  console.log('\n  Step 4/8: Pack Composition');

  const wantExtend = await promptYesNo(rl, '> Extend existing packs?', kind === 'domain' || kind === 'family');
  if (!wantExtend) {
    if (kind === 'family') {
      console.log('  Warning: family packs should extend at least 2 packs.');
    }
    return [];
  }

  let registry;
  try {
    registry = packLib.loadPackRegistry(cwd);
  } catch {
    console.log('  Could not load pack registry. You can add extends manually later.');
    return [];
  }

  const availablePacks = registry.packs || [];
  if (availablePacks.length === 0) {
    console.log('  No existing packs found in registry.');
    return [];
  }

  // Show available packs grouped by kind
  const options = availablePacks.map(p => ({
    value: p.id,
    label: `${p.title || p.id} (${p.kind})`,
  }));

  const selected = await promptMultiSelect(rl, '> Select packs to extend:', options);

  if (kind === 'family' && selected.length < 2) {
    console.log('  Warning: family packs should extend at least 2 packs.');
  }

  return selected;
}

/**
 * Step 5/8: Hypothesis Builder
 * Guided hypothesis authoring with quality validation.
 * Returns string[] of hypothesis_templates.
 */
async function stepHypothesis(rl, extendedPackIds, cwd) {
  console.log('\n  Step 5/8: Hypothesis Builder');
  console.log('  A good hypothesis:');
  console.log('  - Is testable with available telemetry');
  console.log('  - Names the suspected adversary behavior');
  console.log('  - Connects to observable indicators');
  console.log('  - Can be confirmed or refuted with query results');

  // Load existing hypotheses from extended packs for duplicate detection
  const existingHypotheses = [];
  if (extendedPackIds && extendedPackIds.length > 0 && cwd) {
    try {
      const registry = packLib.loadPackRegistry(cwd);
      for (const parentId of extendedPackIds) {
        const parent = registry.packs.find(p => p.id === parentId);
        if (parent && parent.hypothesis_templates) {
          existingHypotheses.push(...parent.hypothesis_templates);
        }
      }
    } catch {
      // Ignore -- registry may not be loadable
    }
  }

  const hypotheses = [];
  let addMore = true;
  let count = 1;

  while (addMore) {
    const text = await promptLine(rl, `> Hypothesis ${count}`);
    if (!text) {
      if (hypotheses.length > 0) break;
      console.log('  At least one hypothesis is required.');
      continue;
    }

    const validation = validateHypothesis(text);
    if (!validation.valid) {
      console.log('  Validation errors:');
      for (const err of validation.errors) {
        console.log(`    - ${err}`);
      }
      const retry = await promptYesNo(rl, '> Use it anyway?', false);
      if (!retry) continue;
    }

    // Check for duplicates with parent packs
    if (existingHypotheses.includes(text)) {
      console.log('  Warning: This hypothesis already exists in an extended parent pack.');
    }

    hypotheses.push(text);
    count++;
    addMore = await promptYesNo(rl, '> Add another hypothesis?', false);
  }

  return hypotheses;
}

/**
 * Step 6/8: Connector & Query Wiring
 * Select connectors, datasets, and build execution targets.
 * Returns { required_connectors, supported_datasets, execution_targets[] }
 */
async function stepConnectorWiring(rl, kind) {
  console.log('\n  Step 6/8: Connector & Query Wiring');

  // Select connectors
  const connectorOptions = CONNECTOR_IDS.map(id => ({
    value: id,
    label: CONNECTOR_DESCRIPTIONS[id] || id,
  }));

  const selectedConnectors = await promptMultiSelect(rl, '> Which connectors will this pack query?', connectorOptions);
  if (selectedConnectors.length === 0) {
    console.log('  Warning: No connectors selected. At least one is recommended.');
  }

  // Select datasets
  const datasetOptions = DATASET_KINDS.map(d => d);
  const selectedDatasets = await promptMultiSelect(rl, '> Select dataset kinds:', datasetOptions);

  // Build execution targets
  const targets = [];
  let addTarget = kind === 'technique' || await promptYesNo(rl, '> Add execution targets?', true);
  let targetCount = 1;

  while (addTarget) {
    console.log(`\n  -- Execution Target ${targetCount} --`);

    const name = await promptLine(rl, '> Target name');
    if (!name) break;

    const description = await promptLine(rl, '> Description');

    let connector;
    if (selectedConnectors.length === 1) {
      connector = selectedConnectors[0];
      console.log(`  Connector: ${connector}`);
    } else if (selectedConnectors.length > 1) {
      connector = await promptChoice(rl, '> Connector:', selectedConnectors);
    } else {
      connector = await promptLine(rl, '> Connector');
    }

    let dataset;
    if (selectedDatasets.length === 1) {
      dataset = selectedDatasets[0];
      console.log(`  Dataset: ${dataset}`);
    } else if (selectedDatasets.length > 1) {
      dataset = await promptChoice(rl, '> Dataset:', selectedDatasets);
    } else {
      dataset = await promptLine(rl, '> Dataset');
    }

    const defaultLang = connector ? (CONNECTOR_LANGUAGES[connector] || 'native') : 'native';
    const language = await promptLine(rl, '> Query language', defaultLang);

    // Query starter presentation
    const starter = connector ? queryStarters.getQueryStarter(connector) : null;
    let useStarter = false;
    if (starter) {
      console.log(`\n  Suggested starter (${starter.description}):`);
      console.log(`    ${starter.template.split('\n').join('\n    ')}`);
      useStarter = await promptYesNo(rl, '> Use this starter as base?', true);
    }

    if (useStarter && starter) {
      console.log('  > Query template (edit below, empty line to finish):');
    } else {
      console.log('  > Query template (enter empty line to finish):');
    }
    const queryLines = useStarter && starter ? [...starter.template.split('\n')] : [];
    if (useStarter && starter) {
      console.log(`    (pre-filled ${queryLines.length} line${queryLines.length !== 1 ? 's' : ''} from starter)`);
    }
    let line;
    do {
      line = await rl.question('    ');
      if (line.trim()) queryLines.push(line);
    } while (line.trim());

    const queryTemplate = queryLines.join('\n');
    if (!queryTemplate) {
      console.log('  Warning: Empty query template.');
    }

    targets.push({
      name,
      description: description || '',
      connector: connector || '',
      dataset: dataset || '',
      language: language || defaultLang,
      query_template: queryTemplate,
    });

    targetCount++;
    addTarget = await promptYesNo(rl, '> Add another target?', false);
  }

  // Multi-target guidance: warn about connectors without execution targets
  if (selectedConnectors.length > 0 && targets.length > 0) {
    const targetConnectors = new Set(targets.map(t => t.connector));
    const uncoveredConnectors = selectedConnectors.filter(c => !targetConnectors.has(c));
    if (uncoveredConnectors.length > 0) {
      console.log(`\n  Connectors without execution targets: ${uncoveredConnectors.join(', ')}`);
      for (const uc of uncoveredConnectors) {
        const addMissing = await promptYesNo(rl, `> Add a target for ${uc}?`, false);
        if (addMissing) {
          const ucStarter = queryStarters.getQueryStarter(uc);
          const ucLang = CONNECTOR_LANGUAGES[uc] || 'native';
          const ucName = await promptLine(rl, '> Target name');
          if (ucName) {
            const ucDataset = selectedDatasets.length === 1 ? selectedDatasets[0] : await promptChoice(rl, '> Dataset:', selectedDatasets.length > 0 ? selectedDatasets : DATASET_KINDS);
            const ucTemplate = ucStarter ? ucStarter.template : '';
            targets.push({
              name: ucName,
              description: '',
              connector: uc,
              dataset: ucDataset,
              language: ucLang,
              query_template: ucTemplate,
            });
          }
        }
      }
    }
  }

  return {
    required_connectors: selectedConnectors,
    supported_datasets: selectedDatasets,
    execution_targets: targets,
  };
}

/**
 * Step 7/8: Telemetry & Blind Spots
 * Define telemetry requirements and blind spots.
 * Returns { telemetry_requirements[], blind_spots[] }
 */
async function stepTelemetry(rl, connectors, datasets) {
  console.log('\n  Step 7/8: Telemetry & Blind Spots');

  // Telemetry requirements
  const requirements = [];
  let addReq = true;
  let reqCount = 1;

  while (addReq) {
    console.log(`  > Telemetry surface ${reqCount}:`);
    const surface = await promptLine(rl, '  Name');
    if (!surface) {
      if (requirements.length > 0) break;
      console.log('  At least one telemetry surface is recommended.');
      break;
    }

    const description = await promptLine(rl, '  Description');

    // Subset of connectors for this requirement
    let reqConnectors = connectors;
    if (connectors.length > 1) {
      const selected = await promptMultiSelect(rl, '  Connectors (subset):', connectors);
      if (selected.length > 0) reqConnectors = selected;
    }

    // Subset of datasets for this requirement
    let reqDatasets = datasets;
    if (datasets.length > 1) {
      const selected = await promptMultiSelect(rl, '  Datasets (subset):', datasets);
      if (selected.length > 0) reqDatasets = selected;
    }

    requirements.push({
      surface,
      description: description || '',
      connectors: reqConnectors,
      datasets: reqDatasets,
    });

    reqCount++;
    addReq = await promptYesNo(rl, '> Add another surface?', false);
  }

  // Blind spots
  const blindSpots = [];
  let addSpot = true;
  let spotCount = 1;

  while (addSpot) {
    const spot = await promptLine(rl, `> Blind spot ${spotCount}`);
    if (!spot) {
      if (blindSpots.length > 0) break;
      break;
    }

    blindSpots.push(spot);
    spotCount++;
    addSpot = await promptYesNo(rl, '> Add another blind spot?', false);
  }

  // Entity type selection (Step 7b)
  console.log('\n  Step 7b: Entity Types');
  console.log('  > Which entity types does this pack extract?');

  const entityOptions = queryStarters.ENTITY_SCOPE_TYPES.map(e => ({
    value: e.kind,
    label: `${e.description} (${e.source})`,
  }));

  const selectedEntities = await promptMultiSelect(rl, '> Select entity types:', entityOptions);

  return {
    telemetry_requirements: requirements,
    blind_spots: blindSpots,
    selected_entities: selectedEntities,
  };
}

/**
 * Step 8/8: Parameters & Publication
 * Auto-detect template parameters, configure each, set publish metadata.
 * Returns { parameters[], publish, examples }
 */
async function stepParameters(rl, executionTargets, hypothesisTemplates) {
  console.log('\n  Step 8/8: Parameters & Publication');

  // Auto-detect parameters from all templates
  const detectedNames = new Set();

  for (const target of executionTargets || []) {
    if (target.query_template) {
      const names = packLib.collectTemplateParameters(target.query_template);
      for (const name of names) detectedNames.add(name);
    }
  }

  for (const hyp of hypothesisTemplates || []) {
    const names = packLib.collectTemplateParameters(hyp);
    for (const name of names) detectedNames.add(name);
  }

  const paramNames = [...detectedNames];
  const parameters = [];
  const examples = { parameters: {} };

  if (paramNames.length > 0) {
    console.log(`  Detected template parameters: ${paramNames.join(', ')}`);

    for (const name of paramNames) {
      console.log(`\n  > Configure parameter "${name}":`);

      const typeOptions = packLib.PACK_PARAMETER_TYPES;
      const defaultType = name.includes('hour') || name.includes('minute') || name.includes('count')
        ? 'integer' : 'string';
      const type = await promptLine(rl, `  Type`, defaultType);
      const validType = typeOptions.includes(type) ? type : 'string';

      const defaultRequired = name === 'tenant' ? 'true' : 'false';
      const requiredStr = await promptLine(rl, `  Required`, defaultRequired);
      const required = requiredStr === 'true' || requiredStr === 'yes' || requiredStr === 'y';

      const param = {
        name,
        type: validType,
        required,
        description: '',
        default: undefined,
        example: null,
      };

      if (!required) {
        const defaultVal = await promptLine(rl, '  Default value');
        if (defaultVal) {
          if (validType === 'integer') {
            const parsed = parseInt(defaultVal, 10);
            param.default = isNaN(parsed) ? defaultVal : parsed;
          } else if (validType === 'number') {
            const parsed = parseFloat(defaultVal);
            param.default = isNaN(parsed) ? defaultVal : parsed;
          } else if (validType === 'boolean') {
            param.default = defaultVal === 'true' || defaultVal === 'yes';
          } else {
            param.default = defaultVal;
          }
        }
      }

      // Integer-specific constraints
      if (validType === 'integer' || validType === 'number') {
        const minStr = await promptLine(rl, '  Minimum');
        if (minStr) {
          const minVal = Number(minStr);
          if (Number.isFinite(minVal)) param.minimum = minVal;
        }
        const maxStr = await promptLine(rl, '  Maximum');
        if (maxStr) {
          const maxVal = Number(maxStr);
          if (Number.isFinite(maxVal)) param.maximum = maxVal;
        }
      }

      const desc = await promptLine(rl, '  Description');
      param.description = desc || '';

      const example = await promptLine(rl, '  Example value');
      if (example) {
        param.example = example;
        if (validType === 'integer') {
          const parsed = parseInt(example, 10);
          examples.parameters[name] = isNaN(parsed) ? example : parsed;
        } else if (validType === 'number') {
          const parsed = parseFloat(example);
          examples.parameters[name] = isNaN(parsed) ? example : parsed;
        } else {
          examples.parameters[name] = example;
        }
      }

      // Clean up undefined fields
      if (param.default === undefined) delete param.default;

      parameters.push(param);
    }
  } else {
    console.log('  No template parameters detected.');
  }

  // Publication metadata
  console.log('');
  const findingType = await promptLine(rl, '> Finding type');
  const outcomesStr = await promptLine(rl, '> Expected outcomes (comma-separated)');
  const expectedOutcomes = outcomesStr
    ? outcomesStr.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const publish = {
    finding_type: findingType || null,
    expected_outcomes: expectedOutcomes,
    receipt_tags: [],
  };

  return { parameters, publish, examples };
}

// ─── Main Orchestrator Functions ─────────────────────────────────────────────

/**
 * Main interactive pack authoring flow.
 * Runs 8 guided steps, assembles pack, validates, previews, and writes.
 */
async function runPackAuthor(cwd, options = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });

  try {
    console.log('\n  THRUNT Pack Author');
    console.log('  ==================\n');

    // Step 1: Pack Type
    const kind = await stepPackType(rl);

    // Step 2: Identity
    const identity = await stepIdentity(rl, kind);

    // Incremental validation: identity checkpoint
    const identityCheck = queryStarters.runIncrementalValidation({
      version: '1.0', id: identity.id, kind, title: identity.title,
      description: identity.description, stability: identity.stability,
    }, 'identity');
    console.log(queryStarters.formatValidationResults(identityCheck));

    // Step 3: ATT&CK Mapping (technique packs only)
    let attackIds = [];
    if (kind === 'technique') {
      attackIds = await stepAttackMapping(rl);
      // Update the pack ID to include the ATT&CK ID
      if (attackIds.length > 0 && !identity.id.includes(attackIds[0].toLowerCase())) {
        const suggestedId = generatePackId(kind, identity.title, attackIds[0]);
        const useNewId = await promptYesNo(rl, `  Update pack ID to ${suggestedId}?`, true);
        if (useNewId) identity.id = suggestedId;
      }
    }

    // Incremental validation: attack checkpoint (technique packs only)
    if (kind === 'technique' && attackIds.length > 0) {
      const attackCheck = queryStarters.runIncrementalValidation({
        version: '1.0', id: identity.id, kind, title: identity.title,
        description: identity.description, stability: identity.stability,
        attack: attackIds,
      }, 'attack');
      console.log(queryStarters.formatValidationResults(attackCheck));
    }

    // Step 4: Composition (domain/family/campaign only)
    let extendsPacks = [];
    if (kind !== 'technique' && kind !== 'custom') {
      extendsPacks = await stepComposition(rl, kind, cwd);
    }

    // Step 5: Hypothesis Builder
    const hypothesisTemplates = await stepHypothesis(rl, extendsPacks, cwd);

    // Step 6: Connector & Query Wiring
    const wiringResult = await stepConnectorWiring(rl, kind);

    // Incremental validation: query checkpoint
    const queryCheck = queryStarters.runIncrementalValidation({
      version: '1.0', id: identity.id, kind, title: identity.title,
      description: identity.description, stability: identity.stability,
      attack: attackIds, required_connectors: wiringResult.required_connectors,
      supported_datasets: wiringResult.supported_datasets,
      execution_targets: wiringResult.execution_targets,
      parameters: [],
    }, 'query');
    console.log(queryStarters.formatValidationResults(queryCheck));

    // Step 7: Telemetry & Blind Spots
    let telemetryResult = { telemetry_requirements: [], blind_spots: [] };
    if (kind === 'technique' || await promptYesNo(rl, '\n  > Configure telemetry requirements?', true)) {
      telemetryResult = await stepTelemetry(
        rl,
        wiringResult.required_connectors,
        wiringResult.supported_datasets
      );
    }

    // Step 8: Parameters & Publication
    const paramResult = await stepParameters(
      rl,
      wiringResult.execution_targets,
      hypothesisTemplates
    );

    // Assemble pack object
    const packInput = {
      version: '1.0',
      id: identity.id,
      kind,
      title: identity.title,
      description: identity.description,
      stability: identity.stability,
      metadata: {
        generated_by: 'pack create',
      },
      extends: extendsPacks,
      attack: attackIds,
      hypothesis_ids: [],
      hypothesis_templates: hypothesisTemplates,
      required_connectors: wiringResult.required_connectors,
      supported_datasets: wiringResult.supported_datasets,
      parameters: paramResult.parameters,
      telemetry_requirements: telemetryResult.telemetry_requirements,
      blind_spots: telemetryResult.blind_spots,
      execution_targets: wiringResult.execution_targets,
      scope_defaults: {
        time_window: {
          lookback_minutes: 1440,
        },
        entities: telemetryResult.selected_entities || [],
      },
      execution_defaults: {
        consistency: 'best_effort',
        receipt_policy: 'material',
      },
      examples: paramResult.examples,
      publish: {
        finding_type: paramResult.publish.finding_type,
        expected_outcomes: paramResult.publish.expected_outcomes,
        receipt_tags: [`pack:${identity.id}`],
      },
      notes: [
        `Generated by pack create on ${new Date().toISOString()}.`,
      ],
    };

    // Incremental validation: final checkpoint
    const finalCheck = queryStarters.runIncrementalValidation(packInput, 'final');
    console.log(queryStarters.formatValidationResults(finalCheck));

    if (!finalCheck.passed) {
      const proceed = await promptYesNo(rl, '> Continue anyway?', false);
      if (!proceed) {
        rl.close();
        return { created: false, pack_id: identity.id, reason: 'validation_errors', errors: finalCheck.results.filter(r => r.status === 'FAIL').map(r => r.message) };
      }
    }

    // Preview
    const packJson = JSON.stringify(packInput, null, 2);
    console.log('\n  ==========================================');
    console.log('  Preview:');
    console.log('  ==========================================');
    console.log(packJson);
    console.log('  ==========================================');

    // Dry run check
    if (options.dryRun) {
      console.log('\n  Dry run -- not writing to disk.');
      rl.close();
      return { dry_run: true, pack_id: identity.id, pack: packInput };
    }

    // Output path
    const folder = getPackFolderForKind(kind);
    const slug = identity.id.includes('.') ? identity.id.split('.').slice(1).join('-') : identity.id;
    const defaultOutput = path.join(
      packLib.getProjectPackRegistryDir(cwd),
      folder,
      `${slug}.json`
    );
    const outputPath = options.output || defaultOutput;
    const relativePath = path.relative(cwd, outputPath);

    const shouldWrite = await promptYesNo(rl, `> Write pack to ${relativePath}?`, true);
    if (!shouldWrite) {
      rl.close();
      return { created: false, pack_id: identity.id, reason: 'cancelled' };
    }

    // Write
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, `${packJson}\n`);

    // Generate test artifacts
    const testArtifacts = packLib.writeTestArtifacts(cwd, packInput);

    console.log(`\n  Pack created: ${relativePath}`);
    console.log(`  Test fixture: ${testArtifacts.fixture_path}`);
    console.log(`  Test file: ${testArtifacts.test_path}`);
    console.log('\n  Next steps:');
    console.log(`    thrunt pack lint ${identity.id}`);
    console.log(`    thrunt pack test ${identity.id}`);

    rl.close();
    return { created: true, pack_id: identity.id, path: relativePath, pack: packInput, test_artifacts: testArtifacts };
  } catch (err) {
    rl.close();
    throw err;
  }
}

/**
 * Non-interactive pack builder from CLI flags.
 * Builds a pack with sensible defaults and TODO markers.
 */
function buildPackFromFlags(cwd, flags = {}) {
  const kind = flags.kind || 'custom';
  if (!packLib.PACK_KINDS.includes(kind) || kind === 'example') {
    throw new Error(`Invalid pack kind: ${kind}. Must be one of: ${packLib.PACK_KINDS.filter(k => k !== 'example').join(', ')}`);
  }

  const title = flags.title || 'Untitled Pack';
  const description = flags.description || `A ${kind} pack.`;
  const stability = flags.stability || 'experimental';

  // Parse comma-separated fields
  const attackIds = flags.attack ? String(flags.attack).split(',').map(s => s.trim()).filter(Boolean) : [];
  const extendsPacks = flags.extends ? String(flags.extends).split(',').map(s => s.trim()).filter(Boolean) : [];
  const connectors = flags.connectors ? String(flags.connectors).split(',').map(s => s.trim()).filter(Boolean) : [];
  const datasets = flags.datasets ? String(flags.datasets).split(',').map(s => s.trim()).filter(Boolean) : [];

  // Technique validation
  if (kind === 'technique' && attackIds.length === 0) {
    throw new Error('Technique packs require --attack flag with at least one ATT&CK technique ID');
  }

  // Validate ATT&CK IDs exist in the MITRE data bundle
  if (attackIds.length > 0) {
    const invalidIds = attackIds.filter(id => !mitreData.getTechniqueById(id));
    if (invalidIds.length > 0) {
      throw new Error(
        `Unknown ATT&CK technique ID(s): ${invalidIds.join(', ')}. ` +
        'Verify IDs against the MITRE ATT&CK Enterprise matrix.'
      );
    }
  }

  // Generate ID
  const id = flags.id || generatePackId(kind, title, attackIds[0]);

  // Build slug for publish
  const slug = id.includes('.') ? id.split('.').slice(1).join('-') : id;
  const slugUnderscored = slug.replace(/-/g, '_');

  // Build hypothesis_templates
  const hypothesisTemplates = flags.hypothesis
    ? [String(flags.hypothesis)]
    : [];

  // Build pack input
  const packInput = {
    version: '1.0',
    id,
    kind,
    title,
    description,
    stability,
    metadata: {
      generated_by: 'pack create --non-interactive',
    },
    extends: extendsPacks,
    attack: attackIds,
    hypothesis_ids: [],
    hypothesis_templates: hypothesisTemplates,
    required_connectors: connectors,
    supported_datasets: datasets,
    parameters: [
      {
        name: 'tenant',
        type: 'string',
        required: true,
        description: 'Tenant, business unit, or environment selector.',
        pattern: '^[A-Za-z0-9._-]+$',
      },
    ],
    telemetry_requirements: [],
    blind_spots: [],
    execution_targets: [],
    scope_defaults: {
      time_window: {
        lookback_minutes: 1440,
      },
    },
    execution_defaults: {
      consistency: 'best_effort',
      receipt_policy: 'material',
    },
    examples: {
      parameters: {
        tenant: 'example-tenant',
      },
    },
    publish: {
      finding_type: slugUnderscored,
      expected_outcomes: [`${slugUnderscored}_outcome`],
      receipt_tags: [`pack:${id}`],
    },
    notes: [
      `Generated by pack create --non-interactive on ${new Date().toISOString()}. Replace placeholder content before publication.`,
    ],
  };

  // Add placeholder content for technique packs
  if (kind === 'technique') {
    if (packInput.hypothesis_templates.length === 0) {
      packInput.hypothesis_templates = [
        `Suspicious activity matching ATT&CK technique ${attackIds[0]} warrants investigation.`,
      ];
    }
    packInput.telemetry_requirements = [
      {
        surface: 'TODO_replace_me',
        description: 'Replace with the required telemetry surface.',
        connectors: connectors.length > 0 ? connectors : ['splunk'],
        datasets: datasets.length > 0 ? datasets : ['events'],
      },
    ];
    packInput.blind_spots = [
      'TODO: Replace with known blind spots for this technique pack.',
    ];
    packInput.execution_targets = [
      {
        name: 'TODO Replace Me',
        description: 'Replace with the first execution target.',
        connector: connectors[0] || 'splunk',
        dataset: datasets[0] || 'events',
        language: connectors[0] ? (CONNECTOR_LANGUAGES[connectors[0]] || 'native') : 'spl',
        query_template: 'TODO: replace_me {{tenant}}',
      },
    ];
  }

  // Validate with allowPartial for non-interactive
  const validation = packLib.validatePackDefinition(packInput, { requireComplete: false });
  if (!validation.valid) {
    // Only throw on truly structural errors, not missing fields
    const structuralErrors = validation.errors.filter(e =>
      !e.startsWith('hypothesis_ids') &&
      !e.startsWith('technique packs must') &&
      !e.startsWith('required_connectors') &&
      !e.startsWith('supported_datasets')
    );
    if (structuralErrors.length > 0) {
      const err = new Error(`Invalid pack definition: ${structuralErrors.join('; ')}`);
      err.validation = validation;
      throw err;
    }
  }

  // Dry run
  if (flags.dryRun || flags.dry_run) {
    return { dry_run: true, pack_id: id, pack: packInput, validation };
  }

  // Write
  const folder = getPackFolderForKind(kind);
  const outputPath = flags.output || path.join(
    packLib.getProjectPackRegistryDir(cwd),
    folder,
    `${slug}.json`
  );

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const packJson = JSON.stringify(packInput, null, 2);
  fs.writeFileSync(outputPath, `${packJson}\n`);

  const relativePath = path.relative(cwd, outputPath);

  // Generate test artifacts
  const testArtifacts = packLib.writeTestArtifacts(cwd, packInput);

  return { created: true, pack_id: id, path: relativePath, pack: packInput, test_artifacts: testArtifacts };
}

// ─── Module Exports ──────────────────────────────────────────────────────────

module.exports = {
  runPackAuthor,
  buildPackFromFlags,
  validateHypothesis,
  generatePackId,
  getPackFolderForKind, // re-exported from pack.cjs
  HYPOTHESIS_QUALITY_WORDS,
  CONNECTOR_LANGUAGES,
  DATASET_KINDS,
};
