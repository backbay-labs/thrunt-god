import { useEffect } from 'preact/hooks';

/**
 * Subscribe to messages posted from the VS Code extension host.
 *
 * Adds a `message` event listener on mount and removes it on cleanup.
 * The caller receives `event.data` typed as `TMessage`.
 *
 * **Tip:** Wrap `handler` in `useCallback` to avoid re-subscribing on every
 * render.
 */
export function useHostMessage<TMessage>(
  handler: (message: TMessage) => void,
): void {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      handler(event.data as TMessage);
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [handler]);
}
