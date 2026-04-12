/**
 * Side panel — real THRUNT case sidebar UI.
 *
 * Phase two: renders bridge-backed state, handles error/empty states,
 * shows vendor context, and supports real capture actions.
 */

import type { CaseViewModel, VendorPageContext, FindingSummary, EvidenceTimelineEntry } from '@thrunt-surfaces/contracts';

// --- State ---

type ConnectionState = 'connecting' | 'connected' | 'mock' | 'disconnected' | 'no_case';
type BannerTone = 'success' | 'warning' | 'error' | 'info';

let connectionState: ConnectionState = 'connecting';
let caseView: CaseViewModel | null = null;
let detectedVendor: VendorPageContext | null = null;
let lastError: string | null = null;
let lastAction: string | null = null;
let lastActionTone: BannerTone = 'info';

// --- DOM helpers ---

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// --- Message handling ---

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'bridge:status':
      if (message.connected) {
        connectionState = message.mockMode ? 'mock' : 'connected';
      } else {
        connectionState = 'disconnected';
      }
      updateStatusDot();
      render();
      break;

    case 'bridge:case_updated':
      if (message.data?.view) {
        caseView = message.data.view;
        connectionState = message.data.mockMode ? 'mock' : 'connected';
        lastError = null;
      } else if (message.data?.error === 'no_case') {
        connectionState = 'no_case';
        caseView = null;
      }
      render();
      break;

    case 'vendor:detected':
      detectedVendor = message.context;
      render();
      break;

    case 'action:result':
      lastAction = message.message;
      lastActionTone = message.kind ?? inferBannerTone(message.message);
      render();
      // Clear action result after 5 seconds
      setTimeout(() => { lastAction = null; render(); }, 5000);
      break;

    case 'bridge:error':
      lastError = message.message;
      render();
      break;
  }
});

// --- Rendering ---

function updateStatusDot(): void {
  const dot = $('status-dot');
  const label = $('status-label');
  if (!dot) return;
  dot.className = 'status-dot';
  let statusLabel = 'Connecting to bridge';
  switch (connectionState) {
    case 'connected':
      dot.classList.add('connected');
      dot.title = 'Connected to bridge (real mode)';
      statusLabel = 'Live bridge ready';
      break;
    case 'mock':
      dot.classList.add('mock');
      dot.title = 'Connected (mock mode)';
      statusLabel = 'Mock bridge connected';
      break;
    case 'disconnected':
      dot.title = 'Bridge unavailable';
      statusLabel = 'Bridge unavailable';
      break;
    case 'no_case':
      dot.classList.add('no-case');
      dot.title = 'No active case';
      statusLabel = 'Bridge ready, no active case';
      break;
    default:
      dot.title = 'Connecting...';
      statusLabel = 'Connecting to bridge';
      break;
  }
  if (label) label.textContent = statusLabel;
}

function render(): void {
  const content = $('content');
  if (!content) return;

  updateStatusDot();

  // Error/empty states
  if (connectionState === 'connecting') {
    content.innerHTML = `
      <div class="section">
        <div class="card hero-card">
          <div class="card-title">Connecting to bridge</div>
          <div class="card-meta">Waiting for the local THRUNT control plane to answer on localhost:7483.</div>
        </div>
      </div>`;
    return;
  }

  if (connectionState === 'disconnected') {
    content.innerHTML = `
      <div class="section">
        <div class="card hero-card" style="border-color: var(--danger)">
          <div class="card-title">Bridge unavailable</div>
          <div class="card-meta">Cannot reach the THRUNT surface bridge at localhost:7483.</div>
          <div class="detail-grid">
            <div class="detail-item">
              <div class="detail-label">Next step</div>
              <div class="detail-value">
            Start the bridge: <code>bun run dogfood:bridge</code>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="actions">
          <button class="btn btn-primary" id="btn-retry">
            <span class="btn-title">Retry bridge connection</span>
            <span class="btn-hint">Poll the bridge again and reload case state.</span>
          </button>
        </div>
      </div>`;
    $('btn-retry')?.addEventListener('click', () => {
      connectionState = 'connecting';
      render();
      chrome.runtime.sendMessage({ type: 'request:bridge_status' });
    });
    return;
  }

  if (connectionState === 'no_case') {
    const openCaseAction = detectedVendor
      ? `<div class="section">
          <div class="actions">
            <button class="btn btn-primary" id="btn-open-case">
              <span class="btn-title">Open case from current console</span>
              <span class="btn-hint">Bootstrap a THRUNT case using the active browser surface.</span>
            </button>
          </div>
        </div>`
      : '';
    content.innerHTML = `
      <div class="section">
        <div class="card hero-card">
          <div class="card-title">No active case</div>
          <div class="card-meta">The bridge is running, but nothing is attached to the operator shell yet.</div>
          ${detectedVendor ? `
            <div class="detail-grid">
              <div class="detail-item">
                <div class="detail-label">Detected console</div>
                <div class="detail-value"><strong>${esc(detectedVendor.consoleName)}</strong> on ${esc(detectedVendor.pageType)}</div>
              </div>
            </div>` : ''}
        </div>
      </div>
      ${openCaseAction}`;
    $('btn-open-case')?.addEventListener('click', () => {
      if (!detectedVendor) return;
      chrome.runtime.sendMessage({
        type: 'command',
        command: {
          type: 'open_case',
          signal: `${detectedVendor.consoleName}: ${detectedVendor.pageTitle}`,
          vendorContext: detectedVendor,
        },
      });
    });
    return;
  }

  if (!caseView) {
    content.innerHTML = '<div class="empty">Loading case data...</div>';
    return;
  }

  // Normal render
  const cv = caseView;
  const html = [
    lastAction ? renderBanner(lastAction, lastActionTone) : '',
    lastError ? renderBanner(lastError, 'error') : '',
    renderControlDeck(cv),
    renderCaseHeader(cv),
    renderVendorStatusRow(cv),
    renderVendorContext(),
    renderRuntimePreview(cv),
    renderLastExecution(cv),
    renderReadiness(cv),
    renderBlockers(cv),
    renderHypotheses(cv),
    renderRecommendedActions(cv),
    renderFindings(cv),
    renderEvidenceTimeline(cv),
    renderDiagnostics(),
  ].join('');

  content.innerHTML = html;
  bindActions();
}

function renderBanner(message: string, tone: BannerTone): string {
  return `<div class="section"><div class="banner banner-${tone}">${esc(message)}</div></div>`;
}

function renderCaseHeader(cv: CaseViewModel): string {
  return `
    <div class="section">
      <div class="card hero-card">
        <div class="split-header">
          <div>
            <div class="section-title" style="margin-bottom:6px">Active Case</div>
            <div class="card-title">${esc(cv.case.title)}</div>
            <div class="card-meta">${esc(cv.case.owner)} &middot; ${esc(cv.case.mode)}</div>
            ${cv.case.signal ? `<div class="card-meta" style="margin-top:6px;font-style:italic">${esc(truncate(cv.case.signal, 200))}</div>` : ''}
          </div>
          ${renderBadge(cv.case.status, badgeClassForState(cv.case.status))}
        </div>
        <div class="pill-row">
          ${connectionState === 'mock' ? renderBadge('mock mode', 'badge-warning') : ''}
          ${renderBadge(`phase ${cv.progress.currentPhase}/${cv.progress.totalPhases}`, 'badge-neutral')}
          ${cv.recommendedAction ? renderBadge('next action ready', 'badge-info') : renderBadge('manual loop', 'badge-neutral')}
        </div>
      </div>
    </div>`;
}

function renderVendorStatusRow(cv: CaseViewModel): string {
  const statuses = cv.adapterStatuses.map(a => {
    // Override detected vendor to 'connected'
    const state = (detectedVendor && a.vendorId === detectedVendor.vendorId) ? 'connected' : a.state;
    const badgeMap: Record<string, string> = {
      connected: 'badge-success',
      extracting: 'badge-success',
      certified: 'badge-info',
      uncertified: 'badge-warning',
      disconnected: 'badge-neutral',
    };
    return renderBadge(`${a.displayName} (${state})`, badgeMap[state] ?? 'badge-neutral');
  }).join('');

  if (cv.adapterStatuses.length === 0) {
    return `
      <div class="section">
        <div class="section-title">Adapters</div>
        <div class="empty">No adapters detected</div>
      </div>`;
  }

  return `
    <div class="section">
      <div class="section-title">Adapters</div>
      <div class="card">
        <div class="pill-row">${statuses}</div>
      </div>
    </div>`;
}

function renderProgress(cv: CaseViewModel): string {
  return `
    <div class="section">
      <div class="section-title">Hunt Progress</div>
      <div class="card">
        <div class="split-header">
          <div class="card-title">Phase ${cv.progress.currentPhase} of ${cv.progress.totalPhases}</div>
          ${renderBadge(`${cv.progress.percent}%`, 'badge-info')}
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${cv.progress.percent}%"></div></div>
        <div class="card-meta">${esc(cv.progress.lastActivity || 'No activity recorded')}</div>
      </div>
    </div>`;
}

function renderControlDeck(cv: CaseViewModel): string {
  const captureDisabled = !detectedVendor;
  const runtimeReady = Boolean(cv.runtimePreview?.ready);
  const devMode = devModeEnabled();
  const previewSummary = cv.runtimePreview
    ? (cv.runtimePreview.ready ? `${cv.runtimePreview.targets.length} ready target${cv.runtimePreview.targets.length === 1 ? '' : 's'}` : `${cv.runtimePreview.blockers.length || 1} blocker${cv.runtimePreview.blockers.length === 1 ? '' : 's'}`)
    : 'not previewed';
  const previewMeta = cv.runtimePreview
    ? truncate(cv.runtimePreview.targetName || cv.runtimePreview.packTitle, 52)
    : 'Resolve pack and parameters first';
  const executionSummary = cv.lastExecution
    ? `${cv.lastExecution.queryIds.length}Q · ${cv.lastExecution.receiptIds.length}R`
    : 'not run';
  const executionMeta = cv.lastExecution
    ? `${cv.lastExecution.status} · ${formatTimestamp(cv.lastExecution.completedAt)}`
    : 'No runtime execution yet';
  const captureSummary = `${cv.recentQueries.length}Q · ${cv.recentReceipts.length}R · ${cv.recentEvidence.length}E`;
  const nextActionCopy = cv.recommendedAction ? truncate(cv.recommendedAction, 78) : 'Manual operator loop';
  const nextActionTitle = cv.recommendedAction ? `Next action: ${cv.recommendedAction}` : 'No bridge-suggested next action';

  return `
    <div class="section">
      <div class="card hero-card control-deck">
        <div class="control-strip-head">
          <div class="control-strip-copy">
            <div class="control-strip-title">Control Deck</div>
            <div class="control-strip-subtitle">${esc(nextActionCopy)}</div>
          </div>
          <div class="pill-row" style="margin-top:0">
            ${renderBadge(`phase ${cv.progress.currentPhase}/${cv.progress.totalPhases}`, 'badge-neutral')}
            ${renderBadge(`${cv.progress.percent}%`, 'badge-info')}
            ${renderBadge(runtimeReady ? 'runtime armed' : 'runtime cold', runtimeReady ? 'badge-success' : 'badge-neutral')}
            ${renderBadge(captureSummary, 'badge-neutral')}
          </div>
        </div>
        <div class="control-rail">
          ${cv.recommendedAction ? renderToolButton({
            id: 'btn-next',
            title: nextActionTitle,
            label: 'Run next action',
            variant: 'primary',
            icon: iconArrow(),
          }) : ''}
          ${renderToolButton({
            id: 'btn-preview-runtime',
            title: `Preview runtime. ${previewSummary}. ${previewMeta}`,
            label: 'Preview runtime',
            disabled: captureDisabled,
            variant: 'runtime',
            icon: iconEye(),
          })}
          ${renderToolButton({
            id: 'btn-run-runtime',
            title: runtimeReady ? `Run runtime. Last run ${executionMeta}.` : 'Run runtime. Requires a ready preview first.',
            label: 'Run runtime',
            disabled: !runtimeReady,
            variant: 'runtime',
            icon: iconPlay(),
          })}
          ${renderToolButton({
            id: 'btn-attach-context',
            title: 'Attach page context as evidence',
            label: 'Attach page context',
            disabled: captureDisabled,
            variant: 'capture',
            icon: iconPlusSquare(),
          })}
          ${renderToolButton({
            id: 'btn-clip-query',
            title: 'Clip a visible query into a canonical THRUNT query artifact',
            label: 'Clip query',
            disabled: captureDisabled,
            variant: 'capture',
            icon: iconSearch(),
          })}
          ${renderToolButton({
            id: 'btn-clip-entity',
            title: 'Clip visible actors and targets from the current console page',
            label: 'Clip entities',
            disabled: captureDisabled,
            variant: 'capture',
            icon: iconNodes(),
          })}
          ${devMode ? renderToolButton({
            id: 'btn-capture-live',
            title: 'Capture a live certification snapshot for replay and review',
            label: 'Capture live snapshot',
            disabled: captureDisabled,
            variant: 'live',
            icon: iconCamera(),
          }) : ''}
          ${renderToolButton({
            id: 'btn-refresh',
            title: 'Refresh panel state from the bridge',
            label: 'Refresh panel',
            variant: 'quiet',
            icon: iconRefresh(),
          })}
        </div>
      </div>
    </div>`;
}

function renderVendorContext(): string {
  const vendor = detectedVendor;
  if (!vendor) return '';
  const extraction = vendor.extraction;
  const certification = caseView?.certification.find((item) => item.vendorId === vendor.vendorId);
  const campaign = caseView?.certificationCampaigns.find((item) => item.vendorId === vendor.vendorId);
  const history = caseView?.certificationHistory.find((item) => item.vendorId === vendor.vendorId);
  const trend = caseView?.certificationDriftTrends.find((item) => item.vendorId === vendor.vendorId);
  const baseline = caseView?.certificationBaselines.find((item) => item.vendorId === vendor.vendorId && item.active);
  const freshness = caseView?.certificationFreshness.find((item) => item.vendorId === vendor.vendorId);
  const churn = caseView?.certificationBaselineChurn.find((item) => item.vendorId === vendor.vendorId);
  const extractionSummary = extraction ? `${extraction.confidence} / ${extraction.completeness}` : 'unrated';
  const latestCampaign = campaign ? `${campaign.status} · ${campaign.tenantLabel}` : 'no campaign yet';
  const historySummary = history
    ? `${history.campaignCount} total · last reviewed ${formatTimestamp(history.lastReviewedAt)}`
    : 'no campaign history';
  const driftSummary = trend
    ? `${trend.unresolvedCampaignCount} unresolved · ${trend.topRecurringDriftClasses[0]?.classification ?? 'stable'}`
    : 'stable';
  const freshnessSummary = freshness
    ? `${freshness.state} · ${freshness.bucket}`
    : 'uncertified';
  const churnSummary = churn
    ? `${churn.currentStabilityPosture} · ${churn.promotedBaselineCount} promoted`
    : 'no baseline';

  return `
    <div class="section">
      <div class="section-title">Active Console</div>
      <div class="card">
        <div class="split-header">
          <div>
            <div class="card-title">${esc(vendor.consoleName)}</div>
            <div class="card-meta">${esc(vendor.pageType)} &middot; ${esc(vendor.vendorId)}</div>
          </div>
          ${renderBadge(extractionSummary, extraction ? badgeClassForState(extraction.completeness) : 'badge-neutral')}
        </div>
        <div class="pill-row">
          ${certification ? renderBadge(certification.status, badgeClassForState(certification.status)) : ''}
          ${renderBadge(freshnessSummary, badgeClassForState(freshnessSummary))}
          ${renderBadge(churnSummary, badgeClassForState(churnSummary))}
        </div>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="detail-label">Latest campaign</div>
            <div class="detail-value">${esc(latestCampaign)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Campaign history</div>
            <div class="detail-value">${esc(historySummary)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Drift posture</div>
            <div class="detail-value">${esc(driftSummary)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Next recertification</div>
            <div class="detail-value">${esc(freshness?.nextRecommendedRecertificationAt ? formatTimestamp(freshness.nextRecommendedRecertificationAt) : 'unscheduled')}</div>
          </div>
          ${baseline ? `
            <div class="detail-item">
              <div class="detail-label">Active baseline</div>
              <div class="detail-value"><strong>${esc(baseline.campaignId)}</strong></div>
            </div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderDiagnostics(): string {
  if (!devModeEnabled() || !detectedVendor) return '';
  const vendor = detectedVendor;
  const extraction = vendor.extraction;
  const diagnostics = {
    vendorId: vendor.vendorId,
    consoleName: vendor.consoleName,
    pageType: vendor.pageType,
    pageUrl: vendor.pageUrl,
    extraction,
    metadata: vendor.metadata ?? {},
    certificationCampaigns: caseView?.certificationCampaigns
      .filter((campaign) => campaign.vendorId === vendor.vendorId)
      .slice(0, 3) ?? [],
    certificationHistory: caseView?.certificationHistory.find((item) => item.vendorId === vendor.vendorId) ?? null,
    certificationTrend: caseView?.certificationDriftTrends.find((item) => item.vendorId === vendor.vendorId) ?? null,
    certificationFreshness: caseView?.certificationFreshness.find((item) => item.vendorId === vendor.vendorId) ?? null,
    certificationBaselineChurn: caseView?.certificationBaselineChurn.find((item) => item.vendorId === vendor.vendorId) ?? null,
    activeBaseline: caseView?.certificationBaselines.find((item) => item.vendorId === vendor.vendorId && item.active) ?? null,
  };

  return `
    <div class="section">
      <div class="section-title">Diagnostics</div>
      <div class="card">
        ${extraction?.failureReasons?.length ? `<div class="subtle" style="color:var(--warning)">Failures: ${esc(extraction.failureReasons.join(' | '))}</div>` : ''}
        ${extraction?.detectedSignals?.length ? `<div class="subtle" style="margin-top:6px">Signals: ${esc(extraction.detectedSignals.join(' | '))}</div>` : ''}
        <details>
          <summary>Show adapter and certification payload</summary>
          <div class="scroll-pane" style="margin-top:10px">
            <pre style="margin:0;font-size:10px;white-space:pre-wrap;word-break:break-word">${esc(JSON.stringify(diagnostics, null, 2))}</pre>
          </div>
        </details>
      </div>
    </div>`;
}

function renderRuntimePreview(cv: CaseViewModel): string {
  if (!cv.runtimePreview) return '';
  const preview = cv.runtimePreview;
  const targetLines = preview.targets.slice(0, 2).map((target) => (
    `<div class="preview-target">
      <div class="split-header">
        <div>
          <div class="card-title" style="font-size:12px">${esc(target.connectorId)} / ${esc(target.dataset)}</div>
          <div class="card-meta">${esc(target.timeWindow)} &middot; ${esc(target.readinessStatus)}</div>
        </div>
        ${renderBadge(target.ready ? 'ready' : 'blocked', target.ready ? 'badge-success' : 'badge-warning')}
      </div>
      <div class="preview-query" style="margin-top:10px">${esc(truncate(target.querySummary, 220))}</div>
      ${target.blockers.length ? `<div class="subtle" style="margin-top:8px">Target blockers: ${esc(target.blockers.slice(0, 2).join(' · '))}${target.blockers.length > 2 ? ` +${target.blockers.length - 2} more` : ''}</div>` : ''}
    </div>`
  )).join('');
  return `
    <div class="section">
      <div class="section-title">Runtime Preview</div>
      <div class="card" style="border-color:${preview.ready ? 'var(--success)' : 'var(--warning)'}">
        <div class="split-header">
          <div>
            <div class="card-title">${esc(preview.packTitle)}</div>
            <div class="card-meta">${esc(preview.targetName || preview.packId)} &middot; generated ${esc(formatTimestamp(preview.generatedAt))}</div>
          </div>
          ${renderBadge(preview.ready ? 'ready' : 'blocked', preview.ready ? 'badge-success' : 'badge-warning')}
        </div>
        <div class="pill-row">
          ${renderBadge(`${preview.targets.length} target${preview.targets.length === 1 ? '' : 's'}`, 'badge-neutral')}
          ${preview.blockers.length ? renderBadge(`${preview.blockers.length} blocker${preview.blockers.length === 1 ? '' : 's'}`, 'badge-warning') : renderBadge('no preview blockers', 'badge-info')}
        </div>
        <div class="preview-stack">${targetLines}</div>
        ${preview.targets.length > 2 ? `
          <details>
            <summary>Show ${preview.targets.length - 2} more target(s)</summary>
            <div class="scroll-pane">
              <div class="preview-stack">
                ${preview.targets.slice(2).map((target) => `
                  <div class="preview-target">
                    <div class="split-header">
                      <div>
                        <div class="card-title" style="font-size:12px">${esc(target.connectorId)} / ${esc(target.dataset)}</div>
                        <div class="card-meta">${esc(target.timeWindow)} &middot; ${esc(target.readinessStatus)}</div>
                      </div>
                      ${renderBadge(target.ready ? 'ready' : 'blocked', target.ready ? 'badge-success' : 'badge-warning')}
                    </div>
                    <div class="preview-query" style="margin-top:10px">${esc(truncate(target.querySummary, 220))}</div>
                  </div>`).join('')}
              </div>
            </div>
          </details>` : ''}
        ${preview.blockers.length ? `<div class="subtle" style="margin-top:10px">Preview blockers: ${esc(preview.blockers.slice(0, 2).join(' · '))}${preview.blockers.length > 2 ? ` +${preview.blockers.length - 2} more` : ''}</div>` : ''}
      </div>
    </div>`;
}

function renderLastExecution(cv: CaseViewModel): string {
  if (!cv.lastExecution) return '';
  const execution = cv.lastExecution;
  return `
    <div class="section">
      <div class="section-title">Last Execution</div>
      <div class="card">
        <div class="split-header">
          <div>
            <div class="card-title">${esc(execution.message)}</div>
            <div class="card-meta">${esc(formatTimestamp(execution.completedAt))} &middot; ${esc(execution.mode)}</div>
          </div>
          ${renderBadge(execution.status, badgeClassForState(execution.status))}
        </div>
        <div class="pill-row">
          ${execution.packId ? renderBadge(execution.packId, 'badge-neutral') : ''}
          ${execution.targetName ? renderBadge(truncate(execution.targetName, 28), 'badge-info') : ''}
          ${renderBadge(`${execution.queryIds.length} queries`, 'badge-info')}
          ${renderBadge(`${execution.receiptIds.length} receipts`, 'badge-success')}
        </div>
      </div>
    </div>`;
}

function renderHypotheses(cv: CaseViewModel): string {
  if (cv.hypotheses.length === 0) return '';
  const items = cv.hypotheses.map(h => {
    const badgeClass = badgeClassForState(h.status);
    const evidenceCount =
      cv.recentReceipts.filter(r => r.relatedHypotheses.includes(h.id)).length +
      cv.recentQueries.filter(q => q.relatedHypotheses.includes(h.id)).length +
      cv.recentEvidence.filter(e => e.relatedHypotheses.includes(h.id)).length;
    const evidenceBadgeClass = evidenceCount === 0 ? 'badge-warning' : 'badge-neutral';
    return `
      <div class="list-row hypothesis-item" data-hypothesis-id="${esc(h.id)}" style="cursor:pointer" title="Click to view ${esc(h.id)}">
        <div class="split-header">
          ${renderBadge(h.status, badgeClass)}
          ${renderBadge(`${evidenceCount} evidence`, evidenceBadgeClass)}
          <div class="subtle">${esc(h.id)}</div>
        </div>
        <div class="compact-item">${esc(truncate(h.assertion, 120))}</div>
      </div>`;
  }).join('');
  return `<div class="section"><div class="section-title">Hypotheses (${cv.hypotheses.length})</div><div class="card"><div class="compact-list">${items}</div></div></div>`;
}

function renderRecommendedActions(cv: CaseViewModel): string {
  if (cv.recommendedActions.length === 0 && !cv.recommendedAction) return '';

  const priorityBadge: Record<string, string> = {
    high: 'badge-danger',
    medium: 'badge-warning',
    low: 'badge-info',
  };

  let items: string;
  if (cv.recommendedActions.length > 0) {
    items = cv.recommendedActions.map(a => `
      <div class="list-row action-item" data-action-id="${esc(a.id)}" style="cursor:pointer" title="${esc(a.label)}">
        <div class="split-header">
          ${renderBadge(a.priority, priorityBadge[a.priority] ?? 'badge-neutral')}
          <div class="subtle">${esc(a.category.replace(/_/g, ' '))}</div>
        </div>
        <div class="compact-item">${esc(a.label)}</div>
      </div>`).join('');
  } else {
    // Legacy single action fallback
    items = `
      <div class="list-row">
        <div class="split-header">
          ${renderBadge('info', 'badge-info')}
        </div>
        <div class="compact-item">${esc(cv.recommendedAction!)}</div>
      </div>`;
  }

  return `
    <div class="section">
      <div class="section-title">Recommended Actions</div>
      <div class="card">
        <div class="compact-list">${items}</div>
      </div>
    </div>`;
}

function renderFindings(cv: CaseViewModel): string {
  if (cv.findings.length === 0) return '';
  const items = cv.findings.slice(0, 5).map((f: FindingSummary) => {
    return `
      <div class="list-row">
        <div class="split-header">
          ${renderBadge(f.severity, badgeClassForSeverity(f.severity))}
        </div>
        <div class="compact-item">${esc(truncate(f.title, 110))}</div>
      </div>`;
  }).join('');
  return `<div class="section"><div class="section-title">Findings (${cv.findings.length})</div><div class="card"><div class="compact-list">${items}</div></div></div>`;
}

function renderEvidenceTimeline(cv: CaseViewModel): string {
  const count = cv.evidenceTimeline.length;
  if (count === 0) {
    return `
      <div class="section">
        <div class="section-title">Evidence Timeline (0)</div>
        <div class="card">
          <div class="empty">No evidence captured yet</div>
        </div>
      </div>`;
  }

  const typeConfig: Record<EvidenceTimelineEntry['type'], { label: string; badgeClass: string }> = {
    query: { label: 'QRY', badgeClass: 'badge-info' },
    receipt: { label: 'RCT', badgeClass: 'badge-success' },
    evidence: { label: 'EVD', badgeClass: 'badge-neutral' },
  };

  const items = cv.evidenceTimeline.map((entry) => {
    const config = typeConfig[entry.type] ?? { label: entry.type.toUpperCase(), badgeClass: 'badge-neutral' };
    return `
      <div class="list-row timeline-item" data-artifact-id="${esc(entry.id)}" data-artifact-type="${esc(entry.type)}" style="cursor:pointer" title="Click to navigate to ${esc(entry.id)}">
        <div class="split-header">
          <div class="pill-row" style="margin-top:0">
            ${renderBadge(config.label, config.badgeClass)}
            ${renderBadge(entry.vendorId, 'badge-neutral')}
          </div>
          <div class="subtle">${esc(formatTimestamp(entry.timestamp))}</div>
        </div>
        <div class="compact-item">${esc(truncate(entry.summary, 120))}</div>
      </div>`;
  }).join('');

  return `
    <div class="section">
      <div class="section-title">Evidence Timeline (${count})</div>
      <div class="card">
        <div class="scroll-pane" style="max-height:280px">
          <div class="compact-list">${items}</div>
        </div>
      </div>
    </div>`;
}

function renderReadiness(cv: CaseViewModel): string {
  if (cv.readinessBlockers.length === 0) return '';
  return `
    <div class="section">
      <div class="section-title">Readiness</div>
      <div class="card" style="border-color: var(--warning)">
        <div class="pill-row">
          ${renderBadge(`${cv.readinessBlockers.length} blocker${cv.readinessBlockers.length === 1 ? '' : 's'}`, 'badge-warning')}
        </div>
        <div class="compact-list" style="margin-top:12px">
          ${cv.readinessBlockers.slice(0, 3).map((blocker) => `<div class="list-row"><div class="compact-item">${esc(blocker)}</div></div>`).join('')}
        </div>
        ${cv.readinessBlockers.length > 3 ? `
          <details>
            <summary>Show ${cv.readinessBlockers.length - 3} more readiness blocker(s)</summary>
            <div class="scroll-pane">
              <div class="compact-list" style="margin-top:10px">
                ${cv.readinessBlockers.slice(3).map((blocker) => `<div class="list-row"><div class="compact-item">${esc(blocker)}</div></div>`).join('')}
              </div>
            </div>
          </details>` : ''}
      </div>
    </div>`;
}

function renderBlockers(cv: CaseViewModel): string {
  if (cv.blockers.length === 0) return '';
  const summary = summarizeBlockers(cv.blockers);
  const headlineRows = [
    ...summary.actionable.slice(0, 4).map((item) => `<div class="list-row"><div class="compact-item">${esc(item)}</div></div>`),
    summary.captureUnlinkedCount > 0
      ? `<div class="list-row"><div class="compact-item"><strong>Capture debt</strong> ${summary.captureUnlinkedCount} evidence note${summary.captureUnlinkedCount === 1 ? ' is' : 's are'} not linked to a hypothesis yet.</div></div>`
      : '',
    summary.captureFollowUpCount > 0
      ? `<div class="list-row"><div class="compact-item"><strong>Follow-up debt</strong> ${summary.captureFollowUpCount} captured evidence item${summary.captureFollowUpCount === 1 ? ' still needs' : 's still need'} follow-up.</div></div>`
      : '',
  ].filter(Boolean).join('');

  return `
    <div class="section">
      <div class="section-title">Blockers</div>
      <div class="card" style="border-color: var(--warning)">
        <div class="pill-row">
          ${renderBadge(`${cv.blockers.length} total`, 'badge-warning')}
          ${summary.captureUnlinkedCount ? renderBadge(`${summary.captureUnlinkedCount} unlinked captures`, 'badge-warning') : ''}
          ${summary.captureFollowUpCount ? renderBadge(`${summary.captureFollowUpCount} follow-up captures`, 'badge-warning') : ''}
          ${summary.actionable.length ? renderBadge(`${summary.actionable.length} active follow-ups`, 'badge-info') : ''}
        </div>
        <div class="compact-list" style="margin-top:12px">${headlineRows}</div>
        ${cv.blockers.length > 4 ? `
          <details>
            <summary>Show raw blocker ledger (${cv.blockers.length})</summary>
            <div class="scroll-pane">
              <div class="compact-list" style="margin-top:10px">
                ${summary.raw.map((blocker) => `<div class="list-row"><div class="compact-item">${esc(blocker)}</div></div>`).join('')}
              </div>
            </div>
          </details>` : ''}
      </div>
    </div>`;
}

function bindActions(): void {
  $('btn-next')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'command', command: { type: 'execute_next' } });
  });

  $('btn-preview-runtime')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'command',
      command: {
        type: 'preview_runtime',
        vendorContext: detectedVendor ?? undefined,
      },
    });
  });

  $('btn-run-runtime')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'command',
      command: {
        type: 'execute_pack',
        vendorContext: detectedVendor ?? undefined,
      },
    });
  });

  $('btn-clip-query')?.addEventListener('click', () => {
    sendCaptureRequest('clip_query');
  });

  $('btn-clip-entity')?.addEventListener('click', () => {
    sendCaptureRequest('clip_entity');
  });

  $('btn-attach-context')?.addEventListener('click', () => {
    sendCaptureRequest('attach_page_context');
  });

  $('btn-capture-live')?.addEventListener('click', () => {
    sendCaptureRequest('capture_live_snapshot');
  });

  $('btn-refresh')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'request:case_view' });
  });

  // Timeline item clicks (SIDE-06)
  document.querySelectorAll('.timeline-item').forEach((el) => {
    el.addEventListener('click', () => {
      const artifactId = (el as HTMLElement).dataset.artifactId;
      const artifactType = (el as HTMLElement).dataset.artifactType;
      if (artifactId && artifactType) {
        chrome.runtime.sendMessage({
          type: 'navigate:artifact',
          artifactId,
          artifactType,
        });
        lastAction = `Navigating to ${artifactType} ${artifactId}`;
        lastActionTone = 'info';
        render();
        setTimeout(() => { lastAction = null; render(); }, 3000);
      }
    });
  });

  // Hypothesis clicks (SIDE-06)
  document.querySelectorAll('.hypothesis-item').forEach((el) => {
    el.addEventListener('click', () => {
      const hypothesisId = (el as HTMLElement).dataset.hypothesisId;
      if (hypothesisId) {
        chrome.runtime.sendMessage({
          type: 'navigate:artifact',
          artifactId: hypothesisId,
          artifactType: 'hypothesis',
        });
        lastAction = `Navigating to hypothesis ${hypothesisId}`;
        lastActionTone = 'info';
        render();
        setTimeout(() => { lastAction = null; render(); }, 3000);
      }
    });
  });

  // Action clicks (SIDE-06)
  document.querySelectorAll('.action-item').forEach((el) => {
    el.addEventListener('click', () => {
      const actionId = (el as HTMLElement).dataset.actionId;
      if (actionId) {
        chrome.runtime.sendMessage({
          type: 'navigate:action',
          actionId,
        });
        lastAction = `Executing action: ${actionId}`;
        lastActionTone = 'info';
        render();
        setTimeout(() => { lastAction = null; render(); }, 3000);
      }
    });
  });
}

function sendCaptureRequest(action: string): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'capture:request', action });
    }
  });
}

function renderArtifactRow(label: string, value: string): string {
  return `
    <div class="list-row">
      <strong>${esc(label)}</strong>
      <div class="compact-item">${esc(truncate(value, 110))}</div>
    </div>`;
}

function renderToolButton(options: {
  id: string;
  title: string;
  label: string;
  icon: string;
  disabled?: boolean;
  variant?: 'primary' | 'runtime' | 'capture' | 'quiet' | 'live';
}): string {
  const classes = ['btn', 'tool-btn'];
  switch (options.variant) {
    case 'primary':
      classes.push('tool-btn-primary');
      break;
    case 'runtime':
      classes.push('tool-btn-runtime');
      break;
    case 'capture':
      classes.push('tool-btn-capture');
      break;
    case 'live':
      classes.push('tool-btn-live');
      break;
    default:
      classes.push('tool-btn-quiet');
      break;
  }

  return `
    <button
      class="${classes.join(' ')}"
      id="${esc(options.id)}"
      title="${esc(options.title)}"
      aria-label="${esc(options.label)}"
      ${options.disabled ? 'disabled' : ''}
    >${options.icon}</button>`;
}

function iconArrow(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12"/><path d="m13 6 6 6-6 6"/></svg>';
}

function iconEye(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>';
}

function iconPlay(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 6 10 6-10 6Z"/></svg>';
}

function iconPlusSquare(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>';
}

function iconSearch(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="5.5"/><path d="m16 16 4 4"/></svg>';
}

function iconNodes(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M8 11 15.8 6.9"/><path d="M8 13 15.8 17.1"/></svg>';
}

function iconCamera(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.4-2h7.2L17 8h3v10H4Z"/><circle cx="12" cy="13" r="3.5"/></svg>';
}

function iconRefresh(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18 11a6.5 6.5 0 0 0-11-2"/><path d="M6 13a6.5 6.5 0 0 0 11 2"/></svg>';
}

function summarizeBlockers(blockers: string[]) {
  const actionable: string[] = [];
  let captureUnlinkedCount = 0;
  let captureFollowUpCount = 0;

  for (const blocker of blockers) {
    if (/^Captured evidence\s+\S+\s+is not linked to a hypothesis$/i.test(blocker)) {
      captureUnlinkedCount += 1;
      continue;
    }

    if (/^Captured evidence\s+\S+\s+still needs follow-up$/i.test(blocker)) {
      captureFollowUpCount += 1;
      continue;
    }

    actionable.push(blocker.replace(/^Evidence follow-up:\s*/i, ''));
  }

  return {
    actionable,
    captureUnlinkedCount,
    captureFollowUpCount,
    raw: blockers,
  };
}

function badgeClassForSeverity(severity: string): string {
  const normalized = severity.toLowerCase();
  if (normalized.includes('high') || normalized.includes('critical')) return 'badge-danger';
  if (normalized.includes('medium')) return 'badge-warning';
  return 'badge-info';
}

function badgeClassForState(value: string): string {
  const normalized = value.toLowerCase();

  if (/(supported|success|approved|ok|ready|complete|fresh|stable|connected|live-certified)/.test(normalized)) {
    return 'badge-success';
  }
  if (/(stale|failed|error|rejected|disconnected|contradict|unstable)/.test(normalized)) {
    return 'badge-danger';
  }
  if (/(warning|blocked|aging|pending|partial|review|uncertified|follow_up|no_baseline|no baseline|inconclusive|unresolved)/.test(normalized)) {
    return 'badge-warning';
  }
  if (/(info|manual)/.test(normalized)) {
    return 'badge-info';
  }

  return 'badge-neutral';
}

function renderBadge(value: string, badgeClass: string): string {
  return `<span class="badge ${badgeClass}">${esc(value)}</span>`;
}

function inferBannerTone(message: string): BannerTone {
  const normalized = message.toLowerCase();

  if (/(failed|error|unavailable|cannot|missing|required)/.test(normalized)) return 'error';
  if (/(blocked|warning|saved as evidence|needs|follow-up)/.test(normalized)) return 'warning';
  if (/(captured|previewed|connected|opened|refreshed|loaded|executed)/.test(normalized)) return 'success';

  return 'info';
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str: string | null | undefined, len: number): string {
  const value = str ?? '';
  return value.length > len ? value.slice(0, len - 3) + '...' : value;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function devModeEnabled(): boolean {
  return localStorage.getItem('thrunt_surfaces_dev_mode') === '1';
}

// --- Initialize ---

chrome.runtime.sendMessage({ type: 'request:bridge_status' });
chrome.runtime.sendMessage({ type: 'request:case_view' });
