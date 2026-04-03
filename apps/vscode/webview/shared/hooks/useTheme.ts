import { useEffect, useState } from 'preact/hooks';

/**
 * Manage the `body[data-theme]` attribute and expose the current theme state.
 *
 * Sets `document.body.dataset.theme` to `'dark'` or `'light'` whenever
 * `isDark` changes, keeping the CSS token layer in sync with VS Code's
 * active color theme.
 */
export function useTheme(): { isDark: boolean; setIsDark: (dark: boolean) => void } {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.body.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return { isDark, setIsDark };
}
