import type { TaskInput, RoutingDecision, ExecutionResult, Toolchain } from "../types"
import * as rules from "./rules"

export { rules }
export { DEFAULT_RULES } from "./rules"

export interface RouterConfig {
  rules: RoutingRule[]
  defaults: {
    toolchain: Toolchain
    gates: string[]
    retries: number
  }
}

export interface RoutingRule {
  name: string
  priority: number
  match: {
    labels?: string[]
    hint?: string
    filePatterns?: string[]
    promptPatterns?: string[]
    contextSize?: { min?: number; max?: number }
  }
  action: {
    toolchain?: string
    strategy?: "single" | "speculate"
    speculation?: {
      count: number
      toolchains: string[]
      voteStrategy: "first_pass" | "best_score" | "consensus"
    }
    gates?: string[]
    gatesAdd?: string[]
    gatesRemove?: string[]
    retries?: number
  }
}

const DEFAULT_PRIORITY = 50
const SPECULATION_TIMEOUT_MS = 300000
const TOOLCHAIN_FALLBACK: Toolchain[] = ["codex", "claude", "opencode", "crush"]
const CRITICAL_GATES = new Set(["evidence-integrity"])

export const DEFAULT_CONFIG: RouterConfig = {
  rules: rules.DEFAULT_RULES,
  defaults: {
    toolchain: "claude",
    gates: ["evidence-integrity", "receipt-completeness"],
    retries: 2,
  },
}

export namespace Router {
  export async function route(
    task: TaskInput,
    config: RouterConfig = DEFAULT_CONFIG
  ): Promise<RoutingDecision> {
    const action = rules.evaluateRules(task, config.rules)

    let toolchain: Toolchain = config.defaults.toolchain
    if (action.toolchain && rules.isValidToolchain(action.toolchain)) {
      toolchain = action.toolchain
    }

    const strategy = action.strategy || "single"
    const gates = task.gates || action.gates || config.defaults.gates
    const retries = action.retries ?? config.defaults.retries
    const taskId = task.id || crypto.randomUUID()

    const decision: RoutingDecision = {
      taskId,
      toolchain,
      strategy,
      gates,
      retries,
      priority: DEFAULT_PRIORITY,
    }

    if (strategy === "speculate" && action.speculation) {
      decision.speculation = {
        count: action.speculation.count,
        toolchains: action.speculation.toolchains.filter(
          rules.isValidToolchain
        ) as Toolchain[],
        voteStrategy: action.speculation.voteStrategy,
        timeout: SPECULATION_TIMEOUT_MS,
      }
    }

    return decision
  }

  export async function reroute(
    task: TaskInput,
    previousResult: ExecutionResult,
    config: RouterConfig = DEFAULT_CONFIG
  ): Promise<RoutingDecision | null> {
    const originalDecision = await route(task, config)

    const wasToolchainError =
      previousResult.error?.includes("not available") ||
      previousResult.error?.includes("timeout")
    const wasGateFailure = !previousResult.success && !wasToolchainError

    const currentIndex = TOOLCHAIN_FALLBACK.indexOf(previousResult.toolchain)

    if (wasToolchainError && currentIndex < TOOLCHAIN_FALLBACK.length - 1) {
      return {
        ...originalDecision,
        toolchain: TOOLCHAIN_FALLBACK[currentIndex + 1],
        retries: 1,
      }
    }

    if (wasGateFailure) {
      const criticalGates = originalDecision.gates.filter(
        (gate) => CRITICAL_GATES.has(gate)
      )

      if (criticalGates.length > 0 && criticalGates.length < originalDecision.gates.length) {
        return {
          ...originalDecision,
          gates: criticalGates,
          retries: 1,
        }
      }
    }

    return null
  }

  export function evaluateRules(
    task: TaskInput,
    rulesList: RoutingRule[]
  ): Partial<RoutingRule["action"]> {
    return rules.evaluateRules(task, rulesList)
  }

  export function matchesRule(task: TaskInput, rule: RoutingRule): boolean {
    return rules.matchesRule(task, rule)
  }

  export function getDefaultConfig(): RouterConfig {
    return {
      rules: [...DEFAULT_CONFIG.rules.map((r) => ({ ...r, match: { ...r.match }, action: { ...r.action } }))],
      defaults: { ...DEFAULT_CONFIG.defaults, gates: [...DEFAULT_CONFIG.defaults.gates] },
    }
  }
}

export default Router
