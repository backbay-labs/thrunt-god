/**
 * THRUNT Surfaces Kibana Plugin — scaffold.
 *
 * Registers a side navigation entry and a minimal panel that reads from the surface bridge.
 * This is a scaffold only — real Kibana plugins require matching the exact Kibana version.
 */

import { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '../../../src/core/public';

const BRIDGE_URL = 'http://127.0.0.1:7483';

export class ThruntSurfacesPlugin implements Plugin {
  constructor(private readonly initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup) {
    // Register the application in the side navigation
    core.application.register({
      id: 'thruntSurfaces',
      title: 'THRUNT Surfaces',
      async mount(params: any) {
        const { renderApp } = await import('./app');
        return renderApp(params);
      },
    });
  }

  public start(core: CoreStart) {
    // Nothing to do on start for the scaffold
  }

  public stop() {}
}
