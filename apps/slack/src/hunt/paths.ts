import { basename, dirname, join } from "node:path"
import { resolvePlanningDir } from "./state.ts"

function isCasePlanningDir(planningDir: string): boolean {
  const parent = dirname(planningDir)
  return basename(parent) === "cases" && basename(dirname(parent)) === ".planning"
}

export async function resolveWorkspaceRoot(root: string): Promise<string> {
  const planningDir = await resolvePlanningDir(root)

  if (basename(planningDir) === ".planning") {
    return dirname(planningDir)
  }

  if (isCasePlanningDir(planningDir)) {
    return dirname(dirname(dirname(planningDir)))
  }

  return root
}

export async function resolveCaseDir(
  root: string,
  slug: string,
): Promise<{ workspaceRoot: string; caseDir: string }> {
  const workspaceRoot = await resolveWorkspaceRoot(root)
  return {
    workspaceRoot,
    caseDir: join(workspaceRoot, ".planning", "cases", slug),
  }
}

export function startHuntCommand(workspaceRoot: string, slug: string): string {
  return `cd "${workspaceRoot}" && THRUNT_CASE="${slug}" thrunt-god`
}
