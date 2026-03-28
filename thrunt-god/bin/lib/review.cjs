/**
 * Evidence Quality Review — Scoring, publish gating, contradiction detection,
 * blind-spot surfacing, chain-of-custody timeline, and Markdown rendering.
 *
 * One-way dependency: manifest.cjs and evidence.cjs must NEVER import from review.cjs.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { planningPaths, loadConfig, output, error, toPosixPath } = require('./core.cjs');
const { verifyManifestIntegrity } = require('./manifest.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function readManifests(cwd, options) {
  const manifestsDir = planningPaths(cwd).manifests;
  if (!fs.existsSync(manifestsDir)) return [];

  const files = fs.readdirSync(manifestsDir).filter(f => f.endsWith('.json'));
  const manifests = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(manifestsDir, file), 'utf-8');
      manifests.push(JSON.parse(content));
    } catch {
      // skip corrupt files
    }
  }

  if (options && options.phase) {
    const phaseTag = `phase:${options.phase}`;
    return manifests.filter(m => {
      if (Array.isArray(m.tags) && m.tags.includes(phaseTag)) return true;
      if (Array.isArray(m.artifacts)) {
        return m.artifacts.some(a =>
          a.path && a.path.includes(`phases/${options.phase}`)
        );
      }
      return false;
    });
  }

  return manifests;
}

// Parses `- [ ] **HYP-XX**` / `- [x] **HYP-XX**` lines from HYPOTHESES.md.
function readHypothesisIds(cwd) {
  const hypPath = planningPaths(cwd).hypotheses;
  if (!fs.existsSync(hypPath)) return [];

  const content = fs.readFileSync(hypPath, 'utf-8');
  const ids = [];
  const pattern = /^-\s*\[[ x]\]\s*\*\*([A-Z]+-\d+)\*\*/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

// Returns Set of hypothesis IDs that have at least one receipt file.
function readReceiptHypothesisIds(cwd) {
  const receiptsDir = planningPaths(cwd).receipts;
  if (!fs.existsSync(receiptsDir)) return new Set();

  const files = fs.readdirSync(receiptsDir).filter(f => f.endsWith('.md'));
  const covered = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(receiptsDir, file), 'utf-8');
    const hypPattern = /\b(HYP-\d+)\b/g;
    let match;
    while ((match = hypPattern.exec(content)) !== null) {
      covered.add(match[1]);
    }
  }

  return covered;
}

// Scan FINDINGS.md across phase dirs. Returns all findings (not just unresolved).
function scanAllFindings(cwd, options) {
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

// Reads PROM-*.json from DETECTIONS/promotions/ directly (not via detection.cjs,
// to avoid circular dependency).
function readPromotionReceipts(cwd) {
  const promotionsDir = path.join(planningPaths(cwd).detections, 'promotions');
  if (!fs.existsSync(promotionsDir)) return [];

  const receipts = [];
  try {
    const files = fs.readdirSync(promotionsDir).filter(f =>
      f.startsWith('PROM-') && f.endsWith('.json')
    );
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(promotionsDir, file), 'utf-8');
        receipts.push(JSON.parse(content));
      } catch {
        // skip corrupt files
      }
    }
  } catch {
    // unreadable
  }

  return receipts;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

// Hypotheses with both "confirmed" and "refuted" findings.
function detectContradictions(cwd, options) {
  const findings = scanAllFindings(cwd, options);
  if (findings.length === 0) return [];

  const byHypothesis = {};
  for (const f of findings) {
    if (!byHypothesis[f.hypothesis_id]) {
      byHypothesis[f.hypothesis_id] = [];
    }
    byHypothesis[f.hypothesis_id].push(f);
  }

  const contradictions = [];
  for (const [hypId, hypFindings] of Object.entries(byHypothesis)) {
    const hasConfirmed = hypFindings.some(f => f.status === 'confirmed');
    const hasRefuted = hypFindings.some(f => f.status === 'refuted');

    if (hasConfirmed && hasRefuted) {
      contradictions.push({
        hypothesis_id: hypId,
        conflicting_findings: hypFindings.map(f => ({
          finding: f.id,
          status: f.status,
          evidence: f.description,
        })),
      });
    }
  }

  return contradictions;
}

function detectBlindSpots(cwd, options) {
  const hypothesisIds = readHypothesisIds(cwd);
  if (hypothesisIds.length === 0) return [];

  const coveredIds = readReceiptHypothesisIds(cwd);
  return hypothesisIds.filter(id => !coveredIds.has(id));
}

function buildChainOfCustody(cwd, options) {
  const manifests = readManifests(cwd, options);
  const chain = [];

  for (const manifest of manifests) {
    if (!manifest.provenance) continue;

    const prov = manifest.provenance;
    const entry = {
      manifest_id: manifest.manifest_id,
      signer_type: prov.signer ? prov.signer.signer_type : null,
      signer_id: prov.signer ? prov.signer.signer_id : null,
      signed_at: prov.signed_at || null,
    };

    if (prov.environment) {
      entry.runtime_name = prov.environment.runtime_name || null;
      entry.thrunt_version = prov.environment.thrunt_version || null;
    }

    chain.push(entry);
  }

  chain.sort((a, b) => {
    if (!a.signed_at && !b.signed_at) return 0;
    if (!a.signed_at) return 1;
    if (!b.signed_at) return -1;
    return new Date(a.signed_at) - new Date(b.signed_at);
  });

  return chain;
}

// Composite quality score: receipt coverage + integrity + provenance,
// minus contradiction penalty, plus promotion bonus.
function scoreEvidenceQuality(cwd, options) {
  const config = loadConfig(cwd);
  const threshold = config.publish_quality_threshold || 0.7;

  const hypothesisIds = readHypothesisIds(cwd);
  const coveredIds = readReceiptHypothesisIds(cwd);
  const receiptTotal = hypothesisIds.length;
  const receiptCovered = hypothesisIds.filter(id => coveredIds.has(id)).length;
  const receiptScore = receiptTotal === 0 ? 1.0 : receiptCovered / receiptTotal;

  const manifests = readManifests(cwd, options);
  const integrityTotal = manifests.length;
  let integrityPassed = 0;
  const integrityFailures = [];

  for (const manifest of manifests) {
    const result = verifyManifestIntegrity(manifest, cwd);
    if (result.valid) {
      integrityPassed++;
    } else {
      integrityFailures.push({
        manifest_id: manifest.manifest_id,
        failures: result.failures,
      });
    }
  }
  const integrityScore = integrityTotal === 0 ? 1.0 : integrityPassed / integrityTotal;

  let withSigner = 0;
  for (const manifest of manifests) {
    if (manifest.provenance && manifest.provenance.signer && manifest.provenance.signer.signer_id) {
      withSigner++;
    }
  }
  const provenanceTotal = manifests.length;
  const provenanceScore = provenanceTotal === 0 ? 1.0 : withSigner / provenanceTotal;

  const contradictions = detectContradictions(cwd, options);
  const contradictionPenalty = 0.1 * contradictions.length;

  const blindSpots = detectBlindSpots(cwd, options);
  const chainOfCustody = buildChainOfCustody(cwd, options);

  const promotionReceipts = readPromotionReceipts(cwd);
  const promotionBonus = Math.min(0.15, promotionReceipts.length * 0.05);

  const avgDimensions = (receiptScore + integrityScore + provenanceScore) / 3;
  const score = Math.min(1, Math.max(0, avgDimensions - contradictionPenalty + promotionBonus));
  const roundedScore = Math.round(score * 10000) / 10000; // avoid floating-point noise

  return {
    score: roundedScore,
    passed: roundedScore >= threshold,
    threshold,
    dimensions: {
      receipt_coverage: {
        score: receiptScore,
        total: receiptTotal,
        covered: receiptCovered,
        details: blindSpots.map(id => ({ hypothesis_id: id, covered: false })),
      },
      integrity: {
        score: integrityScore,
        total: integrityTotal,
        passed_count: integrityPassed,
        failures: integrityFailures,
      },
      provenance_completeness: {
        score: provenanceScore,
        total: provenanceTotal,
        with_signer: withSigner,
      },
    },
    promotion_coverage: {
      promoted_count: promotionReceipts.length,
      bonus: promotionBonus,
      cap: 0.15,
      receipts: promotionReceipts.map(r => r.promotion_id),
    },
    contradiction_penalty: contradictionPenalty,
    contradictions,
    blind_spots: blindSpots,
    chain_of_custody: chainOfCustody,
    phase_filter: (options && options.phase) || null,
  };
}

function checkPublishGate(scoreResult, options) {
  const threshold = scoreResult.threshold || 0.7;
  const force = options && options.force;
  const passed = scoreResult.score >= threshold;

  const failedDimensions = [];
  if (scoreResult.dimensions) {
    for (const [name, dim] of Object.entries(scoreResult.dimensions)) {
      if (dim.score < threshold) {
        failedDimensions.push(name);
      }
    }
  }

  if (force) {
    return {
      passed: true,
      forced: true,
      score: scoreResult.score,
      threshold,
      failed_dimensions: failedDimensions,
      reason: passed ? null : `Score ${scoreResult.score} below threshold ${threshold} — force override applied`,
      override_reason: (options && options.override_reason) || 'Force override requested',
    };
  }

  if (passed) {
    return {
      passed: true,
      forced: false,
      score: scoreResult.score,
      threshold,
      failed_dimensions: [],
      reason: null,
      override_reason: null,
    };
  }

  return {
    passed: false,
    forced: false,
    score: scoreResult.score,
    threshold,
    failed_dimensions: failedDimensions,
    reason: `Publication blocked: quality score ${scoreResult.score} is below threshold ${threshold}. Failed dimensions: ${failedDimensions.join(', ') || 'composite score'}`,
    override_reason: null,
  };
}

function renderReviewMarkdown(result, gateResult) {
  const lines = [];

  lines.push('# Evidence Quality Review');
  lines.push('');

  lines.push('## Score Summary');
  lines.push('');
  lines.push(`- **Composite Score:** ${result.score}`);
  lines.push(`- **Threshold:** ${result.threshold}`);
  lines.push(`- **Status:** ${result.passed ? 'PASSED' : 'FAILED'}`);
  if (result.phase_filter) {
    lines.push(`- **Phase Filter:** ${result.phase_filter}`);
  }
  lines.push('');

  lines.push('## Dimension Breakdown');
  lines.push('');
  lines.push('| Dimension | Score | Detail |');
  lines.push('|-----------|-------|--------|');
  const dims = result.dimensions;
  lines.push(`| Receipt Coverage | ${dims.receipt_coverage.score} | ${dims.receipt_coverage.covered}/${dims.receipt_coverage.total} hypotheses covered |`);
  lines.push(`| Integrity | ${dims.integrity.score} | ${dims.integrity.passed_count}/${dims.integrity.total} manifests pass |`);
  lines.push(`| Provenance Completeness | ${dims.provenance_completeness.score} | ${dims.provenance_completeness.with_signer}/${dims.provenance_completeness.total} with signer |`);
  if (result.contradiction_penalty > 0) {
    lines.push(`| Contradiction Penalty | -${result.contradiction_penalty} | ${result.contradictions.length} contradiction(s) |`);
  }
  lines.push('');

  lines.push('## Contradictions');
  lines.push('');
  if (result.contradictions.length === 0) {
    lines.push('None detected.');
  } else {
    for (const c of result.contradictions) {
      lines.push(`### ${c.hypothesis_id}`);
      lines.push('');
      for (const f of c.conflicting_findings) {
        lines.push(`- **${f.finding}** (${f.status}): ${f.evidence}`);
      }
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## Blind Spots');
  lines.push('');
  if (result.blind_spots.length === 0) {
    lines.push('None detected. All hypotheses have receipt coverage.');
  } else {
    lines.push('The following hypotheses have zero receipts:');
    lines.push('');
    for (const id of result.blind_spots) {
      lines.push(`- ${id}`);
    }
  }
  lines.push('');

  lines.push('## Chain of Custody');
  lines.push('');
  if (result.chain_of_custody.length === 0) {
    lines.push('No provenance entries found.');
  } else {
    lines.push('| Manifest | Signer | Signed At | Runtime |');
    lines.push('|----------|--------|-----------|---------|');
    for (const entry of result.chain_of_custody) {
      lines.push(`| ${entry.manifest_id} | ${entry.signer_id || 'n/a'} | ${entry.signed_at || 'n/a'} | ${entry.runtime_name || 'n/a'} |`);
    }
  }
  lines.push('');

  lines.push('## Gate Status');
  lines.push('');
  if (gateResult.forced) {
    lines.push(`**FORCED OVERRIDE** — Score ${gateResult.score} (threshold ${gateResult.threshold})`);
    lines.push(`Override reason: ${gateResult.override_reason}`);
  } else if (gateResult.passed) {
    lines.push(`**PASSED** — Score ${gateResult.score} meets threshold ${gateResult.threshold}`);
  } else {
    lines.push(`**BLOCKED** — ${gateResult.reason}`);
    if (gateResult.failed_dimensions.length > 0) {
      lines.push(`Failed dimensions: ${gateResult.failed_dimensions.join(', ')}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function cmdEvidenceReview(cwd, options, raw) {
  const scoreResult = scoreEvidenceQuality(cwd, options || {});
  const gateResult = checkPublishGate(scoreResult, options || {});

  const result = {
    ...scoreResult,
    gate: gateResult,
  };

  if (raw) {
    output(result, raw);
  } else {
    const md = renderReviewMarkdown(scoreResult, gateResult);
    // Pass raw=true so output() emits the markdown string instead of JSON
    output(result, true, md);
  }
}

module.exports = {
  scoreEvidenceQuality,
  checkPublishGate,
  detectContradictions,
  detectBlindSpots,
  buildChainOfCustody,
  renderReviewMarkdown,
  cmdEvidenceReview,
};
