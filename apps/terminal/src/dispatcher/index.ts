import type {
  TaskInput,
  ExecutionResult,
  WorkcellInfo,
  Toolchain,
} from "../types"
import * as adaptersModule from "./adapters"
import { git } from "../workcell"

export interface ExecutionRequest {
  task: TaskInput
  workcell: WorkcellInfo
  toolchain: Toolchain
  timeout?: number
}

export interface AdapterResult {
  success: boolean
  output: string
  error?: string
  telemetry?: {
    model?: string
    tokens?: { input: number; output: number }
    cost?: number
    startedAt?: number
    completedAt?: number
  }
}

export interface Adapter {
  info: {
    id: string
    name: string
    description: string
    authType: "oauth" | "api_key" | "none"
    requiresInstall: boolean
  }
  isAvailable(): Promise<boolean>
  execute(
    workcell: WorkcellInfo,
    task: TaskInput,
    signal: AbortSignal
  ): Promise<AdapterResult>
  parseTelemetry(output: string): Partial<AdapterResult["telemetry"]>
}

const DEFAULT_TIMEOUT_MS = 300000
const RETRY_BACKOFF_MS = 1000
const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /rate.?limit/i,
  /too.?many.?requests/i,
  /429/,
  /503/,
  /502/,
  /network/i,
  /connection/i,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /temporarily/i,
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createFailureResult(
  taskId: string,
  workcell: WorkcellInfo,
  toolchain: Toolchain,
  startedAt: number,
  error: string
): ExecutionResult {
  return {
    taskId,
    workcellId: workcell.id,
    toolchain,
    success: false,
    output: "",
    error,
    telemetry: {
      startedAt,
      completedAt: Date.now(),
    },
  }
}

export namespace Dispatcher {
  export async function execute(
    request: ExecutionRequest
  ): Promise<ExecutionResult> {
    const { task, workcell, toolchain, timeout = DEFAULT_TIMEOUT_MS } = request
    const taskId = task.id || crypto.randomUUID()
    const startTime = Date.now()

    const adapter = adaptersModule.getAdapter(toolchain)
    if (!adapter) {
      return createFailureResult(
        taskId,
        workcell,
        toolchain,
        startTime,
        `No adapter found for toolchain: ${toolchain}`
      )
    }

    const available = await adapter.isAvailable()
    if (!available) {
      return createFailureResult(
        taskId,
        workcell,
        toolchain,
        startTime,
        `Adapter ${toolchain} is not available (missing auth or CLI)`
      )
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const result = await adapter.execute(workcell, task, controller.signal)

      clearTimeout(timeoutId)

      let patch: string | undefined
      if (result.success && workcell.name !== "inplace") {
        try {
          patch = await git.getWorktreeDiff(workcell.directory)
        } catch {
        }
      }

      return {
        taskId,
        workcellId: workcell.id,
        toolchain,
        success: result.success,
        patch,
        output: result.output,
        error: result.error,
        telemetry: {
          startedAt: result.telemetry?.startedAt || startTime,
          completedAt: result.telemetry?.completedAt || Date.now(),
          model: result.telemetry?.model,
          tokens: result.telemetry?.tokens,
          cost: result.telemetry?.cost,
        },
      }
    } catch (error) {
      clearTimeout(timeoutId)

      const errorMessage =
        error instanceof Error
          ? error.name === "AbortError"
            ? `Execution timed out after ${timeout}ms`
            : error.message
          : String(error)

      return createFailureResult(
        taskId,
        workcell,
        toolchain,
        startTime,
        errorMessage
      )
    }
  }

  export async function executeWithRetry(
    request: ExecutionRequest,
    maxRetries: number = 3
  ): Promise<ExecutionResult> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await execute(request)

      if (result.success) {
        return result
      }

      const isTransient = isTransientError(result.error)
      if (!isTransient || attempt === maxRetries - 1) {
        return result
      }

      await sleep(RETRY_BACKOFF_MS * 2 ** attempt)
    }

    return execute(request)
  }

  export async function getAvailableAdapters(): Promise<Adapter[]> {
    return adaptersModule.getAvailableAdapters()
  }

  export function getAdapter(toolchain: Toolchain): Adapter | undefined {
    return adaptersModule.getAdapter(toolchain)
  }

  export function getAllAdapters(): Adapter[] {
    return adaptersModule.getAllAdapters()
  }
}

function isTransientError(error?: string): boolean {
  if (!error) return false

  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(error))
}

export default Dispatcher
