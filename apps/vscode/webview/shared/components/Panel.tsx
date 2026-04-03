import type { ComponentChildren } from 'preact';

export interface PanelProps {
  children: ComponentChildren;
  className?: string;
}

export function Panel({ children, className }: PanelProps) {
  return (
    <section class={`hunt-panel${className ? ` ${className}` : ''}`}>
      {children}
    </section>
  );
}
