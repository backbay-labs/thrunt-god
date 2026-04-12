import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolveCaseDir, resolveWorkspaceRoot, startHuntCommand } from "../hunt/paths.ts"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "paths-test-"))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe("resolveWorkspaceRoot", () => {
  test("returns the workspace root when given a workspace root", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true })
    expect(await resolveWorkspaceRoot(tmpDir)).toBe(tmpDir)
  })

  test("returns the workspace root when given the planning directory directly", async () => {
    const planningDir = join(tmpDir, ".planning")
    await mkdir(planningDir, { recursive: true })
    await writeFile(join(planningDir, "STATE.md"), "# State\n")

    expect(await resolveWorkspaceRoot(planningDir)).toBe(tmpDir)
  })

  test("returns the workspace root when given a bound case directory", async () => {
    const caseDir = join(tmpDir, ".planning", "cases", "existing-case")
    await mkdir(caseDir, { recursive: true })
    await writeFile(join(caseDir, "MISSION.md"), "# Mission: Existing Case\n")

    expect(await resolveWorkspaceRoot(caseDir)).toBe(tmpDir)
  })
})

describe("resolveCaseDir", () => {
  test("builds canonical case paths from case-bound roots", async () => {
    const existingCaseDir = join(tmpDir, ".planning", "cases", "existing-case")
    await mkdir(existingCaseDir, { recursive: true })
    await writeFile(join(existingCaseDir, "MISSION.md"), "# Mission: Existing Case\n")

    const resolved = await resolveCaseDir(existingCaseDir, "fresh-case")
    expect(resolved.workspaceRoot).toBe(tmpDir)
    expect(resolved.caseDir).toBe(join(tmpDir, ".planning", "cases", "fresh-case"))
  })
})

describe("startHuntCommand", () => {
  test("uses workspace root plus THRUNT_CASE context", () => {
    expect(startHuntCommand("/workspace/root", "alpha-case")).toBe(
      "cd -- '/workspace/root' && THRUNT_CASE='alpha-case' thrunt-god",
    )
  })

  test("shell-quotes dangerous workspace roots and slugs", () => {
    expect(startHuntCommand(`/tmp/"$(whoami)"\`pwd\`/o'hare`, `alpha'$(rm -rf /)`)).toBe(
      `cd -- '/tmp/"$(whoami)"\`pwd\`/o'"'"'hare' && THRUNT_CASE='alpha'"'"'$(rm -rf /)' thrunt-god`,
    )
  })
})
