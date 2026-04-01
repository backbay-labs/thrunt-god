import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as fsSync from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

const THRUNT_TOOLS_ENV = "THRUNT_TOOLS_PATH"

async function writeExecutableScript(
  dir: string,
  name: string,
  contents: string,
): Promise<string> {
  const scriptPath = path.join(dir, name)
  await fs.writeFile(scriptPath, contents, { mode: 0o755 })
  await fs.chmod(scriptPath, 0o755)
  return scriptPath
}

let tempDirs: string[] = []

afterEach(async () => {
  delete process.env[THRUNT_TOOLS_ENV]
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs = []
})

async function createMockProject(
  prefix: string,
  scriptContents: string,
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(tempDir)

  const projectRoot = path.join(tempDir, "project")
  const toolsDir = path.join(projectRoot, "thrunt-god", "bin")
  await fs.mkdir(toolsDir, { recursive: true })
  await writeExecutableScript(toolsDir, "thrunt-tools.cjs", scriptContents)

  return projectRoot
}

describe("resolveThruntToolsPath", () => {
  test("returns env override when THRUNT_TOOLS_PATH is set", async () => {
    const { resolveThruntToolsPath } = await import("../resolver")
    process.env[THRUNT_TOOLS_ENV] = "/tmp/custom-thrunt-tools.cjs"
    expect(resolveThruntToolsPath()).toBe("/tmp/custom-thrunt-tools.cjs")
  })

  test("walks up from cwd to find thrunt-god/bin/thrunt-tools.cjs", async () => {
    const { resolveThruntToolsPath } = await import("../resolver")
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thrunt-resolver-"))
    const nestedDir = path.join(tempDir, "project", "apps", "terminal")
    const toolsPath = path.join(tempDir, "project", "thrunt-god", "bin", "thrunt-tools.cjs")

    await fs.mkdir(path.dirname(toolsPath), { recursive: true })
    await fs.mkdir(nestedDir, { recursive: true })
    await fs.writeFile(toolsPath, "// placeholder")

    const result = resolveThruntToolsPath(nestedDir)
    expect(result).toBe(toolsPath)

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test("throws when thrunt-tools.cjs not found and no env override", async () => {
    const { resolveThruntToolsPath } = await import("../resolver")
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thrunt-resolver-empty-"))

    expect(() => resolveThruntToolsPath(tempDir)).toThrow(
      "thrunt-tools.cjs not found",
    )

    await fs.rm(tempDir, { recursive: true, force: true })
  })
})

describe("runThruntCommand", () => {
  test("spawns node and returns { ok: true, data, exitCode: 0 } for valid JSON stdout", async () => {
    const { runThruntCommand } = await import("../executor")
    const projectRoot = await createMockProject(
      "thrunt-exec-",
      `#!/usr/bin/env node
const fs = require('fs');
fs.writeSync(1, JSON.stringify({ phase: 23, status: "ready" }));
`,
    )

    const result = await runThruntCommand<{ phase: number; status: string }>(["state-snapshot"], {
      cwd: projectRoot,
    })
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ phase: 23, status: "ready" })
    expect(result.exitCode).toBe(0)
  })

  test("returns { ok: false, error, exitCode } when subprocess exits non-zero", async () => {
    const { runThruntCommand } = await import("../executor")
    const projectRoot = await createMockProject(
      "thrunt-exec-",
      `#!/usr/bin/env node
const fs = require('fs');
fs.writeSync(2, 'Error: unknown command\\n');
process.exit(1);
`,
    )

    const result = await runThruntCommand(["bad-command"], {
      cwd: projectRoot,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("unknown command")
    expect(result.exitCode).toBe(1)
  })

  test("returns { ok: true, data: undefined } for empty stdout", async () => {
    const { runThruntCommand } = await import("../executor")
    const projectRoot = await createMockProject(
      "thrunt-exec-",
      `#!/usr/bin/env node
// Produces no output
`,
    )

    const result = await runThruntCommand(["no-output"], {
      cwd: projectRoot,
    })
    expect(result.ok).toBe(true)
    expect(result.data).toBeUndefined()
    expect(result.exitCode).toBe(0)
  })

  test("detects @file: prefix, reads temp file content as JSON, deletes the temp file", async () => {
    const { runThruntCommand } = await import("../executor")
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thrunt-exec-"))
    tempDirs.push(tempDir)
    const projectRoot = path.join(tempDir, "project")
    const tmpFilePath = path.join(tempDir, "thrunt-large-output.json")
    const largeData = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })) }

    // Script writes JSON to temp file and prints @file: prefix to stdout
    await fs.mkdir(path.join(projectRoot, "thrunt-god", "bin"), { recursive: true })
    await writeExecutableScript(
      path.join(projectRoot, "thrunt-god", "bin"),
      "thrunt-tools.cjs",
      `#!/usr/bin/env node
const fs = require('fs');
const tmpPath = ${JSON.stringify(tmpFilePath)};
fs.writeFileSync(tmpPath, JSON.stringify(${JSON.stringify(largeData)}));
fs.writeSync(1, '@file:' + tmpPath);
`,
    )

    const result = await runThruntCommand<typeof largeData>(["large-output"], {
      cwd: projectRoot,
    })
    expect(result.ok).toBe(true)
    expect(result.data).toEqual(largeData)
    expect(result.exitCode).toBe(0)

    // Temp file should be deleted
    expect(fsSync.existsSync(tmpFilePath)).toBe(false)
  })

  test("returns { ok: false, error: 'JSON parse failed: ...' } for non-JSON stdout", async () => {
    const { runThruntCommand } = await import("../executor")
    const projectRoot = await createMockProject(
      "thrunt-exec-",
      `#!/usr/bin/env node
const fs = require('fs');
fs.writeSync(1, 'This is not JSON at all');
`,
    )

    const result = await runThruntCommand(["bad-json"], {
      cwd: projectRoot,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("JSON parse failed")
    expect(result.exitCode).toBe(0)
  })

  test("kills subprocess after timeout and returns error", async () => {
    const { runThruntCommand } = await import("../executor")
    const projectRoot = await createMockProject(
      "thrunt-exec-",
      `#!/usr/bin/env node
// Sleep for 10 seconds (longer than timeout)
setTimeout(() => {
  const fs = require('fs');
  fs.writeSync(1, JSON.stringify({ done: true }));
}, 10000);
`,
    )

    const result = await runThruntCommand(["slow-cmd"], {
      cwd: projectRoot,
      timeout: 200,
    })
    expect(result.ok).toBe(false)
    expect(result.exitCode).not.toBe(0)
  }, 10000)
})
