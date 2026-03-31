/**
 * CLI tests
 *
 * Tests for the thrunt-god command-line interface.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { VERSION } from "../src"
import { parseCliArgs } from "../src/cli"

const CLI_ENTRY = path.resolve(import.meta.dir, "../src/cli/index.ts")

let tempDir: string

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thrunt-god-cli-test-"))
})

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

function runCli(args: string[], cwd = process.cwd()) {
  return Bun.spawn(["bun", "run", CLI_ENTRY, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
}

describe("CLI Argument Parsing", () => {
  const originalArgv = process.argv

  afterEach(() => {
    process.argv = originalArgv
  })

  test("parses help command", () => {
    process.argv = ["bun", "thrunt-god", "help"]
    const { command, args } = parseCliArgs()
    expect(command).toBe("help")
    expect(args).toEqual([])
  })

  test("parses version flag", () => {
    process.argv = ["bun", "thrunt-god", "--version"]
    const result = parseCliArgs()
    expect(result.options.version).toBe(true)
  })

  test("parses dispatch command with prompt", () => {
    process.argv = ["bun", "thrunt-god", "dispatch", "Fix", "the", "bug"]
    const { command, args } = parseCliArgs()
    expect(command).toBe("dispatch")
    expect(args).toEqual(["Fix", "the", "bug"])
  })

  test("parses dispatch options", () => {
    process.argv = [
      "bun",
      "thrunt-god",
      "dispatch",
      "-t",
      "claude",
      "-g",
      "receipt-completeness",
      "--timeout",
      "60000",
      "Fix bug",
    ]
    const { command, options, args } = parseCliArgs()
    expect(command).toBe("dispatch")
    expect(options.toolchain).toBe("claude")
    expect(options.gates).toEqual(["receipt-completeness"])
    expect(options.timeout).toBe(60000)
    expect(args).toEqual(["Fix bug"])
  })

  test("parses gate command with gates", () => {
    process.argv = ["bun", "thrunt-god", "gate", "pytest", "mypy", "ruff"]
    const { command, args } = parseCliArgs()
    expect(command).toBe("gate")
    expect(args).toEqual(["pytest", "mypy", "ruff"])
  })

  test("parses ui-post command", () => {
    process.argv = ["bun", "thrunt-god", "ui-post", "status", "Running hunt", "Collecting events"]
    const { command, args } = parseCliArgs()
    expect(command).toBe("ui-post")
    expect(args).toEqual(["status", "Running hunt", "Collecting events"])
  })

  test("parses json flag", () => {
    process.argv = ["bun", "thrunt-god", "status", "--json"]
    const { command, options } = parseCliArgs()
    expect(command).toBe("status")
    expect(options.json).toBe(true)
  })

  test("parses short json flag", () => {
    process.argv = ["bun", "thrunt-god", "status", "-j"]
    const { options } = parseCliArgs()
    expect(options.json).toBe(true)
  })

  test("parses cwd option", () => {
    process.argv = ["bun", "thrunt-god", "gate", "--cwd", "/some/path"]
    const { options } = parseCliArgs()
    expect(options.cwd).toBe("/some/path")
  })

  test("parses project option", () => {
    process.argv = ["bun", "thrunt-god", "dispatch", "-p", "my-project", "task"]
    const { options } = parseCliArgs()
    expect(options.project).toBe("my-project")
  })

  test("defaults to empty command (TUI) when no args", () => {
    process.argv = ["bun", "thrunt-god"]
    const { command } = parseCliArgs()
    expect(command).toBe("")
  })
})

describe("CLI Integration", () => {
  test("help command runs without error and lists current commands", async () => {
    const proc = runCli(["help"])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain("thrunt-god")
    expect(stdout).toContain("dispatch")
    expect(stdout).toContain("gate")
    expect(stdout).toContain("status")
    expect(stdout).toContain("ui-post")
    expect(stdout).toContain("init")
    expect(stdout).toContain("doctor")
    expect(stdout).toContain("version")
    expect(stdout).toContain("help")
    expect(stdout).not.toContain("speculate")
    expect(stdout).not.toContain("beads")
  })

  test("version command outputs version", async () => {
    const proc = runCli(["version"])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain(`thrunt-god ${VERSION}`)
  })

  test("--version flag outputs version", async () => {
    const proc = runCli(["--version"])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain(`thrunt-god ${VERSION}`)
  })

  test("status command shows kernel status", async () => {
    const proc = runCli(["status", "--cwd", tempDir])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain("thrunt-god Status")
    expect(stdout).toContain("Version")
    expect(stdout).toContain(VERSION)
    expect(stdout).toContain("Active Rollouts")
  })

  test("init command initializes thrunt-god", async () => {
    const proc = runCli(["init", "--cwd", tempDir])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain("thrunt-god initialized")
    expect(stdout).toContain(".thrunt-god/runs/")

    const configExists = await Bun.file(path.join(tempDir, ".thrunt-god/config.json")).exists()
    expect(configExists).toBe(true)
  })

  test("doctor command reports local environment", async () => {
    const proc = runCli(["doctor", "--cwd", tempDir])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain("thrunt-god Doctor")
    expect(stdout).toContain("Recommended Sandbox")
    expect(stdout).toContain("Detected adapters")
  })

  test("ui-post writes an event for the TUI bridge", async () => {
    const proc = runCli([
      "ui-post",
      "status",
      "Running Elastic hunt",
      "Collecting suspicious shell launches",
      "--cwd",
      tempDir,
      "-t",
      "claude",
    ])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain("Posted status event to the TUI bridge")
    expect(stdout).toContain("Running Elastic hunt")
    expect(stdout).toContain("claude")

    const eventsPath = path.join(tempDir, ".thrunt-god/ui/events.jsonl")
    const raw = await fs.readFile(eventsPath, "utf8")
    expect(raw).toContain("\"kind\":\"status\"")
    expect(raw).toContain("Running Elastic hunt")
    expect(raw).toContain("claude")
  })

  test("unknown command shows error", async () => {
    const proc = runCli(["unknown-command"])
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Unknown command")
  })

  test("dispatch without prompt shows error", async () => {
    const proc = runCli(["dispatch", "--cwd", tempDir])
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Missing prompt")
  })

  test("ui-post without required arguments shows error", async () => {
    const proc = runCli(["ui-post", "--cwd", tempDir])
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Missing arguments")
  })

  test("ui-post rejects unsupported event kinds", async () => {
    const proc = runCli(["ui-post", "invalid-kind", "Bad event", "--cwd", tempDir])
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain("Unsupported ui event kind")
  })

  test("json output works for status", async () => {
    const proc = runCli(["status", "--json", "--cwd", tempDir])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveProperty("active")
    expect(Array.isArray(parsed.active)).toBe(true)
  })

  test("no-color flag disables colors", async () => {
    const proc = runCli(["help", "--no-color"])
    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(0)
    expect(stdout).not.toContain("\x1b[")
  })
})
