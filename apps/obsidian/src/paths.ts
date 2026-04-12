/**
 * Pure path resolution functions.
 *
 * Extracted from main.ts getPlanningDir (lines 100-104) and getCoreFilePath
 * (lines 111-113). The local normalizePath reimplements the Obsidian
 * normalizePath behavior as a pure function with zero runtime dependencies.
 */

export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/^\.\//, '');
}

export function getPlanningDir(
  configuredDir: string,
  defaultDir: string,
): string {
  const raw = configuredDir.trim() || defaultDir;
  return normalizePath(raw);
}

export function getCoreFilePath(
  planningDir: string,
  fileName: string,
): string {
  return normalizePath(`${planningDir}/${fileName}`);
}

export function getEntityFolder(
  planningDir: string,
  entityFolder: string,
): string {
  return normalizePath(`${planningDir}/${entityFolder}`);
}
