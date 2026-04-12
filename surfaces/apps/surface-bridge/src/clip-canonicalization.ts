import type {
  EvidenceAttachment,
  QueryLogSummary,
} from '@thrunt-surfaces/contracts';
import {
  writeArtifact,
  type LoadedArtifacts,
  type PlanningPaths,
} from '@thrunt-surfaces/artifacts';

export interface CanonicalizedArtifact {
  type: 'query' | 'receipt' | 'evidence';
  id: string;
}

export interface CanonicalizationResult {
  artifactKind: 'query' | 'receipt' | 'evidence';
  classification: 'query_candidate' | 'receipt_candidate' | 'plain_evidence' | 'ambiguous';
  primaryId: string;
  reason: string | null;
  createdArtifacts: CanonicalizedArtifact[];
  message: string;
}

type SourceQuery =
  | {
    language: string;
    statement: string;
    timeRange?: { start: string; end: string };
    parameters?: Record<string, unknown>;
  }
  | null
  | undefined;

export function canonicalizeAttachment(
  paths: PlanningPaths,
  attachment: EvidenceAttachment,
  artifacts: LoadedArtifacts,
  makeId: (prefix: string) => string,
): CanonicalizationResult {
  const connectorId = mapVendorToConnector(attachment.vendorId);
  const dataset = mapVendorToDataset(attachment.vendorId, attachment.context?.pageType);
  const hypothesisYaml = yamlList(attachment.hypothesisIds);
  const sourceQuery = attachment.context?.sourceQuery ?? null;
  const timestamp = attachment.capturedAt || new Date().toISOString();

  if (attachment.payload.kind === 'query' && attachment.payload.statement.trim()) {
    const queryId = makeId('QRY');
    const queryDoc = buildQueryDocument({
      queryId,
      connectorId,
      dataset,
      timestamp,
      title: `${connectorId} browser query capture`,
      intent: 'Canonicalized browser clip from the operator shell.',
      statement: attachment.payload.statement,
      language: attachment.payload.language,
      relatedHypotheses: attachment.hypothesisIds,
      relatedReceipts: [],
      attachment,
    });
    writeArtifact(`${paths.queries}/${queryId}.md`, queryDoc);
    return {
      artifactKind: 'query',
      classification: 'query_candidate',
      primaryId: queryId,
      reason: null,
      createdArtifacts: [{ type: 'query', id: queryId }],
      message: `Canonicalized browser query into QUERIES/${queryId}.md`,
    };
  }

  if (attachment.payload.kind === 'table') {
    const hasStructuredResult = attachment.payload.rowCount > 0 || sourceQuery;
    if (hasStructuredResult) {
      const receiptId = makeId('RCT');
      const relatedQueries = resolveReceiptQueries(artifacts.queries, connectorId, sourceQuery, makeId, dataset, timestamp, attachment);
      const receiptDoc = buildReceiptDocument({
        receiptId,
        connectorId,
        dataset,
        timestamp,
        claim: attachment.payload.rowCount > 0
          ? `Captured ${attachment.payload.rowCount} row(s) from a ${connectorId} browser result table.`
          : `Captured an empty ${connectorId} browser result table with source query context.`,
        relatedHypotheses: attachment.hypothesisIds,
        relatedQueries: relatedQueries.map((query) => query.id),
        confidence: renderConfidence(attachment, attachment.payload.rowCount > 0 ? 'Browser-captured results table contained material rows.' : 'Browser-captured results table was empty but query context was preserved.'),
        evidenceLines: [
          `rows=${attachment.payload.rowCount}`,
          `columns=${attachment.payload.headers.length}`,
          `sample_headers=${attachment.payload.headers.slice(0, 6).join(', ') || 'none'}`,
        ],
        attachment,
      });

      for (const query of relatedQueries) {
        if (query.write) {
          writeArtifact(`${paths.queries}/${query.id}.md`, query.document);
        }
      }
      writeArtifact(`${paths.receipts}/${receiptId}.md`, receiptDoc);

      return {
        artifactKind: 'receipt',
        classification: 'receipt_candidate',
        primaryId: receiptId,
        reason: null,
        createdArtifacts: [
          ...relatedQueries.filter((query) => query.write).map((query) => ({ type: 'query' as const, id: query.id })),
          { type: 'receipt', id: receiptId },
        ],
        message: `Canonicalized browser result clip into RECEIPTS/${receiptId}.md`,
      };
    }

    return writeEvidenceFallback(paths, attachment, makeId, {
      classification: 'ambiguous',
      reason: 'Result table did not contain rows or source query context needed for canonical receipt generation.',
      relatedQueries: [],
      relatedReceipts: [],
      hypothesisYaml,
    });
  }

  if (attachment.payload.kind === 'entity') {
    const hasExplicitSourceQuery = typeof sourceQuery?.statement === 'string' && sourceQuery.statement.trim().length > 0;
    const extractionConfidence = attachment.context?.extraction?.confidence ?? 'low';
    const extractionCompleteness = attachment.context?.extraction?.completeness ?? 'partial';
    const structuredEntityPage = attachment.context?.pageType === 'entity_detail' || attachment.context?.pageType === 'incident';
    const sourceQueries = resolveReceiptQueries(artifacts.queries, connectorId, sourceQuery, makeId, dataset, timestamp, attachment);

    if (hasExplicitSourceQuery || (structuredEntityPage && extractionConfidence !== 'low' && extractionCompleteness === 'complete')) {
      const receiptId = makeId('RCT');
      const receiptDoc = buildReceiptDocument({
        receiptId,
        connectorId,
        dataset,
        timestamp,
        claim: `Captured ${attachment.payload.entityType} "${attachment.payload.value}" from the ${connectorId} browser console.`,
        relatedHypotheses: attachment.hypothesisIds,
        relatedQueries: sourceQueries.map((query) => query.id),
        confidence: renderConfidence(attachment, 'Browser-captured entity value came from a structured vendor page.'),
        evidenceLines: [
          `entity_type=${attachment.payload.entityType}`,
          `entity_value=${attachment.payload.value}`,
        ],
        attachment,
      });

      for (const query of sourceQueries) {
        if (query.write) {
          writeArtifact(`${paths.queries}/${query.id}.md`, query.document);
        }
      }
      writeArtifact(`${paths.receipts}/${receiptId}.md`, receiptDoc);

      return {
        artifactKind: 'receipt',
        classification: 'receipt_candidate',
        primaryId: receiptId,
        reason: null,
        createdArtifacts: [
          ...sourceQueries.filter((query) => query.write).map((query) => ({ type: 'query' as const, id: query.id })),
          { type: 'receipt', id: receiptId },
        ],
        message: `Canonicalized browser entity clip into RECEIPTS/${receiptId}.md`,
      };
    }

    return writeEvidenceFallback(paths, attachment, makeId, {
      classification: 'ambiguous',
      reason: 'Entity clip did not include enough query or page context to form a canonical receipt.',
      relatedQueries: [],
      relatedReceipts: [],
      hypothesisYaml,
    });
  }

  return writeEvidenceFallback(paths, attachment, makeId, {
    classification: 'plain_evidence',
    reason: 'Clip does not meet the threshold for query or receipt canonicalization.',
    relatedQueries: [],
    relatedReceipts: [],
    hypothesisYaml,
  });
}

interface SynthesizedQuery {
  id: string;
  document: string;
  write: boolean;
}

function resolveReceiptQueries(
  queries: QueryLogSummary[],
  connectorId: string,
  sourceQuery: SourceQuery,
  makeId: (prefix: string) => string,
  dataset: string,
  timestamp: string,
  attachment: EvidenceAttachment,
): SynthesizedQuery[] {
  if (sourceQuery && typeof sourceQuery.statement === 'string' && sourceQuery.statement.trim()) {
    const queryId = makeId('QRY');
    return [{
      id: queryId,
      write: true,
      document: buildQueryDocument({
        queryId,
        connectorId,
        dataset,
        timestamp,
        title: `${connectorId} browser source query`,
        intent: 'Synthesized query artifact from browser receipt capture context.',
        statement: sourceQuery.statement,
        language: sourceQuery.language,
        relatedHypotheses: attachment.hypothesisIds,
        relatedReceipts: [],
        attachment,
      }),
    }];
  }

  const existing = findLatestQuery(queries, connectorId);
  if (!existing) return [];
  return [{
    id: existing.queryId,
    write: false,
    document: '',
  }];
}

function findLatestQuery(queries: QueryLogSummary[], connectorId: string): QueryLogSummary | null {
  return queries
    .filter((query) => query.connectorId === connectorId)
    .sort((left, right) => toEpoch(right.executedAt) - toEpoch(left.executedAt))[0] ?? null;
}

function writeEvidenceFallback(
  paths: PlanningPaths,
  attachment: EvidenceAttachment,
  makeId: (prefix: string) => string,
  options: {
    classification: CanonicalizationResult['classification'];
    reason: string;
    relatedQueries: string[];
    relatedReceipts: string[];
    hypothesisYaml: string;
  },
): CanonicalizationResult {
  const evidenceId = makeId('EVD');
  const timestamp = attachment.capturedAt || new Date().toISOString();
  const reviewStatus = attachment.hypothesisIds.length > 0 ? 'captured' : 'needs_follow_up';
  const body = buildEvidenceBody(attachment);
  const content = `---
evidence_id: ${evidenceId}
surface_id: ${attachment.surfaceId}
type: ${attachment.type}
vendor_id: ${attachment.vendorId}
source_url: ${attachment.sourceUrl}
captured_at: ${timestamp}
captured_by: ${attachment.capturedBy}
review_status: ${reviewStatus}
classification: ${options.classification}
canonicalization_reason: ${escapeFrontmatter(options.reason)}
related_hypotheses:
${options.hypothesisYaml}
related_queries:
${yamlList(options.relatedQueries)}
related_receipts:
${yamlList(options.relatedReceipts)}
---

# Evidence: ${attachment.type} from ${attachment.vendorId}

${body}

## Canonicalization

- **Outcome:** ${options.classification}
- **Reason:** ${options.reason}

## Source

- **Surface:** ${attachment.surfaceId}
- **Vendor:** ${attachment.vendorId}
- **URL:** ${attachment.sourceUrl}
- **Captured:** ${timestamp}
`;

  writeArtifact(`${paths.evidence}/${evidenceId}.md`, content);
  return {
    artifactKind: 'evidence',
    classification: options.classification,
    primaryId: evidenceId,
    reason: options.reason,
    createdArtifacts: [{ type: 'evidence', id: evidenceId }],
    message: `Stored browser clip as EVIDENCE/${evidenceId}.md`,
  };
}

function buildQueryDocument(options: {
  queryId: string;
  connectorId: string;
  dataset: string;
  timestamp: string;
  title: string;
  intent: string;
  statement: string;
  language: string;
  relatedHypotheses: string[];
  relatedReceipts: string[];
  attachment: EvidenceAttachment;
}): string {
  return `---
query_id: ${options.queryId}
query_spec_version: "browser-capture/v1"
source: ${options.dataset}
connector_id: ${options.connectorId}
dataset: ${options.dataset}
executed_at: ${options.timestamp}
author: browser-extension
related_hypotheses:
${yamlList(options.relatedHypotheses)}
related_receipts:
${yamlList(options.relatedReceipts)}
---

# Query Log: ${options.title}

## Intent

${options.intent}

## Query Or Procedure

~~~text
${options.statement}
~~~

## Parameters

- **Time window:** ${renderTimeWindow(options.attachment)}
- **Page type:** ${options.attachment.context?.pageType || 'unknown'}
- **Browser source:** ${options.attachment.sourceUrl}

## Runtime Metadata

- **Collection path:** browser-extension clip canonicalization
- **Language:** ${options.language}
- **Extraction confidence:** ${options.attachment.context?.extraction?.confidence || 'unknown'}
- **Completeness:** ${options.attachment.context?.extraction?.completeness || 'unknown'}

## Result Summary

events=0, templates=0, entities=0, evidence=1, status=captured

## Related Receipts

- ${options.relatedReceipts.length > 0 ? options.relatedReceipts.join('\n- ') : 'none'}

## Notes

Generated from browser capture context, not direct runtime execution.
`;
}

function buildReceiptDocument(options: {
  receiptId: string;
  connectorId: string;
  dataset: string;
  timestamp: string;
  claim: string;
  relatedHypotheses: string[];
  relatedQueries: string[];
  confidence: string;
  evidenceLines: string[];
  attachment: EvidenceAttachment;
}): string {
  return `---
receipt_id: ${options.receiptId}
query_spec_version: "browser-capture/v1"
created_at: ${options.timestamp}
source: ${options.connectorId}
connector_id: ${options.connectorId}
dataset: ${options.dataset}
result_status: captured
claim_status: context
related_hypotheses:
${yamlList(options.relatedHypotheses)}
related_queries:
${yamlList(options.relatedQueries)}
---

# Receipt: ${options.connectorId} browser capture receipt

## Claim

${options.claim}

## Evidence

${options.evidenceLines.map((line) => `- ${line}`).join('\n')}

## Chain Of Custody

- **Collected by:** ${options.attachment.capturedBy}
- **Collection path:** browser-extension clip canonicalization
- **Source URL:** ${options.attachment.sourceUrl}
- **Page type:** ${options.attachment.context?.pageType || 'unknown'}

## Runtime Metadata

- **Extraction confidence:** ${options.attachment.context?.extraction?.confidence || 'unknown'}
- **Completeness:** ${options.attachment.context?.extraction?.completeness || 'unknown'}
- **Browser source query:** ${options.attachment.context?.sourceQuery?.statement ? 'present' : 'absent'}

## Confidence

${options.confidence}

## Notes

Generated from a structured browser clip instead of direct connector execution.
`;
}

function buildEvidenceBody(attachment: EvidenceAttachment): string {
  const payload = attachment.payload;
  switch (payload.kind) {
    case 'query':
      return `## Captured Query\n\n**Language:** ${payload.language}\n\n\`\`\`\n${payload.statement}\n\`\`\``;
    case 'table':
      return `## Captured Table\n\n**Rows:** ${payload.rowCount}\n\n| ${payload.headers.join(' | ')} |\n| ${payload.headers.map(() => '---').join(' | ')} |\n${payload.rows.slice(0, 20).map((row) => `| ${row.join(' | ')} |`).join('\n')}`;
    case 'entity':
      return `## Captured Entity\n\n**Type:** ${payload.entityType}\n**Value:** ${payload.value}`;
    case 'page_context':
      return `## Page Context\n\n**Title:** ${payload.title}\n**URL:** ${payload.url}${payload.selectedText ? `\n\n**Selected Text:**\n${payload.selectedText}` : ''}`;
    case 'note':
      return `## Operator Note\n\n${payload.text}`;
    case 'screenshot':
      return `## Screenshot Metadata\n\n**Dimensions:** ${payload.width}x${payload.height}\n**Description:** ${payload.description}`;
  }
}

function mapVendorToConnector(vendorId: string): string {
  switch (vendorId) {
    case 'okta':
    case 'sentinel':
    case 'aws':
      return vendorId;
    default:
      return vendorId || 'browser';
  }
}

function mapVendorToDataset(vendorId: string, pageType?: string): string {
  if (vendorId === 'okta') return 'identity';
  if (vendorId === 'sentinel') return pageType === 'incident' ? 'alerts' : 'events';
  if (vendorId === 'aws') return 'cloud';
  return 'events';
}

function renderTimeWindow(attachment: EvidenceAttachment): string {
  const queryRange = attachment.context?.sourceQuery?.timeRange;
  if (queryRange?.start && queryRange?.end) {
    return `${queryRange.start} -> ${queryRange.end}`;
  }

  const metadataTimeRange = attachment.context?.metadata?.timeRange;
  return typeof metadataTimeRange === 'string' ? metadataTimeRange : 'not captured';
}

function renderConfidence(attachment: EvidenceAttachment, reason: string): string {
  const confidence = attachment.context?.extraction?.confidence || 'medium';
  return `${capitalize(confidence)} - ${reason}`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function yamlList(values: string[]): string {
  return values.length > 0
    ? values.map((value) => `  - ${value}`).join('\n')
    : '  -';
}

function escapeFrontmatter(value: string): string {
  return value.replace(/\n/g, ' ').trim();
}

function toEpoch(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
