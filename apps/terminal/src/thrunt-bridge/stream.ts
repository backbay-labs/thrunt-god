// thrunt-bridge/stream.ts - NDJSON streaming subprocess handle

import { resolveThruntToolsPath } from "./resolver"
import type { ThruntStreamHandle, ThruntCommandOptions } from "./types"

/**
 * Spawn a long-running thrunt-tools.cjs command that emits
 * newline-delimited JSON (NDJSON) on stdout.
 *
 * Each line is parsed as JSON and dispatched to onLine. Parse errors
 * for individual lines are silently skipped (non-JSON lines ignored).
 * Process failures are dispatched to onError.
 *
 * Returns a handle with a kill() method to terminate the subprocess.
 */
export function spawnThruntStream(
  args: string[],
  onLine: (data: unknown) => void,
  onError: (error: string) => void,
  opts?: ThruntCommandOptions,
): ThruntStreamHandle {
  const toolsPath = resolveThruntToolsPath(opts?.cwd)

  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn(["node", toolsPath, ...args], {
      cwd: opts?.cwd,
      env: opts?.env ? { ...process.env, ...opts.env } : undefined,
      stdout: "pipe",
      stderr: "pipe",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onError(message)
    return { kill() {} }
  }

  let killed = false

  // Collect stderr for error reporting on non-zero exit
  const stderrText = new Response(proc.stderr).text()

  // Read stdout line-by-line in the background
  const readLines = async () => {
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        // Keep the last (possibly incomplete) chunk in the buffer
        buffer = lines.pop() ?? ""

        for (const raw of lines) {
          const trimmed = raw.trim()
          if (!trimmed) continue
          try {
            onLine(JSON.parse(trimmed))
          } catch {
            /* skip non-JSON lines */
          }
        }
      }

      // Flush remaining buffer
      const remaining = buffer.trim()
      if (remaining) {
        try {
          onLine(JSON.parse(remaining))
        } catch {
          /* skip non-JSON */
        }
      }
    } catch (err) {
      if (!killed) {
        const message = err instanceof Error ? err.message : String(err)
        onError(message)
      }
    }
  }

  void readLines()

  // Watch for non-zero exit and report stderr
  proc.exited.then((exitCode) => {
    if (!killed && exitCode !== 0) {
      stderrText.then((text) => {
        onError(text.trim() || `Exit ${exitCode}`)
      })
    }
  })

  return {
    kill() {
      killed = true
      proc.kill()
    },
  }
}
