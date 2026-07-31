import { PluginInitializerContext } from '../../../src/core/public';
import { ThruntSurfacesPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new ThruntSurfacesPlugin(initializerContext);
}
