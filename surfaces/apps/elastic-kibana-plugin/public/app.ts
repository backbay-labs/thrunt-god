/**
 * THRUNT Surfaces Kibana App — minimal UI scaffold.
 */

const BRIDGE_URL = 'http://127.0.0.1:7483';

export function renderApp(params: { element: HTMLElement }): () => void {
  const { element } = params;

  element.innerHTML = `
    <div style="padding: 24px; font-family: Inter, -apple-system, sans-serif;">
      <h1>THRUNT Surfaces</h1>
      <p>Threat hunting operator surface — connecting to bridge at <code>${BRIDGE_URL}</code></p>
      <div id="thrunt-case-view" style="margin-top: 16px;">
        <p style="color: #69707d;">Loading case data...</p>
      </div>
    </div>
  `;

  // Fetch and render case data
  loadCaseView(element);

  // Return unmount function
  return () => {
    element.innerHTML = '';
  };
}

async function loadCaseView(root: HTMLElement) {
  const container = root.querySelector('#thrunt-case-view');
  if (!container) return;

  try {
    const res = await fetch(`${BRIDGE_URL}/api/case/view`);
    if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
    const data = await res.json();
    const cv = data.view;

    container.innerHTML = `
      <div style="background: #1d1e24; padding: 16px; border-radius: 4px; color: #dfe5ef;">
        <h2>${cv.case.title}</h2>
        <p>${cv.case.status} — Phase ${cv.progress.currentPhase}/${cv.progress.totalPhases} — ${cv.progress.percent}%</p>
        <h3 style="margin-top: 12px;">Hypotheses</h3>
        ${cv.hypotheses.map((h: any) => `<p>[${h.status}] ${h.id}: ${h.assertion}</p>`).join('')}
        <h3 style="margin-top: 12px;">Recent Queries (${cv.recentQueries.length})</h3>
        ${cv.recentQueries.map((q: any) => `<p>${q.queryId}: ${q.title} (${q.eventCount} events)</p>`).join('')}
      </div>
    `;
  } catch {
    container.innerHTML = `
      <div style="padding: 16px; color: #bd271e;">
        <p>Could not connect to the THRUNT surface bridge at ${BRIDGE_URL}.</p>
        <p>Make sure the bridge is running: <code>bun run dev:bridge</code></p>
      </div>
    `;
  }
}
