/**
 * THRUNT Surface Bridge client for Splunk.
 *
 * Fetches case data from the local bridge and renders into dashboard panels.
 * This is a scaffold — production implementation would use Splunk's JS SDK.
 */

const BRIDGE_URL = 'http://127.0.0.1:7483';

async function fetchBridgeData() {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/case/view`);
    if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('THRUNT bridge unavailable:', err.message);
    return null;
  }
}

function renderCaseStatus(data) {
  const el = document.getElementById('thrunt-case-status');
  if (!el || !data) return;
  const cv = data.view;
  el.innerHTML = `
    <h3>${cv.case.title}</h3>
    <p><strong>Status:</strong> ${cv.case.status} | <strong>Phase:</strong> ${cv.progress.currentPhase}/${cv.progress.totalPhases} | <strong>Progress:</strong> ${cv.progress.percent}%</p>
    <p><strong>Last activity:</strong> ${cv.progress.lastActivity}</p>
  `;
}

function renderQueries(data) {
  const el = document.getElementById('thrunt-recent-queries');
  if (!el || !data) return;
  const queries = data.view.recentQueries || [];
  if (queries.length === 0) {
    el.innerHTML = '<p>No queries in this case.</p>';
    return;
  }
  el.innerHTML = queries.map(q =>
    `<div style="margin-bottom: 8px; padding: 4px; border-left: 3px solid #1a73e8;">
      <strong>${q.queryId}</strong> — ${q.title}<br/>
      <small>${q.connectorId} | ${q.eventCount} events | ${q.executedAt}</small>
    </div>`
  ).join('');
}

function renderHypotheses(data) {
  const el = document.getElementById('thrunt-hypotheses');
  if (!el || !data) return;
  const hyps = data.view.hypotheses || [];
  if (hyps.length === 0) {
    el.innerHTML = '<p>No hypotheses defined.</p>';
    return;
  }
  el.innerHTML = hyps.map(h => {
    const colors = { Supported: '#3fb950', Disproved: '#f85149', Inconclusive: '#d29922', Open: '#58a6ff' };
    const color = colors[h.status] || '#8b949e';
    return `<div style="margin-bottom: 6px;">
      <span style="color: ${color}; font-weight: bold;">[${h.status}]</span> ${h.id}: ${h.assertion}
    </div>`;
  }).join('');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  const data = await fetchBridgeData();
  renderCaseStatus(data);
  renderQueries(data);
  renderHypotheses(data);
});
