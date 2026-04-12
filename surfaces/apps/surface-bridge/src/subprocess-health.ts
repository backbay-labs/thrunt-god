/**
 * Subprocess health monitor for Surface Bridge.
 *
 * Probes thrunt-tools availability at startup and periodically,
 * enabling graceful degradation when the subprocess layer is down.
 */

import { runThruntCommand } from './thrunt-tools.ts';
import type { Logger } from './logger.ts';

export interface SubprocessHealthState {
  available: boolean;
  lastProbeAt: string | null;
  lastProbeOk: boolean;
  consecutiveFailures: number;
}

export interface SubprocessHealthMonitor {
  isAvailable(): boolean;
  getState(): SubprocessHealthState;
  probe(): Promise<boolean>;
  startPeriodicProbe(intervalMs?: number): void;
  stop(): void;
}

export interface SubprocessHealthMonitorOptions {
  projectRoot: string;
  toolsPath?: string | null;
  logger: Logger;
  probeTimeoutMs?: number;
  onStateChange?: (available: boolean) => void;
}

export function createSubprocessHealthMonitor(opts: SubprocessHealthMonitorOptions): SubprocessHealthMonitor {
  const { projectRoot, toolsPath, logger, probeTimeoutMs = 5000, onStateChange } = opts;

  let available = false;
  let lastProbeAt: string | null = null;
  let lastProbeOk = false;
  let consecutiveFailures = 0;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  async function probe(): Promise<boolean> {
    const result = await runThruntCommand(projectRoot, ['--version'], toolsPath, {
      timeoutMs: probeTimeoutMs,
      logger,
    });

    lastProbeAt = new Date().toISOString();

    if (result.ok) {
      lastProbeOk = true;
      consecutiveFailures = 0;
      const wasAvailable = available;
      available = true;
      if (!wasAvailable && onStateChange) {
        onStateChange(true);
      }
    } else {
      lastProbeOk = false;
      consecutiveFailures++;
      // Allow one transient failure before marking unavailable
      if (consecutiveFailures >= 2) {
        const wasAvailable = available;
        available = false;
        if (wasAvailable && onStateChange) {
          onStateChange(false);
        }
      }
    }

    logger.info('subprocess', 'health probe', { available, consecutiveFailures, lastProbeOk });
    return available;
  }

  function startPeriodicProbe(intervalMs = 60_000): void {
    // Probe immediately at startup
    void probe();
    intervalHandle = setInterval(() => {
      void probe();
    }, intervalMs);
  }

  function stop(): void {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  function isAvailable(): boolean {
    return available;
  }

  function getState(): SubprocessHealthState {
    return { available, lastProbeAt, lastProbeOk, consecutiveFailures };
  }

  return { isAvailable, getState, probe, startPeriodicProbe, stop };
}
