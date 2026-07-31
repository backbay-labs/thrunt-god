/**
 * Channel bindings — persistent mapping of Slack channel IDs to
 * case/workspace directories.
 *
 * Stored as JSON at `.thrunt-god/slack-bindings.json` in the workspace root.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"

// =============================================================================
// Types
// =============================================================================

export interface ChannelBindings {
  bind(channelId: string, casePath: string): Promise<void>
  unbind(channelId: string): Promise<void>
  resolve(channelId: string): string | null
  list(): Record<string, string>
  load(): Promise<void>
  save(): Promise<void>
}

// =============================================================================
// Factory
// =============================================================================

export function createBindings(workspaceRoot: string): ChannelBindings {
  const filePath = join(workspaceRoot, ".thrunt-god", "slack-bindings.json")
  let map: Record<string, string> = {}

  const bindings: ChannelBindings = {
    async bind(channelId: string, casePath: string): Promise<void> {
      map[channelId] = casePath
      await bindings.save()
    },

    async unbind(channelId: string): Promise<void> {
      delete map[channelId]
      await bindings.save()
    },

    resolve(channelId: string): string | null {
      return map[channelId] ?? null
    },

    list(): Record<string, string> {
      return { ...map }
    },

    async load(): Promise<void> {
      try {
        const raw = await readFile(filePath, "utf8")
        const parsed = JSON.parse(raw)
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          map = parsed as Record<string, string>
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

  return bindings
}
