import type { ComponentChildren } from 'preact';

export interface GhostButtonProps {
  children: ComponentChildren;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
}

export function GhostButton({ children, onClick, className, ariaLabel }: GhostButtonProps) {
  return (
    <button
      class={`hunt-ghost-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      type="button"
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
