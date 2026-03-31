/**
 * Tools - Agent tool definitions for THRUNT GOD operations
 *
 * Exposes dispatch, speculate, and gate tools for use by OpenCode agents.
 * These tools allow agents to orchestrate other agents and run quality checks.
 */

import type {
  RoutingDecision,
  ExecutionResult,
  GateResults,
  Toolchain,
  TaskInput,
  WorkcellInfo,
} from "../types"
import { Router } from "../router"
import { Dispatcher } from "../dispatcher"
import { Verifier } from "../verifier"
import { Workcell } from "../workcell"
import { Telemetry } from "../telemetry"

/**
 * Tool definition interface (compatible with OpenCode/MCP)
 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required: string[]
  }
  handler: (params: unknown, context?: ToolContext) => Promise<unknown>
}

/**
 * Context passed to tool handlers
 */
export interface ToolContext {
  cwd: string
  projectId: string
  taskId?: string
}

// =============================================================================
// DISPATCH TOOL
// =============================================================================

export interface DispatchParams {
  prompt: string
  toolchain?: Toolchain
  gates?: string[]
  timeout?: number
}

export interface DispatchResult {
  success: boolean
  taskId: string
  routing: RoutingDecision
  result?: ExecutionResult
  verification?: GateResults
  error?: string
}

/**
 * Dispatch tool - Submit task for execution
 */
export const dispatchTool: ToolDefinition = {
  name: "dispatch",
  description: `Submit a coding task for execution by a specialized agent.

Available toolchains:
- codex: OpenAI Codex CLI (GPT-5.2) - best for complex reasoning
- claude: Anthropic Claude Code (Opus) - fast, reliable general purpose
- opencode: Local OpenCode - quick, no network dependency
- crush: Multi-provider fallback - retries across providers

The task runs in an isolated workcell with quality gates.`,
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task prompt to execute",
      },
      toolchain: {
        type: "string",
        enum: ["codex", "claude", "opencode", "crush"],
        description:
          "Specific toolchain to use (optional, auto-routed if not specified)",
      },
      gates: {
        type: "array",
        items: { type: "string" },
        description: "Quality gates to run (default: evidence-integrity, receipt-completeness)",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 300000)",
      },
    },
    required: ["prompt"],
  },
  handler: async (
    params: unknown,
    context?: ToolContext
  ): Promise<DispatchResult> => {
    const p = params as DispatchParams
    const ctx = context ?? { cwd: process.cwd(), projectId: "default" }
    const taskId = ctx.taskId ?? crypto.randomUUID()

    // Start telemetry
    const rollout = Telemetry.startRollout(taskId)
    Telemetry.updateStatus(rollout.id, "routing")

    try {
      // Create task input
      const task: TaskInput = {
        id: taskId,
        prompt: p.prompt,
        context: {
          cwd: ctx.cwd,
          projectId: ctx.projectId,
        },
        hint: p.toolchain,
        gates: p.gates,
        timeout: p.timeout,
      }

      // Route the task
      const routing = await Router.route(task)
      Telemetry.setRouting(rollout.id, routing)
      Telemetry.updateStatus(rollout.id, "executing")

      // Load config for sandbox mode
      const { Config } = await import("../config")
      const projectConfig = await Config.load(ctx.cwd)
      const sandboxMode = projectConfig?.sandbox ?? "inplace"

      // Acquire workcell
      let workcell: WorkcellInfo
      try {
        workcell = await Workcell.acquire(ctx.projectId, routing.toolchain, {
          cwd: ctx.cwd,
          sandboxMode,
        })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        Telemetry.updateStatus(rollout.id, "failed")
        await Telemetry.completeRollout(rollout.id)
        return {
          success: false,
          taskId,
          routing,
          error: error.includes("Not a git repository")
            ? "Not a git repository. Run 'thrunt-god init' or launch the TUI for guided setup."
            : `Failed to acquire workcell: ${error}`,
        }
      }

      // Execute the task
      const result = await Dispatcher.execute({
        task,
        workcell,
        toolchain: routing.toolchain,
        timeout: p.timeout ?? 300000,
      })
      Telemetry.setExecution(rollout.id, result)

      // Run gates if execution succeeded
      let verification: GateResults | undefined
      if (result.success) {
        Telemetry.updateStatus(rollout.id, "verifying")
        verification = await Verifier.run(workcell, {
          gates: routing.gates,
          failFast: true,
        })
        Telemetry.setVerification(rollout.id, verification)
      }

      // Release workcell
      await Workcell.release(workcell.id, { reset: true })

      // Complete telemetry
      Telemetry.updateStatus(
        rollout.id,
        result.success && verification?.allPassed ? "completed" : "failed"
      )
      await Telemetry.completeRollout(rollout.id)

      return {
        success: result.success && (verification?.allPassed ?? true),
        taskId,
        routing,
        result,
        verification,
      }
    } catch (err) {
      Telemetry.updateStatus(rollout.id, "failed")
      await Telemetry.completeRollout(rollout.id)
      throw err
    }
  },
}

// =============================================================================
// GATE TOOL
// =============================================================================

export interface GateParams {
  gates?: string[]
  failFast?: boolean
  directory?: string
}

export interface GateToolResult {
  success: boolean
  allPassed: boolean
  score: number
  summary: string
  results: Array<{
    gate: string
    passed: boolean
    critical: boolean
    errorCount: number
    warningCount: number
  }>
}

/**
 * Gate tool - Run quality gates on current workspace
 */
export const gateTool: ToolDefinition = {
  name: "gate",
  description: `Run quality gates on the current workspace.

Available gates:
- evidence-integrity: Verify evidence manifest SHA-256 hashes
- receipt-completeness: Check query-receipt-evidence chain

Use after hunt execution to verify evidence quality.`,
  parameters: {
    type: "object",
    properties: {
      gates: {
        type: "array",
        items: { type: "string" },
        description: "Specific gates to run (default: evidence-integrity, receipt-completeness)",
      },
      failFast: {
        type: "boolean",
        description: "Stop on first critical failure (default: true)",
      },
      directory: {
        type: "string",
        description: "Directory to run gates in (default: current directory)",
      },
    },
    required: [],
  },
  handler: async (
    params: unknown,
    context?: ToolContext
  ): Promise<GateToolResult> => {
    const p = params as GateParams
    const ctx = context ?? { cwd: process.cwd(), projectId: "default" }

    const gates = p.gates ?? ["evidence-integrity", "receipt-completeness"]
    const failFast = p.failFast ?? true
    const directory = p.directory ?? ctx.cwd

    // Create a mock workcell for the directory
    const workcell: WorkcellInfo = {
      id: crypto.randomUUID(),
      name: "gate-check",
      directory,
      branch: "main",
      status: "in_use",
      projectId: ctx.projectId,
      createdAt: Date.now(),
      useCount: 0,
    }

    // Run gates
    const results = await Verifier.run(workcell, {
      gates,
      failFast,
    })

    // Format results
    const formattedResults = results.results.map((r) => ({
      gate: r.gate,
      passed: r.passed,
      critical: r.critical,
      errorCount: r.diagnostics?.filter((d) => d.severity === "error").length ?? 0,
      warningCount:
        r.diagnostics?.filter((d) => d.severity === "warning").length ?? 0,
    }))

    return {
      success: results.allPassed,
      allPassed: results.allPassed,
      score: results.score,
      summary: results.summary,
      results: formattedResults,
    }
  },
}

// =============================================================================
// TOOL REGISTRY
// =============================================================================

/**
 * All THRUNT GOD tools
 */
export const tools: ToolDefinition[] = [dispatchTool, gateTool]

/**
 * Get tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name)
}

/**
 * Register tools with an agent system
 */
export function registerTools(register: (tool: ToolDefinition) => void): void {
  for (const tool of tools) {
    register(tool)
  }
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  params: unknown,
  context?: ToolContext
): Promise<unknown> {
  const tool = getTool(name)
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`)
  }
  return tool.handler(params, context)
}

export default tools
