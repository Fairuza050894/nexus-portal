import { t } from '../i18n.js';
import type { PortalState } from '../state.js';

export function renderStep4LiveRun(state: PortalState): string {
  const lang = state.language;
  const stageOrder = ['preflight', 'discover', 'app-map', 'lanes', 'correlate', 'document'];

  const formatLogLine = (line: string): string => {
    const match = line.match(/^(\[[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?: [AP]M)?\])([\s\S]*)$/i);
    if (match) {
      const time = match[1];
      const rest = match[2].trim();
      let badge = '';
      let msg = rest;
      if (rest.startsWith('[RUN]')) {
        badge = '<span class="tag tag-discovered" style="font-size:9px; padding:0 4px;">RUN</span>';
        msg = rest.slice(5).trim();
      } else if (rest.startsWith('[STAGE]')) {
        badge = '<span class="tag tag-verified" style="font-size:9px; padding:0 4px;">STAGE</span>';
        msg = rest.slice(7).trim();
      } else if (rest.startsWith('[COMPLETE]')) {
        badge = '<span class="tag tag-verified" style="font-size:9px; padding:0 4px;">DONE</span>';
        msg = rest.slice(10).trim();
      } else if (rest.startsWith('[STATUS]')) {
        badge = '<span class="tag tag-meta" style="font-size:9px; padding:0 4px;">STATUS</span>';
        msg = rest.slice(8).trim();
      } else if (rest.startsWith('[WARN]')) {
        badge = '<span class="tag tag-review" style="font-size:9px; padding:0 4px;">WARN</span>';
        msg = rest.slice(6).trim();
      } else if (rest.startsWith('[ERROR]')) {
        badge = '<span class="tag tag-critical" style="font-size:9px; padding:0 4px;">ERROR</span>';
        msg = rest.slice(7).trim();
      }
      return `<div class="log-line"><span class="log-time">${time}</span>${badge ? `${badge} ` : ''}<span class="log-text">${msg}</span></div>`;
    }
    return `<div class="log-line"><span class="log-time">[${new Date().toLocaleTimeString()}]</span><span class="log-text">${line}</span></div>`;
  };

  return `
    <div class="panel">
      <div class="panel-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="live-pulse"><span class="live-pulse-dot"></span>LIVE PIPELINE</span>
          <span style="color:var(--text-muted); font-size:11px;">—</span>
          <span id="live-run-id-title">${state.runId ?? 'Menunggu Run...'}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span id="live-started-at" class="tag tag-meta">MULAI: ${new Date().toLocaleTimeString()}</span>
          <span id="live-elapsed-timer" class="tag tag-meta" style="color:var(--accent-fg);">DURASI: 00:00</span>
          <button id="btn-stop-run" class="btn btn-danger" style="height:22px; padding:0 8px; font-size:10px;">
            ${t(lang, 'cancelRun')}
          </button>
        </div>
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
              <div id="stage-card-${st}" style="flex:1; background:var(--bg); border:1px solid var(--border); border-radius:3px; padding:8px; text-align:center;">
                <div style="font-size:10px; font-family:var(--mono); color:var(--text-muted); font-weight:600;">${st.toUpperCase()}</div>
                <span id="stage-badge-${st}" class="tag ${badgeClass}" style="margin-top:3px; font-size:10px;">${status}</span>
                <div id="stage-dur-${st}" style="font-size:9px; font-family:var(--mono); color:var(--text-muted); margin-top:2px;">${state.stageDurations?.[st] !== undefined ? `${state.stageDurations[st]}ms` : '-'}</div>
              </div>
            `;
            })
            .join('')}
        </div>
        <!-- Per-Lane Progress (Scenario 4.2) -->
        <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">
          Per-Lane Execution Progress:
        </div>
        <div id="lane-progress-container" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; margin-bottom:14px;">
          ${['e2e', 'a11y', 'perf', 'security']
            .map((lane) => {
              const laneInfo = state.lanes?.find((l) => l.lane === lane);
              let status = 'STANDBY';
              let badgeClass = 'tag-muted';
              let width = '0%';
              let countText = '';

              if (laneInfo) {
                if (laneInfo.status === 'passed') {
                  status = 'PASSED';
                  badgeClass = 'tag-verified';
                  width = '100%';
                } else if (laneInfo.status === 'failed') {
                  status = 'FAILED';
                  badgeClass = 'tag-critical';
                  width = '100%';
                } else if (laneInfo.status === 'skipped') {
                  status = 'SKIPPED';
                  badgeClass = 'tag-muted';
                  width = '100%';
                } else {
                  status = (laneInfo.status || 'RUNNING').toUpperCase();
                  badgeClass = 'tag-discovered';
                  width = '65%';
                }
                if (laneInfo.tests !== undefined) {
                  countText = `${laneInfo.passed ?? 0}/${laneInfo.tests} passed${laneInfo.skipped ? ` (${laneInfo.skipped} skipped)` : ''}`;
                }
              } else if (state.stages['lanes'] === 'ok') {
                status = 'PASSED';
                badgeClass = 'tag-verified';
                width = '100%';
              } else if (state.stages['lanes'] === 'running') {
                status = 'RUNNING';
                badgeClass = 'tag-discovered';
                width = '65%';
              }

              return `
            <div id="lane-card-${lane}" style="background:var(--bg); border:1px solid var(--border); border-radius:3px; padding:8px 10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-family:var(--mono);">
                <span style="font-weight:700; color:var(--text-bright);">${lane.toUpperCase()}</span>
                <span id="lane-status-${lane}" class="tag ${badgeClass}" style="font-size:9px;">${status}</span>
              </div>
              <div class="progress-bar-bg">
                <div id="lane-progress-bar-${lane}" class="progress-bar-fill ${status === 'PASSED' ? 'complete' : ''}" style="width:${width};"></div>
              </div>
              ${countText ? `<div style="font-size:9px; font-family:var(--mono); color:var(--text-muted); margin-top:3px; text-align:right;">${countText}</div>` : ''}
            </div>
          `;
            })
            .join('')}
        </div>


        <!-- Telemetry Indicators & Log Filter (Scenario 4.3) -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; gap:10px; align-items:center;">
            <span id="telemetry-requests" class="tag tag-meta">Requests Executed: ${state.requestsCount}</span>
            <span id="telemetry-circuit" class="tag tag-meta">Circuit Breaker: ${state.circuitBreakerOpen ? 'OPEN (Tripped)' : 'CLOSED (Healthy)'}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <label for="filter-log-level" style="font-size:11px; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase;">Filter Log:</label>
            <select id="filter-log-level" class="input-mono" style="height:24px; font-size:10px; padding:0 6px; width:120px;">
              <option value="all">ALL LOGS</option>
              <option value="stage">STAGES ONLY</option>
              <option value="info">INFO</option>
              <option value="warn">WARNINGS</option>
              <option value="error">ERRORS</option>
            </select>
          </div>
        </div>

        <!-- Live Terminal Stream Window with Header & Timestamps -->
        <div class="terminal-window">
          <div class="terminal-topbar">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="terminal-dots">
                <span class="terminal-dot terminal-dot-red"></span>
                <span class="terminal-dot terminal-dot-yellow"></span>
                <span class="terminal-dot terminal-dot-green"></span>
              </div>
              <span style="color:var(--text-muted);">nexus-qa-runner ~ live telemetry output</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" id="btn-copy-terminal-logs" class="btn btn-secondary" style="height:20px; padding:0 6px; font-size:10px;">
                SALIN LOG
              </button>
              <button type="button" id="btn-clear-terminal-logs" class="btn btn-secondary" style="height:20px; padding:0 6px; font-size:10px;">
                BERSIHKAN
              </button>
            </div>
          </div>
          <div class="terminal-box" id="terminal-logs" style="height:300px; padding:10px 14px;">
            ${state.liveLogs.map((l) => formatLogLine(l)).join('')}
            ${state.liveLogs.length === 0 ? '<div class="log-line" style="color:var(--text-muted);"><span class="log-time">[' + new Date().toLocaleTimeString() + ']</span><span class="log-text">Waiting for pipeline events...</span></div>' : ''}
          </div>
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
