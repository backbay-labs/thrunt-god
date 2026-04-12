import type { SiteAdapter } from '@thrunt-surfaces/contracts';

export class SiteAdapterRegistry {
  private adapters: SiteAdapter[] = [];

  register(adapter: SiteAdapter): void {
    this.adapters.push(adapter);
  }

  match(url: string): SiteAdapter | null {
    for (const adapter of this.adapters) {
      for (const pattern of adapter.urlPatterns) {
        if (url.includes(pattern) || new RegExp(pattern).test(url)) {
          return adapter;
        }
      }
    }
    return null;
  }

  list(): SiteAdapter[] {
    return [...this.adapters];
  }
}

export function createDefaultRegistry(): SiteAdapterRegistry {
  // Adapters are registered by consuming code (browser extension content scripts)
  return new SiteAdapterRegistry();
}
