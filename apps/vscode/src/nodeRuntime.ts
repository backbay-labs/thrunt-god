import * as fs from 'fs';
import * as path from 'path';

export type NodeExecutableResolver = string | (() => string);

function readResolverValue(resolver: NodeExecutableResolver): string {
  return typeof resolver === 'function' ? resolver() : resolver;
}

function looksLikeFilesystemPath(value: string): boolean {
  return (
    path.isAbsolute(value)
    || value.startsWith('.')
    || value.includes('/')
    || value.includes('\\')
  );
}

export function resolveNodeExecutable(resolver: NodeExecutableResolver): string {
  const candidate = readResolverValue(resolver).trim();
  if (!candidate) {
    return 'node';
  }

  if (!looksLikeFilesystemPath(candidate)) {
    return candidate;
  }

  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Node.js executable not found: ${resolved}`);
  }

  return resolved;
}
