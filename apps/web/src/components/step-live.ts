import { t } from '../i18n.js';
import type { PortalState } from '../state.js';

export function renderStep4LiveRun(state: PortalState): string {
  const lang = state.language;
  const stageOrder = ['preflight', 'discover', 'app-map', 'lanes', 'correlate', 'document'];

  return `
    <div class="panel">
      <div class="panel-header">
        <span>Live Run Stream — ${state.runId ?? 'Running'}</span>
        <button id="btn-stop-run" class="btn btn-danger" style="height:22px; padding:0 8px; font-size:10px;">
          ${t(lang, 'cancelRun')}
        </button>
      </div>
      <div class="panel-body">
        <!-- Stage Timeline Chips (Scenario 4.1) -->
        <div style="display:flex; gap:6px; margin-bottom:14px; overflow-x:auto;">
          ${stageOrder
            .map((st) => {
              const status = state.stages[st] ?? 'pending';
              let badgeClass = 'tag-muted';
              if (status === 'ok') badgeClass = 'tag-verified';
              else if (status === 'running') badgeClass = 'tag-discovered';
              else if (status === 'failed') badgeClass = 'tag-review';

              return `
              <div style="flex:1; background:var(--bg); border:1px solid var(--border); border-radius:3px; padding:8px; text-align:center;">
                <div style="font-size:10px; font-family:var(--mono); color:var(--text-muted); font-weight:600;">${st.toUpperCase()}</div>
                <span class="tag ${badgeClass}" style="margin-top:3px; font-size:10px;">${status}</span>
              </div>
            `;
            })
            .join('')}
        </div>

        <!-- Telemetry Indicators (Scenario 4.3) -->
        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <span class="tag tag-meta">Requests Executed: ${state.requestsCount}</span>
          <span class="tag tag-meta">Circuit Breaker: ${state.circuitBreakerOpen ? 'OPEN (Tripped)' : 'CLOSED (Healthy)'}</span>
        </div>

        <!-- Live Terminal Stream -->
        <div class="terminal-box" id="terminal-logs">
          ${state.liveLogs.map((l) => `<span class="log-line">${l}</span>`).join('')}
          ${state.liveLogs.length === 0 ? '<span class="log-line" style="color:var(--text-muted);">Waiting for pipeline events...</span>' : ''}
        </div>

        <div style="display:flex; justify-content:flex-end; margin-top:14px;">
          <button id="btn-view-results" class="btn btn-primary">
            ${t(lang, 'viewResults')} ->
          </button>
        </div>
      </div>
    </div>
  `;
}
