import { plot, rectX, ruleX } from '@observablehq/plot';
import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  DrainViewerCluster,
  DrainViewerPinnedTemplate,
  DrainViewerViewModel,
} from '../../shared/drain-viewer';
import { useRovingTabindex } from '../shared/hooks';

interface AppProps {
  viewModel: DrainViewerViewModel | null;
  isDark: boolean;
  isStale: boolean;
  selectedTemplateId: string | null;
  highlightedArtifactId?: string | null;
  isPulsing?: boolean;
  onNavigate: (queryId: string, templateId?: string | null) => void;
  onSelectTemplate: (templateId: string) => void;
  onTogglePin: (queryId: string, templateId: string, isPinned: boolean) => void;
}

interface TooltipState {
  x: number;
  y: number;
  text: string;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

function renderTooltipText(cluster: DrainViewerCluster): string {
  return `${cluster.templateId}: ${cluster.template} | ${formatCount(cluster.count)} events | ${formatPercentage(cluster.percentage)}`;
}

function normalizeDetailLine(line: string): string {
  return line.replace(/^[-*]\s+/, '').trim();
}

function PinnedTemplates(props: {
  pinnedTemplates: DrainViewerPinnedTemplate[];
  onNavigate: (queryId: string, templateId?: string | null) => void;
}) {
  const pinnedListRef = useRef<HTMLDivElement>(null);
  useRovingTabindex(pinnedListRef, '.pinned-chip');

  return (
    <details class="pinned-panel">
      <summary>
        Pinned templates
        <span class="summary-badge">{props.pinnedTemplates.length}</span>
      </summary>
      {props.pinnedTemplates.length === 0 ? (
        <p class="muted-copy">Pin a template to keep it handy across query switches.</p>
      ) : (
        <div class="pinned-list" role="list" aria-label="Pinned templates" ref={pinnedListRef}>
          {props.pinnedTemplates.map((pin) => (
            <button
              key={`${pin.queryId}:${pin.templateId}`}
              class="pinned-chip"
              role="listitem"
              onClick={() => props.onNavigate(pin.queryId, pin.templateId)}
              type="button"
            >
              <span class="pinned-chip__id">{pin.templateId}</span>
              <span class="pinned-chip__text">{pin.template}</span>
              <span class="pinned-chip__meta">
                {pin.queryTitle} · {formatCount(pin.count)}
              </span>
            </button>
          ))}
        </div>
      )}
    </details>
  );
}

function ActiveIocs(props: { values: string[] }) {
  if (props.values.length === 0) {
    return null;
  }

  return (
    <div class="ioc-strip" aria-label="Active IOC highlights">
      <span class="ioc-strip__label">Active IOCs</span>
      <div class="ioc-strip__values">
        {props.values.map((value) => (
          <span key={value} class="ioc-badge">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function DrainChart(props: {
  clusters: DrainViewerCluster[];
  selectedTemplateId: string | null;
  totalCount: number;
  highlightedArtifactId?: string | null;
  isPulsing?: boolean;
  queryId?: string | null;
  onSelectTemplate: (templateId: string) => void;
}) {
  const { highlightedArtifactId, isPulsing, queryId } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const clusterListRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [width, setWidth] = useState(0);
  useRovingTabindex(clusterListRef, '.cluster-chip');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const updateWidth = () => {
      setWidth(Math.max(Math.floor(host.clientWidth), 240));
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    setTooltip(null);
    host.replaceChildren();

    if (props.clusters.length === 0 || width < 300) {
      return;
    }

    let start = 0;
    const segments = props.clusters.map((cluster) => {
      const segment = {
        ...cluster,
        start,
        end: start + cluster.count,
      };
      start += cluster.count;
      return segment;
    });

    const plotChart = plot({
      width,
      height: 132,
      marginTop: 12,
      marginRight: 12,
      marginBottom: 36,
      marginLeft: 0,
      x: {
        domain: [0, Math.max(props.totalCount, 1)],
        grid: true,
        label: 'Event count',
        tickFormat: (value) => formatCount(Number(value)),
      },
      y: {
        axis: null,
        domain: ['clusters'],
      },
      marks: [
        ruleX([0]),
        rectX(segments, {
          x1: 'start',
          x2: 'end',
          y: () => 'clusters',
          fill: (segment) => segment.color,
          inset: 1.5,
          rx: 10,
          title: (segment) => renderTooltipText(segment),
        }),
      ],
    });

    host.replaceChildren(plotChart);

    const nodes = Array.from(plotChart.querySelectorAll('rect')).slice(0, segments.length);
    nodes.forEach((node, index) => {
      const segment = segments[index];
      const showTooltip = (event: MouseEvent | FocusEvent) => {
        const rect = node.getBoundingClientRect();
        const x = 'clientX' in event ? event.clientX : rect.left + rect.width / 2;
        const y = 'clientY' in event ? event.clientY : rect.top;
        setTooltip({
          x,
          y,
          text: renderTooltipText(segment),
        });
      };
      const hideTooltip = () => {
        setTooltip((current) => {
          if (current?.text === renderTooltipText(segment)) {
            return null;
          }
          return current;
        });
      };
      const updateTooltip = (event: MouseEvent) => {
        setTooltip({
          x: event.clientX,
          y: event.clientY,
          text: renderTooltipText(segment),
        });
      };
      const select = () => {
        props.onSelectTemplate(segment.templateId);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      };

      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.setAttribute(
        'aria-label',
        `${segment.templateId}. ${segment.template}. ${formatCount(segment.count)} events, ${formatPercentage(segment.percentage)} of the query total.${segment.matchedIocs.length > 0 ? ` IOC matches: ${segment.matchedIocs.join(', ')}.` : ''}`
      );
      node.style.cursor = 'pointer';
      node.setAttribute(
        'stroke',
        segment.matchedIocs.length > 0
          ? 'var(--hunt-warning, #f59e0b)'
          : segment.templateId === props.selectedTemplateId
            ? 'var(--hunt-accent-strong)'
            : 'var(--hunt-panel-border)'
      );
      node.setAttribute(
        'stroke-width',
        segment.matchedIocs.length > 0 || segment.templateId === props.selectedTemplateId
          ? '3'
          : '1'
      );
      node.addEventListener('click', select);
      node.addEventListener('keydown', onKeyDown);
      node.addEventListener('mouseenter', showTooltip);
      node.addEventListener('mousemove', updateTooltip);
      node.addEventListener('mouseleave', hideTooltip);
      node.addEventListener('focus', showTooltip);
      node.addEventListener('blur', hideTooltip);
    });

    return () => {
      setTooltip(null);
      plotChart.remove();
    };
  }, [props.clusters, props.onSelectTemplate, props.selectedTemplateId, props.totalCount, width]);

  return (
    <section class="chart-panel">
      <div class="panel-header">
        <div>
          <h2>Template clustering</h2>
          <p class="muted-copy">
            Horizontal stacked bar of structural templates for the current query.
          </p>
        </div>
      </div>
      <div class="plot-host" ref={hostRef} />
      {width < 300 ? (
        <p class="muted-copy compact-note">
          Narrow layout: chart hidden. Use the template list below to inspect clusters.
        </p>
      ) : null}
      {tooltip ? (
        <div
          class="chart-tooltip"
          style={{
            left: `${tooltip.x + 12}px`,
            top: `${tooltip.y + 12}px`,
          }}
        >
          {tooltip.text}
        </div>
      ) : null}
      <div class="cluster-list" role="list" aria-label="Template clusters" ref={clusterListRef}>
        {props.clusters.map((cluster) => {
          let chipClass = `cluster-chip ${cluster.templateId === props.selectedTemplateId ? 'is-selected' : ''}`;
          const isHighlighted = cluster.templateId === highlightedArtifactId || queryId === highlightedArtifactId;
          if (isHighlighted) chipClass += ' hunt-selection-highlight';
          if (isHighlighted && isPulsing) chipClass += ' hunt-selection-pulse';
          if (cluster.matchedIocs.length > 0) chipClass += ' is-ioc-match';

          return (
          <button
            key={cluster.templateId}
            class={chipClass}
            role="listitem"
            onClick={() => props.onSelectTemplate(cluster.templateId)}
            type="button"
          >
            <span
              class="cluster-chip__swatch"
              style={{ backgroundColor: cluster.color }}
            />
            <span class="cluster-chip__label">
              {cluster.templateId} · {cluster.template}
            </span>
            <span class="cluster-chip__meta">
              {formatCount(cluster.count)} · {formatPercentage(cluster.percentage)}
            </span>
            {cluster.matchedIocs.length > 0 ? (
              <span class="cluster-chip__ioc">
                IOC match: {cluster.matchedIocs.join(', ')}
              </span>
            ) : null}
          </button>
          );
        })}
      </div>
    </section>
  );
}

export function App(props: AppProps) {
  if (!props.viewModel) {
    return (
      <main class="viewer-shell">
        <section class="empty-state">
          <h1>Drain Template Viewer</h1>
          <p>Waiting for query data from the extension host.</p>
        </section>
      </main>
    );
  }

  const { clusters, emptyMessage, pinnedTemplates, query } = props.viewModel;
  const selectedCluster =
    clusters.find((cluster) => cluster.templateId === props.selectedTemplateId) ??
    clusters[0] ??
    null;

  return (
    <main class={`viewer-shell ${props.isDark ? 'is-dark' : 'is-light'}`}>
      <section class="hero-panel">
        <div class="hero-panel__header">
          <div>
            <p class="eyebrow">Drain Template Viewer</p>
            <h1>{query.title}</h1>
            <p class="hero-meta">
              {query.queryId} · {query.connectorId} · {query.dataset}
            </p>
          </div>
          <button
            class="ghost-button"
            onClick={() => props.onNavigate(query.queryId, null)}
            type="button"
          >
            Open query artifact
          </button>
        </div>
        <div class="stats-grid">
          <article class="stat-card">
            <span class="stat-card__label">Events</span>
            <strong>{formatCount(query.eventCount)}</strong>
          </article>
          <article class="stat-card">
            <span class="stat-card__label">Templates</span>
            <strong>{formatCount(query.templateCount)}</strong>
          </article>
          <article class="stat-card">
            <span class="stat-card__label">Entities</span>
            <strong>{formatCount(query.entityCount)}</strong>
          </article>
          <article class="stat-card">
            <span class="stat-card__label">Time window</span>
            <strong>
              {query.timeWindow ? `${query.timeWindow.start} -> ${query.timeWindow.end}` : 'Unavailable'}
            </strong>
          </article>
        </div>
        <ActiveIocs values={props.viewModel.activeIocs} />
      </section>

      {props.isStale ? (
        <aside class="stale-banner" aria-live="polite">
          Query data changed on disk. Refreshing template details.
        </aside>
      ) : null}

      <PinnedTemplates
        pinnedTemplates={pinnedTemplates}
        onNavigate={props.onNavigate}
      />

      {emptyMessage ? (
        <section class="empty-state">
          <h2>No clustered templates</h2>
          <p>{emptyMessage}</p>
        </section>
      ) : (
        <>
          <DrainChart
            clusters={clusters}
            selectedTemplateId={selectedCluster?.templateId ?? null}
            totalCount={query.eventCount}
            highlightedArtifactId={props.highlightedArtifactId}
            isPulsing={props.isPulsing}
            queryId={query.queryId}
            onSelectTemplate={props.onSelectTemplate}
          />

          {selectedCluster ? (
            <section class="detail-panel">
              <div class="detail-panel__header">
                <div>
                  <p class="eyebrow">Selected template</p>
                  <h2>
                    {selectedCluster.templateId} · {selectedCluster.template}
                  </h2>
                  <p class="muted-copy">
                    {formatCount(selectedCluster.count)} events · {formatPercentage(selectedCluster.percentage)} of total
                  </p>
                </div>
                <div class="detail-actions">
                  <button
                    class="primary-button"
                    onClick={() => props.onNavigate(query.queryId, selectedCluster.templateId)}
                    type="button"
                  >
                    Jump to detail section
                  </button>
                  <button
                    class="ghost-button"
                    onClick={() =>
                      props.onTogglePin(
                        query.queryId,
                        selectedCluster.templateId,
                        selectedCluster.isPinned
                      )
                    }
                    type="button"
                  >
                    {selectedCluster.isPinned ? 'Unpin template' : 'Pin template'}
                  </button>
                </div>
              </div>

              {selectedCluster.sampleEventText ? (
                <div class="sample-callout">
                  <span class="sample-callout__label">Sample detail</span>
                  <strong>{selectedCluster.sampleEventText}</strong>
                </div>
              ) : null}

              <div class="detail-grid">
                <article class="detail-card">
                  <h3>Analyst detail</h3>
                  {selectedCluster.detailLines.length === 0 ? (
                    <p class="muted-copy">
                      No template-specific detail was serialized in the query artifact.
                    </p>
                  ) : (
                    <ul class="detail-list">
                      {selectedCluster.detailLines.map((line) => (
                        <li key={line}>{normalizeDetailLine(line)}</li>
                      ))}
                    </ul>
                  )}
                </article>
                <article class="detail-card">
                  <h3>Event IDs</h3>
                  {selectedCluster.eventIds.length === 0 ? (
                    <p class="muted-copy">
                      Current query artifacts do not serialize concrete per-template event IDs.
                    </p>
                  ) : (
                    <ul class="detail-list detail-list--mono">
                      {selectedCluster.eventIds.map((eventId) => (
                        <li key={eventId}>{eventId}</li>
                      ))}
                    </ul>
                  )}
                </article>
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
