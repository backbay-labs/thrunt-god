export interface StatCardProps {
  label: string;
  value: string;
  className?: string;
}

export function StatCard({ label, value, className }: StatCardProps) {
  return (
    <article class={`hunt-stat-card${className ? ` ${className}` : ''}`}>
      <span class="hunt-stat-card__label">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
