/**
 * Orchestrate hunt sessions from Slack.
 *
 * The bot doesn't run AI agents directly — it creates the dispatch
 * artifacts and monitors progress, bridging between Slack and the
 * THRUNT CLI that an operator runs in their terminal.
 */

import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises"
import { join } from "node:path"

export interface HuntDispatch {
  caseSlug: string
  caseDir: string
  channelId: string
  threadTs?: string
  requestedBy: string
  requestedAt: string
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/

/** Validate a slug is safe for use in file paths */
function validateSlug(slug: string): string {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
  if (!SAFE_SLUG.test(sanitized)) {
    throw new Error(`Invalid case slug: ${slug}`)
  }
  return sanitized
}

/** Return the dispatches directory path */
function dispatchesDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".thrunt-god", "dispatches")
}

/** Write a dispatch marker so operators/automation know a hunt was requested */
export async function createDispatch(
  workspaceRoot: string,
  dispatch: HuntDispatch,
): Promise<string> {
  const safeSlug = validateSlug(dispatch.caseSlug)
  const dir = dispatchesDir(workspaceRoot)
  await mkdir(dir, { recursive: true })

  const filePath = join(dir, `${safeSlug}.json`)
  await writeFile(filePath, JSON.stringify(dispatch, null, 2) + "\n", "utf8")

  return filePath
}

/** Read pending dispatches */
export async function listPendingDispatches(
  workspaceRoot: string,
): Promise<HuntDispatch[]> {
  const dir = dispatchesDir(workspaceRoot)

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const dispatches: HuntDispatch[] = []

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue

    try {
      const raw = await readFile(join(dir, entry), "utf8")
      const parsed = JSON.parse(raw) as HuntDispatch
      dispatches.push(parsed)
    } catch {
      // Skip malformed dispatch files
    }
  }

  return dispatches
}

/** Mark a dispatch as picked up by removing its file */
export async function markDispatched(
  workspaceRoot: string,
  caseSlug: string,
): Promise<void> {
  const safeSlug = validateSlug(caseSlug)
  const filePath = join(dispatchesDir(workspaceRoot), `${safeSlug}.json`)
  await rm(filePath, { force: true })
}
