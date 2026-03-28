/**
 * Evidence Audit — Cross-phase EVIDENCE_REVIEW/FINDINGS scanner
 *
 * Reads all evidence review and findings files across all phases.
 * Extracts unresolved items. Returns structured JSON for workflow consumption.
 */

const fs = require('fs');
const path = require('path');
const { output, error, getMilestonePhaseFilter, planningDir, planningPaths, toPosixPath } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { requireSafePath, sanitizeForDisplay } = require('./security.cjs');
const { createEvidenceManifest, canonicalSerialize, computeContentHash, buildProvenance, computeManifestHash, verifyManifestIntegrity } = require('./manifest.cjs');
const telemetry = require('./telemetry.cjs');

function cmdAuditEvidence(cwd, raw) {
  const phasesDir = path.join(planningDir(cwd), 'phases');
  if (!fs.existsSync(phasesDir)) {
    error('No phases directory found in planning directory');
  }

  const isDirInMilestone = getMilestonePhaseFilter(cwd);
  const results = [];

  // Scan all phase directories
  const dirs = fs.readdirSync(phasesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(isDirInMilestone)
    .sort();

  for (const dir of dirs) {
    const phaseMatch = dir.match(/^(\d+[A-Z]?(?:\.\d+)*)/i);
    const phaseNum = phaseMatch ? phaseMatch[1] : dir;
    const phaseDir = path.join(phasesDir, dir);
    const files = fs.readdirSync(phaseDir);

    for (const file of files.filter(f => f.includes('EVIDENCE_REVIEW') && f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
      const items = parseEvidenceReviewItems(content);
      if (items.length > 0) {
        results.push({
          phase: phaseNum,
          phase_dir: dir,
          file,
          file_path: toPosixPath(path.relative(cwd, path.join(phaseDir, file))),
          type: 'evidence_review',
          status: (extractFrontmatter(content).status || 'unknown'),
          items,
        });
      }
    }

    for (const file of files.filter(f => f.includes('FINDINGS') && f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
      const items = parseFindingsItems(content);
      if (items.length > 0) {
        results.push({
          phase: phaseNum,
          phase_dir: dir,
          file,
          file_path: toPosixPath(path.relative(cwd, path.join(phaseDir, file))),
          type: 'findings',
          status: (extractFrontmatter(content).status || 'unknown'),
          items,
        });
      }
    }
  }

  // Phase 14: Manifest integrity scanning
  const manifestsDir = planningPaths(cwd).manifests;
  if (fs.existsSync(manifestsDir)) {
    const manifestFiles = fs.readdirSync(manifestsDir).filter(f => f.endsWith('.json'));
    for (const file of manifestFiles) {
      const filePath = path.join(manifestsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const manifest = JSON.parse(content);
        const integrity = verifyManifestIntegrity(manifest, cwd);
        if (!integrity.valid) {
          results.push({
            file,
            file_path: toPosixPath(path.relative(cwd, filePath)),
            type: 'manifest_integrity',
            manifest_id: manifest.manifest_id || file,
            items: integrity.failures.map(f => ({
              name: f.message,
              result: 'fail',
              category: `integrity_${f.type}`,
              ...f,
            })),
          });
        }
      } catch (err) {
        results.push({
          file,
          file_path: toPosixPath(path.relative(cwd, filePath)),
          type: 'manifest_corrupt',
          manifest_id: file,
          items: [{
            name: `Corrupt manifest JSON: ${err.message}`,
            result: 'error',
            category: 'manifest_corrupt',
          }],
        });
      }
    }
  }

  // Compute summary
  const summary = {
    total_files: results.length,
    total_items: results.reduce((sum, r) => sum + r.items.length, 0),
    by_category: {},
    by_phase: {},
  };

  for (const r of results) {
    if (!summary.by_phase[r.phase]) summary.by_phase[r.phase] = 0;
    for (const item of r.items) {
      summary.by_phase[r.phase]++;
      const cat = item.category || 'unknown';
      summary.by_category[cat] = (summary.by_category[cat] || 0) + 1;
    }
  }

  output({ results, summary }, raw);
}

function cmdRenderEvidenceCheckpoint(cwd, options = {}, raw) {
  const filePath = options.file;
  if (!filePath) {
    error('evidence review file required: use evidence render-checkpoint --file <path>');
  }

  const resolvedPath = requireSafePath(filePath, cwd, 'evidence review file', { allowAbsolute: true });
  if (!fs.existsSync(resolvedPath)) {
    error(`evidence review file not found: ${filePath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const currentTest = parseCurrentTest(content);

  if (currentTest.complete) {
    error('evidence session is already complete; no pending checkpoint to render');
  }

  const checkpoint = buildCheckpoint(currentTest);
  output({
    file_path: toPosixPath(path.relative(cwd, resolvedPath)),
    test_number: currentTest.number,
    test_name: currentTest.name,
    checkpoint,
  }, raw, checkpoint);
}

function parseCurrentTest(content) {
  const currentTestMatch = content.match(/##\s*Current Test\s*(?:\n<!--[\s\S]*?-->)?\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!currentTestMatch) {
    error('evidence review file is missing a Current Test section');
  }

  const section = currentTestMatch[1].trimEnd();
  if (!section.trim()) {
    error('Current Test section is empty');
  }

  if (/\[testing complete\]/i.test(section)) {
    return { complete: true };
  }

  const numberMatch = section.match(/^number:\s*(\d+)\s*$/m);
  const nameMatch = section.match(/^name:\s*(.+)\s*$/m);
  const expectedBlockMatch = section.match(/^expected:\s*\|\n([\s\S]*?)(?=^\w[\w-]*:\s)/m)
    || section.match(/^expected:\s*\|\n([\s\S]+)/m);
  const expectedInlineMatch = section.match(/^expected:\s*(.+)\s*$/m);

  if (!numberMatch || !nameMatch || (!expectedBlockMatch && !expectedInlineMatch)) {
    error('Current Test section is malformed');
  }

  let expected;
  if (expectedBlockMatch) {
    expected = expectedBlockMatch[1]
      .split('\n')
      .map(line => line.replace(/^ {2}/, ''))
      .join('\n')
      .trim();
  } else {
    expected = expectedInlineMatch[1].trim();
  }

  return {
    complete: false,
    number: parseInt(numberMatch[1], 10),
    name: sanitizeForDisplay(nameMatch[1].trim()),
    expected: sanitizeForDisplay(expected),
  };
}

function buildCheckpoint(currentTest) {
  return [
    '╔══════════════════════════════════════════════════════════════╗',
    '║  CHECKPOINT: Evidence Review Required                        ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `**Test ${currentTest.number}: ${currentTest.name}**`,
    '',
    currentTest.expected,
    '',
    '──────────────────────────────────────────────────────────────',
    'Type `pass` or describe what\'s wrong.',
    '──────────────────────────────────────────────────────────────',
  ].join('\n');
}

function parseEvidenceReviewChecklistItems(content) {
  const items = [];
  // Match test blocks: ### N. Name\nexpected: ...\nresult: ...\n
  const testPattern = /###\s*(\d+)\.\s*([^\n]+)\nexpected:\s*([^\n]+)\nresult:\s*(\w+)(?:\n(?:reported|reason|blocked_by):\s*[^\n]*)?/g;
  let match;
  while ((match = testPattern.exec(content)) !== null) {
    const [, num, name, expected, result] = match;
    if (result === 'pending' || result === 'skipped' || result === 'blocked') {
      // Extract optional fields — limit to current test block (up to next ### or EOF)
      const afterMatch = content.slice(match.index);
      const nextHeading = afterMatch.indexOf('\n###', 1);
      const blockText = nextHeading > 0 ? afterMatch.slice(0, nextHeading) : afterMatch;
      const reasonMatch = blockText.match(/reason:\s*(.+)/);
      const blockedByMatch = blockText.match(/blocked_by:\s*(.+)/);

      const item = {
        test: parseInt(num, 10),
        name: name.trim(),
        expected: expected.trim(),
        result,
        category: categorizeItem(result, reasonMatch?.[1], blockedByMatch?.[1]),
      };
      if (reasonMatch) item.reason = reasonMatch[1].trim();
      if (blockedByMatch) item.blocked_by = blockedByMatch[1].trim();
      items.push(item);
    }
  }
  return items;
}

function parseFindingsHumanVerificationItems(content, status) {
  const items = [];
  if (status === 'human_needed') {
    // Extract from human_verification section — look for numbered items or table rows
    const hvSection = content.match(/##\s*Human Verification.*?\n([\s\S]*?)(?=\n##\s|\n---\s|$)/i);
    if (hvSection) {
      const lines = hvSection[1].split('\n');
      for (const line of lines) {
        // Match table rows: | N | description | ... |
        const tableMatch = line.match(/\|\s*(\d+)\s*\|\s*([^|]+)/);
        // Match bullet items: - description
        const bulletMatch = line.match(/^[-*]\s+(.+)/);
        // Match numbered items: 1. description
        const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);

        if (tableMatch) {
          items.push({
            test: parseInt(tableMatch[1], 10),
            name: tableMatch[2].trim(),
            result: 'human_needed',
            category: 'human_evidence_review',
          });
        } else if (numberedMatch) {
          items.push({
            test: parseInt(numberedMatch[1], 10),
            name: numberedMatch[2].trim(),
            result: 'human_needed',
            category: 'human_evidence_review',
          });
        } else if (bulletMatch && bulletMatch[1].length > 10) {
          items.push({
            name: bulletMatch[1].trim(),
            result: 'human_needed',
            category: 'human_evidence_review',
          });
        }
      }
    }
  }
  // gaps_found items are already handled by hunt planning gap-closure.
  return items;
}

function parseEvidenceReviewItems(content) {
  const items = parseEvidenceReviewChecklistItems(content);
  const verdictMatch = content.match(/##\s*Publishability Verdict\s*\n+([^\n]+)/i);
  if (verdictMatch && !/ready to publish/i.test(verdictMatch[1])) {
    items.push({
      name: 'Publishability verdict',
      result: verdictMatch[1].trim(),
      category: 'needs_evidence',
    });
  }

  const checkMatches = [...content.matchAll(/^\|\s*([^|]+?)\s*\|\s*(Pass|Fail)\s*\|\s*([^|]*)\|?$/gmi)];
  for (const match of checkMatches) {
    if (match[2].toLowerCase() !== 'fail') continue;
    items.push({
      name: match[1].trim(),
      result: 'fail',
      notes: match[3].trim(),
      category: 'evidence_gap',
    });
  }

  const followUpSection = content.match(/##\s*Follow-Up Needed\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (followUpSection) {
    const followUps = followUpSection[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^-\s+/.test(line))
      .map(line => line.replace(/^-\s+/, '').trim())
      .filter(Boolean);
    for (const followUp of followUps) {
      items.push({
        name: followUp,
        result: 'pending',
        category: 'follow_up',
      });
    }
  }

  return items;
}

function parseFindingsItems(content) {
  const items = [];
  const status = extractFrontmatter(content).status || 'unknown';
  items.push(...parseFindingsHumanVerificationItems(content, status));
  const verdictMatches = [...content.matchAll(/^\|\s*([^|]+?)\s*\|\s*(Supported|Disproved|Inconclusive)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|?$/gmi)];
  for (const match of verdictMatches) {
    if (match[2].toLowerCase() !== 'inconclusive') continue;
    items.push({
      name: match[1].trim(),
      result: 'inconclusive',
      confidence: match[3].trim(),
      evidence: match[4].trim(),
      category: 'inconclusive_hypothesis',
    });
  }

  const unknownSection = content.match(/##\s*What We Do Not Know\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (unknownSection) {
    const unknowns = unknownSection[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^-\s+/.test(line))
      .map(line => line.replace(/^-\s+/, '').trim())
      .filter(Boolean);
    for (const unknown of unknowns) {
      items.push({
        name: unknown,
        result: 'unknown',
        category: 'knowledge_gap',
      });
    }
  }

  return items;
}

function categorizeItem(result, reason, blockedBy) {
  if (result === 'blocked' || blockedBy) {
    if (blockedBy) {
      if (/server/i.test(blockedBy)) return 'server_blocked';
      if (/device|physical/i.test(blockedBy)) return 'device_needed';
      if (/build|release|preview/i.test(blockedBy)) return 'build_needed';
      if (/third.party|twilio|stripe/i.test(blockedBy)) return 'third_party';
    }
    return 'blocked';
  }
  if (result === 'skipped') {
    if (reason) {
      if (/server|not running|not available/i.test(reason)) return 'server_blocked';
      if (/simulator|physical|device/i.test(reason)) return 'device_needed';
      if (/build|release|preview/i.test(reason)) return 'build_needed';
    }
    return 'skipped_unresolved';
  }
  if (result === 'pending') return 'pending';
  if (result === 'human_needed') return 'human_evidence_review';
  return 'unknown';
}

function buildQueryLogDocument(spec, envelope, options = {}) {
  const hypotheses = options.hypothesisIds || spec.evidence?.hypothesis_ids || [];
  const warningSummary = envelope.warnings.length > 0 ? envelope.warnings.map(item => item.code || item.message).join(', ') : 'none';
  const errorSummary = envelope.errors.length > 0 ? envelope.errors.map(item => item.code || item.message).join(', ') : 'none';

  return `---
query_id: ${spec.query_id}
query_spec_version: "${spec.version}"
source: ${spec.dataset.kind}
connector_id: ${spec.connector.id}
dataset: ${spec.dataset.kind}
executed_at: ${envelope.timing.completed_at}
author: ${options.author || 'thrunt-runtime'}
related_hypotheses:
${hypotheses.length > 0 ? hypotheses.map(id => `  - ${id}`).join('\n') : '  -'}
---

# Query Log: ${options.title || `${spec.connector.id} ${spec.dataset.kind} query`}

## Intent

${options.intent || `Execute ${spec.connector.id} ${spec.dataset.kind} query through the shared THRUNT runtime.`}

## Query Or Procedure

~~~text
${spec.query.statement}
~~~

## Parameters

- **Time window:** ${spec.time_window.start} -> ${spec.time_window.end}
- **Entities:** ${Object.keys(spec.parameters).length > 0 ? Object.keys(spec.parameters).join(', ') : 'none'}
- **Filters:** ${Object.keys(spec.parameters).length > 0 ? JSON.stringify(spec.parameters) : 'none'}

## Runtime Metadata

- **Profile:** ${spec.execution.profile}
- **Pagination:** ${spec.pagination.mode} (limit=${spec.pagination.limit}, pages=${envelope.pagination.pages_fetched})
- **Execution hints:** timeout=${spec.execution.timeout_ms}ms, consistency=${spec.execution.consistency}, dry_run=${spec.execution.dry_run}
- **Result status:** ${envelope.status}
- **Warnings:** ${warningSummary}
- **Errors:** ${errorSummary}

## Result Summary

${options.resultSummary || `events=${envelope.counts.events}, entities=${envelope.counts.entities}, evidence=${envelope.counts.evidence}, status=${envelope.status}`}

## Related Receipts

- ${options.receiptIds && options.receiptIds.length > 0 ? options.receiptIds.join('\n- ') : '[RCT-...]'}

## Notes

${options.notes || 'Generated by the shared THRUNT runtime.'}
`;
}

function buildReceiptDocument(spec, envelope, options = {}) {
  const receiptId = options.receiptId || `RCT-${spec.query_id.replace(/^QRY-/, '')}`;
  const hypotheses = options.hypothesisIds || spec.evidence?.hypothesis_ids || [];
  const queryIds = options.queryIds || [spec.query_id];
  const claim = options.claim || `Execution of ${spec.connector.id} ${spec.dataset.kind} query completed with status ${envelope.status}.`;

  return `---
receipt_id: ${receiptId}
query_spec_version: "${spec.version}"
created_at: ${envelope.timing.completed_at}
source: ${spec.connector.id}
connector_id: ${spec.connector.id}
dataset: ${spec.dataset.kind}
result_status: ${envelope.status}
claim_status: ${options.claimStatus || 'context'}
related_hypotheses:
${hypotheses.length > 0 ? hypotheses.map(id => `  - ${id}`).join('\n') : '  -'}
related_queries:
${queryIds.map(id => `  - ${id}`).join('\n')}
---

# Receipt: ${options.title || `${spec.connector.id} ${spec.dataset.kind} execution receipt`}

## Claim

${claim}

## Evidence

- events=${envelope.counts.events}
- entities=${envelope.counts.entities}
- warnings=${envelope.counts.warnings}
- errors=${envelope.counts.errors}

## Chain Of Custody

- **Collected by:** ${options.author || 'thrunt-runtime'}
- **Collection path:** shared runtime execution
- **Identifiers:** query_id=${spec.query_id}, request_id=${spec.execution.request_id}
- **Time observed:** ${envelope.timing.started_at} -> ${envelope.timing.completed_at}

## Runtime Metadata

- **Execution profile:** ${spec.execution.profile}
- **Time window:** ${spec.time_window.start} -> ${spec.time_window.end}
- **Pagination:** ${spec.pagination.mode}; pages_fetched=${envelope.pagination.pages_fetched}
- **Warnings:** ${envelope.warnings.length}
- **Errors:** ${envelope.errors.length}

## Confidence

${options.confidence || 'Medium'} - ${options.confidenceReason || 'Execution metadata was captured directly from the shared runtime.'}

## Notes

${options.notes || 'Generated automatically from runtime execution metadata.'}
`;
}

function writeRuntimeArtifacts(cwd, spec, envelope, options = {}) {
  const paths = planningPaths(cwd);
  fs.mkdirSync(paths.queries, { recursive: true });
  fs.mkdirSync(paths.receipts, { recursive: true });

  const receiptId = options.receiptId || `RCT-${spec.query_id.replace(/^QRY-/, '')}`;
  const queryPath = path.join(paths.queries, `${spec.query_id}.md`);
  const receiptPath = path.join(paths.receipts, `${receiptId}.md`);

  const queryDoc = buildQueryLogDocument(spec, envelope, {
    ...options,
    receiptIds: [receiptId],
  });
  const receiptDoc = buildReceiptDocument(spec, envelope, {
    ...options,
    receiptId,
  });

  fs.writeFileSync(queryPath, queryDoc, 'utf-8');
  fs.writeFileSync(receiptPath, receiptDoc, 'utf-8');

  // Emit manifest AFTER writing artifacts — hash the exact bytes written (pitfall 5)
  const queryContentHash = computeContentHash(queryDoc);
  const receiptContentHash = computeContentHash(receiptDoc);

  const manifest = createEvidenceManifest({
    connector_id: spec.connector.id,
    dataset: spec.dataset.kind,
    execution: {
      profile: spec.execution.profile,
      query_id: spec.query_id,
      request_id: spec.execution.request_id,
      status: envelope.status,
      started_at: envelope.timing.started_at,
      completed_at: envelope.timing.completed_at,
      duration_ms: envelope.timing.duration_ms,
      dry_run: spec.execution.dry_run || false,
    },
    artifacts: [
      {
        id: spec.query_id,
        type: 'query_log',
        path: toPosixPath(path.relative(cwd, queryPath)),
        content: queryDoc,
        receipt_ids: [receiptId],
      },
      {
        id: receiptId,
        type: 'receipt',
        path: toPosixPath(path.relative(cwd, receiptPath)),
        content: receiptDoc,
        query_ids: [spec.query_id],
      },
    ],
    hypothesis_ids: options.hypothesisIds || null,
    tags: options.tags || null,
    raw_metadata: options.rawMetadata || null,
  });

  // Phase 14: Provenance + manifest-level hash
  manifest.provenance = buildProvenance(options.provenance || {});
  manifest.signature = null; // placeholder for future signature hooks
  manifest.manifest_hash = computeManifestHash(manifest);

  const manifestJson = canonicalSerialize(manifest);
  fs.mkdirSync(paths.manifests, { recursive: true });
  const manifestPath = path.join(paths.manifests, `${manifest.manifest_id}.json`);
  fs.writeFileSync(manifestPath, manifestJson, 'utf-8');

  // Emit hunt execution telemetry
  let huntExecution = null;
  try {
    huntExecution = telemetry.recordHuntExecution(cwd, spec, envelope, {
      pack_id: (options && options.pack_id) || null,
      receipt_ids: [receiptId],
      manifest_ids: [manifest.manifest_id],
    });
  } catch (_) { /* telemetry failures must not break execution */ }

  return {
    query_log: {
      id: spec.query_id,
      path: toPosixPath(path.relative(cwd, queryPath)),
    },
    receipts: [
      {
        id: receiptId,
        path: toPosixPath(path.relative(cwd, receiptPath)),
      },
    ],
    manifest: {
      id: manifest.manifest_id,
      path: toPosixPath(path.relative(cwd, manifestPath)),
    },
    telemetry: {
      hunt_execution_id: huntExecution && huntExecution.hunt_execution_id
        ? huntExecution.hunt_execution_id
        : null,
    },
  };
}

module.exports = {
  cmdAuditEvidence,
  cmdRenderEvidenceCheckpoint,
  parseCurrentTest,
  buildCheckpoint,
  buildQueryLogDocument,
  buildReceiptDocument,
  writeRuntimeArtifacts,
};
