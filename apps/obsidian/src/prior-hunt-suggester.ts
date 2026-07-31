/**
 * Prior-hunt suggester module for surfacing historical intelligence.
 *
 * Pure-function module -- NO Obsidian imports. Provides entity matching
 * against historical hunt data to surface relevant prior hunt context
 * when new entities are ingested during a live hunt.
 *
 * All functions are pure data transforms suitable for unit testing.
 */

import type { EntityNote } from './cross-hunt';

// --- Public types ---

/** A suggestion linking a newly ingested entity to prior hunts */
export interface PriorHuntSuggestion {
  entityName: string;
  entityType: string;
  matchingHunts: string[];  // hunt_refs from historical notes, excluding current hunt
  sourcePath: string;       // path of the matching historical entity note (set by caller)
}

// --- Public functions ---

/**
 * Find prior hunt matches for a newly ingested entity.
 *
 * Scans all known entity notes for exact name matches that appear in
 * multiple prior hunts, indicating historical intelligence relevance.
 *
 * @param newEntityName - Name/value of the newly ingested entity
 * @param newEntityType - Type of the newly ingested entity (fallback if note has no type)
 * @param allNotes - All known entity notes from the vault
 * @param currentHuntId - ID of the current active hunt (excluded from matchingHunts)
 * @param minHunts - Minimum number of total hunt refs required (default 2)
 * @returns Array of suggestions for entities seen in prior hunts
 */
export function findPriorHuntMatches(
  newEntityName: string,
  newEntityType: string,
  allNotes: EntityNote[],
  currentHuntId: string,
  minHunts: number = 2,
): PriorHuntSuggestion[] {
  return allNotes
    .filter(note =>
      note.name === newEntityName &&
      note.huntRefs.length >= minHunts &&
      note.huntRefs.some(ref => ref !== currentHuntId),
    )
    .map(note => ({
      entityName: note.name,
      entityType: note.entityType || newEntityType,
      matchingHunts: note.huntRefs.filter(ref => ref !== currentHuntId),
      sourcePath: '',
    }));
}
