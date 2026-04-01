export interface HealthStatus {
  id: string
  name: string
  category: "security" | "ai" | "infra" | "mcp"
  available: boolean
  version?: string
  latency?: number
  error?: string
  checkedAt: number
}

export interface HealthCheckOptions {
  force?: boolean
  timeout?: number
}

export interface HealthSummary {
  security: HealthStatus[]
  ai: HealthStatus[]
  infra: HealthStatus[]
  mcp: HealthStatus[]
  checkedAt: number
}

interface IntegrationDef {
  id: string
  name: string
  category: "security" | "ai" | "infra" | "mcp"
  command?: string
  args?: string[]
  versionParser?: (output: string) => string | undefined
  httpProbe?: string
}

function getIntegrations(): IntegrationDef[] {
  return [
    {
      id: "claude",
      name: "Claude",
      category: "ai",
      command: "claude",
      args: ["--version"],
      versionParser: (out) => out.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1],
    },
    {
      id: "codex",
      name: "Codex",
      category: "ai",
      command: "codex",
      args: ["--version"],
      versionParser: (out) => out.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1],
    },
    {
      id: "opencode",
      name: "OpenCode",
      category: "ai",
      command: "opencode",
      args: ["--version"],
      versionParser: (out) => out.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1],
    },
    {
      id: "git",
      name: "Git",
      category: "infra",
      command: "git",
      args: ["--version"],
      versionParser: (out) => out.match(/git version (\d+\.\d+(?:\.\d+)?)/)?.[1],
    },
    {
      id: "python",
      name: "Python",
      category: "infra",
      command: "python3",
      args: ["--version"],
      versionParser: (out) => out.match(/Python (\d+\.\d+(?:\.\d+)?)/)?.[1],
    },
    {
      id: "bun",
      name: "Bun",
      category: "infra",
      command: "bun",
      args: ["--version"],
      versionParser: (out) => out.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1],
    },
  ]
}

const CACHE_TTL = 60_000
const DEFAULT_TIMEOUT_MS = 3000
let healthCache: Map<string, HealthStatus> = new Map()
let lastFullCheck = 0

let mcpServerStatus: { running: boolean; port?: number } = { running: false }

function createMcpStatus(checkedAt: number = Date.now()): HealthStatus {
  return {
    id: "thrunt-god-mcp",
    name: "THRUNT GOD MCP",
    category: "mcp",
    available: mcpServerStatus.running,
    version: mcpServerStatus.port ? `:${mcpServerStatus.port}` : undefined,
    checkedAt,
  }
}

async function checkIntegration(
  def: IntegrationDef,
  timeout: number
): Promise<HealthStatus> {
  const startTime = Date.now()
  const result: HealthStatus = {
    id: def.id,
    name: def.name,
    category: def.category,
    available: false,
    checkedAt: Date.now(),
  }

  if (def.httpProbe) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      const response = await fetch(def.httpProbe, { signal: controller.signal })
      clearTimeout(timer)
      result.latency = Date.now() - startTime
      result.available = response.ok
      if (!response.ok) {
        result.error = `HTTP ${response.status}`
      }
    } catch (err) {
      result.latency = Date.now() - startTime
      result.available = false
      if (err instanceof Error) {
        result.error = err.name === "AbortError" ? "timeout" : err.message
      } else {
        result.error = String(err)
      }
    }
    return result
  }

  try {
    const proc = Bun.spawn([def.command!, ...(def.args ?? [])], {
      stdout: "pipe",
      stderr: "pipe",
    })

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), timeout)
    })

    const processPromise = (async () => {
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      return { exitCode, stdout, stderr }
    })()

    const raceResult = await Promise.race([processPromise, timeoutPromise])

    result.latency = Date.now() - startTime

    if (raceResult === "timeout") {
      proc.kill()
      result.available = false
      result.error = "timeout"
    } else {
      const { exitCode, stdout, stderr } = raceResult
      const output = stdout || stderr

      if (exitCode === 0) {
        const version = def.versionParser?.(output)
        result.available = true
        result.version = version
      } else {
        result.available = false
        result.error = output.trim().slice(0, 100) || `exit code ${exitCode}`
      }
    }
  } catch (err) {
    result.latency = Date.now() - startTime
    result.available = false

    if (err instanceof Error) {
      if (err.message.includes("spawn") || err.message.includes("ENOENT") || err.message.includes("not found")) {
        result.error = "not found"
      } else {
        result.error = err.message
      }
    } else {
      result.error = String(err)
    }
  }

  return result
}

export namespace Health {
  export async function checkAll(
    options: HealthCheckOptions = {}
  ): Promise<HealthSummary> {
    const { force = false, timeout = DEFAULT_TIMEOUT_MS } = options
    const now = Date.now()

    if (!force && now - lastFullCheck < CACHE_TTL && healthCache.size > 0) {
      return getSummary()
    }

    const checks = getIntegrations().map((def) => checkIntegration(def, timeout))
    const results = await Promise.all(checks)

    for (const result of results) {
      healthCache.set(result.id, result)
    }
    lastFullCheck = now

    return getSummary()
  }

  export async function check(
    id: string,
    options: HealthCheckOptions = {}
  ): Promise<HealthStatus | undefined> {
    const { force = false, timeout = DEFAULT_TIMEOUT_MS } = options

    const cached = healthCache.get(id)
    if (!force && cached && Date.now() - cached.checkedAt < CACHE_TTL) {
      return cached
    }

    const def = getIntegrations().find((i) => i.id === id)
    if (!def) {
      return undefined
    }

    const result = await checkIntegration(def, timeout)
    healthCache.set(id, result)
    return result
  }

  export function getSummary(): HealthSummary {
    const summary: HealthSummary = {
      security: [],
      ai: [],
      infra: [],
      mcp: [],
      checkedAt: lastFullCheck,
    }

    for (const status of healthCache.values()) {
      if (status.category === "security") {
        summary.security.push(status)
      } else if (status.category === "ai") {
        summary.ai.push(status)
      } else if (status.category === "infra") {
        summary.infra.push(status)
      }
    }

    summary.mcp.push(createMcpStatus())

    summary.security.sort((a, b) => a.id.localeCompare(b.id))
    summary.ai.sort((a, b) => a.id.localeCompare(b.id))
    summary.infra.sort((a, b) => a.id.localeCompare(b.id))

    return summary
  }

  export function getStatus(id: string): HealthStatus | undefined {
    if (id === "thrunt-god-mcp") {
      return createMcpStatus()
    }
    return healthCache.get(id)
  }

  export function setMcpStatus(running: boolean, port?: number): void {
    mcpServerStatus = { running, port }
  }

  export function getMcpStatus(): { running: boolean; port?: number } {
    return { ...mcpServerStatus }
  }

  export function clearCache(): void {
    healthCache.clear()
    lastFullCheck = 0
  }

  export function getIntegrationIds(): string[] {
    return getIntegrations().map((i) => i.id)
  }

  export function isCacheStale(): boolean {
    return Date.now() - lastFullCheck > CACHE_TTL
  }
}

export default Health
