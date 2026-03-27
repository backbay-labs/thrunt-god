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
const { planningPaths, output, error } = require('./core.cjs');
const { canonicalSerialize, computeContentHash } = require('./manifest.cjs');

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
  toYaml,
};
