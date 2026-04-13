/**
 * Creates a vault event handler that only fires the callback when the
 * changed file resides inside the planning directory.
 */
export function createScopedHandler(
  planningDir: string,
  onMatch: () => void,
): (file: { path: string }) => void {
  return (file) => {
    if (file.path.startsWith(planningDir + '/') || file.path === planningDir) {
      onMatch();
    }
  };
}
