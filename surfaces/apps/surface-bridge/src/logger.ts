/**
 * Structured JSON logger for Surface Bridge.
 *
 * Every log line is a single JSON object written to the configured stream.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory = 'http' | 'ws' | 'subprocess' | 'file-watcher' | 'lifecycle' | 'auth';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  category: LogCategory;
  msg: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(category: LogCategory, msg: string, meta?: Record<string, unknown>): void;
  info(category: LogCategory, msg: string, meta?: Record<string, unknown>): void;
  warn(category: LogCategory, msg: string, meta?: Record<string, unknown>): void;
  error(category: LogCategory, msg: string, meta?: Record<string, unknown>): void;
}

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  minLevel?: LogLevel;
  stream?: { write(s: string): void };
}

export function createLogger(options?: LoggerOptions): Logger {
  const minLevel = options?.minLevel ?? 'debug';
  const stream = options?.stream ?? process.stdout;
  const minValue = LEVEL_VALUES[minLevel];

  function emit(level: LogLevel, category: LogCategory, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_VALUES[level] < minValue) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      category,
      msg,
      ...meta,
    };
    stream.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (category, msg, meta?) => emit('debug', category, msg, meta),
    info: (category, msg, meta?) => emit('info', category, msg, meta),
    warn: (category, msg, meta?) => emit('warn', category, msg, meta),
    error: (category, msg, meta?) => emit('error', category, msg, meta),
  };
}
