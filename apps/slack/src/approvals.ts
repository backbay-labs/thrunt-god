/**
 * Persistent approval store — maps approval IDs to pending approval records.
 *
 * Stored as JSON at `.thrunt-god/slack-approvals.json` in the workspace root.
 * Follows the same persistence pattern as channel bindings.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"

// =============================================================================
// Types
// =============================================================================

export interface PendingApproval {
  action: string
  rationale: string
  phase: string
  requestedAt: string
  channelId: string
  messageTs: string
}

export interface ApprovalStore {
  set(id: string, data: PendingApproval): Promise<void>
  get(id: string): PendingApproval | undefined
  delete(id: string): Promise<void>
  load(): Promise<void>
  save(): Promise<void>
}

// =============================================================================
// Factory
// =============================================================================

export function createApprovalStore(workspaceRoot: string): ApprovalStore {
  const filePath = join(workspaceRoot, ".thrunt-god", "slack-approvals.json")
  let map: Record<string, PendingApproval> = {}

  const store: ApprovalStore = {
    async set(id: string, data: PendingApproval): Promise<void> {
      map[id] = data
      await store.save()
    },

    get(id: string): PendingApproval | undefined {
      return map[id]
    },

    async delete(id: string): Promise<void> {
      delete map[id]
      await store.save()
    },

    async load(): Promise<void> {
      try {
        const raw = await readFile(filePath, "utf8")
        const parsed = JSON.parse(raw)
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          map = parsed as Record<string, PendingApproval>
        }
      } catch {
        // File doesn't exist or is malformed — start fresh
        map = {}
      }
    },

    async save(): Promise<void> {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, JSON.stringify(map, null, 2) + "\n", "utf8")
    },
  }

  return store
}
