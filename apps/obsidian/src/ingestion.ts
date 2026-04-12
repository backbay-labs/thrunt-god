/**
 * Ingestion engine -- pure module for scanning receipt and query log artifacts,
 * extracting IOC and TTP entities, producing entity note create/update
 * instructions with idempotent sighting deduplication, and formatting
 * ingestion log entries.
 *
 * Zero Obsidian imports. All functions are pure -- they accept data and return
 * data. The actual vault I/O is wired in Plan 02.
 */

import type {
  ReceiptSnapshot,
  QuerySnapshot,
  EntityInstruction,
  IngestionResult,
  ReceiptTimelineEntry,
} from './types';

// ---------------------------------------------------------------------------
// extractEntitiesFromReceipt
// ---------------------------------------------------------------------------

/**
 * For each technique_ref in the receipt snapshot, create an EntityInstruction
 * with type = 'ttp', folder = 'entities/ttps', sourceId = receipt_id.
 */
export function extractEntitiesFromReceipt(
  snapshot: ReceiptSnapshot,
  fileName: string,
): EntityInstruction[] {
  return snapshot.technique_refs.map((ref) => ({
    action: 'create' as const,
    entityType: 'ttp',
    name: ref,
    folder: 'entities/ttps',
    sightingLine: buildSightingLine(snapshot.receipt_id, snapshot.claim, fileName),
    sourceId: snapshot.receipt_id,
  }));
}

// ---------------------------------------------------------------------------
// extractEntitiesFromQuery
// ---------------------------------------------------------------------------

/**
 * For each IP create ioc/ip instruction, for each domain create ioc/domain,
 * for each hash create ioc/hash. sourceId = query_id.
 */
export function extractEntitiesFromQuery(
  snapshot: QuerySnapshot,
  fileName: string,
): EntityInstruction[] {
  const instructions: EntityInstruction[] = [];
  const { entity_refs } = snapshot;

  for (const ip of entity_refs.ips) {
    instructions.push({
      action: 'create',
      entityType: 'ioc/ip',
      name: ip,
      folder: 'entities/iocs',
      sightingLine: buildSightingLine(snapshot.query_id, snapshot.intent, fileName),
      sourceId: snapshot.query_id,
    });
  }

  for (const domain of entity_refs.domains) {
    instructions.push({
      action: 'create',
      entityType: 'ioc/domain',
      name: domain,
      folder: 'entities/iocs',
      sightingLine: buildSightingLine(snapshot.query_id, snapshot.intent, fileName),
      sourceId: snapshot.query_id,
    });
  }

  for (const hash of entity_refs.hashes) {
    instructions.push({
      action: 'create',
      entityType: 'ioc/hash',
      name: hash,
      folder: 'entities/iocs',
      sightingLine: buildSightingLine(snapshot.query_id, snapshot.intent, fileName),
      sourceId: snapshot.query_id,
    });
  }

  return instructions;
}

// ---------------------------------------------------------------------------
// buildSightingLine
// ---------------------------------------------------------------------------

/**
 * Returns a markdown sighting line:
 * `- **{sourceId}** ({ISO date}): {truncated claim} [[{fileName}]]`
 *
 * Truncates claim_or_intent to 80 characters with "..." suffix.
 */
export function buildSightingLine(
  sourceId: string,
  claim_or_intent: string,
  fileName: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const truncated =
    claim_or_intent.length > 80
      ? claim_or_intent.slice(0, 77) + '...'
      : claim_or_intent;
  return `- **${sourceId}** (${date}): ${truncated} [[${fileName}]]`;
}

// ---------------------------------------------------------------------------
// deduplicateSightings
// ---------------------------------------------------------------------------

/**
 * Returns true if sourceId does NOT appear in the ## Sightings section of
 * the existing content (i.e., sighting is new). Returns true for empty
 * content or missing Sightings section (treat as new).
 *
 * Checks for `**{sourceId}**` pattern within the ## Sightings section only.
 */
export function deduplicateSightings(
  existingContent: string,
  sourceId: string,
): boolean {
  if (!existingContent) return true;

  // Find the ## Sightings section
  const sightingsMatch = existingContent.match(/^## Sightings\s*$/m);
  if (!sightingsMatch || sightingsMatch.index === undefined) return true;

  // Extract content from ## Sightings to the next ## heading or end of file
  const sectionStart = sightingsMatch.index + sightingsMatch[0].length;
  const nextHeading = existingContent.slice(sectionStart).match(/^## /m);
  const sectionEnd = nextHeading && nextHeading.index !== undefined
    ? sectionStart + nextHeading.index
    : existingContent.length;

  const sightingsSection = existingContent.slice(sectionStart, sectionEnd);

  // Check if sourceId appears as **sourceId**
  return !sightingsSection.includes(`**${sourceId}**`);
}

// ---------------------------------------------------------------------------
// formatIngestionLog
// ---------------------------------------------------------------------------

/**
 * Returns a markdown block for appending to INGESTION_LOG.md:
 *
 * ```
 * ## {timestamp}
 *
 * - Created: {created}
 * - Updated: {updated}
 * - Skipped: {skipped}
 *
 * ### Entities
 * - {action} {entityType} {name} from {sourceId}
 * ```
 */
export function formatIngestionLog(result: IngestionResult): string {
  const lines: string[] = [];

  lines.push(`## ${result.timestamp}`);
  lines.push('');
  lines.push(`- Created: ${result.created}`);
  lines.push(`- Updated: ${result.updated}`);
  lines.push(`- Skipped: ${result.skipped}`);
  lines.push('');
  lines.push('### Entities');

  for (const entity of result.entities) {
    lines.push(`- ${entity.action} ${entity.entityType} ${entity.name} from ${entity.sourceId}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildReceiptTimeline
// ---------------------------------------------------------------------------

/**
 * Maps each receipt to a ReceiptTimelineEntry, using related_hypotheses[0]
 * or "Ungrouped" as hypothesis.
 */
export function buildReceiptTimeline(
  receipts: Array<{ fileName: string; snapshot: ReceiptSnapshot }>,
): ReceiptTimelineEntry[] {
  return receipts.map(({ fileName, snapshot }) => ({
    receipt_id: snapshot.receipt_id,
    claim_status: snapshot.claim_status,
    claim: snapshot.claim,
    technique_refs: snapshot.technique_refs,
    hypothesis: snapshot.related_hypotheses[0] ?? 'Ungrouped',
    fileName,
  }));
}
