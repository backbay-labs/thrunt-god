/**
 * Detection Mapping -- Candidate model, finding-to-detection mapping,
 * promotion readiness scoring, format-agnostic rendering, and CLI entry points.
 *
 * One-way dependency: core.cjs, manifest.cjs, evidence.cjs may NEVER import from detection.cjs.
 *
 * Provides:
 * - createDetectionCandidate(input) -- builds a canonical candidate JSON
 * - mapFindingsToDetections(cwd, options) -- scans findings, produces candidates
 * - scorePromotionReadiness(candidate, context) -- composite 0-1 score
 * - renderCandidate(candidate, format) -- format-specific detection output
 * - listDetectionCandidates(cwd, options) -- read existing candidates from DETECTIONS/
 * - cmdDetectionMap(cwd, options, raw) -- CLI: detection map
 * - cmdDetectionList(cwd, options, raw) -- CLI: detection list
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { planningPaths, loadConfig, output, error } = require('./core.cjs');
const { canonicalSerialize, computeContentHash, detectRuntimeName } = require('./manifest.cjs');
const telemetry = require('./telemetry.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANDIDATE_VERSION = '1.0';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a candidate ID following the manifest.cjs makeManifestId pattern.
 * Format: DET-{YYYYMMDDHHMMSS}-{RANDOM8}
 */
function makeCandidateId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `DET-${stamp}-${suffix}`;
}

/** Current UTC timestamp in ISO-8601 format. */
function nowUtc() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// YAML Serializer (lightweight, no external dependency)
// ---------------------------------------------------------------------------

/**
 * Quote a string if it contains YAML-special characters.
 */
function yamlQuote(str) {
  if (/[:{}\[\],&*#?|>!%@`"'\n]/.test(str) || str === '' || str === 'true' || str === 'false' || str === 'null') {
    return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return str;
}

/**
 * Minimal YAML serializer for Sigma rules. Handles scalars, arrays, and nested objects.
 * No anchors, references, or complex types -- Sigma rules use a flat subset of YAML.
 */
function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const lines = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          const subLines = toYaml(item, indent + 2).split('\n').filter(Boolean);
          lines.push(`${pad}  - ${subLines[0].trim()}`);
          for (let i = 1; i < subLines.length; i++) {
            lines.push(`${pad}    ${subLines[i].trim()}`);
          }
        } else {
          lines.push(`${pad}  - ${yamlQuote(String(item))}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${pad}${key}:`);
      lines.push(toYaml(value, indent + 1));
    } else {
      lines.push(`${pad}${key}: ${yamlQuote(String(value))}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Findings Scanner (replicates review.cjs scanAllFindings internal logic)
// ---------------------------------------------------------------------------

/**
 * Scan FINDINGS.md files across phase directories for structured finding items.
 * Replicates the regex from review.cjs scanAllFindings (line 148).
 *
 * @param {string} cwd - project root
 * @param {object} options - { phase?: string }
 * @returns {Array<{ id, description, status, hypothesis_id, source_file }>}
 */
function scanFindingsForDetection(cwd, options) {
  const phasesDir = planningPaths(cwd).phases;
  if (!fs.existsSync(phasesDir)) return [];

  const findings = [];
  let dirs;
  try {
    dirs = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }

  // Phase filtering
  if (options && options.phase) {
    dirs = dirs.filter(d => d.startsWith(options.phase));
  }

  for (const dir of dirs) {
    const phaseDir = path.join(phasesDir, dir);
    let files;
    try {
      files = fs.readdirSync(phaseDir).filter(f => f.includes('FINDINGS') && f.endsWith('.md'));
    } catch {
      continue;
    }

    for (const file of files) {
      const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
      const findingPattern = /^-\s*\*\*([^*]+)\*\*:\s*(.+?)\s*\|\s*status:\s*(\w+)\s*\|\s*hypothesis:\s*([A-Z]+-\d+)/gm;
      let match;
      while ((match = findingPattern.exec(content)) !== null) {
        findings.push({
          id: match[1],
          description: match[2].trim(),
          status: match[3].toLowerCase(),
          hypothesis_id: match[4],
          source_file: path.join(dir, file),
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// ATT&CK Technique Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve ATT&CK technique IDs for a finding.
 *
 * Resolution chain:
 * 1. Check finding description for T{4digit} patterns (with optional .XXX sub-technique)
 * 2. Scan technique packs for packs whose hypothesis_ids include the finding's hypothesis_id
 *
 * All IDs normalized to uppercase TXXXX or TXXXX.XXX format.
 *
 * @param {object} finding - { id, description, hypothesis_id }
 * @param {string} cwd - project root
 * @returns {string[]} technique IDs
 */
function resolveAttackTechniques(finding, cwd) {
  const techniques = new Set();

  // 1. Extract from description: T followed by 4 digits, optionally .NNN
  const descPattern = /T(\d{4}(?:\.\d{3})?)/gi;
  let match;
  while ((match = descPattern.exec(finding.description)) !== null) {
    techniques.add(`T${match[1].toUpperCase()}`);
  }

  // 2. Scan technique packs for matching hypothesis_ids
  const packsDir = path.join(__dirname, '..', '..', 'packs', 'techniques');
  if (fs.existsSync(packsDir)) {
    try {
      const packFiles = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));
      for (const pf of packFiles) {
        try {
          const pack = JSON.parse(fs.readFileSync(path.join(packsDir, pf), 'utf-8'));
          if (pack.hypothesis_ids && pack.hypothesis_ids.includes(finding.hypothesis_id)) {
            if (Array.isArray(pack.attack)) {
              for (const tid of pack.attack) {
                techniques.add(tid.toUpperCase());
              }
            }
          }
        } catch {
          // Skip corrupt pack files
        }
      }
    } catch {
      // Packs directory unreadable
    }
  }

  return Array.from(techniques);
}

// ---------------------------------------------------------------------------
// Detection Logic Builder
// ---------------------------------------------------------------------------

/**
 * Build a format-neutral detection_logic object from a finding and technique IDs.
 *
 * @param {object} finding - { id, description, hypothesis_id }
 * @param {string[]} techniqueIds - ATT&CK technique IDs
 * @returns {object} detection_logic
 */
function buildDetectionLogic(finding, techniqueIds) {
  // Try to resolve logsource category from technique packs
  let category = 'generic';
  const packsDir = path.join(__dirname, '..', '..', 'packs', 'techniques');
  if (fs.existsSync(packsDir)) {
    try {
      const packFiles = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));
      for (const pf of packFiles) {
        try {
          const pack = JSON.parse(fs.readFileSync(path.join(packsDir, pf), 'utf-8'));
          if (pack.attack && pack.attack.some(t => techniqueIds.includes(t.toUpperCase()))) {
            if (pack.metadata && pack.metadata.domains && pack.metadata.domains.length > 0) {
              category = pack.metadata.domains[0];
              break;
            }
          }
        } catch {
          // Skip
        }
      }
    } catch {
      // Packs directory unreadable
    }
  }

  return {
    title: `Detection: ${finding.description.slice(0, 80)}`,
    description: `Detection derived from finding ${finding.id}: ${finding.description}`,
    logsource: { category },
    detection: {
      selection: {},
      condition: 'selection',
    },
    false_positives: ['Unknown -- review required'],
  };
}

// ---------------------------------------------------------------------------
// Evidence Chain Resolution
// ---------------------------------------------------------------------------

/**
 * Scan RECEIPTS/ directory for files mentioning the finding ID.
 * Returns array of evidence link objects with receipt IDs (not file paths).
 *
 * @param {object} finding - { id }
 * @param {string} cwd - project root
 * @returns {Array<{ type, id, claim_status }>}
 */
function resolveEvidenceChain(finding, cwd) {
  const receiptsDir = planningPaths(cwd).receipts;
  if (!fs.existsSync(receiptsDir)) return [];

  const links = [];
  try {
    const files = fs.readdirSync(receiptsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(receiptsDir, file), 'utf-8');
        if (content.includes(finding.id)) {
          // Extract receipt ID from filename (e.g., RCT-20260327-001.md -> RCT-20260327-001)
          const receiptId = path.basename(file, '.md');
          links.push({
            type: 'receipt',
            id: receiptId,
            claim_status: 'supports',
          });
        }
      } catch {
        // Skip unreadable receipt files
      }
    }
  } catch {
    // Receipts directory unreadable
  }

  return links;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Create a detection candidate from input parameters.
 * Returns null if technique_ids is empty or missing (ATT&CK mapping required).
 *
 * @param {object} input - candidate fields
 * @returns {object|null} candidate JSON or null
 */
function createDetectionCandidate(input) {
  const techniqueIds = input.technique_ids;
  if (!techniqueIds || techniqueIds.length === 0) {
    return null;
  }

  const now = nowUtc();
  const candidate = {
    candidate_version: CANDIDATE_VERSION,
    candidate_id: makeCandidateId(),
    source_finding_id: input.source_finding_id,
    source_phase: input.source_phase || null,
    technique_ids: techniqueIds,
    detection_logic: input.detection_logic || {},
    target_format: input.target_format || 'sigma',
    confidence: input.confidence || 'medium',
    promotion_readiness: 0,
    evidence_links: input.evidence_links || [],
    metadata: {
      author: (input.metadata && input.metadata.author) || 'thrunt-detection-mapper',
      created_at: now,
      last_updated: now,
      status: (input.metadata && input.metadata.status) || 'draft',
      notes: (input.metadata && input.metadata.notes) || '',
    },
  };

  // Compute content hash over the candidate body (excluding content_hash itself)
  candidate.content_hash = computeContentHash(canonicalSerialize(candidate));

  return candidate;
}

/**
 * Composite promotion readiness score (0-1).
 *
 * Weights: evidence(0.4) + technique(0.3) + confidence(0.3)
 *
 * @param {object} candidate - { technique_ids, evidence_links }
 * @param {object} context - { finding_status }
 * @returns {number} 0-1 score with 4-decimal precision
 */
function scorePromotionReadiness(candidate, context) {
  // Evidence strength: how many receipts back this candidate
  const receiptCount = (candidate.evidence_links || []).length;
  const evidenceScore = receiptCount > 0 ? Math.min(1.0, receiptCount / 3) : 0;

  // Technique coverage: must have at least one ATT&CK technique
  const techniqueScore = (candidate.technique_ids || []).length > 0 ? 1.0 : 0;

  // Finding confidence: map from finding status
  const confidenceMap = { confirmed: 1.0, supported: 0.8, inconclusive: 0.4, unknown: 0.2 };
  const findingConfidence = confidenceMap[(context && context.finding_status)] || 0.2;

  const raw = (evidenceScore * 0.4) + (techniqueScore * 0.3) + (findingConfidence * 0.3);
  return Math.round(raw * 10000) / 10000;
}

/**
 * Map findings to detection candidates.
 *
 * Scans findings, skips refuted, resolves techniques (skips if none),
 * resolves evidence chain, creates candidate, scores promotion readiness.
 * Writes each candidate as JSON to DETECTIONS/ directory.
 *
 * @param {string} cwd - project root
 * @param {object} options - { phase?, format?, finding? }
 * @returns {Array<object>} candidates created
 */
function mapFindingsToDetections(cwd, options) {
  const findings = scanFindingsForDetection(cwd, options);
  const candidates = [];
  const paths = planningPaths(cwd);
  const detectionsDir = paths.detections;

  for (const finding of findings) {
    // Skip refuted findings
    if (finding.status === 'refuted') continue;

    // Resolve ATT&CK technique IDs
    const techniqueIds = resolveAttackTechniques(finding, cwd);
    if (techniqueIds.length === 0) continue;

    // Resolve evidence chain
    const evidenceLinks = resolveEvidenceChain(finding, cwd);

    // Build detection logic
    const detectionLogic = buildDetectionLogic(finding, techniqueIds);

    // Create candidate
    const candidate = createDetectionCandidate({
      source_finding_id: finding.id,
      source_phase: finding.source_file,
      technique_ids: techniqueIds,
      detection_logic: detectionLogic,
      confidence: finding.status === 'confirmed' ? 'high' : 'medium',
      evidence_links: evidenceLinks,
      metadata: {
        author: 'thrunt-detection-mapper',
        status: 'draft',
        notes: `Generated from finding ${finding.id} (${finding.status}: ${finding.description}).`,
      },
    });

    if (!candidate) continue;

    // Score promotion readiness
    candidate.promotion_readiness = scorePromotionReadiness(candidate, {
      finding_status: finding.status,
    });

    // Apply format selection
    const formats = (options && options.format) ? [options.format] : ['sigma'];
    for (const format of formats) {
      const formatCandidate = { ...candidate, target_format: format };

      // Write to DETECTIONS/ directory
      if (fs.existsSync(detectionsDir) || tryMkdir(detectionsDir)) {
        const filename = `${formatCandidate.candidate_id}.json`;
        fs.writeFileSync(
          path.join(detectionsDir, filename),
          JSON.stringify(formatCandidate, null, 2)
        );
      }

      candidates.push(formatCandidate);
    }
  }

  return candidates;
}

/**
 * Try to create a directory recursively. Returns true on success.
 */
function tryMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Map candidate confidence to Sigma level.
 */
function mapConfidenceToSigmaLevel(confidence) {
  const map = { high: 'high', medium: 'medium', low: 'low' };
  return map[confidence] || 'medium';
}

/**
 * Render a candidate as Sigma YAML.
 */
function renderSigma(candidate) {
  const rule = {
    title: `THRUNT: ${(candidate.detection_logic && candidate.detection_logic.title) || candidate.candidate_id}`,
    id: candidate.candidate_id,
    status: (candidate.metadata && candidate.metadata.status === 'promoted') ? 'test' : 'experimental',
    description: (candidate.detection_logic && candidate.detection_logic.description) ||
      `Detection derived from finding ${candidate.source_finding_id}`,
    author: (candidate.metadata && candidate.metadata.author) || 'THRUNT',
    date: ((candidate.metadata && candidate.metadata.created_at) || nowUtc()).split('T')[0],
    tags: (candidate.technique_ids || []).map(t => `attack.${t.toLowerCase()}`),
    logsource: (candidate.detection_logic && candidate.detection_logic.logsource) || {},
    detection: (candidate.detection_logic && candidate.detection_logic.detection) || {},
    level: mapConfidenceToSigmaLevel(candidate.confidence),
    falsepositives: (candidate.detection_logic && candidate.detection_logic.false_positives) || ['Unknown'],
  };
  return toYaml(rule);
}

/**
 * Render a candidate as Splunk SPL (structured stub).
 */
function renderSplunkSpl(candidate) {
  const title = (candidate.detection_logic && candidate.detection_logic.title) || candidate.candidate_id;
  return [
    `| \`comment("THRUNT Detection: ${title}")\``,
    `| \`comment("Candidate: ${candidate.candidate_id}")\``,
    `| \`comment("Source Finding: ${candidate.source_finding_id}")\``,
    `| \`comment("Techniques: ${(candidate.technique_ids || []).join(', ')}")\``,
    `| \`comment("Status: stub -- replace with actual SPL logic")\``,
    `index=* sourcetype=*`,
    `| search *`,
    `| stats count by host`,
  ].join('\n');
}

/**
 * Render a candidate as Elastic EQL (structured stub).
 */
function renderElasticEql(candidate) {
  const title = (candidate.detection_logic && candidate.detection_logic.title) || candidate.candidate_id;
  return [
    `/* THRUNT Detection: ${title} */`,
    `/* Candidate: ${candidate.candidate_id} */`,
    `/* Source Finding: ${candidate.source_finding_id} */`,
    `/* Techniques: ${(candidate.technique_ids || []).join(', ')} */`,
    `/* Status: stub -- replace with actual EQL logic */`,
    `any where true`,
  ].join('\n');
}

/**
 * Render a candidate as KQL (structured stub).
 */
function renderKql(candidate) {
  const title = (candidate.detection_logic && candidate.detection_logic.title) || candidate.candidate_id;
  return [
    `// THRUNT Detection: ${title}`,
    `// Candidate: ${candidate.candidate_id}`,
    `// Source Finding: ${candidate.source_finding_id}`,
    `// Techniques: ${(candidate.technique_ids || []).join(', ')}`,
    `// Status: stub -- replace with actual KQL logic`,
    `SecurityEvent`,
    `| take 10`,
  ].join('\n');
}

const RENDERERS = {
  sigma: renderSigma,
  splunk_spl: renderSplunkSpl,
  elastic_eql: renderElasticEql,
  kql: renderKql,
};

/**
 * Render a candidate in a specific format.
 *
 * @param {object} candidate - detection candidate
 * @param {string} format - target format (sigma, splunk_spl, elastic_eql, kql)
 * @returns {object} { format, content } or { error, supported }
 */
function renderCandidate(candidate, format) {
  const targetFormat = format || candidate.target_format;
  const renderer = RENDERERS[targetFormat];
  if (!renderer) {
    return { error: `Unknown format: ${targetFormat}`, supported: Object.keys(RENDERERS) };
  }
  return { format: targetFormat, content: renderer(candidate) };
}

// ---------------------------------------------------------------------------
// List Candidates
// ---------------------------------------------------------------------------

/**
 * Read existing detection candidates from DETECTIONS/ directory.
 *
 * @param {string} cwd - project root
 * @param {object} options - { status?, phase? }
 * @returns {Array<object>} parsed candidate objects
 */
function listDetectionCandidates(cwd, options) {
  const detectionsDir = planningPaths(cwd).detections;
  if (!fs.existsSync(detectionsDir)) return [];

  const files = fs.readdirSync(detectionsDir).filter(f => f.endsWith('.json'));
  const candidates = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(detectionsDir, file), 'utf-8');
      const candidate = JSON.parse(content);
      candidates.push(candidate);
    } catch {
      // Skip corrupt JSON files
    }
  }

  // Apply filters
  let filtered = candidates;

  if (options && options.status) {
    filtered = filtered.filter(c =>
      c.metadata && c.metadata.status === options.status
    );
  }

  if (options && options.phase) {
    filtered = filtered.filter(c =>
      c.source_phase && c.source_phase.startsWith(options.phase)
    );
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// CLI Entry Points
// ---------------------------------------------------------------------------

/**
 * CLI: detection map -- scan findings and produce detection candidates.
 *
 * Follows output(result, raw, humanText) convention:
 * - --raw => output(candidates, raw) => JSON
 * - no --raw => output(candidates, true, markdown) => human-readable Markdown
 */
function cmdDetectionMap(cwd, options, raw) {
  const candidates = mapFindingsToDetections(cwd, options || {});

  if (raw) {
    output(candidates, raw);
    return;
  }

  if (candidates.length === 0) {
    output(candidates, true, 'No detection candidates generated. No qualifying findings found.');
    return;
  }

  const lines = [`# Detection Mapping Results`, '', `**Candidates created:** ${candidates.length}`, ''];

  for (const c of candidates) {
    lines.push(`## ${c.candidate_id}`);
    lines.push('');
    lines.push(`- **Source Finding:** ${c.source_finding_id}`);
    lines.push(`- **Techniques:** ${c.technique_ids.join(', ')}`);
    lines.push(`- **Target Format:** ${c.target_format}`);
    lines.push(`- **Confidence:** ${c.confidence}`);
    lines.push(`- **Promotion Readiness:** ${c.promotion_readiness}`);
    lines.push(`- **Status:** ${c.metadata.status}`);
    lines.push('');
  }

  output(candidates, true, lines.join('\n'));
}

/**
 * CLI: detection list -- display existing detection candidates.
 *
 * Follows output(result, raw, humanText) convention:
 * - --raw => output(candidates, raw) => JSON
 * - no --raw => output(candidates, true, markdown) => human-readable Markdown
 */
function cmdDetectionList(cwd, options, raw) {
  const candidates = listDetectionCandidates(cwd, options || {});

  if (raw) {
    output(candidates, raw);
    return;
  }

  if (candidates.length === 0) {
    output(candidates, true, 'No detection candidates found.');
    return;
  }

  const lines = [
    '# Detection Candidates',
    '',
    '| Candidate ID | Source Finding | Target Format | Status | Promotion Readiness |',
    '|---|---|---|---|---|',
  ];

  for (const c of candidates) {
    lines.push(`| ${c.candidate_id} | ${c.source_finding_id || '-'} | ${c.target_format || '-'} | ${(c.metadata && c.metadata.status) || '-'} | ${c.promotion_readiness || '-'} |`);
  }

  output(candidates, true, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Generation, Validation, Noise Scoring, and Backtesting
// ---------------------------------------------------------------------------

const FORMAT_EXTENSIONS = {
  sigma: '.yml',
  splunk_spl: '.spl',
  elastic_eql: '.eql',
  kql: '.kql',
};

/**
 * Generate a backtest ID following the makeCandidateId pattern.
 * Format: BT-{YYYYMMDDHHMMSS}-{RANDOM8}
 */
function makeBacktestId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `BT-${stamp}-${suffix}`;
}

/**
 * Validate Sigma structural requirements.
 * Required: title (string), logsource (object), detection (object with condition).
 * Warns on: empty logsource (no category/product/service), empty selection.
 */
function validateSigmaStructure(candidate) {
  const errors = [];
  const warnings = [];
  const dl = candidate.detection_logic || {};

  if (!dl.title || typeof dl.title !== 'string') errors.push('missing or invalid title');
  if (!dl.logsource || typeof dl.logsource !== 'object') errors.push('missing logsource');
  if (!dl.detection || typeof dl.detection !== 'object') errors.push('missing detection');
  if (dl.detection && !dl.detection.condition) errors.push('missing detection.condition');

  if (dl.logsource && typeof dl.logsource === 'object' &&
      !dl.logsource.category && !dl.logsource.product && !dl.logsource.service) {
    warnings.push('logsource has no category, product, or service -- overly generic');
  }
  if (dl.detection && dl.detection.selection &&
      typeof dl.detection.selection === 'object' &&
      Object.keys(dl.detection.selection).length === 0) {
    warnings.push('empty selection object -- matches everything');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate stub format structure (SPL/EQL/KQL).
 * Checks detection_logic is non-empty. Flags as stub with limited validation.
 */
function validateStubStructure(candidate, format) {
  const errors = [];
  const warnings = [`stub format (${format}) -- limited validation`];
  const dl = candidate.detection_logic;
  if (!dl || (typeof dl === 'object' && Object.keys(dl).length === 0)) {
    errors.push('empty detection_logic');
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate candidate structure per target format.
 * Dispatches to format-specific validators.
 *
 * @param {object} candidate
 * @param {string} format - sigma, splunk_spl, elastic_eql, kql
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateStructure(candidate, format) {
  if (format === 'sigma') return validateSigmaStructure(candidate);
  if (format === 'splunk_spl' || format === 'elastic_eql' || format === 'kql') {
    return validateStubStructure(candidate, format);
  }
  return { valid: false, errors: [`unsupported format: ${format}`], warnings: [] };
}

/**
 * Score noise risk for a detection candidate.
 *
 * Stub formats (SPL/EQL/KQL) return default medium risk with stub flag.
 * Sigma: scores detection section content for wildcard density,
 * field specificity, time window breadth, and negation usage.
 *
 * @param {object} candidate
 * @param {string} renderedContent
 * @returns {{ noise_risk: string, dimensions: object, score: number, stub?: boolean }}
 */
function scoreNoise(candidate, renderedContent) {
  const format = candidate.target_format;

  // Stub formats get default medium noise
  if (format === 'splunk_spl' || format === 'elastic_eql' || format === 'kql') {
    return {
      noise_risk: 'medium',
      dimensions: {
        wildcard_density: 0.5,
        field_specificity: 0.5,
        time_window_breadth: 0.5,
        negation_only: 0,
      },
      score: 0.45,
      stub: true,
    };
  }

  // Sigma: extract detection section from rendered content
  const detectionContent = extractDetectionSection(renderedContent);
  const dl = (candidate.detection_logic && candidate.detection_logic.detection) || {};
  const selection = dl.selection || {};
  const condition = (dl.condition || '').toLowerCase();

  // Wildcard density
  const wildcardCount = (detectionContent.match(/\*/g) || []).length;
  const tokenCount = detectionContent.split(/\s+/).filter(Boolean).length;
  const wildcardDensity = Math.min(1.0, wildcardCount / Math.max(tokenCount * 0.1, 1));

  // Field specificity: more named fields = lower noise
  const fieldCount = Object.keys(selection).length;
  const fieldSpecificity = Math.max(0, 1.0 - (fieldCount / 5));

  // Time window breadth: 1.0 if no timeframe, 0.0 if timeframe present
  const hasTimeframe = candidate.detection_logic &&
    (candidate.detection_logic.timeframe || (dl.timeframe));
  const timeWindowBreadth = hasTimeframe ? 0.0 : 1.0;

  // Negation only: 1.0 if condition uses only NOT/exclude without positive selection
  const hasPositiveSelection = /\bselection\b/.test(condition) && !/^\s*not\b/i.test(condition);
  const hasNegation = /\bnot\b/i.test(condition) || /\bexclude\b/i.test(condition);
  const negationOnly = (hasNegation && !hasPositiveSelection) ? 1.0 : 0.0;

  const dimensions = {
    wildcard_density: Math.round(wildcardDensity * 10000) / 10000,
    field_specificity: Math.round(fieldSpecificity * 10000) / 10000,
    time_window_breadth: timeWindowBreadth,
    negation_only: negationOnly,
  };

  const score = (dimensions.wildcard_density * 0.3) +
                (dimensions.field_specificity * 0.3) +
                (dimensions.time_window_breadth * 0.2) +
                (dimensions.negation_only * 0.2);

  const roundedScore = Math.round(score * 10000) / 10000;
  const noiseRisk = roundedScore > 0.6 ? 'high' : roundedScore > 0.3 ? 'medium' : 'low';

  return { noise_risk: noiseRisk, dimensions, score: roundedScore };
}

/**
 * Extract the detection section from rendered Sigma YAML content.
 * Returns lines between 'detection:' and the next top-level key.
 */
function extractDetectionSection(content) {
  const lines = content.split('\n');
  let collecting = false;
  const detectionLines = [];

  for (const line of lines) {
    if (/^detection:/.test(line)) {
      collecting = true;
      continue;
    }
    if (collecting) {
      // Stop at next top-level key (no leading whitespace)
      if (/^\S/.test(line) && line.trim() !== '') {
        break;
      }
      detectionLines.push(line);
    }
  }

  return detectionLines.join('\n');
}

/**
 * Validate expected outcome schema.
 * Returns { valid, errors, warnings }.
 *
 * @param {object|null|undefined} outcomes
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateExpectedOutcomes(outcomes) {
  if (outcomes === null || outcomes === undefined) {
    return { valid: true, errors: [], warnings: ['no expected outcomes defined'] };
  }

  const errors = [];
  const warnings = [];

  // expected_matches must have numeric min and max
  if (!outcomes.expected_matches ||
      typeof outcomes.expected_matches.min !== 'number' ||
      typeof outcomes.expected_matches.max !== 'number') {
    errors.push('expected_matches must have numeric min and max');
  }

  // expected_noise_level must be low/medium/high
  const validLevels = ['low', 'medium', 'high'];
  if (!validLevels.includes(outcomes.expected_noise_level)) {
    errors.push('expected_noise_level must be low, medium, or high');
  }

  // time_window must be a string
  if (outcomes.time_window !== undefined && typeof outcomes.time_window !== 'string') {
    errors.push('time_window must be a string');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Generate detection rules from existing candidates.
 *
 * Reads candidates from DETECTIONS/, renders each via renderCandidate(),
 * and writes rule files to DETECTIONS/rules/ with format-specific extensions.
 *
 * @param {string} cwd - project root
 * @param {object} options - { phase?, candidate?, format? }
 * @returns {object} generation report
 */
function generateDetectionRules(cwd, options) {
  let candidates = listDetectionCandidates(cwd, options || {});

  // Candidate ID filter
  if (options && options.candidate) {
    candidates = candidates.filter(c => c.candidate_id === options.candidate);
  }

  const paths = planningPaths(cwd);
  const rulesDir = path.join(paths.detections, 'rules');
  const report = {
    total_candidates: candidates.length,
    generated: 0,
    skipped: 0,
    errors: 0,
    rules: [],
    skipped_candidates: [],
    format_breakdown: {},
  };

  for (const candidate of candidates) {
    // Skip candidates with missing or empty detection_logic
    if (!candidate.detection_logic ||
        (typeof candidate.detection_logic === 'object' &&
         Object.keys(candidate.detection_logic).length === 0)) {
      report.skipped++;
      report.skipped_candidates.push({
        candidate_id: candidate.candidate_id,
        reason: 'missing detection_logic',
      });
      continue;
    }

    const result = renderCandidate(candidate);
    if (result.error) {
      report.errors++;
      report.skipped_candidates.push({
        candidate_id: candidate.candidate_id,
        reason: result.error,
      });
      continue;
    }

    // Ensure rules/ directory exists
    tryMkdir(rulesDir);

    const ext = FORMAT_EXTENSIONS[result.format] || '.txt';
    const filename = `${candidate.candidate_id}-${result.format}${ext}`;
    const filePath = path.join(rulesDir, filename);

    fs.writeFileSync(filePath, result.content, 'utf-8');

    report.generated++;
    report.rules.push({
      candidate_id: candidate.candidate_id,
      format: result.format,
      file: `rules/${filename}`,
      status: 'ok',
    });
    report.format_breakdown[result.format] = (report.format_breakdown[result.format] || 0) + 1;
  }

  return report;
}

/**
 * Write a backtest result to backtests/ atomically (write to tmp, rename).
 */
function writeBacktestResult(backtestsDir, backtestResult) {
  tryMkdir(backtestsDir);
  const tmpFile = path.join(backtestsDir, `.tmp-${backtestResult.backtest_id}.json`);
  const finalFile = path.join(backtestsDir, `${backtestResult.backtest_id}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(backtestResult, null, 2), 'utf-8');
  fs.renameSync(tmpFile, finalFile);
}

/**
 * Update candidate promotion_readiness with backtest delta and rewrite to disk.
 */
function updateCandidateReadiness(detectionsDir, candidate, delta) {
  const baseScore = scorePromotionReadiness(candidate, {
    finding_status: candidate.confidence,
  });
  candidate.promotion_readiness = Math.max(0, Math.min(1,
    Math.round((baseScore + delta) * 10000) / 10000
  ));

  const candidateCopy = { ...candidate };
  delete candidateCopy.content_hash;
  candidate.content_hash = computeContentHash(canonicalSerialize(candidateCopy));

  const candidateFile = path.join(detectionsDir, `${candidate.candidate_id}.json`);
  if (fs.existsSync(candidateFile)) {
    fs.writeFileSync(candidateFile, JSON.stringify(candidate, null, 2), 'utf-8');
  }
}

/**
 * Compute promotion_readiness_delta from validation and noise results.
 */
function computeReadinessDelta(validation, noiseScore) {
  const validationPenalty = validation.passed ? 0 : -0.2;
  const noisePenalties = { high: -0.15, medium: -0.05, low: 0 };
  const noisePenalty = noisePenalties[noiseScore.noise_risk] || 0;
  return validationPenalty + noisePenalty;
}

/**
 * Backtest a single detection candidate.
 *
 * Renders the candidate, runs structural validation and noise scoring,
 * validates expected outcomes, computes promotion_readiness_delta,
 * writes result to backtests/ atomically, and updates the candidate JSON.
 *
 * @param {string} cwd - project root
 * @param {object} candidate - detection candidate object
 * @returns {object} backtest result
 */
function backtestDetection(cwd, candidate) {
  const paths = planningPaths(cwd);
  const format = candidate.target_format || 'sigma';

  // Render candidate
  const renderResult = renderCandidate(candidate);
  const renderedContent = renderResult.error ? '' : renderResult.content;
  const ruleFile = renderResult.error ? null :
    `rules/${candidate.candidate_id}-${renderResult.format}${FORMAT_EXTENSIONS[renderResult.format] || '.txt'}`;

  // Validation and scoring
  const validation = validateStructure(candidate, format);
  const noiseScore = scoreNoise(candidate, renderedContent);
  const outcomeValidation = validateExpectedOutcomes(
    candidate.expected_outcomes !== undefined ? candidate.expected_outcomes : null
  );
  const delta = computeReadinessDelta(validation, noiseScore);

  // Build backtest result
  const backtestResult = {
    backtest_id: makeBacktestId(),
    candidate_id: candidate.candidate_id,
    rule_file: ruleFile,
    timestamp: nowUtc(),
    validation: { passed: validation.valid, errors: validation.errors, warnings: validation.warnings },
    noise_score: noiseScore,
    expected_outcomes: outcomeValidation,
    promotion_readiness_delta: Math.round(delta * 10000) / 10000,
  };
  backtestResult.content_hash = computeContentHash(canonicalSerialize(backtestResult));

  // Persist results and update candidate
  writeBacktestResult(path.join(paths.detections, 'backtests'), backtestResult);
  updateCandidateReadiness(paths.detections, candidate, delta);

  return backtestResult;
}

// ---------------------------------------------------------------------------
// CLI Entry Points: Generation and Backtesting
// ---------------------------------------------------------------------------

/**
 * CLI: detection generate -- generate detection rule files from candidates.
 *
 * Follows output(result, raw, humanText) convention:
 * - --raw => output(report, raw) => JSON
 * - no --raw => human-readable Markdown summary
 */
function cmdDetectionGenerate(cwd, options, raw) {
  const report = generateDetectionRules(cwd, options || {});

  if (raw) {
    output(report, raw);
    return;
  }

  const lines = [
    '# Detection Generation Report',
    '',
    `**Total candidates:** ${report.total_candidates}`,
    `**Generated:** ${report.generated}`,
    `**Skipped:** ${report.skipped}`,
    `**Errors:** ${report.errors}`,
    '',
  ];

  if (report.rules.length > 0) {
    lines.push('| Candidate ID | Format | File | Status |');
    lines.push('|---|---|---|---|');
    for (const rule of report.rules) {
      lines.push(`| ${rule.candidate_id} | ${rule.format} | ${rule.file} | ${rule.status} |`);
    }
    lines.push('');
  }

  if (report.skipped_candidates.length > 0) {
    lines.push('**Skipped candidates:**');
    for (const s of report.skipped_candidates) {
      lines.push(`- ${s.candidate_id}: ${s.reason}`);
    }
    lines.push('');
  }

  output(report, true, lines.join('\n'));
}

/**
 * CLI: detection backtest -- run backtests on detection candidates.
 *
 * Follows output(result, raw, humanText) convention:
 * - --raw => output(summary, raw) => JSON
 * - no --raw => human-readable Markdown with pass/fail and noise breakdown
 */
function cmdDetectionBacktest(cwd, options, raw) {
  let candidates = listDetectionCandidates(cwd, options || {});

  if (options && options.candidate) {
    candidates = candidates.filter(c => c.candidate_id === options.candidate);
  }

  const results = [];
  const noiseBreakdown = { low: 0, medium: 0, high: 0 };
  let passed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const result = backtestDetection(cwd, candidate);
    results.push(result);

    if (result.validation.passed) {
      passed++;
    } else {
      failed++;
    }
    const risk = result.noise_score.noise_risk;
    noiseBreakdown[risk] = (noiseBreakdown[risk] || 0) + 1;
  }

  const summary = {
    total_candidates: candidates.length,
    backtested: results.length,
    results,
    summary: { passed, failed, noise_breakdown: noiseBreakdown },
  };

  if (raw) {
    output(summary, raw);
    return;
  }

  const lines = [
    '# Detection Backtest Results',
    '',
    `**Backtested:** ${summary.backtested}`,
    `**Passed:** ${passed}`,
    `**Failed:** ${failed}`,
    '',
    '**Noise Breakdown:**',
    `- Low: ${noiseBreakdown.low}`,
    `- Medium: ${noiseBreakdown.medium}`,
    `- High: ${noiseBreakdown.high}`,
    '',
  ];

  if (results.length > 0) {
    lines.push('| Candidate ID | Validation | Noise Risk | Delta |');
    lines.push('|---|---|---|---|');
    for (const r of results) {
      const status = r.validation.passed ? 'PASS' : 'FAIL';
      lines.push(`| ${r.candidate_id} | ${status} | ${r.noise_score.noise_risk} | ${r.promotion_readiness_delta} |`);
    }
    lines.push('');
  }

  output(summary, true, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Promotion ID Generators
// ---------------------------------------------------------------------------

/**
 * Generate a promotion receipt ID. Format: PROM-{YYYYMMDDHHMMSS}-{RANDOM8}
 */
function makePromotionId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `PROM-${stamp}-${suffix}`;
}

/**
 * Generate a rejection receipt ID. Format: REJ-{YYYYMMDDHHMMSS}-{RANDOM8}
 */
function makeRejectionId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `REJ-${stamp}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Promotion: Backtest Lookup
// ---------------------------------------------------------------------------

/**
 * Find the latest backtest result for a candidate.
 * Scans DETECTIONS/backtests/ for JSON files matching candidate_id.
 * Returns latest by backtest_id (timestamp-based sort), or null.
 */
function findLatestBacktest(candidateId, cwd) {
  const backtestsDir = path.join(planningPaths(cwd).detections, 'backtests');
  if (!fs.existsSync(backtestsDir)) return null;

  let backtests = [];
  try {
    const files = fs.readdirSync(backtestsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const bt = JSON.parse(fs.readFileSync(path.join(backtestsDir, file), 'utf-8'));
        if (bt.candidate_id === candidateId) {
          backtests.push(bt);
        }
      } catch {
        // Skip corrupt files
      }
    }
  } catch {
    return null;
  }

  if (backtests.length === 0) return null;
  backtests.sort((a, b) => (b.backtest_id || '').localeCompare(a.backtest_id || ''));
  return backtests[0];
}

// ---------------------------------------------------------------------------
// Promotion: Gate Checking
// ---------------------------------------------------------------------------

/**
 * Evaluate three promotion gates (cheapest first):
 * 1. backtest_passed - has a passing backtest
 * 2. readiness_threshold - promotion_readiness >= config threshold
 * 3. analyst_approval - --approve flag set
 *
 * @returns {{ all_passed: boolean, gates: Array<{ gate, passed, detail }> }}
 */
function checkPromotionGates(candidate, cwd, options) {
  const config = loadConfig(cwd);
  const gates = [];

  // Gate 1: Backtest passed
  const backtest = findLatestBacktest(candidate.candidate_id, cwd);
  const backtestPassed = backtest ? (backtest.validation && backtest.validation.passed === true) : false;
  gates.push({
    gate: 'backtest_passed',
    passed: backtestPassed,
    detail: backtest
      ? (backtestPassed ? `Backtest ${backtest.backtest_id} passed` : `Backtest ${backtest.backtest_id} failed validation`)
      : 'No backtest found for candidate',
  });

  // Gate 2: Readiness threshold
  const threshold = config.promotion_readiness_threshold || 0.6;
  const readiness = candidate.promotion_readiness || 0;
  const readinessPassed = readiness >= threshold;
  gates.push({
    gate: 'readiness_threshold',
    passed: readinessPassed,
    detail: readinessPassed
      ? `Readiness ${readiness} >= threshold ${threshold}`
      : `Readiness ${readiness} < threshold ${threshold}`,
  });

  // Gate 3: Analyst approval
  const approved = options && options.approve === true;
  gates.push({
    gate: 'analyst_approval',
    passed: approved,
    detail: approved ? 'Analyst approved with --approve flag' : 'Missing --approve flag',
  });

  return {
    all_passed: gates.every(g => g.passed),
    gates,
  };
}

// ---------------------------------------------------------------------------
// Promotion: Hooks
// ---------------------------------------------------------------------------

/**
 * Apply promotion hooks following applySignatureHooks pattern from manifest.cjs.
 * Calls beforePromote(candidate) before, afterPromote(candidate, receipt) after.
 * Returns potentially mutated candidate.
 */
function applyPromotionHooks(candidate, receipt, hooks) {
  if (!hooks || (!hooks.beforePromote && !hooks.afterPromote)) return candidate;

  let result = { ...candidate };

  if (typeof hooks.beforePromote === 'function') {
    result = hooks.beforePromote(result) || result;
  }

  if (typeof hooks.afterPromote === 'function') {
    hooks.afterPromote(result, receipt);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Promotion: Write Promoted Rule
// ---------------------------------------------------------------------------

/**
 * Render candidate and write rule file + meta.json sidecar to DETECTIONS/promotions/rules/.
 * Returns { rulePath, metaPath } as relative paths from DETECTIONS/.
 */
function writePromotedRule(candidate, cwd) {
  const detectionsDir = planningPaths(cwd).detections;
  const promotionRulesDir = path.join(detectionsDir, 'promotions', 'rules');
  tryMkdir(promotionRulesDir);

  const format = candidate.target_format || 'sigma';
  const ext = FORMAT_EXTENSIONS[format] || '.txt';
  const ruleFilename = `${candidate.candidate_id}-${format}${ext}`;
  const metaFilename = `${candidate.candidate_id}-${format}${ext}.meta.json`;

  const rendered = renderCandidate(candidate);
  const content = rendered.error ? '' : rendered.content;

  fs.writeFileSync(path.join(promotionRulesDir, ruleFilename), content, 'utf-8');

  const meta = {
    candidate_id: candidate.candidate_id,
    source_finding_id: candidate.source_finding_id,
    technique_ids: candidate.technique_ids || [],
    confidence: candidate.confidence,
    promotion_readiness: candidate.promotion_readiness,
    evidence_chain: candidate.evidence_links || [],
    promoted_at: nowUtc(),
  };
  fs.writeFileSync(path.join(promotionRulesDir, metaFilename), JSON.stringify(meta, null, 2), 'utf-8');

  return {
    rulePath: `promotions/rules/${ruleFilename}`,
    metaPath: `promotions/rules/${metaFilename}`,
  };
}

// ---------------------------------------------------------------------------
// Promotion: Core Promote/Reject/Status
// ---------------------------------------------------------------------------

/**
 * Promote a detection candidate through three-gate workflow.
 *
 * @param {string} cwd - project root
 * @param {object} candidate - detection candidate object
 * @param {object} options - { approve, 'promoted-by'?, hooks? }
 * @returns {object} promotion result
 */
function promoteDetection(cwd, candidate, options) {
  const config = loadConfig(cwd);
  const detectionsDir = planningPaths(cwd).detections;
  const promotionsDir = path.join(detectionsDir, 'promotions');

  // Check gates
  const gateResult = checkPromotionGates(candidate, cwd, options);
  if (!gateResult.all_passed) {
    const failedGates = gateResult.gates.filter(g => !g.passed);
    return {
      promoted: false,
      gates: gateResult,
      reason: `Promotion blocked: ${failedGates.map(g => g.detail).join('; ')}`,
    };
  }

  // Hooks: beforePromote
  const hooksEnabled = config.promotion_hooks_enabled;
  const hooks = options && options.hooks;
  if (hooksEnabled && hooks) {
    applyPromotionHooks(candidate, null, hooks);
  }

  // Write promoted rule + sidecar
  const ruleResult = writePromotedRule(candidate, cwd);

  // Build promotion receipt
  const promotionId = makePromotionId();
  const promotedBy = (options && options['promoted-by']) || detectRuntimeName();
  const receipt = {
    promotion_id: promotionId,
    candidate_id: candidate.candidate_id,
    rule_path: ruleResult.rulePath,
    target_format: candidate.target_format || 'sigma',
    promoted_at: nowUtc(),
    promoted_by: promotedBy,
    gate_results: gateResult.gates,
    evidence_chain: candidate.evidence_links || [],
  };

  // Compute content hash for receipt integrity
  const receiptCopy = { ...receipt };
  receipt.content_hash = computeContentHash(canonicalSerialize(receiptCopy));

  // Write receipt atomically
  tryMkdir(promotionsDir);
  const tmpFile = path.join(promotionsDir, `.tmp-${promotionId}.json`);
  const finalFile = path.join(promotionsDir, `${promotionId}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(receipt, null, 2), 'utf-8');
  fs.renameSync(tmpFile, finalFile);

  // Update candidate status on disk
  candidate.metadata.status = 'promoted';
  const candidateCopy = { ...candidate };
  delete candidateCopy.content_hash;
  candidate.content_hash = computeContentHash(canonicalSerialize(candidateCopy));
  const candidateFile = path.join(detectionsDir, `${candidate.candidate_id}.json`);
  if (fs.existsSync(candidateFile)) {
    fs.writeFileSync(candidateFile, JSON.stringify(candidate, null, 2), 'utf-8');
  }

  // Hooks: afterPromote
  if (hooksEnabled && hooks) {
    applyPromotionHooks(candidate, receipt, { afterPromote: hooks.afterPromote });
  }

  // Emit promotion outcome telemetry
  try {
    telemetry.recordPromotionOutcome(cwd, candidate, receipt);
  } catch (_) { /* telemetry failures must not break promotion */ }

  return { promoted: true, receipt, rule_path: ruleResult.rulePath };
}

/**
 * Reject a detection candidate with a reason, creating an audit trail.
 *
 * @param {string} cwd - project root
 * @param {object} candidate - detection candidate object
 * @param {object} options - { reason, 'rejected-by'? }
 * @returns {object} rejection result
 */
function rejectDetection(cwd, candidate, options) {
  const detectionsDir = planningPaths(cwd).detections;
  const promotionsDir = path.join(detectionsDir, 'promotions');

  const rejectionId = makeRejectionId();
  const rejectedBy = (options && options['rejected-by']) || detectRuntimeName();
  const receipt = {
    rejection_id: rejectionId,
    candidate_id: candidate.candidate_id,
    reason: (options && options.reason) || 'No reason provided',
    rejected_at: nowUtc(),
    rejected_by: rejectedBy,
  };
  receipt.content_hash = computeContentHash(canonicalSerialize({ ...receipt }));

  // Write receipt atomically
  tryMkdir(promotionsDir);
  const tmpFile = path.join(promotionsDir, `.tmp-${rejectionId}.json`);
  const finalFile = path.join(promotionsDir, `${rejectionId}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(receipt, null, 2), 'utf-8');
  fs.renameSync(tmpFile, finalFile);

  // Update candidate status on disk
  candidate.metadata.status = 'rejected';
  candidate.metadata.rejection_reason = receipt.reason;
  const candidateCopy = { ...candidate };
  delete candidateCopy.content_hash;
  candidate.content_hash = computeContentHash(canonicalSerialize(candidateCopy));
  const candidateFile = path.join(detectionsDir, `${candidate.candidate_id}.json`);
  if (fs.existsSync(candidateFile)) {
    fs.writeFileSync(candidateFile, JSON.stringify(candidate, null, 2), 'utf-8');
  }

  // Emit rejection outcome telemetry
  try {
    telemetry.recordPromotionOutcome(cwd, candidate, receipt);
  } catch (_) { /* telemetry failures must not break rejection */ }

  return { rejected: true, receipt };
}

/**
 * Scan DETECTIONS/ for all candidates, group by status with counts and scores.
 *
 * @param {string} cwd - project root
 * @param {object} options - (reserved for future use)
 * @returns {object} { by_status, counts }
 */
function detectionStatus(cwd, options) {
  const candidates = listDetectionCandidates(cwd, {});

  const byStatus = { draft: [], promoted: [], rejected: [] };
  for (const c of candidates) {
    const status = (c.metadata && c.metadata.status) || 'draft';
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push({
      candidate_id: c.candidate_id,
      source_finding_id: c.source_finding_id,
      target_format: c.target_format,
      promotion_readiness: c.promotion_readiness,
      status,
    });
  }

  return {
    by_status: byStatus,
    counts: {
      draft: byStatus.draft.length,
      promoted: byStatus.promoted.length,
      rejected: byStatus.rejected.length,
      total: candidates.length,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI Entry Points: Promote, Reject, Status
// ---------------------------------------------------------------------------

/**
 * CLI: detection promote -- promote single candidate or bulk by phase.
 */
function cmdDetectionPromote(cwd, options, raw) {
  const detectionsDir = planningPaths(cwd).detections;

  if (options && options.candidate) {
    // Single candidate promote
    const candidateFile = path.join(detectionsDir, `${options.candidate}.json`);
    if (!fs.existsSync(candidateFile)) {
      error(`Candidate not found: ${options.candidate}`);
    }
    const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf-8'));
    const result = promoteDetection(cwd, candidate, options);

    if (raw) {
      output(result, raw);
      return;
    }

    if (result.promoted) {
      output(result, true, `Promoted ${options.candidate}\nReceipt: ${result.receipt.promotion_id}\nRule: ${result.rule_path}`);
    } else {
      output(result, true, `Promotion blocked for ${options.candidate}: ${result.reason}`);
    }
    return;
  }

  if (options && options.phase) {
    // Bulk promote
    const candidates = listDetectionCandidates(cwd, {}).filter(c =>
      c.metadata && c.metadata.status === 'draft' &&
      c.source_phase && c.source_phase.startsWith(options.phase)
    );

    const promoted = [];
    const skipped = [];
    const failed = [];

    for (const candidate of candidates) {
      try {
        const result = promoteDetection(cwd, candidate, options);
        if (result.promoted) {
          promoted.push({ candidate_id: candidate.candidate_id, receipt: result.receipt });
        } else {
          skipped.push({ candidate_id: candidate.candidate_id, reason: result.reason });
        }
      } catch (err) {
        failed.push({ candidate_id: candidate.candidate_id, error: err.message });
      }
    }

    const summary = { promoted, skipped, failed };

    if (raw) {
      output(summary, raw);
      return;
    }

    const lines = [
      '# Bulk Promotion Results',
      '',
      `**Promoted:** ${promoted.length}`,
      `**Skipped:** ${skipped.length}`,
      `**Failed:** ${failed.length}`,
      '',
    ];
    for (const p of promoted) {
      lines.push(`- PROMOTED: ${p.candidate_id} (${p.receipt.promotion_id})`);
    }
    for (const s of skipped) {
      lines.push(`- SKIPPED: ${s.candidate_id}: ${s.reason}`);
    }
    for (const f of failed) {
      lines.push(`- FAILED: ${f.candidate_id}: ${f.error}`);
    }

    output(summary, true, lines.join('\n'));
    return;
  }

  error('Usage: detection promote --candidate ID --approve  OR  detection promote --phase N --approve');
}

/**
 * CLI: detection reject -- reject a candidate with reason.
 */
function cmdDetectionReject(cwd, options, raw) {
  if (!options || !options.candidate) {
    error('Usage: detection reject --candidate ID --reason "text"');
  }
  if (!options.reason) {
    error('Usage: detection reject --candidate ID --reason "text" (--reason is required)');
  }

  const detectionsDir = planningPaths(cwd).detections;
  const candidateFile = path.join(detectionsDir, `${options.candidate}.json`);
  if (!fs.existsSync(candidateFile)) {
    error(`Candidate not found: ${options.candidate}`);
  }
  const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf-8'));
  const result = rejectDetection(cwd, candidate, options);

  if (raw) {
    output(result, raw);
    return;
  }

  output(result, true, `Rejected ${options.candidate}\nReceipt: ${result.receipt.rejection_id}\nReason: ${result.receipt.reason}`);
}

/**
 * CLI: detection status -- show candidates grouped by lifecycle status.
 */
function cmdDetectionStatus(cwd, options, raw) {
  const result = detectionStatus(cwd, options || {});

  if (raw) {
    output(result, raw);
    return;
  }

  const lines = [
    '# Detection Status',
    '',
    '| Status | Count |',
    '|--------|-------|',
    `| Draft | ${result.counts.draft} |`,
    `| Promoted | ${result.counts.promoted} |`,
    `| Rejected | ${result.counts.rejected} |`,
    `| **Total** | **${result.counts.total}** |`,
    '',
  ];

  for (const [status, candidates] of Object.entries(result.by_status)) {
    if (candidates.length > 0) {
      lines.push(`## ${status.charAt(0).toUpperCase() + status.slice(1)}`);
      lines.push('');
      for (const c of candidates) {
        lines.push(`- ${c.candidate_id} (readiness: ${c.promotion_readiness})`);
      }
      lines.push('');
    }
  }

  output(result, true, lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createDetectionCandidate,
  mapFindingsToDetections,
  scorePromotionReadiness,
  renderCandidate,
  listDetectionCandidates,
  cmdDetectionMap,
  cmdDetectionList,
  cmdDetectionGenerate,
  cmdDetectionBacktest,
  toYaml,
  generateDetectionRules,
  backtestDetection,
  scoreNoise,
  validateStructure,
  validateExpectedOutcomes,
  FORMAT_EXTENSIONS,
  makeBacktestId,
  promoteDetection,
  rejectDetection,
  detectionStatus,
  checkPromotionGates,
  applyPromotionHooks,
  cmdDetectionPromote,
  cmdDetectionReject,
  cmdDetectionStatus,
};
