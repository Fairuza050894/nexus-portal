import { t } from '../i18n.js';
import type { PortalState } from '../state.js';

export function renderStep5Results(state: PortalState): string {
  const lang = state.language;
  const gate = state.gate ?? 'GO WITH RISKS';

  let gateBannerClass = 'banner-warn';
  let gateText = t(lang, 'gateRisks');
  if (gate === 'GO') {
    gateBannerClass = 'banner-success';
    gateText = t(lang, 'gateGo');
  } else if (gate === 'NO-GO') {
    gateBannerClass = 'banner-danger';
    gateText = t(lang, 'gateNoGo');
  }

  const verifiedCount = state.findings.filter((f) => f.confidence === 'verified').length;
  const autoCount = state.findings.filter((f) => f.confidence === 'auto-discovered').length;
  const reviewCount = state.findings.filter((f) => f.confidence === 'needs-review').length;

  return `
    <div class="panel">
      <div class="panel-header">
        <span>Execution Report & Quality Gate Verdict</span>
        <div style="display:flex; gap:6px;">
          <button id="btn-download-bundle" class="btn btn-primary" style="height:24px; padding:0 8px; font-size:11px;">
            ${t(lang, 'downloadBundle')}
          </button>
          <button id="btn-start-new-run" class="btn btn-secondary" style="height:24px; padding:0 8px; font-size:11px;">
            ${t(lang, 'startNewRun')}
          </button>
        </div>
      </div>
      <div class="panel-body">
        <!-- Gate Result Banner (Scenario 5.1) -->
        <div class="banner ${gateBannerClass}" style="font-weight:700; font-size:13px;">
          <span>Gate Result: ${gateText}</span>
        </div>

        ${
          state.gateReasons.length > 0
            ? `
          <div style="margin-bottom:16px; background:var(--bg); padding:10px 12px; border-radius:3px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); margin-bottom:4px;">GATE REASONS:</div>
            <ul style="padding-left:16px; font-size:12px; font-family:var(--mono);">
              ${state.gateReasons.map((r) => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        `
            : ''
        }

        <!-- KPI Metrics (Scenario 5.2) -->
        <div class="kpi-grid" style="grid-template-columns:repeat(3, 1fr); margin-bottom:16px;">
          <div class="kpi-box">
            <div class="kpi-label">${t(lang, 'verifiedBadge')}</div>
            <div class="kpi-val" style="color:var(--success-fg);">${verifiedCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">${t(lang, 'autoDiscoveredBadge')}</div>
            <div class="kpi-val" style="color:var(--accent-fg);">${autoCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">${t(lang, 'needsReviewBadge')}</div>
            <div class="kpi-val" style="color:var(--warning-fg);">${reviewCount}</div>
          </div>
        </div>

        <!-- Correlated Findings Table (Scenario 5.3) -->
        <div style="font-size:11px; font-weight:600; font-family:var(--mono); color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">
          ${t(lang, 'findingsTitle')}
        </div>
        <div class="table-container">
          <table class="data-table" id="findings-table">
            <thead>
              <tr>
                <th style="width:80px;">FINDING ID</th>
                <th style="width:90px;">SEVERITY</th>
                <th style="width:120px;">CONFIDENCE</th>
                <th style="width:80px;">LANE</th>
                <th>TITLE & EVIDENCE SUMMARY</th>
              </tr>
            </thead>
            <tbody>
              ${state.findings
                .map((f) => {
                  let confBadge = 'badge-verified tag-verified';
                  if (f.confidence === 'needs-review') confBadge = 'badge-review tag-review';
                  else if (f.confidence === 'auto-discovered') confBadge = 'badge-discovered tag-discovered';

                  return `
                  <tr>
                    <td style="font-family:var(--mono); font-weight:600;">${f.id}</td>
                    <td><span class="tag tag-meta">${f.severity.toUpperCase()}</span></td>
                    <td><span class="tag ${confBadge}">${f.confidence}</span></td>
                    <td><span class="tag tag-meta">${f.lanes.join(', ').toUpperCase()}</span></td>
                    <td>
                      <div style="font-weight:600;">${f.title}</div>
                      ${f.evidenceSummary ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px; font-family:var(--mono);">${f.evidenceSummary}</div>` : ''}
                    </td>
                  </tr>
                `;
                })
                .join('')}
              ${state.findings.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No findings recorded.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <!-- Visual Regression Split-Screen Diff Slider (Phase 8.1) -->
        <div class="panel" id="visual-diff-panel" style="margin-top:20px;">
          <div class="panel-header">
            <span>Visual Regression Diff Inspector (Before vs After)</span>
            <span class="tag tag-review">TOLERANCE: 0.1% | OBSERVED: 0.42%</span>
          </div>
          <div class="panel-body">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-family:var(--mono); color:var(--text-muted); margin-bottom:6px;">
              <span>[LEFT] Production Baseline (Expected)</span>
              <span>[CENTER] Drag Slider to Compare</span>
              <span>[RIGHT] Staging Build (Actual)</span>
            </div>
            <div style="position:relative; width:100%; height:160px; overflow:hidden; border:1px solid var(--border); border-radius:3px; background:#04070b;">
              <div id="visual-before" style="position:absolute; top:0; left:0; width:50%; height:100%; overflow:hidden; border-right:2px solid var(--accent); background:#0e1520; z-index:2;">
                <div style="padding:14px; font-family:var(--mono); font-size:11px;">
                  <span class="tag tag-verified">BASELINE SNAPSHOT</span>
                  <p style="margin-top:8px; color:var(--text-muted);">Baseline layout verified (0% drift)</p>
                </div>
              </div>
              <div id="visual-after" style="position:absolute; top:0; left:0; width:100%; height:100%; background:#090d13; z-index:1;">
                <div style="padding:14px; padding-left:calc(50% + 16px); font-family:var(--mono); font-size:11px;">
                  <span class="tag tag-review">STAGING ACTUAL SNAPSHOT</span>
                  <p style="margin-top:8px; color:var(--warning-fg);">Shifted element detected (+0.42% drift)</p>
                </div>
              </div>
            </div>
            <div style="margin-top:8px; display:flex; align-items:center; gap:10px;">
              <span style="font-size:11px; font-family:var(--mono); color:var(--text-muted);">SPLIT POSITION:</span>
              <input type="range" min="0" max="100" value="50" style="flex:1; cursor:pointer;" id="slider-visual-diff" />
              <span style="font-size:11px; font-family:var(--mono); color:var(--text-bright);" id="slider-pos-val">50%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
