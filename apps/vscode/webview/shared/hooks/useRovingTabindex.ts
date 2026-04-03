import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

/**
 * W3C ARIA APG roving tabindex pattern for keyboard navigation.
 *
 * Manages `tabindex` attributes and focus across interactive items within a
 * container. Supports:
 * - ArrowDown / ArrowRight: move focus to next item (wraps to first)
 * - ArrowUp / ArrowLeft: move focus to previous item (wraps to last)
 * - Home: move focus to first item
 * - End: move focus to last item
 *
 * Items are re-queried on every keydown so that dynamically added/removed
 * elements are handled correctly without a MutationObserver.
 */
export function useRovingTabindex(
  containerRef: RefObject<HTMLElement>,
  itemSelector: string,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Initialise: first item gets tabindex 0, rest get -1.
    const initItems = container.querySelectorAll<HTMLElement>(itemSelector);
    initItems.forEach((item, index) => {
      item.setAttribute('tabindex', index === 0 ? '0' : '-1');
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(itemSelector),
      );
      if (items.length === 0) {
        return;
      }

      const currentIndex = items.findIndex(
        (item) => item === document.activeElement,
      );
      if (currentIndex === -1) {
        return;
      }

      let nextIndex: number | null = null;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % items.length;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + items.length) % items.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = items.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();

      items[currentIndex].setAttribute('tabindex', '-1');
      items[nextIndex].setAttribute('tabindex', '0');
      items[nextIndex].focus();
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef, itemSelector]);
}
