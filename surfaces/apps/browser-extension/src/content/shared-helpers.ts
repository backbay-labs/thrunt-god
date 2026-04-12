/**
 * Shared entity helpers for content script adapters.
 * Consolidates deduplicateEntities and inferEntityType to avoid duplication.
 */

import type { ExtractedEntity } from '@thrunt-surfaces/contracts';

export function inferEntityType(value: string): ExtractedEntity['type'] {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value) || /^[0-9a-fA-F]*:[0-9a-fA-F:]{1,37}$/.test(value)) return 'ip';
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return 'domain';
  if (/^[a-fA-F0-9]{32,128}$/.test(value)) return 'hash';
  if (value.includes('@')) return 'email';
  if (value.startsWith('/') || value.includes('\\')) return 'file_path';
  return 'other';
}

export function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const value = e.value?.trim().toLowerCase() ?? '';
    const key = `${e.type}:${value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
