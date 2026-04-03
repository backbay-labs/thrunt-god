import type { ComponentChildren } from 'preact';

export interface BadgeProps {
  children: ComponentChildren;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span class={`hunt-badge hunt-badge--${variant}`}>
      {children}
    </span>
  );
}
