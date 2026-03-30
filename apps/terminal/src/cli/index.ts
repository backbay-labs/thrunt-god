#!/usr/bin/env bun
/**
 * thrunt-god CLI - Command-line interface for the orchestration engine
 *
 * Usage:
 *   thrunt-god dispatch <prompt>     Submit task for execution
 *   thrunt-god gate [gates...]       Run quality gates
 *   thrunt-god status                Show kernel status
 *   thrunt-god init                  Initialize thrunt-god
 *   thrunt-god doctor                Inspect local environment and services
 *   thrunt-god version               Show version
 */

import { parseArgs } from "util"
import { TUI, launchTUI } from "../tui"
import { VERSION, init, shutdown, isInitialized } from "../index"
import { Telemetry } from "../telemetry"
import { Health, type HealthStatus } from "../health"
import { Config } from "../config"
import { executeTool } from "../tools"
import type { ToolContext } from "../tools"

// =============================================================================
// CLI TYPES
// =============================================================================

interface CLIOptions {
  help?: boolean
  version?: boolean
  color?: boolean
  json?: boolean
  toolchain?: string
  gates?: string[]
  timeout?: number
  strategy?: string
  cwd?: string
  project?: string
  limit?: number
  offset?: number
}

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

function parseCliArgs(): { command: string; args: string[]; options: CLIOptions } {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      "no-color": { type: "boolean" },
      json: { type: "boolean", short: "j" },
      toolchain: { type: "string", short: "t" },
      gate: { type: "string", short: "g", multiple: true },
      timeout: { type: "string" },
      strategy: { type: "string", short: "s" },
      cwd: { type: "string" },
      project: { type: "string", short: "p" },
      limit: { type: "string", short: "n" },
      offset: { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  })

  const command = positionals[0] ?? ""  // Empty = launch TUI
  const args = positionals.slice(1)

  // Handle --no-color flag
  const noColor = values["no-color"] as boolean | undefined
  const color = noColor ? false : true

  return {
    command,
    args,
    options: {
      help: values.help as boolean | undefined,
      version: values.version as boolean | undefined,
      color,
      json: values.json as boolean | undefined,
      toolchain: values.toolchain as string | undefined,
      gates: values.gate as string[] | undefined,
      timeout: values.timeout ? parseInt(values.timeout as string, 10) : undefined,
      strategy: values.strategy as string | undefined,
      cwd: values.cwd as string | undefined,
      project: values.project as string | undefined,
      limit: values.limit ? parseInt(values.limit as string, 10) : undefined,
      offset: values.offset ? parseInt(values.offset as string, 10) : undefined,
    },
  }
}

// =============================================================================
// HELP TEXT
// =============================================================================

function getHelpText(): string {
  return `
${TUI.header("thrunt-god - Agentic Threat Hunting Operator Console")}

${TUI.info("Usage:")} thrunt-god <command> [options] [args]

${TUI.info("Commands:")}
  dispatch <prompt>       Submit task for execution by an AI agent
  gate [gates...]         Run quality gates on current directory
  status                  Show active rollouts and kernel status
  init                    Initialize thrunt-god in current directory
  doctor                  Inspect local environment and services
  version                 Show version information
  help                    Show this help message

${TUI.info("Global Options:")}
  -h, --help              Show help for a command
  -v, --version           Show version
  --no-color              Disable colored output
  -j, --json              Output as JSON
  --cwd <path>            Working directory (default: current)
  -p, --project <id>      Project identifier (default: from cwd)

${TUI.info("Dispatch Options:")}
  -t, --toolchain <name>  Force toolchain (codex, claude, opencode, crush)
  -g, --gate <name>       Quality gates to run (can specify multiple)
  --timeout <ms>          Execution timeout in milliseconds

${TUI.info("Examples:")}
  thrunt-god dispatch "Fix the bug in auth.ts"
  thrunt-god dispatch -t claude "Add unit tests for utils.ts"
  thrunt-god gate evidence-integrity receipt-completeness
  thrunt-god doctor
`
}


// =============================================================================
// COMMANDS
// =============================================================================

async function cmdDispatch(args: string[], options: CLIOptions): Promise<void> {
  const prompt = args.join(" ")
  if (!prompt) {
    console.error(TUI.error("Missing prompt. Usage: thrunt-god dispatch <prompt>"))
    process.exit(1)
  }

  await ensureInitialized(options)

  const context: ToolContext = {
    cwd: options.cwd ?? process.cwd(),
    projectId: options.project ?? "default",
  }

  console.log(TUI.progress(`Dispatching task...`))

  try {
    const result = await executeTool(
      "dispatch",
      {
        prompt,
        toolchain: options.toolchain,
        gates: options.gates,
        timeout: options.timeout,
      },
      context
    )

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      const r = result as {
        success: boolean
        taskId: string
        routing?: { toolchain: string }
        verification?: { score: number }
        error?: string
      }

      if (r.success) {
        console.log(TUI.success(`Task completed successfully`))
        console.log(
          TUI.formatTable([
            ["Task ID", r.taskId.slice(0, 8)],
            ["Toolchain", r.routing?.toolchain ?? "unknown"],
            ["Gate Score", `${r.verification?.score ?? 0}/100`],
          ])
        )
      } else {
        console.log(TUI.error(`Task failed: ${r.error ?? "Unknown error"}`))
        process.exit(1)
      }
    }
  } catch (err) {
    console.error(TUI.error(`Dispatch failed: ${err}`))
    process.exit(1)
  }
}

async function cmdGate(args: string[], options: CLIOptions): Promise<void> {
  await ensureInitialized(options)

  const gates = args.length > 0 ? args : undefined
  const context: ToolContext = {
    cwd: options.cwd ?? process.cwd(),
    projectId: options.project ?? "default",
  }

  console.log(TUI.progress(`Running gates...`))

  try {
    const result = await executeTool(
      "gate",
      {
        gates,
        directory: options.cwd,
      },
      context
    )

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      const r = result as {
        success: boolean
        score: number
        summary: string
        results: Array<{
          gate: string
          passed: boolean
          errorCount: number
          warningCount: number
        }>
      }

      if (r.success) {
        console.log(TUI.success(`All gates passed (${r.score}/100)`))
      } else {
        console.log(TUI.error(`Gates failed (${r.score}/100)`))
      }

      for (const res of r.results) {
        const icon = res.passed ? "✓" : "✗"
        let suffix = ""
        if (res.errorCount > 0) suffix += ` ${res.errorCount} errors`
        if (res.warningCount > 0) suffix += ` ${res.warningCount} warnings`
        console.log(`  ${icon} ${res.gate}${suffix}`)
      }

      console.log(TUI.info(r.summary))

      if (!r.success) {
        process.exit(1)
      }
    }
  } catch (err) {
    console.error(TUI.error(`Gate check failed: ${err}`))
    process.exit(1)
  }
}

async function cmdStatus(options: CLIOptions): Promise<void> {
  await ensureInitialized(options)

  const active = Telemetry.getActive()

  if (options.json) {
    const rollouts = await Promise.all(active.map((id) => Telemetry.getRollout(id)))
    console.log(JSON.stringify({ active: rollouts.filter(Boolean) }, null, 2))
  } else {
    console.log(TUI.header("thrunt-god Status"))
    console.log(
      TUI.formatTable([
        ["Version", VERSION],
        ["Initialized", isInitialized() ? "yes" : "no"],
        ["Active Rollouts", String(active.length)],
      ])
    )

    if (active.length > 0) {
      console.log(TUI.info("\nActive Rollouts:"))
      for (const id of active) {
        const rollout = await Telemetry.getRollout(id)
        if (rollout) {
          console.log(`  ${id.slice(0, 8)} ${TUI.formatStatus(rollout.status)}`)
        }
      }
    }
  }
}

async function cmdInit(options: CLIOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  console.log(TUI.progress(`Initializing thrunt-god in ${cwd}...`))

  try {
    await init({
      telemetryDir: `${cwd}/.thrunt-god/runs`,
    })

    // Keep init lightweight and deterministic; richer probing belongs in doctor.
    const project = await Config.inspectProject(cwd)

    const config = {
      schema_version: "1.0.0" as const,
      sandbox: project.recommended_sandbox,
      adapters: {},
      git_available: project.git_available,
      project_id: options.project ?? "default",
    }
    await Config.save(cwd, config)

    console.log(TUI.success("thrunt-god initialized"))

    // Show detection summary
    const rows: [string, string][] = [
      ["Config", ".thrunt-god/config.json"],
      ["Telemetry", ".thrunt-god/runs/"],
      ["Sandbox", project.recommended_sandbox],
      ["Git", project.git_available ? "detected" : "not found"],
      ["Next", "run thrunt-god doctor"],
    ]

    console.log(TUI.formatTable(rows, { indent: 2 }))
  } catch (err) {
    console.error(TUI.error(`Initialization failed: ${err}`))
    process.exit(1)
  }
}

function formatHealthStatus(status: HealthStatus | undefined): string {
  if (!status) {
    return "unknown"
  }

  if (status.available) {
    const detail = status.version ? ` (${status.version})` : ""
    return `available${detail}`
  }

  return status.error ? `unavailable (${status.error})` : "unavailable"
}

function detectRuntimeInfo(): { source: string; script_path: string | null; bun_version: string | null } {
  const scriptPath = process.env.THRUNT_TUI_RUNTIME_SCRIPT ?? Bun.main ?? process.argv[1] ?? null
  const envSource = process.env.THRUNT_TUI_RUNTIME_SOURCE

  if (envSource) {
    return {
      source: envSource,
      script_path: scriptPath,
      bun_version: Bun.version ?? null,
    }
  }

  if (scriptPath?.includes("/apps/terminal/src/cli/index.ts")) {
    return {
      source: "repo-source",
      script_path: scriptPath,
      bun_version: Bun.version ?? null,
    }
  }

  return {
    source: "direct",
    script_path: scriptPath,
    bun_version: Bun.version ?? null,
  }
}

async function cmdDoctor(options: CLIOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  try {
    const runtime = detectRuntimeInfo()
    const [configExists, config, detection, health] = await Promise.all([
      Config.exists(cwd),
      Config.load(cwd),
      Config.detect(cwd),
      Health.checkAll({ force: true, timeout: 2000 }),
    ])
    const project = {
      git_available: detection.git_available,
      recommended_sandbox: detection.recommended_sandbox,
    }

    const result = {
      cwd,
      config_exists: configExists,
      config_status: configExists ? (config ? "valid" : "invalid") : "missing",
      config,
      project,
      runtime,
      detection,
      health,
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    const rows: [string, string][] = [
      ["Working Directory", cwd],
      ["Config", result.config_status],
      ["TUI Runtime", runtime.source],
      ["Bun", runtime.bun_version ?? "unknown"],
      ["Saved Sandbox", config?.sandbox ?? "unset"],
      ["Saved Toolchain", config?.toolchain ?? "unset"],
      ["Recommended Sandbox", project.recommended_sandbox],
      ["Git", project.git_available ? "detected" : "not found"],
    ]

    console.log(TUI.header("thrunt-god Doctor"))
    console.log(TUI.formatTable(rows))

    const sections: Array<[string, HealthStatus[]]> = [
      ["Security", health.security],
      ["AI", health.ai],
      ["Infrastructure", health.infra],
      ["MCP", health.mcp],
    ]

    for (const [label, statuses] of sections) {
      console.log(`\n${TUI.info(`${label}:`)}`)
      for (const status of statuses) {
        console.log(`  ${status.id.padEnd(16)} ${formatHealthStatus(status)}`)
      }
    }

    console.log(`\n${TUI.info("Detected adapters:")}`)
    for (const [id, adapter] of Object.entries(detection.adapters)) {
      const suffix = detection.recommended_toolchain === id ? " (recommended)" : ""
      console.log(`  ${id.padEnd(16)} ${adapter.available ? "available" : "unavailable"}${suffix}`)
    }
  } catch (err) {
    console.error(TUI.error(`Doctor failed: ${err}`))
    process.exit(1)
  }
}

async function cmdVersion(): Promise<void> {
  console.log(`thrunt-god ${VERSION}`)
}

async function cmdHelp(): Promise<void> {
  console.log(getHelpText())
}

// =============================================================================
// HELPERS
// =============================================================================

async function ensureInitialized(options: CLIOptions): Promise<void> {
  if (!isInitialized()) {
    const cwd = options.cwd ?? process.cwd()
    await init({
      telemetryDir: `${cwd}/.thrunt-god/runs`,
    })
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const { command, args, options } = parseCliArgs()

  // Configure TUI colors
  TUI.setColors(options.color !== false)

  // Handle global flags
  if (options.version) {
    await cmdVersion()
    return
  }

  if (options.help && command === "help") {
    await cmdHelp()
    return
  }

  // Route to command
  try {
    switch (command) {
      case "":
        // No command - launch interactive TUI
        await launchTUI(options.cwd)
        break
      case "dispatch":
        await cmdDispatch(args, options)
        break
      case "gate":
        await cmdGate(args, options)
        break
      case "status":
        await cmdStatus(options)
        break
      case "init":
        await cmdInit(options)
        break
      case "doctor":
        await cmdDoctor(options)
        break
      case "version":
        await cmdVersion()
        break
      case "help":
        await cmdHelp()
        break
      default:
        console.error(TUI.error(`Unknown command: ${command}`))
        await cmdHelp()
        process.exit(1)
    }
  } finally {
    // Clean shutdown
    if (isInitialized()) {
      await shutdown()
    }
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(TUI.error(`Fatal error: ${err}`))
    process.exit(1)
  })
}

export { main, parseCliArgs }
